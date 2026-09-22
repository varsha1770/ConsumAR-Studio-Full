import struct
import json
import copy
import os

def color_orange(glb_path, out_glb_path):
    with open(glb_path, 'rb') as f:
        data = bytearray(f.read())
        
    magic = data[0:4]
    if magic != b'glTF': 
        print("Not a GLTF file!")
        return
        
    version, length = struct.unpack('<II', data[4:12])
    
    chunk0_len, chunk0_type = struct.unpack('<I4s', data[12:20])
    if chunk0_type != b'JSON': 
        print("Chunk 0 is not JSON!")
        return
        
    json_data = data[20:20+chunk0_len]
    json_obj = json.loads(json_data.decode('utf-8'))
    
    # Change all baseColorFactors to orange
    changed = False
    if 'materials' in json_obj:
        for mat in json_obj['materials']:
            if 'pbrMetallicRoughness' in mat:
                mat['pbrMetallicRoughness']['baseColorFactor'] = [1.0, 0.4, 0.0, 1.0]
                changed = True
            else:
                mat['pbrMetallicRoughness'] = {'baseColorFactor': [1.0, 0.4, 0.0, 1.0]}
                changed = True
                
    if not changed:
        print("No materials found to change.")
        return
        
    # Serialize JSON
    new_json_str = json.dumps(json_obj, separators=(',', ':'))
    # Pad to 4 bytes
    while len(new_json_str) % 4 != 0:
        new_json_str += ' '
        
    new_json_bytes = new_json_str.encode('utf-8')
    new_chunk0_len = len(new_json_bytes)
    
    # Reassemble GLB
    # new data = header + chunk0_header + chunk0_data + chunk1 (if exists)
    new_data = bytearray()
    
    # Header (12 bytes, length will be updated later)
    new_data.extend(data[0:12])
    
    # Chunk 0 Header (8 bytes)
    new_data.extend(struct.pack('<I4s', new_chunk0_len, b'JSON'))
    
    # Chunk 0 Data
    new_data.extend(new_json_bytes)
    
    # Chunk 1 Header and Data (if exists)
    offset = 20 + chunk0_len
    if offset < len(data):
        new_data.extend(data[offset:])
        
    # Update total length in Header
    struct.pack_into('<I', new_data, 8, len(new_data))
    
    with open(out_glb_path, 'wb') as f:
        f.write(new_data)
        
    print("Exported to", out_glb_path)

if __name__ == '__main__':
    color_orange('centered.glb', 'orange.glb')
