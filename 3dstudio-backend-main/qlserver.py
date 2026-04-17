import os
import uuid
import time
import logging
import traceback
import threading
import queue

from flask import Flask, request, jsonify
from flask_cors import CORS
from usdzscript import convert_s3_glb_to_usdz

from resize import resize_glb, get_dimensions, from_units
from s3_utils import upload_to_s3, download_from_s3


# ================================================================
# CONFIG
# ================================================================

TMP_DIR  = "/tmp"
LOG_PATH = "/home/ubuntu/server.log"

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


# ================================================================
# LOGGING HELPERS
# ================================================================

def log_request_start(route, extra=""):
    logger.info(f">> {route} called  {extra}")

def log_success(route, detail, duration_ms):
    logger.info(f"OK {route}  [{duration_ms}ms]  {detail}")
    logger.debug(f"   detail -> {detail}")

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
# QUEUE SYSTEM
# One worker thread processes jobs one at a time.
# Each job is a callable that returns a result dict.
# The HTTP handler submits the job and blocks until done.
# ================================================================

job_queue   = queue.Queue()
queue_lock  = threading.Lock()  # used only for queue-size snapshot


def _worker():
    """Background thread — runs forever, processes one job at a time."""
    logger.info("Queue worker started - ready for jobs")
    while True:
        job_id, fn, result_holder, done_event = job_queue.get()
        logger.info(f"QUEUE starting job {job_id}  (remaining in queue after this: {job_queue.qsize()})")
        try:
            result_holder["result"] = fn()
        except Exception as e:
            result_holder["result"] = {"error": str(e), "success": False}
            logger.error(f"QUEUE job {job_id} raised exception: {e}")
        finally:
            done_event.set()
            job_queue.task_done()
            logger.info(f"QUEUE job {job_id} finished  (queue size now: {job_queue.qsize()})")


worker_thread = threading.Thread(target=_worker, daemon=True)
worker_thread.start()


def enqueue(route, fn):
    """
    Submit fn() to the queue and block until it completes.
    Logs queue position and total wait time.
    Returns the result dict from fn().
    """
    job_id     = str(uuid.uuid4())[:8]
    position   = job_queue.qsize() + 1   # approximate position
    enqueue_ts = time.time()

    logger.info(f"QUEUE job {job_id} enqueued for {route}  (position ~{position})")
    if position > 1:
        logger.info(f"QUEUE job {job_id} is WAITING — {position - 1} job(s) ahead of it")

    result_holder = {}
    done_event    = threading.Event()

    job_queue.put((job_id, fn, result_holder, done_event))
    done_event.wait()   # block HTTP thread until worker is done

    wait_ms = round((time.time() - enqueue_ts) * 1000)
    logger.info(f"QUEUE job {job_id} completed  total_wait={wait_ms}ms")

    return result_holder.get("result", {"error": "no result", "success": False})


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
    return f"3D Resize/Convert Backend Running | Queue size: {job_queue.qsize()}"


# ----------------------------------------------------------------
# /dimensions  -- inspect a GLB without resizing
# ----------------------------------------------------------------

@app.route("/dimensions", methods=["POST"])
def dimensions_api():
    t0    = time.time()
    route = "/dimensions"

    data   = request.get_json() if request.is_json else request.form
    s3_key = data.get("s3_key")
    log_request_start(route, f"s3_key={s3_key}")

    if not s3_key:
        return jsonify({"error": "Missing s3_key"}), 400

    def job():
        input_path = download_from_s3(s3_key)
        logger.debug(f"  downloaded -> {input_path}  ({file_size_kb(input_path)} KB)")
        dims = get_dimensions(input_path)
        os.remove(input_path)
        return {"success": True, "dimensions": dims}

    try:
        result = enqueue(route, job)
        ms = round((time.time() - t0) * 1000)
        if result.get("success"):
            log_success(route, f"dims={fmt_dims(result.get('dimensions'))}", ms)
        else:
            log_error(route, result.get("error"), ms)
        return jsonify(result), (200 if result.get("success") else 500)

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
    t0    = time.time()
    route = "/resize"

    data   = request.get_json() if request.is_json else request.form
    s3_key = data.get("s3_key")
    width  = data.get("width")
    height = data.get("height")
    depth  = data.get("depth")
    unit   = data.get("unit",  "cm")
    mode   = data.get("mode",  "non-uniform")
    axis   = data.get("axis",  "y")

    log_request_start(route, f"s3_key={s3_key}  target={width}x{height}x{depth} {unit}  mode={mode}")

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

    def job():
        # download
        input_path = download_from_s3(s3_key)
        input_kb   = file_size_kb(input_path)
        logger.debug(f"  downloaded -> {input_path}  ({input_kb} KB)")

        # dims before
        dims_before = get_dimensions(input_path)
        logger.debug(f"  dims BEFORE -> {fmt_dims(dims_before)}")

        # resize
        output_path = os.path.join(TMP_DIR, f"{uuid.uuid4()}_resized.glb")
        resize_glb(input_path, output_path, target_dims, mode=mode, axis=axis)
        output_kb = file_size_kb(output_path)
        logger.debug(f"  resize done -> {output_path}  ({output_kb} KB)")

        # dims after
        dims_after = get_dimensions(output_path)
        logger.debug(f"  dims AFTER  -> {fmt_dims(dims_after)}")

        # upload
        s3_data = upload_to_s3(output_path)
        logger.debug(f"  uploaded -> {s3_data['key']}")

        # cleanup
        os.remove(input_path)
        os.remove(output_path)

        return {
            "success":     True,
            "file_url":    s3_data["url"],
            "s3_key":      s3_data["key"],
            "dims_before": dims_before,
            "dims_after":  dims_after,
            "target_unit": unit,
            "target_w":    width,
            "target_h":    height,
            "target_d":    depth,
        }

    try:
        result = enqueue(route, job)
        ms = round((time.time() - t0) * 1000)
        if result.get("success"):
            log_success(
                route,
                f"before={fmt_dims(result.get('dims_before'))}  "
                f"after={fmt_dims(result.get('dims_after'))}  "
                f"new_key={result.get('s3_key')}",
                ms
            )
        else:
            log_error(route, result.get("error"), ms)
        return jsonify(result), (200 if result.get("success") else 500)

    except Exception as e:
        ms = round((time.time() - t0) * 1000)
        log_error(route, str(e), ms)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ----------------------------------------------------------------
# /convert_usdz  -- convert GLB to USDZ for AR
# ----------------------------------------------------------------

@app.route("/convert_usdz", methods=["POST"])
def convert_usdz_api():
    t0    = time.time()
    route = "/convert_usdz"

    data   = request.get_json() if request.is_json else request.form
    s3_key = data.get("s3_key")
    log_request_start(route, f"s3_key={s3_key}")

    if not s3_key:
        return jsonify({"error": "No s3_key provided"}), 400

    def job():
        return convert_s3_glb_to_usdz(s3_key)

    try:
        result = enqueue(route, job)
        ms = round((time.time() - t0) * 1000)
        if result.get("success"):
            log_success(route, f"usdz_key={result.get('s3_key')}", ms)
        else:
            log_error(route, result.get("error", "unknown"), ms)
        return jsonify(result), (200 if result.get("success") else 500)

    except Exception as e:
        ms = round((time.time() - t0) * 1000)
        log_error(route, str(e), ms)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ----------------------------------------------------------------
# /queue_status  -- see what's happening in the queue right now
# ----------------------------------------------------------------

@app.route("/queue_status", methods=["GET"])
def queue_status():
    size = job_queue.qsize()
    return jsonify({
        "queue_size":    size,
        "jobs_waiting":  size,
        "worker_alive":  worker_thread.is_alive(),
    })


# ================================================================
# RUN
# ================================================================

if __name__ == "__main__":
    # ============================================================
    # IP / DOMAIN CHANGES -- update here whenever your frontend
    # IP or domain changes. This is the ONLY place you need to edit.
    # ============================================================
    ALLOWED_ORIGINS = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://13.233.7.249:5000",   # <-- replace/add your frontend IP here
    ]
    # ============================================================

    CORS(app, origins=ALLOWED_ORIGINS)

    logger.info(f"Allowed CORS origins: {ALLOWED_ORIGINS}")
    logger.info("Server listening on 0.0.0.0:5000")

    # threaded=True so Flask can accept new connections while worker is busy
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)