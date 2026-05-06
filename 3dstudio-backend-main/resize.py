import os
import trimesh
import dracox
import numpy as np
import time
import gc
from watermark import apply_texture_branding

# --- THE CRITICAL FIX ---
trimesh.exchange.gltf.draco = dracox
# ------------------------

UNIT_FACTORS = {
    "m": 1.0, "meter": 1.0, "meters": 1.0,
    "cm": 100.0, "centimeter": 100.0, "centimeters": 100.0,
    "inch": 39.3701, "inches": 39.3701, "in": 39.3701,
    "ft": 3.28084, "foot": 3.28084, "feet": 3.28084
}

def clean_unit(unit):
    if not unit: return "m"
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
        geoms = {name: g for name, g in scene.geometry.items() if "watermark" not in name.lower()}
        if geoms:
            all_v = [g.vertices for g in geoms.values() if hasattr(g, 'vertices')]
            if all_v:
                v_stack = np.vstack(all_v)
                dims = v_stack.max(axis=0) - v_stack.min(axis=0)
            else: dims = scene.extents
        else: dims = scene.extents
        return {"width": float(dims[0]), "height": float(dims[1]), "depth": float(dims[2])}
    except: return {"width": 1, "height": 1, "depth": 1}



def resize_glb(input_path, output_path, target_dims, mode="non-uniform", axis="y", align=False, watermark=False, watermark_text="TryitFirstLabs"):
    start_time = time.time()
    scene = trimesh.load(input_path, force='scene', process=False)
    
    # 1. BRANDING (Does not touch scaling math)
    if watermark:
        apply_texture_branding(scene, watermark_text)

    # 2. YOUR VERIFIED SCALING MATH (STRICTLY UNTOUCHED)
    all_v = [g.vertices for g in scene.geometry.values() if hasattr(g, 'vertices') and len(g.vertices) > 0]
    if not all_v:
        current_extents = scene.extents
        bbox_center = scene.centroid
    else:
        v_stack = np.vstack(all_v)
        v_min, v_max = v_stack.min(axis=0), v_stack.max(axis=0)
        current_extents = v_max - v_min
        bbox_center = (v_min + v_max) / 2.0

    if target_dims[0] <= 0 and target_dims[1] <= 0 and target_dims[2] <= 0:
        sx = sy = sz = 1.0
        target_dims = current_extents
    else:
        sx, sy, sz = target_dims[0] / current_extents[0], target_dims[1] / current_extents[1], target_dims[2] / current_extents[2]
        if mode == "uniform":
            scale = max([sx, sy, sz], key=lambda x: abs(x - 1.0))
            sx = sy = sz = scale

    move_to_origin = np.eye(4)
    move_to_origin[:3, 3] = -bbox_center
    scale_matrix = np.diag([sx, sy, sz, 1.0])
    full_transform = scale_matrix @ move_to_origin
    
    # BAKE TRANSFORM TO VERTICES
    for geom in scene.geometry.values():
        if hasattr(geom, 'vertices'):
            geom.apply_transform(full_transform)
    
    # RESET NODES TO IDENTITY
    for node in scene.graph.nodes:
        scene.graph.update(node, matrix=np.eye(4))

    # 3. EXPORT
    scene.export(output_path, file_type='glb')
    gc.collect()
    print(f"RESULT_DIMENSIONS: {target_dims[0]:.4f} {target_dims[1]:.4f} {target_dims[2]:.4f}")
    print(f"DEBUG: Watermark Fixed in {time.time() - start_time:.2f}s")