import os
import shutil
from usdzconvert import convert_glb_to_usdz

glb_path = r"c:\Users\Hi\Desktop\voxel-vista\3dstudio-backend-main\3dstudio-backend-main\storage\e13a7ee6-a581-4ee0-b916-54f9de2e8340.glb"

usdz_path = convert_glb_to_usdz(glb_path)
shutil.copy(usdz_path, "test_output.usdz")
print(f"Generated: test_output.usdz")
