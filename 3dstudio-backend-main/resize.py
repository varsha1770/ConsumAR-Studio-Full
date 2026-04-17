import os
import trimesh
import dracox

# --- THE CRITICAL FIX ---
# Manually inject dracox into trimesh's GLTF exchange
trimesh.exchange.gltf.draco = dracox
# ------------------------

import numpy as np

# ---------------- UNITS ----------------

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
    # Fallback is now 1.0 (meters) to prevent extreme microscopic shrinking
    factor = UNIT_FACTORS.get(clean_unit(unit), 1.0)
    return float(value) / factor

def to_units(value, unit):
    factor = UNIT_FACTORS.get(clean_unit(unit), 1.0)
    return float(value) * factor


# aspose.threed was fully removed so we don't need to try importing it anymore


# ---------------- UTILS ----------------

def load_scene(path, process=False):
    return trimesh.load(path, force='scene', process=process)

def get_dimensions(path):
    try:
        # Try a quick load first
        scene = load_scene(path, process=False)
        
        # Robust extent calculation
        if hasattr(scene, 'extents') and np.any(scene.extents > 1e-6):
            dims = scene.extents
        else:
            # Fallback: Force process to trigger Draco decompression or node mergers
            print("DEBUG: quick extents zero. Trying forced process load...")
            scene = load_scene(path, process=True)
            if hasattr(scene, 'extents') and np.any(scene.extents > 1e-8):
                dims = scene.extents
            elif hasattr(scene, 'geometry') and len(scene.geometry) > 0:
                print("DEBUG: scene.extents still zero. Calculating manual bounds from geometry...")
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
        err_msg = str(e)
        print(f"Error getting dimensions: {err_msg}")
        if "draco" in err_msg.lower():
            print("CRITICAL: Draco compression detected but 'draco_py' or decoder is missing in Python environment.")
        return {"width": 1, "height": 1, "depth": 1}


def resize_glb(input_path, output_path, target_dims, mode="non-uniform", axis="y", align=False):
    """
    High-Fidelity Scaling (Texture Safe).
    Uses trimesh vertex manipulation to ensure PBR materials and high-res textures are preserved.
    """
    import trimesh
    import numpy as np
    import time

    start_time = time.time()
    print(f"DEBUG: High-fidelity scaling started...")

    # 1. LOAD (process=False is CRITICAL to keep textures)
    scene = trimesh.load(input_path, force='scene', process=False)
    
    # 2. DEBUG SCENE CONTENT
    print(f"DEBUG: Scene Loaded. Type: {type(scene)}")
    if hasattr(scene, 'geometry'):
        print(f"DEBUG: Geometries found: {len(scene.geometry)}")
    
    # 3. CALC CURRENT DIMS & CENTROID
    # Use extents or fallback if zero
    if np.any(scene.extents > 1e-8):
        current_extents = scene.extents
    else:
        print("DEBUG: scene.extents is zero in resize_glb. Falling back to scene.bounds")
        current_extents = scene.bounds[1] - scene.bounds[0]
    
    # Ensure we actually have non-zero geometry to scale
    if np.any(current_extents < 1e-10):
        print("CRITICAL: Resulting dimensions are zero. Model might be Draco compressed and missing a decoder.")
        # Final attempt: check if there's ONLY one mesh and use its bounds
        if hasattr(scene, 'geometry') and len(scene.geometry) > 0:
             geom = list(scene.geometry.values())[0]
             if hasattr(geom, 'extents'):
                 current_extents = geom.extents
        
        # Still zero? Abort.
        if np.any(current_extents < 1e-10):
            raise ValueError("Model geometry appears empty or unreadable. Ensure dracox is working.")

    sx = target_dims[0] / current_extents[0]
    sy = target_dims[1] / current_extents[1]
    sz = target_dims[2] / current_extents[2]

    if mode == "uniform":
        scale = max([sx, sy, sz], key=lambda x: abs(x - 1.0))
        sx = sy = sz = scale

    # 3. Calculate Global Centroid (for centering)
    # We calculate bounds from ACTUAL vertices to ignore ghost nodes/cameras
    all_vertices = []
    if hasattr(scene, 'geometry'):
        for obj in scene.geometry.values():
            if hasattr(obj, 'vertices') and len(obj.vertices) > 0:
                all_vertices.append(obj.vertices)
    
    if not all_vertices:
        # Fallback to scene.bounds if no geometry found
        bbox_center = scene.centroid
    else:
        v_stack = np.vstack(all_vertices)
        v_min = v_stack.min(axis=0)
        v_max = v_stack.max(axis=0)
        bbox_center = (v_min + v_max) / 2.0

    # 4. PHYSICAL BAKE (V16 Identity Preservation)
    move_to_origin = np.eye(4)
    move_to_origin[:3, 3] = -bbox_center
    
    # 2. Scaling Matrix
    scale_matrix = np.diag([sx, sy, sz, 1.0])
    
    # Combine (Apply centering first, then scale)
    full_transform = scale_matrix @ move_to_origin
    
    print(f"DEBUG: Applying V16 Identity Transform -> sx={sx:.4f}, sy={sy:.4f}, sz={sz:.4f}")
    scene.apply_transform(full_transform)
    
    # 5. EXPORT
    # Export the whole scene as a single high-fidelity GLB
    # This preserves the original internal structure exactly
    scene.export(output_path, file_type='glb')
    
    # 4. FINAL SAFETY VERIFY
    if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
        raise RuntimeError("GLB export produced an empty or missing file. Possible geometry corruption.")
    
    duration = time.time() - start_time
    print(f"DEBUG: High-fidelity scaling complete in {duration:.2f}s")