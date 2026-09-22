import os
import struct
import json
import math

def fix_glb_nan_test(glb_path):
    print(f"Testing {glb_path}")
    try:
        with open(glb_path, 'rb') as f:
            data = bytearray(f.read())
        magic = data[0:4]
        if magic != b'glTF': 
            print("Not glTF")
            return
        chunk0_len, chunk0_type = struct.unpack('<I4s', data[12:20])
        if chunk0_type != b'JSON': 
            print("Not JSON chunk")
            return
        
        json_data = data[20:20+chunk0_len]
        json_str = json_data.decode('utf-8')
        if 'NaN' not in json_str: 
            print("NO NaN in json string")
            return
            
        print("FOUND NaN, trying to parse...")
        try:
            parsed = json.loads(json_str)
            print("Parsed successfully!")
        except Exception as e:
            print("json.loads FAILED:", e)
            return

        def replace_nan(obj):
            if isinstance(obj, float):
                if math.isnan(obj) or math.isinf(obj):
                    return 0.0
                return obj
            elif isinstance(obj, dict):
                return {k: replace_nan(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [replace_nan(v) for v in obj]
            return obj
            
        fixed = replace_nan(parsed)
        
        try:
            new_json_str = json.dumps(fixed, separators=(',', ':'), allow_nan=False)
            print("json.dumps successfully!")
        except Exception as e:
            print("json.dumps FAILED:", e)
            
    except Exception as e:
        print("Outer exception:", e)

tmp_dir = "storage"
if os.path.exists(tmp_dir):
    files = [f for f in os.listdir(tmp_dir) if f.endswith('.glb')]
    # sort by modification time to get the latest
    files.sort(key=lambda x: os.path.getmtime(os.path.join(tmp_dir, x)), reverse=True)
    
    for f in files[:5]: # check latest 5
        fix_glb_nan_test(os.path.join(tmp_dir, f))
