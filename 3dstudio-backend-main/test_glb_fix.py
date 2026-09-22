import struct
import json
import math

def fix_glb_nan(glb_path, out_path):
    with open(glb_path, 'rb') as f:
        data = bytearray(f.read())
    
    magic = data[0:4]
    if magic != b'glTF': 
        print("Not a GLB")
        return
        
    chunk0_len, chunk0_type = struct.unpack('<I4s', data[12:20])
    if chunk0_type != b'JSON': 
        print("Chunk0 is not JSON")
        return
        
    json_data = data[20:20+chunk0_len]
    json_str = json_data.decode('utf-8')
    
    # Manually inject a NaN for testing if not present
    if 'NaN' not in json_str:
        parsed = json.loads(json_str)
        # Add a fake node with NaN
        if "nodes" not in parsed:
            parsed["nodes"] = []
        parsed["nodes"].append({"translation": [float('nan'), float('nan'), float('nan')]})
        json_str = json.dumps(parsed)
        
    print("Has NaN before:", 'NaN' in json_str)
    
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
    
    print("Has NaN after:", 'NaN' in new_json_str)
    
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
    print("Successfully wrote fixed GLB")

import trimesh
mesh = trimesh.creation.box()
with open("test_nan_in.glb", "wb") as f:
    f.write(trimesh.exchange.gltf.export_glb(mesh))

fix_glb_nan("test_nan_in.glb", "test_nan_out.glb")
