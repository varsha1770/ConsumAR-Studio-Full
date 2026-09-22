import os
import uuid
import traceback
import boto3
import trimesh
import numpy as np

from PIL import Image
try:
    import importlib
    importlib.import_module("pillow_avif")
except Exception:
    pass
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS, cross_origin

# from trellis.pipelines import TrellisImageTo3DPipeline
# from trellis.utils import postprocessing_utils

from usdzconvert import convert_s3_glb_to_usdz
from resize import resize_glb, get_dimensions as get_glb_dimensions, from_units


# ---------------- TRIMESH ----------------

# ---------------- LOGIC IMPORTED FROM resize.py ----------------


# ---------------- ENV ----------------

os.environ['SPCONV_ALGO'] = 'native'

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # Allows 100MB files
# Allow all origins for the development session to bypass 403 errors
CORS(app, resources={r"/*": {"origins": "*"}})


# ---- GLOBAL ERROR HANDLER — always return JSON, never HTML -----------
@app.errorhandler(Exception)
def handle_all_exceptions(e):
    """Catch ANY unhandled exception Flask would otherwise turn into HTML 500."""
    tb = traceback.format_exc()
    print("\n!!! UNHANDLED FLASK EXCEPTION !!!")
    print(tb)
    return jsonify({"success": False, "error": str(e), "traceback": tb}), 500


# ---------------- S3 ----------------

S3_BUCKET = "glb-output"
S3_FOLDER = "temp"
REGION = "ap-south-1"

s3 = boto3.client("s3", region_name=REGION)

UPLOAD_FOLDER = os.path.join(os.getcwd(), "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


# ---------------- TRELLIS ----------------

print("Loading TRELLIS pipeline...")
# pipeline = TrellisImageTo3DPipeline.from_pretrained("microsoft/TRELLIS-image-large")
# pipeline.cuda()
print("Pipeline loaded ?")


# ---------------- S3 FUNCTION ----------------

def upload_to_s3(local_path):
    try:
        file_name = f"{uuid.uuid4()}.glb"
        s3_key = f"{S3_FOLDER}/{file_name}"

        print(f"Uploading {local_path} ? s3://{S3_BUCKET}/{s3_key}")

        s3.upload_file(
            local_path,
            S3_BUCKET,
            s3_key,
            ExtraArgs={"ContentType": "model/gltf-binary"}
        )

        presigned_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET, "Key": s3_key},
            ExpiresIn=3600
        )

        return {
            "url": presigned_url,
            "key": s3_key,
            "expires_in": 3600
        }

    except Exception as e:
        print("? S3 ERROR:", e)
        raise e


# ---------------- ROUTES ----------------

@app.route("/")
def home():
    return "3D Backend Running ??"


@app.route("/run", methods=["POST"])
def run_model():
    print("\n=== /run called ===")

    try:
        # ---------- GET IMAGES ----------
        if "images" not in request.files:
            return jsonify({"error": "No images uploaded"}), 400

        files = request.files.getlist("images")

        image_paths = []
        for f in files:
            img = Image.open(f).convert("RGB")
            path = os.path.join(UPLOAD_FOLDER, f"{uuid.uuid4()}.jpg")
            img.save(path, "JPEG")
            image_paths.append(path)

        images = [Image.open(p) for p in image_paths]

        # ---------- OPTIONAL RESIZE INPUT ----------
        width = request.form.get("width")
        height = request.form.get("height")
        depth = request.form.get("depth")
        unit = request.form.get("unit", "cm")

        resize_requested = width and height and depth

        if resize_requested:
            target_dims = [
                from_units(float(width), unit),
                from_units(float(height), unit),
                from_units(float(depth), unit)
            ]

        # ---------- RUN TRELLIS (DISABLED) ----------
        return jsonify({"success": False, "error": "Trellis 3D Generation is currently disabled."}), 503
        
        # ---------- DEAD TRELLIS LOGIC REMOVED ----------
        # The remainder of this try block has been cleared because 
        # it was dead code and contained broken indentation.

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/convert-usdz", methods=["POST"])
def convert_to_usdz():
    s3_key = request.form.get("s3_key")
    glb_url = request.form.get("glb_url")
    if not s3_key:
        return jsonify({"success": False, "error": "No s3_key provided"}), 400

    print(f"\n=== /api/convert-usdz called for: {s3_key} ===", flush=True)
    try:
        print("Starting magic conversion with Aspose.3D...", flush=True)
        result = convert_s3_glb_to_usdz(s3_key, glb_url)
        if result and result.get("success"):
            print("DONE: Conversion successful!", flush=True)
            # Use 127.0.0.1:5001 to bypass the proxy-mode 403 error
            filename = result.get("filename")
            full_url = f"http://127.0.0.1:5001/download/{filename}"
            return jsonify({
                "success": True,
                "url": full_url,
                "file_url": full_url,
                "filename": filename
            }), 200
        else:
            error_msg = result.get('error') if result else "Unknown internal backend error (result was None)"
            print(f"FAILED: {error_msg}", flush=True)
            # Send HTTP 200 so the frontend can receive the error message JSON without proxy interception!
            return jsonify({"success": False, "error": error_msg}), 200
    except Exception as e:
        print("!!! SERVER ROUTE CRASHED !!!", flush=True)
        traceback.print_exc()
        return jsonify({"success": False, "error": f"Route exception: {str(e)}"}), 200


@app.route("/resize", methods=["POST"])
@cross_origin()
def handle_resize():
    print("\n=== /resize called (V12 Lock Active) ===")
    try:
        # 1. SETUP STORAGE
        BASE_DIR = os.path.dirname(os.path.abspath(__file__))
        STORAGE_DIR = os.path.join(BASE_DIR, "storage")
        os.makedirs(STORAGE_DIR, exist_ok=True)

        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400
        
        file = request.files['file']
        width = request.form.get("width")
        height = request.form.get("height")
        depth = request.form.get("depth")
        unit = request.form.get("unit", "m")

        if not (width and height and depth):
            return jsonify({"error": "Missing dimensions"}), 400

        from resize import from_units
        target_dims = [
            from_units(float(width), unit),
            from_units(float(height), unit),
            from_units(float(depth), unit)
        ]
        
        # 2. SAVE INPUT
        input_path = os.path.join(STORAGE_DIR, f"{uuid.uuid4()}_{file.filename}")
        file.save(input_path)
        
        # 3. PROCESS GLB
        filename = f"{uuid.uuid4()}_resized.glb"
        output_path = os.path.join(STORAGE_DIR, filename)
        resize_glb(input_path, output_path, target_dims)
        
        # 4. V12: ABSOLUTE REALITY LOCK - Return full path for converter
        local_url = f"http://localhost:5001/download/{filename}"
        file_key = output_path # ABSOLUTE PATH
        
        # Cleanup input
        if os.path.exists(input_path):
            os.remove(input_path)

        print(f"DONE: Resized. local_path={file_key}")
        return jsonify({
            "success": True,
            "glb_url": local_url,
            "file_url": local_url,
            "file_key": file_key,
            "s3_key": file_key
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/download/<filename>")
@cross_origin()
def download_file(filename):
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    directory = os.path.join(BASE_DIR, 'storage')
    
    # Auto-detect MIME type based on extension
    if filename.lower().endswith(".usdz"):
        mimetype = "model/vnd.usdz+zip"
    elif filename.lower().endswith(".glb"):
        mimetype = "model/gltf-binary"
    else:
        mimetype = "application/octet-stream"
        
    return send_from_directory(directory, filename, as_attachment=True, mimetype=mimetype)


# ---------------- RUN SERVER ----------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)
