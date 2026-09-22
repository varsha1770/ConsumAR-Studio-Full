import os
import sys
import numpy as np
import trimesh

from resize import resize_glb, get_dimensions

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

TARGET_MODELS = [
    "sofa_orange.glb",
    "sofa_sample.glb",
    "sample2.glb",
    "orange.glb",
    "sample2_processed.glb"
]

def normalize_model(filename):
    filepath = os.path.join(BASE_DIR, filename)
    if not os.path.exists(filepath):
        print(f"Skipping {filename} (not found)")
        return

    dims = get_dimensions(filepath)
    w, h, d = dims["width"], dims["height"], dims["depth"]
    print(f"Checking {filename}: current dims = {w:.2f}m x {h:.2f}m x {d:.2f}m")

    # If any dimension is huge (> 10m) or extremely small (< 0.1m)
    max_dim = max(w, h, d)
    if max_dim > 10.0 or max_dim < 0.1:
        print(f"  -> Rescaling {filename} to realistic furniture scale (target width ~ 2.0m)")

        # Target realistic sofa dimensions: ~2.0m width (X), proportional height (Y) and depth (Z)
        target_width = 2.0
        scale = target_width / w if w > 0 else 1.0

        target_w = target_width
        target_h = max(0.5, h * scale)
        target_d = max(0.8, d * scale)

        print(f"  -> Target dims: {target_w:.2f}m x {target_h:.2f}m x {target_d:.2f}m")
        
        # Temporary output file
        tmp_out = filepath + ".tmp.glb"
        try:
            resize_glb(
                input_path=filepath,
                output_path=tmp_out,
                target_dims=[target_w, target_h, target_d],
                mode="non-uniform",
                align=True,
                watermark=False,
                remove_watermark=False
            )
            # Replace original file with normalized file
            if os.path.exists(tmp_out) and os.path.getsize(tmp_out) > 0:
                os.replace(tmp_out, filepath)
                print(f"  -> Successfully normalized {filename}!")
                new_dims = get_dimensions(filepath)
                print(f"  -> New dims: {new_dims['width']:.2f}m x {new_dims['height']:.2f}m x {new_dims['depth']:.2f}m")
        except Exception as e:
            print(f"  -> Error normalizing {filename}: {e}")
            if os.path.exists(tmp_out):
                os.remove(tmp_out)

if __name__ == "__main__":
    print("Starting normalization of mock GLB models...")
    for model_file in TARGET_MODELS:
        normalize_model(model_file)
    print("Normalization complete.")
