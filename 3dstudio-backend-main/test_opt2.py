import subprocess
import os

tmp_centered = "centered.glb"
output_path = "output.glb"
input_path = "c:/Users/Hi/Desktop/voxel-vista/3dstudio-backend-main/3dstudio-backend-main/test_watermark.glb"

gltf_cmd = "npx.cmd" if os.name == 'nt' else "npx"
center_cmd = [gltf_cmd, "--yes", "@gltf-transform/cli", "center", input_path, tmp_centered, "--pivot", "below"]
print("Running center...")
res = subprocess.run(center_cmd, capture_output=True, text=True, shell=True)
print("Center RC:", res.returncode)
print("Center stdout:", res.stdout)
print("Center stderr:", res.stderr)

opt_cmd = [
    gltf_cmd, "--yes", "@gltf-transform/cli", "optimize", tmp_centered, output_path,
    "--texture-compress", "false",
    "--compress", "draco"
]
print("Running optimize...")
res = subprocess.run(opt_cmd, capture_output=True, text=True, shell=True)
print("Opt RC:", res.returncode)
print("Opt stdout:", res.stdout)
print("Opt stderr:", res.stderr)
