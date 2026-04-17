import os
import uuid
import time
import logging
import traceback

from flask import Flask, request, jsonify
from flask_cors import CORS
from usdzconvert import convert_s3_glb_to_usdz

from resize import resize_glb, get_dimensions, from_units
from s3_utils import upload_to_s3, download_from_s3


# ================================================================
# CONFIG
# ================================================================

TMP_DIR  = "/tmp"
LOG_PATH = "/home/ubuntu/server.log"   # <-- Log file appends here

os.makedirs(TMP_DIR, exist_ok=True)


# ================================================================
# LOGGING SETUP
# Two handlers:
#   1. File    -> /home/ubuntu/server.log  (detailed, persistent)
#   2. Console -> stdout                   (simple, live in PuTTY)
# ================================================================

LOG_FORMAT_FILE    = "%(asctime)s | %(levelname)-8s | %(message)s"
LOG_FORMAT_CONSOLE = "%(asctime)s | %(message)s"
DATE_FMT           = "%Y-%m-%d %H:%M:%S"

file_handler = logging.FileHandler(LOG_PATH)
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
    logger.debug(f"   detail -> {detail}")

def log_error(route, err, duration_ms):
    logger.error(f"FAIL {route}  [{duration_ms}ms]  {err}")

def fmt_dims(d):
    """Pretty-print a dimensions dict as 'W x H x D cm'"""
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
# APP
# ================================================================

app = Flask(__name__)
CORS(app)

logger.info("=" * 60)
logger.info("Backend server starting up")
logger.info("=" * 60)


# ================================================================
# ROUTES
# ================================================================

@app.route("/")
def home():
    return "3D Resize/Convert Backend Running"


# ----------------------------------------------------------------
# /dimensions  -- inspect a GLB without changing it
# ----------------------------------------------------------------

@app.route("/dimensions", methods=["POST"])
def dimensions_api():
    t0 = time.time()
    route = "/dimensions"

    try:
        data   = request.get_json() if request.is_json else request.form
        s3_key = data.get("s3_key")

        log_request_start(route, f"s3_key={s3_key}")

        if not s3_key:
            return jsonify({"error": "Missing s3_key"}), 400

        input_path = download_from_s3(s3_key)
        logger.debug(f"  downloaded -> {input_path}  ({file_size_kb(input_path)} KB)")

        dims = get_dimensions(input_path)
        os.remove(input_path)

        ms = round((time.time() - t0) * 1000)
        log_success(route, f"dims={fmt_dims(dims)}", ms)

        return jsonify({"success": True, "dimensions": dims})

    except Exception as e:
        ms = round((time.time() - t0) * 1000)
        log_error(route, str(e), ms)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ----------------------------------------------------------------
# /resize  -- scale GLB to target dimensions
# ----------------------------------------------------------------

@app.route("/resize", methods=["POST"])
def resize_api():
    t0 = time.time()
    route = "/resize"

    try:
        data   = request.get_json() if request.is_json else request.form
        s3_key = data.get("s3_key")
        width  = data.get("width")
        height = data.get("height")
        depth  = data.get("depth")
        unit   = data.get("unit",  "cm")
        mode   = data.get("mode",  "non-uniform")
        axis   = data.get("axis",  "y")

        log_request_start(
            route,
            f"s3_key={s3_key}  target={width}x{height}x{depth} {unit}  mode={mode}"
        )

        if not s3_key:
            return jsonify({"error": "Missing s3_key"}), 400
        if not width or not height or not depth:
            return jsonify({"error": "Missing dimensions"}), 400

        width  = float(width)
        height = float(height)
        depth  = float(depth)

        target_dims = [
            from_units(width,  unit),
            from_units(height, unit),
            from_units(depth,  unit),
        ]

        # --- download ---
        input_path = download_from_s3(s3_key)
        input_kb   = file_size_kb(input_path)
        logger.debug(f"  downloaded -> {input_path}  ({input_kb} KB)")

        # --- dimensions before ---
        dims_before = get_dimensions(input_path)
        logger.debug(f"  dims BEFORE -> {fmt_dims(dims_before)}")

        # --- resize ---
        output_path = os.path.join(TMP_DIR, f"{uuid.uuid4()}_resized.glb")
        resize_glb(input_path, output_path, target_dims, mode=mode, axis=axis)
        output_kb = file_size_kb(output_path)
        logger.debug(f"  resize done -> {output_path}  ({output_kb} KB)")

        # --- dimensions after ---
        dims_after = get_dimensions(output_path)
        logger.debug(f"  dims AFTER  -> {fmt_dims(dims_after)}")

        # --- upload ---
        s3_data = upload_to_s3(output_path)
        logger.debug(f"  uploaded -> {s3_data['key']}")

        # --- cleanup ---
        os.remove(input_path)
        os.remove(output_path)

        ms = round((time.time() - t0) * 1000)
        log_success(
            route,
            f"before={fmt_dims(dims_before)}  after={fmt_dims(dims_after)}  "
            f"size={input_kb}KB->{output_kb}KB  new_key={s3_data['key']}",
            ms
        )

        return jsonify({
            "success":     True,
            "file_url":    s3_data["url"],
            "s3_key":      s3_data["key"],
            "dims_before": dims_before,
            "dims_after":  dims_after,
            "target_unit": unit,
            "target_w":    width,
            "target_h":    height,
            "target_d":    depth,
        })

    except Exception as e:
        ms = round((time.time() - t0) * 1000)
        log_error(route, str(e), ms)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ----------------------------------------------------------------
# /convert_usdz  -- convert a resized GLB to USDZ for AR
# ----------------------------------------------------------------

@app.route("/convert_usdz", methods=["POST"])
def convert_usdz_api():
    t0 = time.time()
    route = "/convert_usdz"

    try:
        data   = request.get_json() if request.is_json else request.form
        s3_key = data.get("s3_key")

        log_request_start(route, f"s3_key={s3_key}")

        if not s3_key:
            return jsonify({"error": "No s3_key provided"}), 400

        result = convert_s3_glb_to_usdz(s3_key)

        ms = round((time.time() - t0) * 1000)
        if result.get("success"):
            log_success(route, f"usdz_key={result.get('s3_key')}", ms)
        else:
            log_error(route, result.get("error", "unknown"), ms)

        return jsonify(result)

    except Exception as e:
        ms = round((time.time() - t0) * 1000)
        log_error(route, str(e), ms)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ================================================================
# RUN
# ================================================================

if __name__ == "__main__":
    # ============================================================
    # IP / DOMAIN CHANGES -- update here whenever your frontend
    # IP or domain changes. This is the ONLY place you need to edit.
    # ============================================================
    ALLOWED_ORIGINS = [
        "http://localhost:3000",        # local dev (React CRA)
        "http://localhost:5173",        # local dev (Vite)
        
       
    ]
    # ============================================================

    CORS(app, origins=ALLOWED_ORIGINS)

    logger.info(f"Allowed CORS origins: {ALLOWED_ORIGINS}")
    logger.info("Server listening on 0.0.0.0:5000")

    app.run(host="0.0.0.0", port=5000, debug=False)
