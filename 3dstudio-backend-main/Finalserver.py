from flask import Flask, request, jsonify, send_from_directory
from logging.handlers import RotatingFileHandler
import os
import uuid
import time
import logging
import traceback
import subprocess
import json
import sys
from flask_cors import CORS
import requests
from flask import Response

from s3_utils import upload_to_s3, download_from_s3
from resize import from_units

try:
    import importlib
    importlib.import_module("pillow_avif")
except Exception:
    pass

# ================================================================
# CONFIG
# ================================================================

# OS-Agnostic paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TMP_DIR  = os.path.join(BASE_DIR, "storage")
LOG_DIR  = os.path.join(BASE_DIR, "Log")
LOG_PATH = os.path.join(LOG_DIR, "server.log")

os.makedirs(TMP_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)

# ----------------------------------------------------------------
# DEBUG MODE
# Set DEBUG_RESIZE = True to get full step-by-step logs from
# resize.py (scale factors, transforms, extents at each stage).
# These go to stderr in the child process and are captured in the
# server log automatically.
# Set to False in production to keep logs clean.
# ----------------------------------------------------------------
DEBUG_RESIZE = True

os.makedirs(TMP_DIR, exist_ok=True)


# ================================================================
# LOGGING SETUP
# ================================================================

LOG_FORMAT_FILE    = "%(asctime)s | %(levelname)-8s | %(message)s"
LOG_FORMAT_CONSOLE = "%(asctime)s | %(message)s"
DATE_FMT           = "%Y-%m-%d %H:%M:%S"

file_handler = RotatingFileHandler(
    LOG_PATH,
    maxBytes=20 * 1024 * 1024,  # 20 MB
    backupCount=5               # keeps last 5 old logs
)

file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(logging.Formatter(LOG_FORMAT_FILE, datefmt=DATE_FMT))

console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(logging.Formatter(LOG_FORMAT_CONSOLE, datefmt=DATE_FMT))

logger = logging.getLogger("backend")
logger.setLevel(logging.DEBUG)
logger.addHandler(file_handler)
logger.addHandler(console_handler)


def log_request_start(route, extra=""):
    logger.info(f">> {route} called  {extra}")

def log_success(route, detail, duration_ms):
    logger.info(f"OK {route}  [{duration_ms}ms]  {detail}")

def log_error(route, err, duration_ms):
    logger.error(f"FAIL {route}  [{duration_ms}ms]  {err}")

def fmt_dims(d):
    if not d:
        return "unknown"
    w   = round(d.get("width",  0) * 100, 2)
    h   = round(d.get("height", 0) * 100, 2)
    dep = round(d.get("depth",  0) * 100, 2)
    return f"{w}cm x {h}cm x {dep}cm"

def file_size_kb(path):
    try:
        return round(os.path.getsize(path) / 1024, 1)
    except Exception:
        return "?"


# ================================================================
# CHILD PROCESS SCRIPTS
# stdout is redirected to stderr before any imports so that debug
# prints from resize.py / usdzconvert never pollute the JSON
# that Flask reads from stdout.
# RESIZE_DEBUG env var is passed to the child so resize.py knows
# whether to print debug lines.
# ================================================================

_SCRIPT_DIMENSIONS = """
import sys, json, os

_out = sys.stdout
sys.stdout = sys.stderr

from resize import get_dimensions
args = json.loads(sys.argv[1])
dims = get_dimensions(args['input_path'])

sys.stdout = _out
print(json.dumps({"dimensions": dims}))
"""

_SCRIPT_RESIZE = """
import sys, json, os

_out = sys.stdout
sys.stdout = sys.stderr

from resize import resize_glb, get_dimensions
args        = json.loads(sys.argv[1])
dims_before = get_dimensions(args['input_path'])
resize_glb(args['input_path'], args['output_path'],
           args['target_dims'], mode=args['mode'], axis=args['axis'], align=args.get('align', True), watermark=args.get('watermark', False), watermark_text=args.get('watermark_text', 'Tryitfirstlabs'))
dims_after  = get_dimensions(args['output_path'])

sys.stdout = _out
print(json.dumps({"dims_before": dims_before, "dims_after": dims_after}))
"""

_SCRIPT_CONVERT_USDZ = """
import sys, json, os

_out = sys.stdout
sys.stdout = sys.stderr

from usdzconvert import convert_s3_glb_to_usdz
args   = json.loads(sys.argv[1])
result = convert_s3_glb_to_usdz(args['s3_key'], glb_url=args.get('glb_url'), watermark=args.get('watermark', False), watermark_text=args.get('watermark_text', 'TryitFirstLabs'))

sys.stdout = _out
print(json.dumps(result))
"""

_SCRIPT_CENTER = """
import sys, json, os
import trimesh
import numpy as np

_out = sys.stdout
sys.stdout = sys.stderr

args = json.loads(sys.argv[1])
input_path = args['input_path']
output_path = args['output_path']

scene = trimesh.load(input_path, force='scene', process=False)
all_vertices = []
if hasattr(scene, 'geometry'):
    for obj in scene.geometry.values():
        if hasattr(obj, 'vertices') and len(obj.vertices) > 0:
            all_vertices.append(obj.vertices)

if all_vertices:
    v_stack = np.vstack(all_vertices)
    bbox_center = (v_stack.min(axis=0) + v_stack.max(axis=0)) / 2.0
    move_to_origin = np.eye(4)
    move_to_origin[:3, 3] = -bbox_center
    scene.apply_transform(move_to_origin)
    v_min_y = np.vstack([g.vertices for g in scene.geometry.values() if hasattr(g, 'vertices')]).min(axis=0)[1]
    scene.apply_translation([0, -v_min_y, 0])

scene.export(output_path, file_type='glb')

sys.stdout = _out
print(json.dumps({"success": True}))
"""


# ================================================================
# SUBPROCESS HELPERS
# Using Popen so we can forcefully kill the child on timeout.
# subprocess.run() raises TimeoutExpired but leaves the child alive.
# RESIZE_DEBUG is forwarded to the child via environment variable.
# ================================================================

def _child_env():
    """Build environment for child process, forwarding debug flag."""
    env = os.environ.copy()
    env["RESIZE_DEBUG"] = "1" if DEBUG_RESIZE else "0"
    return env


def _run_child(script, kwargs, timeout):
    proc = subprocess.Popen(
        [sys.executable, "-c", script, json.dumps(kwargs)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=_child_env(),
    )
    try:
        stdout, stderr = proc.communicate(timeout=timeout)
        return proc, stdout, stderr
    except subprocess.TimeoutExpired:
        proc.kill()
        stdout, stderr = proc.communicate()   # capture before discarding
        logger.error(f"  child killed after timeout. last stderr -> {stderr.strip()[-1000:]}")
        raise


def _child_result(proc, stdout, stderr, route):
    """
    Parses child output.
    Returns (dict, error_str) - exactly one of them is None.
    stderr is always logged at DEBUG level so it appears in the log file.
    """
    if stderr.strip():
        logger.debug(f"  [{route}] child stderr ->\n{stderr.strip()}")

    if proc.returncode != 0:
        err = stderr.strip() or f"child process exited with code {proc.returncode}"
        logger.error(f"  [{route}] child crash -> {err}")
        return None, err

    try:
        return json.loads(stdout), None
    except json.JSONDecodeError as e:
        err = f"child output parse error: {e} | stdout={stdout[:200]}"
        logger.error(f"  [{route}] {err}")
        return None, err


def fix_glb_nan(glb_path, out_path):
    import struct
    import json
    import math
    try:
        with open(glb_path, 'rb') as f:
            data = bytearray(f.read())
        magic = data[0:4]
        if magic != b'glTF': return
        chunk0_len, chunk0_type = struct.unpack('<I4s', data[12:20])
        if chunk0_type != b'JSON': return
        
        json_data = data[20:20+chunk0_len]
        json_str = json_data.decode('utf-8')
        if 'NaN' not in json_str: return
        
        def replace_nan(obj):
            if isinstance(obj, float):
                if math.isnan(obj) or math.isinf(obj):
                    return 0.0
                return obj
            elif isinstance(obj, dict):
                return {k: replace_nan(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [replace_nan(v) for v in obj]
            return obj
            
        parsed = json.loads(json_str)
        fixed = replace_nan(parsed)
        new_json_str = json.dumps(fixed, separators=(',', ':'), allow_nan=False)
        
        padding = (4 - (len(new_json_str) % 4)) % 4
        new_json_str += ' ' * padding
        new_json_bytes = new_json_str.encode('utf-8')
        
        new_chunk0_len = len(new_json_bytes)
        new_data = bytearray()
        new_data += data[0:8]
        new_data += struct.pack('<I', 0)
        new_data += struct.pack('<I4s', new_chunk0_len, b'JSON')
        new_data += new_json_bytes
        
        rest_idx = 20 + chunk0_len
        while rest_idx < len(data):
            chunk_len, chunk_type = struct.unpack('<I4s', data[rest_idx:rest_idx+8])
            new_data += data[rest_idx:rest_idx+8+chunk_len]
            rest_idx += 8 + chunk_len
            
        new_data[8:12] = struct.pack('<I', len(new_data))
        with open(out_path, 'wb') as f:
            f.write(new_data)
        print("Successfully fixed NaN in GLB JSON chunk.")
    except Exception as e:
        print("Failed to fix GLB NaN:", e)


# ================================================================
# APP
# ================================================================

app = Flask(__name__)
CORS(app)

logger.info("=" * 60)
logger.info("Backend server starting up")
logger.info(f"Python Executable: {sys.executable}")
logger.info("=" * 60)


# ================================================================
# ROUTES
# ================================================================

@app.route("/")
def home():
    return "3D Resize/Convert Backend Running"


# ----------------------------------------------------------------
# Static Serve: Locally serve resized models to bypass S3 flakes
# ----------------------------------------------------------------
@app.route("/models/<filename>")
def serve_model(filename):
    """Directly serve 3D models for local preview to avoid S3/Proxy issues."""
    try:
        mimetype = "model/vnd.usdz+zip" if filename.endswith(".usdz") else "model/gltf-binary"
        return send_from_directory(TMP_DIR, filename, mimetype=mimetype)
    except Exception as e:
        return str(e), 404


# ----------------------------------------------------------------
# /run (MOCK)
# ----------------------------------------------------------------

@app.route("/run", methods=["POST"])
def run_model():
    logger.info("=== /run called (MOCK) ===")
    try:
        import time, shutil
        time.sleep(1)

        filename = f"{uuid.uuid4()}_generated.glb"
        output_path = os.path.join(TMP_DIR, filename)
        
        # Smart model selection based on uploaded image name
        uploaded_files = request.files.getlist("images")
        uploaded_names = [f.filename.lower() for f in uploaded_files if f and f.filename]
        
        is_tufted = any("2-seat" in n or "2_seat" in n or "tufted" in n or "sofa" in n for n in uploaded_names) or len(uploaded_names) > 0
        is_wooden_frame = any("wooden" in n or "frame" in n for n in uploaded_names)

        if is_wooden_frame and os.path.exists(os.path.join(BASE_DIR, "sofa_orange.glb")):
            dummy_source = os.path.join(BASE_DIR, "sofa_orange.glb")
        elif os.path.exists(os.path.join(BASE_DIR, "sofa_tufted.glb")):
            dummy_source = os.path.join(BASE_DIR, "sofa_tufted.glb")
        elif os.path.exists(os.path.join(BASE_DIR, "sofa_orange.glb")):
            dummy_source = os.path.join(BASE_DIR, "sofa_orange.glb")
        elif os.path.exists(os.path.join(BASE_DIR, "sofa_sample.glb")):
            dummy_source = os.path.join(BASE_DIR, "sofa_sample.glb")
        else:
            dummy_source = os.path.join(BASE_DIR, "sample2.glb")
            
        if os.path.exists(dummy_source):
            shutil.copy(dummy_source, output_path)
        else:
            # Create a valid minimal GLB if everything else fails (this is an empty valid GLB header)
            with open(output_path, "wb") as f:
                f.write(b'glTF\x02\x00\x00\x00\x1c\x00\x00\x00\x02\x00\x00\x00\x00\x00\x00\x00JSON{}')

        # Dimension Normalization Safeguard (Ensure real-world furniture meters ~2.0m max width)
        try:
            from resize import get_dimensions, resize_glb
            dims = get_dimensions(output_path)
            w, h, d = dims.get("width", 1.0), dims.get("height", 1.0), dims.get("depth", 1.0)
            if max(w, h, d) > 10.0 or max(w, h, d) < 0.1:
                logger.info(f"Normalizing oversized GLB bounds ({w:.1f}m x {h:.1f}m x {d:.1f}m) to 2.0m human furniture scale...")
                target_w = 2.0
                scale = target_w / w if w > 0 else 1.0
                target_h = max(0.5, h * scale)
                target_d = max(0.8, d * scale)
                tmp_norm = os.path.join(TMP_DIR, f"{uuid.uuid4()}_norm.glb")
                resize_glb(output_path, tmp_norm, target_dims=[target_w, target_h, target_d], mode="non-uniform", align=True, watermark=False, remove_watermark=False)
                if os.path.exists(tmp_norm) and os.path.getsize(tmp_norm) > 0:
                    os.replace(tmp_norm, output_path)
                dims = get_dimensions(output_path)
        except Exception as norm_err:
            logger.error(f"Failed to normalize /run GLB: {norm_err}")
            dims = {"width": 2.0, "height": 0.85, "depth": 0.9}
            
        host_base = request.host_url.rstrip("/")
        local_url = f"{host_base}/models/{filename}"
        
        try:
            s3_data = upload_to_s3(output_path)
            s3_url = s3_data["url"]
            s3_key_result = s3_data["key"]
        except Exception as e:
            logger.error(f"S3 upload failed: {e}")
            s3_url = local_url
            s3_key_result = output_path
            
        return jsonify({
            "success": True,
            "glb_url": s3_url,
            "file_url": s3_url,
            "file_key": s3_key_result,
            "dimensions": dims
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# ----------------------------------------------------------------
# /dimensions
# ----------------------------------------------------------------

@app.route("/dimensions", methods=["POST"])
def dimensions_api():
    t0    = time.time()
    route = "/dimensions"
    input_path = None

    try:
        data   = request.get_json() if request.is_json else request.form
        s3_key = data.get("s3_key")
        log_request_start(route, f"s3_key={s3_key}")

        if not s3_key:
            return jsonify({"error": "Missing s3_key"}), 400

        input_path = download_from_s3(s3_key)
        logger.debug(f"  downloaded -> {input_path}  ({file_size_kb(input_path)} KB)")
        fix_glb_nan(input_path, input_path)

        proc, stdout, stderr = _run_child(
            _SCRIPT_DIMENSIONS, {"input_path": input_path}, timeout=60
        )
        result, err = _child_result(proc, stdout, stderr, route)

        if err:
            ms = round((time.time() - t0) * 1000)
            log_error(route, err, ms)
            return jsonify({"error": f"GLB processing failed: {err}"}), 500

        dims = result["dimensions"]
        ms   = round((time.time() - t0) * 1000)
        log_success(route, f"dims={fmt_dims(dims)}", ms)
        return jsonify({"success": True, "dimensions": dims})

    except subprocess.TimeoutExpired:
        ms = round((time.time() - t0) * 1000)
        log_error(route, "child killed after timeout", ms)
        return jsonify({"error": "Processing timed out -GLB may be malformed"}), 500

    except Exception as e:
        ms = round((time.time() - t0) * 1000)
        log_error(route, str(e), ms)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    finally:
        if input_path and os.path.exists(input_path):
            os.remove(input_path)


# ----------------------------------------------------------------
# /resize
# ----------------------------------------------------------------

@app.route("/resize", methods=["POST"])
def resize_api():
    t0    = time.time()
    route = "/resize"
    input_path  = None
    output_path = None

    try:
        data   = request.get_json() if request.is_json else request.form
        s3_key = data.get("s3_key")
        width  = data.get("width")
        height = data.get("height")
        depth  = data.get("depth")
        unit   = data.get("unit",  "cm")
        mode   = data.get("mode",  "non-uniform")
        axis   = data.get("axis",  "y")
        
        force_watermark = data.get("force_watermark", False)
        if isinstance(force_watermark, str):
            force_watermark = force_watermark.lower() == 'true'
        watermark_text = data.get("watermark_text", "Tryitfirstlabs")

        log_request_start(route,
            f"s3_key={s3_key}  target={width}x{height}x{depth} {unit}  mode={mode}")

        # Support either S3 Mode or Tunnel Mode (direct file)
        file = request.files.get("file")
        if file:
            logger.info("  Tunnel Mode: Processing uploaded file")
            input_path = os.path.join(TMP_DIR, f"{uuid.uuid4()}_{file.filename}")
            file.save(input_path)
        elif s3_key:
            logger.info(f"  S3 Mode: Downloading {s3_key}...")
            input_path = download_from_s3(s3_key)
            fix_glb_nan(input_path, input_path)
        else:
            return jsonify({"error": "Missing 'file' or 's3_key'"}), 400

        output_path = os.path.join(TMP_DIR, f"{uuid.uuid4()}_resized.glb")
        input_kb    = file_size_kb(input_path)
        logger.debug(f"  downloaded -> {input_path}  ({input_kb} KB)")

        if not width or not height or not depth:
            return jsonify({"error": "Missing dimensions"}), 400

        try:
            width  = float(width)
            height = float(height)
            depth  = float(depth)
        except (ValueError, TypeError) as ve:
            return jsonify({"error": f"Invalid dimensions: {ve}"}), 400

        target_dims = [
            from_units(width,  unit),
            from_units(height, unit),
            from_units(depth,  unit),
        ]

        proc, stdout, stderr = _run_child(_SCRIPT_RESIZE, {
            "input_path":  input_path,
            "output_path": output_path,
            "target_dims": target_dims,
            "mode":        mode,
            "axis":        axis,
            "watermark":   force_watermark,
            "watermark_text": watermark_text,
        }, timeout=120)

        result, err = _child_result(proc, stdout, stderr, route)

        if err:
            ms = round((time.time() - t0) * 1000)
            log_error(route, err, ms)
            return jsonify({"error": f"GLB processing failed: {err}"}), 500

        dims_before = result["dims_before"]
        dims_after  = result["dims_after"]
        output_kb   = file_size_kb(output_path)

        logger.debug(f"  dims BEFORE -> {fmt_dims(dims_before)}")
        logger.debug(f"  dims AFTER  -> {fmt_dims(dims_after)}")

        # V12: Absolute Reality Lock - Return Full Path as file_key
        local_filename = os.path.basename(output_path)
        host_base = request.host_url.rstrip("/")
        local_url = f"{host_base}/models/{local_filename}"
        
        # We now use the ABSOLUTE PATH as the key so the USDZ script finds it 100%
        file_key = os.path.basename(output_path)
        
        ms = round((time.time() - t0) * 1000)
        log_success(route,
            f"before={fmt_dims(dims_before)}  after={fmt_dims(dims_after)}  "
            f"local_path={file_key}", ms)

        return jsonify({
            "success":     True,
            "glb_url":     local_url, # For the 3D Viewer
            "file_key":    file_key,  # For the USDZ Converter (Absolute Path)
            "dims_before": dims_before,
            "dims_after":  dims_after,
            "target_unit": unit,
            "target_w":    width,
            "target_h":    height,
            "target_d":    depth,
        })

    except subprocess.TimeoutExpired:
        ms = round((time.time() - t0) * 1000)
        log_error(route, "child killed after timeout", ms)
        return jsonify({"error": "Processing timed out - GLB may be malformed"}), 500

    except Exception as e:
        ms = round((time.time() - t0) * 1000)
        log_error(route, str(e), ms)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    finally:
        if input_path  and os.path.exists(input_path):  os.remove(input_path)
        # STABILITY LOCK: Do not delete output_path so browser can load it locally.


# ----------------------------------------------------------------
# /optimize-direct
# ----------------------------------------------------------------

@app.route("/optimize-direct", methods=["POST"])
def optimize_direct_api():
    t0    = time.time()
    route = "/optimize-direct"
    input_path  = None
    output_path = None
    tmp_centered = None

    try:
        data   = request.get_json() if request.is_json else request.form
        s3_key = data.get("s3_key")
        
        log_request_start(route, f"s3_key={s3_key}")

        if not s3_key:
            return jsonify({"error": "Missing 's3_key'"}), 400

        input_path = download_from_s3(s3_key)
        fix_glb_nan(input_path, input_path)
        input_kb    = file_size_kb(input_path)
        logger.debug(f"  downloaded -> {input_path}  ({input_kb} KB)")

        tmp_centered = os.path.join(TMP_DIR, f"{uuid.uuid4()}_centered.glb")
        output_path  = os.path.join(TMP_DIR, f"{uuid.uuid4()}_optimized.glb")

        gltf_cmd = "npx.cmd" if os.name == 'nt' else "npx"

        # 1. Center pivot below using trimesh (ignores broken bounding boxes)
        proc, stdout, stderr = _run_child(_SCRIPT_CENTER, {
            "input_path": input_path,
            "output_path": tmp_centered
        }, timeout=60)
        
        result, err = _child_result(proc, stdout, stderr, route)
        if err:
            raise Exception(f"trimesh center failed: {err}")

        # 2. Optimize non-destructively (clean geometry, keep materials) + Compress
        opt_cmd = [
            gltf_cmd, "--yes", "@gltf-transform/cli", "optimize", tmp_centered, output_path,
            "--flatten", "false",
            "--join", "false",
            "--palette", "false",
            "--simplify", "true",
            "--texture-compress", "false",
            "--compress", "draco"
        ]
        logger.debug(f"  Running: {' '.join(opt_cmd)}")
        res_opt = subprocess.run(opt_cmd, capture_output=True, text=True, shell=True)
        if res_opt.returncode != 0:
            raise Exception(f"gltf-transform optimize failed: {res_opt.stderr}")
            
        # Fix any NaN bounds introduced by draco
        fix_glb_nan(output_path, output_path)

        output_kb = file_size_kb(output_path)
        local_filename = os.path.basename(output_path)
        host_base = request.host_url.rstrip("/")
        local_url = f"{host_base}/models/{local_filename}"
        
        ms = round((time.time() - t0) * 1000)
        log_success(route, f"Optimized {input_kb}KB -> {output_kb}KB, path={local_filename}", ms)

        return jsonify({
            "success": True,
            "glb_url": local_url,
            "file_key": local_filename,
            "input_kb": input_kb,
            "output_kb": output_kb
        })

    except Exception as e:
        ms = round((time.time() - t0) * 1000)
        log_error(route, str(e), ms)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    finally:
        if input_path and os.path.exists(input_path): os.remove(input_path)
        if tmp_centered and os.path.exists(tmp_centered): os.remove(tmp_centered)


# ----------------------------------------------------------------
# /convert_usdz
# ----------------------------------------------------------------

@app.route("/api/convert-usdz", methods=["POST"])
def convert_usdz_api():
    t0    = time.time()
    route = "/convert_usdz"

    try:
        data   = request.get_json() if request.is_json else request.form
        s3_key = data.get("s3_key")
        
        force_watermark = False
        watermark_text = ""

        log_request_start(route, f"s3_key={s3_key} watermark={force_watermark}")

        if not s3_key:
            return jsonify({"error": "No s3_key provided"}), 400

        # V13: SMART RECOVERY - The child script will handle filename extraction
        # so we just pass the key as-is.
        proc, stdout, stderr = _run_child(
            _SCRIPT_CONVERT_USDZ, {
                "s3_key": s3_key,
                "glb_url": data.get("glb_url"),
                "watermark": force_watermark,
                "watermark_text": watermark_text
            }, timeout=180
        )
        result, err = _child_result(proc, stdout, stderr, route)

        if err:
            ms = round((time.time() - t0) * 1000)
            log_error(route, err, ms)
            return jsonify({"error": f"USDZ conversion failed: {err}"}), 500

        ms = round((time.time() - t0) * 1000)
        if result.get("success"):
            log_success(route, f"usdz_key={result.get('s3_key')}", ms)
        else:
            log_error(route, result.get("error", "unknown"), ms)

        return jsonify(result)

    except subprocess.TimeoutExpired:
        ms = round((time.time() - t0) * 1000)
        log_error(route, "child killed after timeout", ms)
        return jsonify({"error": "Conversion timed out - GLB may be malformed"}), 500

    except Exception as e:
        ms = round((time.time() - t0) * 1000)
        log_error(route, str(e), ms)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ================================================================
# PROXY ROUTES TO NODE.JS SUPERADMIN BACKEND (Port 5005)
# ================================================================
PROXY_TARGET = "http://localhost:5005"

@app.route('/api/admin/<path:path>', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
@app.route('/api/auth/<path:path>', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
@app.route('/api/tasks', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], defaults={'path': ''})
@app.route('/api/tasks/<path:path>', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
def proxy(path):
    if request.method == 'OPTIONS':
        # Let Flask-CORS handle the preflight
        return '', 200

    url = f"{PROXY_TARGET}{request.path}"
    # Forward the request
    headers = {key: value for (key, value) in request.headers if key.lower() != 'host'}
    
    try:
        resp = requests.request(
            method=request.method,
            url=url,
            headers=headers,
            data=request.get_data(),
            cookies=request.cookies,
            allow_redirects=False)

        excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
        resp_headers = [(name, value) for (name, value) in resp.raw.headers.items()
                   if name.lower() not in excluded_headers]

        return Response(resp.content, resp.status_code, resp_headers)
    except Exception as e:
        logger.error(f"Proxy error: {e}")
        return jsonify({"error": "Failed to connect to SuperAdmin Node backend"}), 502

# ================================================================
# TEMP FILE CLEANUP
# ================================================================
import threading

def cleanup_old_temp_files():
    """Runs in the background and deletes temp files older than 24 hours."""
    while True:
        try:
            now = time.time()
            cutoff_time = now - (24 * 3600)  # 24 hours ago
            
            temp_dirs = [TMP_DIR, "/tmp"]
            
            for directory in temp_dirs:
                if not os.path.exists(directory):
                    continue
                    
                for filename in os.listdir(directory):
                    file_path = os.path.join(directory, filename)
                    
                    if os.path.isfile(file_path):
                        file_mtime = os.path.getmtime(file_path)
                        if file_mtime < cutoff_time:
                            try:
                                os.remove(file_path)
                                logger.info(f"Cleaned up old temp file: {file_path}")
                            except Exception as e:
                                logger.error(f"Failed to delete {file_path}: {e}")
                                
        except Exception as e:
            logger.error(f"Error in cleanup thread: {e}")
            
        time.sleep(3600)  # Sleep for 1 hour

# ================================================================
# RUN
# ================================================================

if __name__ == "__main__":
    CORS(app, origins="*")

    logger.info("Allowed CORS origins: * (Local & Network enabled)")
    
    # Start cleanup thread
    cleanup_thread = threading.Thread(target=cleanup_old_temp_files, daemon=True)
    cleanup_thread.start()
    logger.info("Started background temp file cleanup thread")

    logger.info("Server listening on 0.0.0.0:5001")

    app.run(host="0.0.0.0", port=5001, debug=False)