import sys
import os
import json

# Add current dir to path
sys.path.append(os.getcwd())

from resize import resize_glb, get_dimensions

input_glb = "BoxTextured.glb"
output_glb = "test_watermark.glb"
target_dims = [1.0, 1.0, 1.0] # 1m x 1m x 1m

print(f"Resizing {input_glb} to {target_dims} with watermark...")
resize_glb(input_glb, output_glb, target_dims, watermark=True)

if os.path.exists(output_glb):
    print(f"Success! Output file size: {os.path.getsize(output_glb)} bytes")
    # Check if watermark is there (hacky check: search for 'WatermarkFloor' string in binary if it's GLB/glTF)
    with open(output_glb, 'rb') as f:
        content = f.read()
        if b'WatermarkFloor' in content:
            print("WatermarkFloor geometry found in GLB!")
        else:
            print("WatermarkFloor NOT found in GLB.")
else:
    print("Failed to create output GLB.")
