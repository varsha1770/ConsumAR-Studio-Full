import os
import struct
import json
import math

def fix_glb_nan(glb_path):
    print(f"Checking {glb_path}...")
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
            print("No NaN found.")
            return
            
        print("FOUND NaN in JSON!")
        
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
        
        print("Has NaN after fix?", 'NaN' in new_json_str)
    except Exception as e:
        print(f"Failed to fix GLB NaN: {e}")

tmp_dir = "tmp"
if os.path.exists(tmp_dir):
    for f in os.listdir(tmp_dir):
        if f.endswith('.glb'):
            fix_glb_nan(os.path.join(tmp_dir, f))
