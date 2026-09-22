import os
import struct

def dump_glb_json(glb_path, out_json_path):
    with open(glb_path, 'rb') as f:
        data = bytearray(f.read())
    magic = data[0:4]
    if magic != b'glTF': return
    chunk0_len, chunk0_type = struct.unpack('<I4s', data[12:20])
    if chunk0_type != b'JSON': return
    
    json_data = data[20:20+chunk0_len]
    json_str = json_data.decode('utf-8')
    
    with open(out_json_path, 'w', encoding='utf-8') as f:
        f.write(json_str)
    
    print(f"Dumped JSON chunk to {out_json_path}")
    print(f"Does the dump contain 'NaN'? {'NaN' in json_str}")

tmp_dir = "storage"
if os.path.exists(tmp_dir):
    for f in os.listdir(tmp_dir):
        if f.endswith('.glb'):
            dump_glb_json(os.path.join(tmp_dir, f), f"{f}.json")
