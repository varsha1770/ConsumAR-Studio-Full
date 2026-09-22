import os
from resize import resize_glb

input_file = "test_watermark.glb"
output_file = "storage/test_opt.glb"

if not os.path.exists(input_file):
    print("test_watermark.glb not found.")
else:
    print(f"Original size: {os.path.getsize(input_file)}")
    resize_glb(input_file, output_file, [100, 100, 100], align=True)
    if os.path.exists(output_file):
        print(f"Optimized size: {os.path.getsize(output_file)}")
