import os
import trimesh
import dracox
import numpy as np
import time

# Manually inject dracox into trimesh's GLTF exchange
trimesh.exchange.gltf.draco = dracox

# Explicitly map every possible spelling the frontend might send
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
        return {
            "width":  float(dims[0]),
            "height": float(dims[1]),
            "depth":  float(dims[2])
        }
    except Exception as e:
        print(f"Error getting dimensions: {str(e)}")
        return {"width": 1, "height": 1, "depth": 1}

def apply_watermark(scene, text="TryitFirstLabs"):
    """V146: Bakes a 3D watermark node into the scene."""
    try:
        # We'll create a distinctive "Watermark Plate" at the base
        # In a production env, this would be 3D text meshes
        ext = scene.extents
        bounds = scene.bounds
        
        # Plate size: 15% width, 2% height
        w, h, d = ext[0]*0.15, ext[1]*0.02, ext[2]*0.01
        plate = trimesh.creation.box(extents=[w, h, d])
        
        # Position: Front-Center, slightly above bottom
        # This keeps it "on" the model surface rather than "under" it
        pos = [0, bounds[0][1] + h*2, bounds[1][2]]
        plate.apply_translation(pos)
        
        # Color it distinctively (e.g. Semi-transparent Gray)
        plate.visual.face_colors = [100, 100, 100, 150]
        
        scene.add_geometry(plate, node_name="CONSUMAR_WATERMARK")
    except Exception as e:
        print(f"DEBUG: Watermark application failed: {e}")

def strip_watermark(scene):
    """V146: Removes any geometry nodes identified as CONSUMAR_WATERMARK."""
    try:
        nodes_to_remove = [n for n in scene.graph.nodes if "CONSUMAR_WATERMARK" in n]
        for node in nodes_to_remove:
            # Get geometry name associated with node
            geom_name = scene.graph.get(node)[1]
            if geom_name in scene.geometry:
                del scene.geometry[geom_name]
            scene.graph.remove_node(node)
        return len(nodes_to_remove) > 0
    except:
        return False

def resize_glb(input_path, output_path, target_dims, mode="non-uniform", axis="y", align=False, watermark=False, watermark_text="TryitFirstLabs", remove_watermark=False):
    start_time = time.time()
    print(f"DEBUG: High-fidelity scaling started...")

    # Load with process=False to preserve original textures/materials
    scene = trimesh.load(input_path, force='scene', process=False)

    if np.any(scene.extents > 1e-8):
        current_extents = scene.extents
    else:
        current_extents = scene.bounds[1] - scene.bounds[0]

    if np.any(current_extents < 1e-10):
        raise ValueError("Model geometry appears empty or unreadable.")

    sx = target_dims[0] / current_extents[0]
    sy = target_dims[1] / current_extents[1]
    sz = target_dims[2] / current_extents[2]

    if mode == "uniform":
        scale = max([sx, sy, sz], key=lambda x: abs(x - 1.0))
        sx = sy = sz = scale

    # Calculate Global Centroid for V16 Identity Transform
    all_vertices = []
    if hasattr(scene, 'geometry'):
        for obj in scene.geometry.values():
            if hasattr(obj, 'vertices') and len(obj.vertices) > 0:
                all_vertices.append(obj.vertices)

    if not all_vertices:
        bbox_center = scene.centroid
    else:
        v_stack = np.vstack(all_vertices)
        bbox_center = (v_stack.min(axis=0) + v_stack.max(axis=0)) / 2.0

    # V16: Centering + Scaling Matrix
    move_to_origin = np.eye(4)
    move_to_origin[:3, 3] = -bbox_center
    scale_matrix = np.diag([sx, sy, sz, 1.0])
    full_transform = scale_matrix @ move_to_origin

    print(f"DEBUG: Applying V16 Identity Transform -> sx={sx:.4f}, sy={sy:.4f}, sz={sz:.4f}")
    scene.apply_transform(full_transform)

    # Align to floor if requested
    if align:
        v_min_y = np.vstack([g.vertices for g in scene.geometry.values() if hasattr(g, 'vertices')]).min(axis=0)[1]
        scene.apply_translation([0, -v_min_y, 0])
    
    # V146: Process Watermark requests
    if remove_watermark:
        stripped = strip_watermark(scene)
        if stripped: print("DEBUG: Watermark identified and removed.")
    
    if watermark:
        apply_watermark(scene, watermark_text)
        print(f"DEBUG: Watermark '{watermark_text}' applied.")

    scene.export(output_path, file_type='glb')
    print(f"DEBUG: Scaling complete in {time.time() - start_time:.2f}s")