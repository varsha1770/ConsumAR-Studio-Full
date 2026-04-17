import os
import uuid
import json
import zipfile
import shutil
import boto3
import io
import numpy as np
from PIL import Image
import trimesh
import dracox

# --- THE CRITICAL FIX ---
# Manually inject dracox into trimesh's GLTF exchange
trimesh.exchange.gltf.draco = dracox
# ------------------------

# ------------------------------------------------------------------ CONFIG ---

S3_BUCKET    = "glb-output"
S3_FOLDER    = "temp"
REGION       = "ap-south-1"

BACKEND_ROOT = os.path.dirname(os.path.abspath(__file__))
TMP_DIR      = os.path.join(BACKEND_ROOT, "storage")
os.makedirs(TMP_DIR, exist_ok=True)

# --------------------------------------------------------------- S3 HELPERS --

def get_s3():
    return boto3.client("s3", region_name=REGION)

def download_from_s3(s3_key, glb_url=None):
    """
    V17 Zero-Failure Bridge:
    1. Check if s3_key is an absolute local path (bypass S3)
    2. Try Direct HTTP Download from glb_url (Priority)
    3. Try probing S3 buckets as final backup
    """
    local_path = os.path.join(TMP_DIR, str(uuid.uuid4()) + ".glb")

    # 1. LOCAL DISK CHECK (Absolute Reality Lock)
    if s3_key:
        clean_key = s3_key.strip("'\"")
        # Handle Windows absolute paths or relative storage paths
        if (":\\" in clean_key or clean_key.startswith("storage\\")) and os.path.exists(clean_key):
             print(f"DEBUG: V17 Local Lock hit -> {clean_key}")
             shutil.copy2(clean_key, local_path)
             return local_path
        
        # Fallback: check if it's just the filename in TMP_DIR
        storage_alt = os.path.join(TMP_DIR, os.path.basename(clean_key))
        if os.path.exists(storage_alt):
             print(f"DEBUG: V17 Local Lock hit (alt) -> {storage_alt}")
             shutil.copy2(storage_alt, local_path)
             return local_path

    # 2. GLB_URL DOWNLOAD (High Priority)
    if glb_url and glb_url.startswith("http"):
        import requests
        try:
            print(f"DEBUG: V17 HTTP Fallback -> Downloading from {glb_url[:80]}...")
            r = requests.get(glb_url, timeout=30, stream=True)
            r.raise_for_status()
            with open(local_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
            print("SUCCESS: URL download successful.")
            return local_path
        except Exception as e:
            print(f"WARNING: V17 URL download failed: {str(e)}")

    # 3. S3 BUCKET PROBE (Final Backup)
    if s3_key:
        filename = os.path.basename(s3_key)
        buckets_to_try = [S3_BUCKET, "tryitproductmodels"]
        keys_to_try = [s3_key, filename, f"temp/{filename}"]
        # Sanitization: Remove any paths from S3 keys
        keys_to_try = [k for k in keys_to_try if k and ":" not in k and "\\" not in k]
        
        s3 = get_s3()
        for bucket in buckets_to_try:
            for key in keys_to_try:
                try:
                    print(f"DEBUG: S3 Probe -> bucket={bucket}, key={key}")
                    s3.download_file(bucket, key, local_path)
                    print(f"SUCCESS: Found in bucket={bucket}")
                    return local_path
                except: continue

    raise RuntimeError(f"Could not find model file {s3_key} via Local, HTTP, or S3 probe.")

def upload_usdz_to_s3(local_path):
    s3  = get_s3()
    key = S3_FOLDER + "/" + str(uuid.uuid4()) + ".usdz"
    s3.upload_file(
        local_path, S3_BUCKET, key,
        ExtraArgs={
            "ContentType": "model/vnd.usdz+zip",
            "ContentDisposition": "inline",
        }
    )
    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": key},
        ExpiresIn=3600,
    )
    return {"url": url, "key": key}

# --------------------------------------------------------- NATIVE CONVERTER ---

def convert_glb_to_usdz(glb_path):
    """
    Absolute Texture Lock (V5): Uses Native Trimesh Engine to extract textures.
    This bypasses all binary parsing issues with Draco/Basis models.
    """
    work_dir = os.path.join(TMP_DIR, str(uuid.uuid4()))
    tex_dir  = os.path.join(work_dir, "textures")
    os.makedirs(tex_dir, exist_ok=True)
    
    usdz_path = glb_path.replace(".glb", ".usdz")
    
    try:
        # 1. LOAD MODEL (Native Unlocking)
        print(f"DEBUG: Native Unlocking {glb_path}...")
        scene = trimesh.load(glb_path, force='scene', process=True)
        
        # SAFETY CHECK: Ensure scene is valid
        if scene is None or len(scene.geometry) == 0:
            raise RuntimeError(f"Failed to load 3D model from {glb_path}. File might be empty or corrupted.")
            
        # 2. EXTRACT GEOMETRIES & TEXTURES (The Engine Way)
        # Use dump(concatenate=False) to get world-safe meshes with their own visuals
        meshes = scene.dump(concatenate=False)
        
        if meshes is None:
            raise RuntimeError("Geometry extraction (dump) failed. No meshes found in the scene.")
        
        # 3. ANTI-GRAVITY FIX: Calculate floor snap from physical world positions
        global_min_y = float("inf")
        for mesh in meshes:
            if hasattr(mesh, 'vertices') and len(mesh.vertices) > 0:
                y_min = mesh.vertices[:, 1].min()
                if y_min < global_min_y:
                    global_min_y = y_min
        if global_min_y == float("inf"): global_min_y = 0.0
        
        # 4. PREPARE USDA & TEXTURES
        usda_lines = [
            '#usda 1.0',
            '(',
            '    defaultPrim = "Root"',
            '    metersPerUnit = 0.01',
            '    upAxis = "Y"',
            ')',
            'def Xform "Root"',
            '{',
        ]
        
        materials_lines = [ '    def Scope "Materials"', '    {']
        processed_textures = {} # original_id -> filename
        processed_materials = set()
        
        for i, mesh in enumerate(meshes):
            mesh_name = f"Mesh_{i}"
            mat_name = f"Mat_{i}"
            mat_root = f"/Root/Materials/{mat_name}"
            
            # Extract Texture for this mesh (V16 Enhanced Audit)
            tex_filename = None
            if hasattr(mesh.visual, 'material'):
                mat = mesh.visual.material
                img = None
                
                # Try standard trimesh PBR lookups
                if hasattr(mat, 'baseColorTexture') and mat.baseColorTexture is not None:
                    img = mat.baseColorTexture
                elif hasattr(mat, 'image') and mat.image is not None:
                    img = mat.image
                
                # V16: Deep Audit - Check if it's a PBRMaterial with internal dicts
                if img is None and hasattr(mat, 'to_color'):
                    # Some materials mask their textures in sub-properties
                    try:
                        if hasattr(mat, 'main_texture'):
                             img = mat.main_texture
                    except: pass
                
                if img is not None:
                    img_id = id(img)
                    if img_id not in processed_textures:
                        fname = f"texture_{len(processed_textures)}.png"
                        fpath = os.path.join(tex_dir, fname)
                        img.save(fpath, "PNG")
                        processed_textures[img_id] = fname
                        print(f"DEBUG: V16 Audit -> Mesh '{mesh_name}' texture SAVED as {fname}")
                    tex_filename = processed_textures[img_id]
                else:
                    print(f"DEBUG: V16 Audit -> Mesh '{mesh_name}' HAS NO TEXTURE (using fallback)")

            # Physical Geometry Calculation
            pts_list = [f"({round(v[0]*100.0, 6)}, {round((v[1]-global_min_y)*100.0, 6)}, {round(v[2]*100.0, 6)})" for v in mesh.vertices]
            indices = mesh.faces.flatten()
            idx_str = ", ".join(map(str, indices))
            fvc_str = ", ".join(["3"] * len(mesh.faces))
            
            usda_lines += [
                f'    def Mesh "{mesh_name}"',
                '    {',
                f'        int[] faceVertexCounts = [{fvc_str}]',
                f'        int[] faceVertexIndices = [{idx_str}]',
                f'        point3f[] points = [{", ".join(pts_list)}]',
            ]
            
            # Normals
            if hasattr(mesh, 'vertex_normals'):
                nrm_list = [f"({round(n[0],6)}, {round(n[1],6)}, {round(n[2],6)})" for n in mesh.vertex_normals]
                usda_lines += [
                    f'        normal3f[] normals = [{", ".join(nrm_list)}] (',
                    '            interpolation = "vertex"',
                    '        )',
                ]
            
            # UVs (V15 FIX: Use faceVarying for maximum compatibility)
            if hasattr(mesh.visual, 'uv') and mesh.visual.uv is not None:
                # We map vertex UVs to face corners
                uv_data = mesh.visual.uv
                face_uvs = []
                for face in mesh.faces:
                    for v_idx in face:
                        u, v = uv_data[v_idx]
                        face_uvs.append(f"({round(u,6)}, {round(1.0 - v,6)})")
                
                usda_lines += [
                    f'        texCoord2f[] primvars:st = [{", ".join(face_uvs)}] (',
                    '            interpolation = "faceVarying"',
                    '        )',
                ]

            if tex_filename:
                usda_lines.append(f'        rel material:binding = <{mat_root}>')
                
                if mat_name not in processed_materials:
                    processed_materials.add(mat_name)
                    tex_arc = f"textures/{tex_filename}"
                    materials_lines += [
                        f'        def Material "{mat_name}"',
                        '        {',
                        f'            token outputs:surface.connect = <{mat_root}/PBR.outputs:surface>',
                        '            def Shader "PBR"',
                        '            {',
                        '                uniform token info:id = "UsdPreviewSurface"',
                        f'                color3f inputs:diffuseColor.connect = <{mat_root}/Tex.outputs:rgb>',
                        '                float inputs:roughness = 0.4',
                        '                float inputs:metallic = 0.1',
                        '                token outputs:surface',
                        '            }',
                        '            def Shader "TexCoords"',
                        '            {',
                        '                uniform token info:id = "UsdPrimvarReader_float2"',
                        '                token inputs:varname = "st"',
                        '                float2 outputs:result',
                        '            }',
                        '            def Shader "Tex"',
                        '            {',
                        '                uniform token info:id = "UsdUVTexture"',
                        f'                asset inputs:file = @{tex_arc}@',
                        f'                float2 inputs:st.connect = <{mat_root}/TexCoords.outputs:result>',
                        '                float3 outputs:rgb',
                        '            }',
                        '        }',
                    ]
            else:
                # Fallback Material (Silver/Grey)
                usda_lines.append(f'        rel material:binding = <{mat_root}>')
                if mat_name not in processed_materials:
                    processed_materials.add(mat_name)
                    materials_lines += [
                        f'        def Material "{mat_name}"',
                        '        {',
                        f'            token outputs:surface.connect = <{mat_root}/PBR.outputs:surface>',
                        '            def Shader "PBR"',
                        '            {',
                        '                uniform token info:id = "UsdPreviewSurface"',
                        '                color3f inputs:diffuseColor = (0.8, 0.8, 0.8)',
                        '                float inputs:roughness = 0.3',
                        '                float inputs:metallic = 0.5',
                        '                token outputs:surface',
                        '            }',
                        '        }',
                    ]
            
            usda_lines.append('    }')

        materials_lines.append('    }')
        usda_lines += materials_lines
        usda_lines += ['}', '']
        
        # 5. SAVE USDA
        usda_path = os.path.join(work_dir, "model.usda")
        with open(usda_path, "w", encoding="utf-8") as f:
            f.write("\n".join(usda_lines))
            
        # 6. PACKAGE USDZ
        with zipfile.ZipFile(usdz_path, "w", compression=zipfile.ZIP_STORED) as zf:
            zf.write(usda_path, arcname="model.usda")
            for fname in os.listdir(tex_dir):
                zf.write(os.path.join(tex_dir, fname), arcname=f"textures/{fname}")
                
        print(f"DEBUG: USDZ created successfully at {usdz_path}")
        return usdz_path
        
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

# ------------------------------------------------------------- SYNC WRAPPER ---

def convert_s3_glb_to_usdz(s3_key, glb_url=None):
    try:
        glb_path  = download_from_s3(s3_key, glb_url)
        usdz_path = convert_glb_to_usdz(glb_path)
        s3_data   = upload_usdz_to_s3(usdz_path)
        
        try: os.remove(glb_path)
        except: pass

        return {
            "success":  True,
            "filename": os.path.basename(usdz_path),
            "file_url": s3_data["url"],
            "s3_key":   s3_data["key"],
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}