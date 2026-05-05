import os
import trimesh
import dracox
import numpy as np
import time
from PIL import Image

# --- THE CRITICAL FIX ---
# Manually inject dracox into trimesh's GLTF exchange
trimesh.exchange.gltf.draco = dracox
# ------------------------

# ---------------- UNITS ----------------

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
        # Filter out existing watermarks for accurate detection
        geoms = {name: g for name, g in scene.geometry.items() if "watermark" not in name.lower()}
        if geoms:
            all_v = [g.vertices for g in geoms.values() if hasattr(g, 'vertices')]
            if all_v:
                v_stack = np.vstack(all_v)
                dims = v_stack.max(axis=0) - v_stack.min(axis=0)
            else:
                dims = scene.extents
        else:
            dims = scene.extents

        if np.any(dims < 1e-6):
             scene_p = load_scene(path, process=True)
             dims = scene_p.extents

        return {
            "width":  float(dims[0]),
            "height": float(dims[1]),
            "depth":  float(dims[2])
        }
    except Exception as e:
        return {"width": 1, "height": 1, "depth": 1}

def resize_glb(input_path, output_path, target_dims, mode="non-uniform", axis="y", align=False, watermark=False):
    start_time = time.time()
    print(f"DEBUG: High-fidelity scaling started...")

    # 1. LOAD
    scene = trimesh.load(input_path, force='scene', process=False)
    
    # 2. AGGRESSIVE WATERMARK CLEANUP (V107)
    nodes_to_del = [node for node in scene.graph.nodes if "watermark" in node.lower()]
    for n in nodes_to_del:
        try: scene.graph.remove_node(n)
        except: pass
    
    # Force purge geometry cache
    geo_to_del = [name for name in scene.geometry.keys() if "watermark" in name.lower()]
    for gname in geo_to_del:
        try: del scene.geometry[gname]
        except: pass

    # 3. CALC CURRENT DIMS & CENTROID (V16 Reference Style)
    if np.any(scene.extents > 1e-8):
        current_extents = scene.extents
    else:
        current_extents = scene.bounds[1] - scene.bounds[0]
    
    # Fallback for empty/Draco scenes
    if np.any(current_extents < 1e-10) and hasattr(scene, 'geometry') and len(scene.geometry) > 0:
         geom = list(scene.geometry.values())[0]
         if hasattr(geom, 'extents'):
             current_extents = geom.extents
    
    if np.any(current_extents < 1e-10):
        raise ValueError("Model geometry appears empty or unreadable.")

    sx = target_dims[0] / current_extents[0]
    sy = target_dims[1] / current_extents[1]
    sz = target_dims[2] / current_extents[2]

    if mode == "uniform":
        scale = max([sx, sy, sz], key=lambda x: abs(x - 1.0))
        sx = sy = sz = scale

    # 3. Calculate Global Centroid (from ACTUAL vertices)
    all_vertices = []
    if hasattr(scene, 'geometry'):
        for obj in scene.geometry.values():
            if hasattr(obj, 'vertices') and len(obj.vertices) > 0:
                all_vertices.append(obj.vertices)
    
    if not all_vertices:
        bbox_center = scene.centroid
    else:
        v_stack = np.vstack(all_vertices)
        v_min = v_stack.min(axis=0)
        v_max = v_stack.max(axis=0)
        bbox_center = (v_min + v_max) / 2.0

    # 4. PHYSICAL BAKE (V16 Identity Preservation)
    move_to_origin = np.eye(4)
    move_to_origin[:3, 3] = -bbox_center
    scale_matrix = np.diag([sx, sy, sz, 1.0])
    full_transform = scale_matrix @ move_to_origin
    
    print(f"DEBUG: Applying V16 Identity Transform -> sx={sx:.4f}, sy={sy:.4f}, sz={sz:.4f}")
    scene.apply_transform(full_transform)

    # 5. OPTIONAL WATERMARK INJECTION
    if watermark:
        print("DEBUG: Watermark Cyclorama injection starting...")
        try:
            v_min, v_max = scene.bounds[0], scene.bounds[1]
            cx, cy, cz = (v_min + v_max) / 2.0, v_min[1], (v_min + v_max) / 2.0
            W, H, D = 8.0, 8.0, 8.0
            
            # Wall Geometries
            floor = trimesh.creation.box(extents=[W, 0.001, D])
            back  = trimesh.creation.box(extents=[W, H, 0.001])
            side  = trimesh.creation.box(extents=[0.001, H, D])
            
            # Offsets
            floor.apply_translation([cx, cy, cz])
            back.apply_translation([cx, cy + H/2, cz - D/2])
            side.apply_translation([cx - W/2, cy + H/2, cz])
            
            wm_mesh = trimesh.util.concatenate([floor, back, side])
            
            # Material
            tex_path = "watermark_tiled.png"
            if os.path.exists(tex_path):
                img = Image.open(tex_path)
                mat = trimesh.visual.material.PBRMaterial(
                    baseColorTexture=img,
                    baseColorFactor=[255, 255, 255, 255],
                    metallicFactor=0.1,
                    roughnessFactor=0.8
                )
                wm_mesh.visual = trimesh.visual.TextureVisuals(uv=np.zeros((len(wm_mesh.vertices), 2)), material=mat)
            
            scene.add_geometry(wm_mesh, node_name="WatermarkNode")
        except Exception as e:
            print(f"ERROR: Watermark injection failed: {e}")

    # 6. EXPORT
    scene.export(output_path, file_type='glb')
    duration = time.time() - start_time
    print(f"DEBUG: High-fidelity scaling complete in {duration:.2f}s")