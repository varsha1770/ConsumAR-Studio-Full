import os
import sys
import requests

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from usdzconvert import convert_glb_to_usdz, TMP_DIR

glb_url = "https://voxel-vista.s3.ap-south-1.amazonaws.com/7e9ce0b6d196470a930305009ab50c7d.glb"
target_name = "56f6e5e1-4fec-44d9-8794-c43961c3e2b1"

def recover():
    print("Downloading GLB...")
    glb_path = os.path.join(TMP_DIR, f"{target_name}.glb")
    r = requests.get(glb_url, stream=True)
    r.raise_for_status()
    with open(glb_path, 'wb') as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
    
    print(f"Downloaded to {glb_path}. Starting conversion...")
    usdz_path = convert_glb_to_usdz(glb_path)
    print(f"Success! USDZ recovered to {usdz_path}")

if __name__ == "__main__":
    recover()
