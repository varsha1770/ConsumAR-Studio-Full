import os
import uuid
import json
import zipfile
import shutil
import numpy as np
import trimesh
import dracox
import traceback

# Manually inject dracox into trimesh's GLTF exchange
trimesh.exchange.gltf.draco = dracox

BACKEND_ROOT = os.path.dirname(os.path.abspath(__file__))
TMP_DIR = os.path.join(BACKEND_ROOT, "storage")
os.makedirs(TMP_DIR, exist_ok=True)

def download_from_s3_smart(s3_key, glb_url=None):
    """
    V17 Zero-Failure Bridge from GitHub:
    1. Check if s3_key is an absolute local path (bypass S3)
    2. Try Direct HTTP Download from glb_url
    3. Try probing local storage
    """
    local_path = os.path.join(TMP_DIR, str(uuid.uuid4()) + ".glb")

    if s3_key:
        clean_key = s3_key.strip("'\"")
        # 1. Local Path Check
        if (":\\" in clean_key or "storage" in clean_key) and os.path.exists(clean_key):
             shutil.copy2(clean_key, local_path)
             return local_path
        
        # 2. Local Storage Folder Check
        storage_alt = os.path.join(TMP_DIR, os.path.basename(clean_key))
        if os.path.exists(storage_alt):
             shutil.copy2(storage_alt, local_path)
             return local_path

    # 3. HTTP Download Fallback
    if glb_url and glb_url.startswith("http"):
        import requests
        try:
            r = requests.get(glb_url, timeout=30, stream=True)
            r.raise_for_status()
            with open(local_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
            return local_path
        except: pass

    # If all fail, assume s3_key is already a valid path (backward compatibility)
    if os.path.exists(s3_key):
        shutil.copy2(s3_key, local_path)
        return local_path
        
    raise RuntimeError(f"Could not find model file: {s3_key}")

def convert_glb_to_usdz(glb_path, watermark=True, watermark_text="TryitFirstLabs"):
    """
    V65 Hybrid Engine from GitHub:
    Extracts textures, handles Draco, and snaps model to floor.
    """
    work_dir = os.path.join(TMP_DIR, str(uuid.uuid4()))
    tex_dir = os.path.join(work_dir, "textures")
    os.makedirs(tex_dir, exist_ok=True)
    usdz_path = glb_path.replace(".glb", ".usdz")

    try:
        # Load scene without processing to preserve original materials
        scene = trimesh.load(glb_path, force='scene', process=False)

        # V147: Enhanced Kill the Floor - Remove by name OR by size
        # This catches floor meshes even if they have random names
        nodes_to_remove = []
        for node in scene.graph.nodes:
            node_data = scene.graph.get(node)
            if not node_data or len(node_data) < 2: continue
            
            name = node.lower()
            geom_name = node_data[1]
            
            # Check if name matches common floor keywords
            is_floor_name = any(word in name for word in ["watermark", "plane", "floor", "ground", "base"])
            
            # Check if the geometry is suspiciously large (e.g., wider than 3 meters)
            is_huge = False
            if geom_name in scene.geometry:
                extents = scene.geometry[geom_name].extents
                # Floor planes are usually very wide (X/Z) compared to their height
                if max(extents[0], extents[2]) > 3.0: 
                    is_huge = True

            if is_floor_name or is_huge:
                nodes_to_remove.append(node)

        for node in nodes_to_remove:
            try:
                geom_name = scene.graph.get(node)[1]
                if geom_name in scene.geometry:
                    del scene.geometry[geom_name]
                scene.graph.remove_node(node)
                print(f"DEBUG: Successfully purged floor/watermark node: {node}")
            except Exception as e:
                print(f"DEBUG: Error removing node {node}: {e}")

        meshes = scene.dump(concatenate=False)
        
        # Calculate Floor Snap using the actual final meshes (object only)
        all_v = []
        for mesh in meshes:
            if hasattr(mesh, 'vertices') and len(mesh.vertices) > 0:
                all_v.append(mesh.vertices)
        
        if not all_v: raise RuntimeError("No geometry found")
        all_v_stacked = np.vstack(all_v)
        global_min_y = all_v_stacked.min(axis=0)[1]

        # Prepare USDA content - Switch to Meters (1.0) to fix framing issues
        usda = [
            '#usda 1.0', '(', '    defaultPrim = "Root"', '    metersPerUnit = 1.0', '    upAxis = "Y"', ')',
            'def Xform "Root"', '{'
        ]
        
        mats_lines = ['    def Scope "Materials"', '    {']
        geom_lines = []
        temp_files = []
        for i, mesh in enumerate(meshes):
            mesh_name = f"Mesh_{i}"
            mat_name = f"Mat_{i}"
            mat_root = f"/Root/Materials/{mat_name}"
            
            # Texture extraction
            tex_fn = None
            if hasattr(mesh.visual, 'material'):
                mat = mesh.visual.material
                img = next((getattr(mat, a) for a in ['baseColorTexture','image','diffuseTexture'] if getattr(mat, a)), None)
                if img:
                    tex_fn = f"tex_{i}.png"
                    save_p = os.path.join(tex_dir, tex_fn)
                    img.convert('RGBA').save(save_p)
                    temp_files.append(save_p)

            # Material definition
            mats_lines += [
                f'        def Material "{mat_name}"', '        {',
                f'            token outputs:surface.connect = <{mat_root}/PBR.outputs:surface>',
                '            def Shader "PBR"', '            {',
                '                uniform token info:id = "UsdPreviewSurface"',
                '                color3f inputs:diffuseColor = (1, 1, 1)',
                '                float inputs:opacity = 1.0',
                '                token outputs:surface'
            ]
            if tex_fn: mats_lines += [f'                color3f inputs:diffuseColor.connect = <{mat_root}/Tex.outputs:rgb>']
            mats_lines += ['            }']
            
            if tex_fn:
                mats_lines += [
                    '            def Shader "TexCoords"', '            {',
                    '                uniform token info:id = "UsdPrimvarReader_float2"',
                    '                token inputs:varname = "st"', '                float2 outputs:result', '            }',
                    '            def Shader "Tex"', '            {',
                    '                uniform token info:id = "UsdUVTexture"',
                    f'                asset inputs:file = @textures/{tex_fn}@',
                    f'                float2 inputs:st.connect = <{mat_root}/TexCoords.outputs:result>',
                    '                float3 outputs:rgb', '            }'
                ]
            mats_lines += ['        }']

            # Vertex calculation (Standard Meters and floor snap)
            # We no longer multiply by 100.0 to keep dimensions native to AR QuickLook framing.
            v_fin = mesh.vertices - [0, global_min_y, 0]
            pts = [f"({v[0]:.4f},{v[1]:.4f},{v[2]:.4f})" for v in v_fin]
            idx = mesh.faces.flatten().tolist()
            
            geom_lines += [
                f'    def Mesh "{mesh_name}"', '    {',
                f'        int[] faceVertexCounts = [{", ".join(["3"]*len(mesh.faces))}]',
                f'        int[] faceVertexIndices = [{", ".join(map(str, idx))}]',
                f'        point3f[] points = [{", ".join(pts)}]'
            ]
            
            if hasattr(mesh.visual, 'uv') and mesh.visual.uv is not None:
                uvs = [f"({u:.4f},{1.0-v:.4f})" for u, v in mesh.visual.uv[mesh.faces.flatten()]]
                geom_lines += [
                    '        texCoord2f[] primvars:st = [',
                    f'            {", ".join(uvs)}',
                    '        ] (interpolation = "faceVarying")'
                ]
            geom_lines += [f'        rel material:binding = <{mat_root}>', '    }']

        mats_lines.append('    }')
        usda += geom_lines + mats_lines + ['    }', '}']
        
        usda_path = os.path.join(work_dir, "model.usda")
        with open(usda_path, 'w') as f: f.write("\n".join(usda))
        
        # Package into USDZ
        with zipfile.ZipFile(usdz_path, 'w', zipfile.ZIP_STORED) as zf:
            zf.write(usda_path, "model.usda")
            for t in os.listdir(tex_dir):
                zf.write(os.path.join(tex_dir, t), f"textures/{t}")
        
        return usdz_path

    except Exception:
        traceback.print_exc()
        return None
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

def convert_s3_glb_to_usdz(glb_p, watermark=False, watermark_text="TryitFirstLabs"):
    try:
        actual = download_from_s3_smart(glb_p)
        # V147: USDZ is always a clean export, watermark is stripped above.
        out = convert_glb_to_usdz(actual, watermark=False, watermark_text=watermark_text)
        if out:
            fn = os.path.basename(out)
            return {"success": True, "s3_key": out, "filename": fn, "url": f"http://localhost:5002/models/{fn}"}
        return {"success": False, "error": "Conversion failed"}
    except Exception as e:
        return {"success": False, "error": str(e)}