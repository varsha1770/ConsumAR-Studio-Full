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

from s3_utils import upload_to_s3, download_from_s3
from resize import from_units


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
           args['target_dims'], mode=args['mode'], axis=args['axis'],
           watermark=args.get('watermark', False))
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
result = convert_s3_glb_to_usdz(args['s3_key'])

sys.stdout = _out
print(json.dumps(result))
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


# ================================================================
# APP
# ================================================================

app = Flask(__name__)
CORS(app)

logger.info("=" * 60)
logger.info("Backend server starting up")
logger.info(f"Python Executable: {sys.executable}")
logger.info(f"DEBUG_RESIZE = {DEBUG_RESIZE}")
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
        return send_from_directory(TMP_DIR, filename, mimetype="model/gltf-binary")
    except Exception as e:
        return str(e), 404


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
        tier   = data.get("tier", "GUEST")
        force_watermark = data.get("force_watermark", False)
        
        # Watermark is ON if Tier is not PAID, or if forced (for Admin testing)
        watermark = (tier.upper() != "PAID") or (str(force_watermark).lower() == "true")
        
        logger.info(f"!!! TIER CHECK: tier={tier}, forced={force_watermark} => watermark={watermark} !!!")

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
            "watermark":   watermark
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
        local_url = f"http://localhost:5001/models/{local_filename}"
        
        # We now use the ABSOLUTE PATH as the key so the USDZ script finds it 100%
        file_key = output_path 
        
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
# /convert_usdz
# ----------------------------------------------------------------

@app.route("/api/convert-usdz", methods=["POST"])
def convert_usdz_api():
    t0    = time.time()
    route = "/convert_usdz"

    try:
        data   = request.get_json() if request.is_json else request.form
        s3_key = data.get("s3_key")
        log_request_start(route, f"s3_key={s3_key}")

        if not s3_key:
            return jsonify({"error": "No s3_key provided"}), 400

        # V13: SMART RECOVERY - The child script will handle filename extraction
        # so we just pass the key as-is.
        proc, stdout, stderr = _run_child(
            _SCRIPT_CONVERT_USDZ, {"s3_key": s3_key}, timeout=180
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
# RUN
# ================================================================

if __name__ == "__main__":
    ALLOWED_ORIGINS = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    CORS(app, origins=ALLOWED_ORIGINS)

    logger.info(f"Allowed CORS origins: {ALLOWED_ORIGINS}")
    logger.info("Server listening on 0.0.0.0:5001")

    app.run(host="0.0.0.0", port=5001, debug=True)