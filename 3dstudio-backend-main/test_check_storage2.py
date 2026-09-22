import os
import struct
import json
import math

def check_glb_nan(glb_path):
    try:
        with open(glb_path, 'rb') as f:
            data = bytearray(f.read())
        magic = data[0:4]
        if magic != b'glTF': return
        chunk0_len, chunk0_type = struct.unpack('<I4s', data[12:20])
        if chunk0_type != b'JSON': return
        
        json_data = data[20:20+chunk0_len]
        json_str = json_data.decode('utf-8')
        if 'NaN' in json_str: 
            print(f"FOUND NaN in {os.path.basename(glb_path)}!")
        else:
            print(f"No NaN in {os.path.basename(glb_path)}")
    except Exception as e:
        print(f"Error checking {glb_path}: {e}")

tmp_dir = "storage"
if os.path.exists(tmp_dir):
    print(f"Scanning {tmp_dir}...")
    count = 0
    for f in os.listdir(tmp_dir):
        if f.endswith('.glb'):
            check_glb_nan(os.path.join(tmp_dir, f))
            count += 1
    print(f"Done scanning. Checked {count} files.")
