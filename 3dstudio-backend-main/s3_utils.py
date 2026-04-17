import os
import uuid
import boto3
import shutil
import tempfile

S3_BUCKET = "glb-output"
S3_FOLDER = "temp"
REGION = "ap-south-1"

TMP_DIR = tempfile.gettempdir()
s3 = boto3.client("s3", region_name=REGION)


def upload_to_s3(local_path):
    file_name = f"{uuid.uuid4()}.glb"
    s3_key = f"{S3_FOLDER}/{file_name}"

    s3.upload_file(
        local_path,
        S3_BUCKET,
        s3_key,
        ExtraArgs={
            "ContentType": "model/gltf-binary"
        }
    )

    # Generate a Presigned URL (Master Key) so the proxy can always reach the file
    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": s3_key},
        ExpiresIn=3600, # 1 hour
    )

    return {
        "url": url,
        "key": s3_key
    }


def download_from_s3(s3_key):
    """
    Downloads a file from S3 to a local temp path.
    V14: Multi-Bucket Recovery - checks both resized and original buckets.
    """
    # 1. Normalize for Windows
    normalized_key = os.path.normpath(s3_key) if s3_key else ""
    is_absolute = os.path.isabs(normalized_key) or (len(normalized_key) > 1 and normalized_key[1] == ':')
    
    # 2. LOCAL DISK CHECK
    if is_absolute and os.path.exists(normalized_key):
        print(f"DEBUG: S3_Utils Direct Path Injection triggered for {normalized_key}")
        local_path = os.path.join(TMP_DIR, f"{uuid.uuid4()}.glb")
        import shutil
        shutil.copy2(normalized_key, local_path)
        return local_path

    # 3. SMART KEY PREPARATION
    filename = os.path.basename(normalized_key)
    buckets_to_try = [S3_BUCKET, "tryitproductmodels"]
    keys_to_try = [s3_key, filename, f"temp/{filename}"]
    
    # Cleanup keys (Key Shield)
    keys_to_try = [k for k in keys_to_try if k and ":" not in k and "\\" not in k]
    keys_to_try = list(dict.fromkeys(keys_to_try))

    local_path = os.path.join(TMP_DIR, f"{uuid.uuid4()}.glb")

    for bucket in buckets_to_try:
        for key in keys_to_try:
            try:
                print(f"DEBUG: S3_Utils Probe -> bucket={bucket}, key={key}")
                s3.download_file(bucket, key, local_path)
                print(f"SUCCESS: S3_Utils Found in bucket={bucket}")
                return local_path
            except:
                continue

    raise RuntimeError(f"S3_Utils: Could not find model {s3_key} in buckets {buckets_to_try}")