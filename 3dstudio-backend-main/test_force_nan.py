import subprocess
import trimesh
import json
import math
import struct
import os

def fix_glb_nan(glb_path, out_path):
    try:
        with open(glb_path, 'rb') as f:
            data = bytearray(f.read())
        magic = data[0:4]
        if magic != b'glTF': return
        chunk0_len, chunk0_type = struct.unpack('<I4s', data[12:20])
        if chunk0_type != b'JSON': return
        
        json_data = data[20:20+chunk0_len]
        json_str = json_data.decode('utf-8')
        if 'NaN' not in json_str: 
            print("NO NaN in JSON string!")
            return
            
        def replace_nan(obj):
            if isinstance(obj, float) and math.isnan(obj):
                return 0.0
            elif isinstance(obj, dict):
                return {k: replace_nan(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [replace_nan(v) for v in obj]
            return obj
            
        parsed = json.loads(json_str)
        fixed = replace_nan(parsed)
        new_json_str = json.dumps(fixed, separators=(',', ':'))
        
        padding = (4 - (len(new_json_str) % 4)) % 4
        new_json_str += ' ' * padding
        new_json_bytes = new_json_str.encode('utf-8')
        
        new_chunk0_len = len(new_json_bytes)
        new_data = bytearray()
        new_data += data[0:8]
        new_data += struct.pack('<I', 0)
        new_data += struct.pack('<I4s', new_chunk0_len, b'JSON')
        new_data += new_json_bytes
        
        rest_idx = 20 + chunk0_len
        while rest_idx < len(data):
            chunk_len, chunk_type = struct.unpack('<I4s', data[rest_idx:rest_idx+8])
            new_data += data[rest_idx:rest_idx+8+chunk_len]
            rest_idx += 8 + chunk_len
            
        new_data[8:12] = struct.pack('<I', len(new_data))
        with open(out_path, 'wb') as f:
            f.write(new_data)
        print("Fixed NaN successfully!")
    except Exception as e:
        print("Failed to fix GLB NaN:", e)

# 1. Create a mesh with NaN bounds to force Draco to output NaN
mesh = trimesh.creation.box()
# Inject NaN into a vertex to force NaN bounds
import numpy as np
mesh.vertices[0] = [np.nan, np.nan, np.nan]

in_path = "test_force_nan_in.glb"
out_path = "test_force_nan_out.glb"
with open(in_path, "wb") as f:
    f.write(trimesh.exchange.gltf.export_glb(mesh))

# 2. Run gltf-transform optimize
gltf_cmd = "npx.cmd" if os.name == 'nt' else "npx"
opt_cmd = [
    gltf_cmd, "--yes", "@gltf-transform/cli", "optimize", in_path, out_path,
    "--flatten", "false",
    "--join", "false",
    "--palette", "false",
    "--simplify", "true",
    "--texture-compress", "false",
    "--compress", "draco"
]
print("Running optimize...")
res_opt = subprocess.run(opt_cmd, capture_output=True, text=True, shell=True)
if res_opt.returncode != 0:
    print("Optimize failed:", res_opt.stderr)
else:
    print("Optimize succeeded!")
    # Check if NaN is present before fix
    with open(out_path, 'rb') as f:
        data = f.read()
    print("Has NaN before fix?", b'NaN' in data)
    
    # 3. Run fix
    fix_glb_nan(out_path, out_path)
    
    # Check if NaN is present after fix
    with open(out_path, 'rb') as f:
        data = f.read()
    print("Has NaN after fix?", b'NaN' in data)

