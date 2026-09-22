import usdzconvert
import traceback

try:
    with open("dummy.usda", "w") as f:
        f.write("#usda 1.0\n")
    with open("dummy.png", "wb") as f:
        f.write(b"PNG")
    
    usdzconvert.package_usdz("dummy.usda", [{"filename": "dummy.png", "path": "dummy.png"}], "out.usdz")
    print("Success")
except Exception as e:
    traceback.print_exc()
