import os
import trimesh
import dracox
import numpy as np
import time
import pygltflib
from watermark import apply_watermark

# Manually inject dracox into trimesh's GLTF exchange
trimesh.exchange.gltf.draco = dracox

# Explicitly map every possible spelling the frontend might send
def fix_glb_nan(glb_path, out_path):
    import struct
    import json
    import math
    try:
        with open(glb_path, 'rb') as f:
            data = bytearray(f.read())
        magic = data[0:4]
        if magic != b'glTF': return
        chunk0_len, chunk0_type = struct.unpack('<I4s', data[12:20])
        if chunk0_type != b'JSON': return
        
        json_data = data[20:20+chunk0_len]
        json_str = json_data.decode('utf-8')
        if 'NaN' not in json_str: return
        
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
            
        parsed = json.loads(json_str)
        fixed = replace_nan(parsed)
        new_json_str = json.dumps(fixed, separators=(',', ':'), allow_nan=False)
        
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
        print("Successfully fixed NaN in GLB JSON chunk.")
    except Exception as e:
        print("Failed to fix GLB NaN:", e)

UNIT_FACTORS = {
    "m": 1.0, "meter": 1.0, "meters": 1.0,
    "cm": 100.0, "centimeter": 100.0, "centimeters": 100.0,
    "inch": 39.3701, "inches": 39.3701, "in": 39.3701,
    "ft": 3.28084, "foot": 3.28084, "feet": 3.28084
}

def clean_unit(unit):
    if not unit:
        return "m"
    return str(unit).lower().strip()

def from_units(value, unit):
    factor = UNIT_FACTORS.get(clean_unit(unit), 1.0)
    return float(value) / factor

def to_units(value, unit):
    factor = UNIT_FACTORS.get(clean_unit(unit), 1.0)
    return float(value) * factor

def load_scene(path, process=False):
    return trimesh.load(path, force='scene', process=process)

def get_dimensions(path):
    try:
        scene = load_scene(path, process=False)
        if hasattr(scene, 'extents') and np.any(scene.extents > 1e-6):
            dims = scene.extents
        else:
            scene = load_scene(path, process=True)
            if hasattr(scene, 'extents') and np.any(scene.extents > 1e-8):
                dims = scene.extents
            elif hasattr(scene, 'geometry') and len(scene.geometry) > 0:
                bounds = scene.bounds
                dims = bounds[1] - bounds[0]
            else:
                dims = [1.0, 1.0, 1.0]

        max_e = max(dims)
        if max_e > 500.0:
            dims = dims * 0.001
        elif max_e > 10.0:
            dims = dims * 0.01

        return {
            "width":  float(dims[0]),
            "height": float(dims[1]),
            "depth":  float(dims[2])
        }
    except Exception as e:
        print(f"Error getting dimensions: {str(e)}")
        return {"width": 1, "height": 1, "depth": 1}

def strip_watermark(scene):
    """V146: Removes any geometry nodes identified as CONSUMAR_WATERMARK or ground planes."""
    nodes_to_remove = [n for n in scene.graph.nodes if "CONSUMAR_WATERMARK" in n or any(k in n.lower() for k in ["watermark", "tryitfirst", "labs"])]
    try:
        for node in nodes_to_remove:
            # Get geometry name associated with node
            data = scene.graph.get(node)
            geom_name = data[1] if data and len(data) > 1 else None
            scene.graph.remove_node(node)
            if geom_name and geom_name in scene.geometry:
                del scene.geometry[geom_name]
        return len(nodes_to_remove) > 0
    except:
        return False

def resize_glb(input_path, output_path, target_dims, mode="non-uniform", axis="y", align=True, watermark=False, watermark_text="TryitFirstLabs", remove_watermark=True):
    start_time = time.time()
    print(f"DEBUG: Non-destructive root node scaling started...")

    current_dims = get_dimensions(input_path)
    curr_w = current_dims["width"]
    curr_h = current_dims["height"]
    curr_d = current_dims["depth"]

    if curr_w <= 1e-10 or curr_h <= 1e-10 or curr_d <= 1e-10:
        raise ValueError("Model geometry appears empty or unreadable.")

    target_w, target_h, target_d = target_dims

    sx = target_w / curr_w if curr_w > 0 else 1.0
    sy = target_h / curr_h if curr_h > 0 else 1.0
    sz = target_d / curr_d if curr_d > 0 else 1.0

    if mode == "uniform":
        scale = max([sx, sy, sz], key=lambda x: abs(x - 1.0))
        sx = sy = sz = scale

    print(f"DEBUG: Applying Non-Destructive Root Scale -> sx={sx:.4f}, sy={sy:.4f}, sz={sz:.4f}")

    # Load glTF structure non-destructively (preserves 100% binary buffers, Draco & PBR textures)
    gltf = pygltflib.GLTF2().load(input_path)
    scene = gltf.scenes[gltf.scene or 0]

    for node_idx in scene.nodes:
        node = gltf.nodes[node_idx]
        if node.scale is None:
            node.scale = [sx, sy, sz]
        else:
            node.scale = [
                node.scale[0] * sx,
                node.scale[1] * sy,
                node.scale[2] * sz
            ]

    gltf.save(output_path)
    fix_glb_nan(output_path, output_path)

    print(f"DEBUG: Scaling complete in {time.time() - start_time:.2f}s")