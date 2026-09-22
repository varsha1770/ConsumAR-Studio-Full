import os
import uuid
import json
import struct
import base64
import zipfile
import shutil
import subprocess
try:
    import pygltflib
except ImportError:
    pygltflib = None  # type: ignore

def preprocess_glb(glb_path):
    try:
        print("Preprocessing GLB (dequantizing, flattening hierarchy, and baking scale/rotation)...")
        tmp_path = glb_path.replace(".glb", "_tmp.glb")
        processed_path = glb_path.replace(".glb", "_processed.glb")
        gltf_cmd = "npx.cmd" if os.name == 'nt' else "npx"
        
        # Step 1: Dequantize
        cmd1 = [gltf_cmd, "--yes", "@gltf-transform/cli", "dequantize", glb_path, tmp_path]
        res1 = subprocess.run(cmd1, capture_output=True, text=True)
        if res1.returncode != 0:
            print(f"gltf-transform dequantize failed: {res1.stderr}")
            return glb_path
            
        # Step 2: Flatten
        cmd2 = [gltf_cmd, "--yes", "@gltf-transform/cli", "flatten", tmp_path, processed_path]
        res2 = subprocess.run(cmd2, capture_output=True, text=True)
        
        # Cleanup tmp file
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
            
        if res2.returncode != 0:
            print(f"gltf-transform flatten failed: {res2.stderr}")
            return glb_path

        # Step 3: Reset node scale metadata on flattened GLB to prevent double-scaling in write_usda
        try:
            gltf_obj = pygltflib.GLTF2().load(processed_path)
            for node in gltf_obj.nodes:
                node.scale = [1.0, 1.0, 1.0]
            gltf_obj.save(processed_path)
            print("Successfully cleared redundant node scale metadata post-flatten.")
        except Exception as reset_err:
            print(f"Warning: Failed to reset node scale metadata post-flatten: {reset_err}")
            
        return processed_path
    except Exception as e:
        print(f"Failed to preprocess GLB: {e}")
    return glb_path


import boto3
import numpy as np # --- NEW: Required for matrix math ---

# ------------------------------------------------------------------ CONFIG ---

S3_BUCKET    = "glb-output"
S3_FOLDER    = "temp"
REGION       = "ap-south-1"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TMP_DIR = os.path.join(BASE_DIR, "storage")
os.makedirs(TMP_DIR, exist_ok=True)

# --------------------------------------------------------------- S3 HELPERS --

def get_s3():
    return boto3.client("s3", region_name=REGION)


def download_from_s3(s3_key):
    s3         = get_s3()
    local_path = os.path.join(TMP_DIR, str(uuid.uuid4()) + ".glb")
    print("Downloading " + s3_key + " -> " + local_path)
    s3.download_file(S3_BUCKET, s3_key, local_path)
    return local_path


def download_from_url(url):
    import requests
    if url.startswith('/'):
        url = f"http://127.0.0.1:3000{url}"

    if "/api/proxy-model/" in url:
        try:
            parts = url.split("/api/proxy-model/")[1].split("/file")[0].replace('/', '')
            b64_str = parts.replace('-', '+').replace('_', '/')
            while len(b64_str) % 4: b64_str += '='
            decoded = base64.b64decode(b64_str).decode('utf-8')
            if decoded.startswith('http'):
                url = decoded
                print(f"Decoded proxy URL to original target: {url}")
        except Exception as e:
            print(f"Failed to decode proxy URL: {e}")

    local_path = os.path.join(TMP_DIR, str(uuid.uuid4()) + ".glb")
    print(f"Downloading from URL: {url} -> {local_path}")
    r = requests.get(url, stream=True, timeout=30)
    r.raise_for_status()
    with open(local_path, 'wb') as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
    return local_path


def upload_usdz_to_s3(local_path):
    s3  = get_s3()
    key = S3_FOLDER + "/" + str(uuid.uuid4()) + ".usdz"
    print("Uploading USDZ -> " + key)
    s3.upload_file(
        local_path, S3_BUCKET, key,
        ExtraArgs={
            "ContentType": "model/vnd.usdz+zip",
            "ContentDisposition": 'inline; filename="model.usdz"',
        }
    )
    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": key},
        ExpiresIn=3600,
    )
    return {"url": url, "key": key}


# ---------------------------------------------------------------- GLB PARSE --

def parse_glb(glb_path):
    with open(glb_path, "rb") as f:
        raw = f.read()

    magic = struct.unpack_from("<I", raw, 0)[0]
    if magic != 0x46546C67:
        raise ValueError("Not a valid GLB file")

    offset   = 12
    gltf     = None
    bin_data = b""

    while offset < len(raw):
        chunk_len  = struct.unpack_from("<I", raw, offset)[0]
        chunk_type = struct.unpack_from("<I", raw, offset + 4)[0]
        chunk_data = raw[offset + 8: offset + 8 + chunk_len]
        offset    += 8 + chunk_len

        if chunk_type == 0x4E4F534A:
            gltf = json.loads(chunk_data.decode("utf-8"))
        elif chunk_type == 0x004E4942:
            bin_data = chunk_data

    if gltf is None:
        raise ValueError("No JSON chunk found in GLB")

    return gltf, bin_data


# -------------------------------------------------------- TEXTURE EXTRACTION --

def extract_textures(gltf, bin_data, out_dir):
    images       = gltf.get("images", [])
    buffer_views = gltf.get("bufferViews", [])
    extracted    = []

    for i, image in enumerate(images):
        mime = image.get("mimeType", "image/png")
        ext  = ".jpg" if ("jpeg" in mime or "jpg" in mime) else ".png"

        img_bytes = None

        if "bufferView" in image:
            bv          = buffer_views[image["bufferView"]]
            byte_offset = bv.get("byteOffset", 0)
            byte_length = bv["byteLength"]
            img_bytes   = bin_data[byte_offset: byte_offset + byte_length]

        elif "uri" in image:
            uri = image["uri"]
            if uri.startswith("data:"):
                header, b64 = uri.split(",", 1)
                img_bytes   = base64.b64decode(b64)
                if "jpeg" in header or "jpg" in header:
                    ext = ".jpg"
            else:
                print("Skipping external URI: " + uri)
                continue

        if not img_bytes:
            continue

        filename = "texture_" + str(i) + ".jpg"
        path     = os.path.join(out_dir, filename)
        
        # V25: Apple AR Quick Look Texture Fix
        # Apple strictly requires standard JPEG or PNG formats. Many modern GLBs use WebP internally.
        # If Apple encounters a WebP texture, the AR engine spins endlessly and hangs.
        # We MUST force-transcode all textures to standard RGB JPEGs using Pillow!
        try:
            import io
            from PIL import Image
            img = Image.open(io.BytesIO(img_bytes))
            if img.mode != 'RGB':
                img = img.convert('RGB')
            img.save(path, 'JPEG', quality=85)
        except Exception as e:
            print(f"Failed to transcode texture {i}: {e}")
            with open(path, "wb") as f:
                f.write(img_bytes)

        extracted.append({"index": i, "filename": filename, "path": path})

    return extracted


# ------------------------------------------------ MATERIAL -> TEXTURE MAP ----

def build_material_tex_map(gltf, tex_list):
    materials = gltf.get("materials", [])
    textures  = gltf.get("textures", [])
    tex_by_source = {t["index"]: t for t in tex_list}

    material_tex_map = {}
    for i, mat in enumerate(materials):
        pbr      = mat.get("pbrMetallicRoughness", {})
        base_tex = pbr.get("baseColorTexture")
        if not base_tex:
            if tex_list:
                material_tex_map[i] = tex_list[0]
            continue
        t_idx = base_tex.get("index")
        if t_idx is not None and t_idx < len(textures):
            source = textures[t_idx].get("source", 0)
            if source in tex_by_source:
                material_tex_map[i] = tex_by_source[source]

    if not material_tex_map and tex_list:
        material_tex_map[0] = tex_list[0]

    mesh_material_map = []
    for mesh in gltf.get("meshes", []):
        prim_mats = [p.get("material", 0) for p in mesh.get("primitives", [])]
        mesh_material_map.append(prim_mats)

    return material_tex_map, mesh_material_map


# ----------------------------------------------- ACCESSOR READER ------------

def read_accessor(gltf, bin_data, acc_idx):
    if acc_idx is None:
        return []
    accessors = gltf.get("accessors", [])
    buffer_views = gltf.get("bufferViews", [])
    if acc_idx >= len(accessors):
        return []

    acc = accessors[acc_idx]
    if "bufferView" not in acc:
        return []

    bv_idx = acc["bufferView"]
    if bv_idx >= len(buffer_views):
        return []

    bv = buffer_views[bv_idx]

    byte_offset = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    count       = acc["count"]
    comp_type   = acc["componentType"]
    acc_type    = acc["type"]

    comp_fmt  = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
    comp_size = {5120: 1,   5121: 1,   5122: 2,   5123: 2,   5125: 4,   5126: 4}
    type_n    = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

    n      = type_n[acc_type]
    csize  = comp_size[comp_type]
    fmt    = comp_fmt[comp_type]
    stride = bv.get("byteStride", n * csize)

    result = []
    for i in range(count):
        off    = byte_offset + i * stride
        values = struct.unpack_from("<" + fmt * n, bin_data, off)
        result.append(values if n > 1 else values[0])

    return result

# --- NEW: Extract Node Transforms from GLTF JSON (with full parent-chain accumulation) ---
def compute_node_matrices(gltf):
    nodes = gltf.get("nodes", [])
    num_nodes = len(nodes)
    local_mats = []
    for node in nodes:
        if "matrix" in node:
            mat = np.array(node["matrix"]).reshape(4, 4).T
        else:
            mat = np.eye(4)
            if "scale" in node:
                s = node["scale"]
                mat = mat @ np.diag([s[0], s[1], s[2], 1.0])
            if "rotation" in node:
                q = node["rotation"]
                qx, qy, qz, qw = q[0], q[1], q[2], q[3]
                r_mat = np.array([
                    [1 - 2*(qy**2 + qz**2), 2*(qx*qy - qz*qw), 2*(qx*qz + qy*qw), 0],
                    [2*(qx*qy + qz*qw), 1 - 2*(qx**2 + qz**2), 2*(qy*qz - qx*qw), 0],
                    [2*(qx*qz - qy*qw), 2*(qy*qz + qx*qw), 1 - 2*(qx**2 + qy**2), 0],
                    [0, 0, 0, 1]
                ])
                mat = mat @ r_mat
            if "translation" in node:
                t = node["translation"]
                t_mat = np.eye(4)
                t_mat[:3, 3] = t
                mat = t_mat @ mat
        local_mats.append(mat)
    parent_map = {}
    for parent_idx, node in enumerate(nodes):
        for child_idx in node.get("children", []):
            parent_map[child_idx] = parent_idx
    world_mats = []
    for i in range(num_nodes):
        curr = i
        chain = []
        while curr is not None:
            chain.append(curr)
            curr = parent_map.get(curr)
        w_mat = np.eye(4)
        for n_idx in reversed(chain):
            w_mat = w_mat @ local_mats[n_idx]
        world_mats.append(w_mat)
    return world_mats

def get_global_transform(gltf, mesh_index):
    world_mats = compute_node_matrices(gltf)
    for node_idx, node in enumerate(gltf.get("nodes", [])):
        if node.get("mesh") == mesh_index:
            return world_mats[node_idx]
    return np.eye(4)


# ----------------------------------------------- WRITE USDA ------------------

def write_usda(usda_path, gltf, bin_data, material_tex_map, mesh_material_map):
    meshes_gltf = gltf.get("meshes", [])

    # Pre-pass to find global bounding box for origin centering (X, Z), floor snapping (Y=0), and smart auto-scaling
    global_min_y = 0.0
    center_x = 0.0
    center_z = 0.0
    scale_multiplier = 100.0
    
    all_x = []
    all_y = []
    all_z = []
    keywords = ["watermark", "consumar", "tryitfirst", "labs"]
    
    for mesh_i, mesh in enumerate(meshes_gltf):
        node_name = ""
        for node in gltf.get("nodes", []):
            if node.get("mesh") == mesh_i:
                node_name = node.get("name", "").lower()
                break
        if any(k in node_name for k in keywords):
            continue

        transform_mat = get_global_transform(gltf, mesh_i)
        for prim_i, prim in enumerate(mesh.get("primitives", [])):
            pos = read_accessor(gltf, bin_data, prim.get("attributes", {}).get("POSITION"))
            if not pos: continue
            for p in pos:
                vec = np.array([float(p[0]), float(p[1]), float(p[2]), 1.0])
                t_v = transform_mat.dot(vec)
                all_x.append(t_v[0])
                all_y.append(t_v[1])
                all_z.append(t_v[2])

    root_extent_str = ""
    if all_x and all_y and all_z:
        min_x, max_x = min(all_x), max(all_x)
        min_y, max_y = min(all_y), max(all_y)
        min_z, max_z = min(all_z), max(all_z)
        
        center_x = (min_x + max_x) / 2.0
        center_z = (min_z + max_z) / 2.0
        global_min_y = min_y
        
        max_extent = max(max_x - min_x, max_y - min_y, max_z - min_z)
        if max_extent > 500.0:
            scale_multiplier = 0.001
        elif max_extent > 10.0:
            scale_multiplier = 0.01
        else:
            scale_multiplier = 1.0
        
        rx1 = round((min_x - center_x) * scale_multiplier, 4)
        rx2 = round((max_x - center_x) * scale_multiplier, 4)
        ry1 = round((min_y - global_min_y) * scale_multiplier, 4)
        ry2 = round((max_y - global_min_y) * scale_multiplier, 4)
        rz1 = round((min_z - center_z) * scale_multiplier, 4)
        rz2 = round((max_z - center_z) * scale_multiplier, 4)
        root_extent_str = f"    float3[] extent = [({rx1}, {ry1}, {rz1}), ({rx2}, {ry2}, {rz2})]\n"

        print(f"[write_usda] Bounding Box: X[{min_x:.3f}, {max_x:.3f}] Y[{min_y:.3f}, {max_y:.3f}] Z[{min_z:.3f}, {max_z:.3f}] | Center: ({center_x:.3f}, {center_z:.3f}) | Scale Multiplier: {scale_multiplier}")

    lines = [
        '#usda 1.0',
        '(',
        '    defaultPrim = "Root"',
        '    metersPerUnit = 1.0',
        '    upAxis = "Y"',
        ')',
        '',
        'def Xform "Root" (',
        '    kind = "component"',
        ')',
        '{',
    ]
    if root_extent_str:
        lines.append(root_extent_str.rstrip())

    meshes_written = 0
    for mesh_i, mesh in enumerate(meshes_gltf):
        # Skip watermarks
        node_name = ""
        for node in gltf.get("nodes", []):
            if node.get("mesh") == mesh_i:
                node_name = node.get("name", "").lower()
                break
        if any(k in node_name for k in keywords):
            continue

        # --- NEW: Get the exact JSON transform Trimesh saved ---
        transform_mat = get_global_transform(gltf, mesh_i)

        for prim_i, prim in enumerate(mesh.get("primitives", [])):
            attrs   = prim.get("attributes", {})
            pos     = read_accessor(gltf, bin_data, attrs.get("POSITION"))
            nrm     = read_accessor(gltf, bin_data, attrs.get("NORMAL"))
            uvs     = read_accessor(gltf, bin_data, attrs.get("TEXCOORD_0"))
            indices = read_accessor(gltf, bin_data, prim.get("indices"))
            
            if not pos or not indices:
                continue

            meshes_written += 1
            mat_idx = prim.get("material", 0)
            tex_info = material_tex_map.get(mat_idx)
            if not tex_info and material_tex_map:
                tex_info = list(material_tex_map.values())[0]

            tex_filename = tex_info["filename"] if tex_info else None
            mesh_name    = "Mesh_" + str(mesh_i) + "_" + str(prim_i)
            mat_name     = "Mat_" + str(mat_idx)
            mat_root     = "/Root/Materials/" + mat_name

            # Ensure indices array length perfectly matches the sum of faceVertexCounts
            valid_len = (len(indices) // 3) * 3
            indices = indices[:valid_len]
            
            fvc_str = ", ".join(["3"] * (len(indices) // 3))
            idx_str = ", ".join(str(x) for x in indices)
            
            # --- THE FIX: Center X/Z at origin, snap Y to floor (0), and auto-normalize scale ---
            pts_list = []
            min_pt = [float('inf'), float('inf'), float('inf')]
            max_pt = [float('-inf'), float('-inf'), float('-inf')]

            for p in pos:
                # 1. Convert to a homogeneous coordinate vector
                vec = np.array([float(p[0]), float(p[1]), float(p[2]), 1.0])
                
                # 2. Apply the GLB node transform to physically scale the vertex
                t_vec = transform_mat.dot(vec)
                
                # 3. Center X/Z at (0,0), snap Y to floor (0), and apply scale multiplier
                x = round((t_vec[0] - center_x) * scale_multiplier, 6)
                y = round((t_vec[1] - global_min_y) * scale_multiplier, 6)
                z = round((t_vec[2] - center_z) * scale_multiplier, 6)
                
                min_pt = [min(min_pt[0], x), min(min_pt[1], y), min(min_pt[2], z)]
                max_pt = [max(max_pt[0], x), max(max_pt[1], y), max(max_pt[2], z)]
                
                pts_list.append(f"({x}, {y}, {z})")
            
            pts_str = ", ".join(pts_list)
            extent_str = f"[({min_pt[0]}, {min_pt[1]}, {min_pt[2]}), ({max_pt[0]}, {max_pt[1]}, {max_pt[2]})]"

            lines += [
                '    def Mesh "' + mesh_name + '"',
                '    {',
                '        uniform token subdivisionScheme = "none"',
                '        float3[] extent = ' + extent_str,
                '        int[] faceVertexCounts = [' + fvc_str + ']',
                '        int[] faceVertexIndices = [' + idx_str + ']',
                '        point3f[] points = [' + pts_str + ']',
            ]
            import math
            def s_f(val):
                v = float(val)
                if math.isnan(v) or math.isinf(v): return 0.0
                return round(v, 6)
            
            if nrm:
                nrm_pts = []
                for n in nrm:
                    nx, ny, nz = s_f(n[0]), s_f(n[1]), s_f(n[2])
                    n_vec = np.array([nx, ny, nz])
                    t_nrm = transform_mat[:3, :3].dot(n_vec)
                    mag = np.linalg.norm(t_nrm)
                    if mag > 1e-6: 
                        t_nrm /= mag
                    else:
                        t_nrm = np.array([0.0, 1.0, 0.0])
                    nrm_pts.append(f"({s_f(t_nrm[0])}, {s_f(t_nrm[1])}, {s_f(t_nrm[2])})")
                
                lines += [
                    '        normal3f[] normals = [' + ", ".join(nrm_pts) + '] (',
                    '            interpolation = "vertex"',
                    '        )'
                ]
            
            if uvs:
                uv_str = ", ".join(
                    f"({s_f(u[0])}, {s_f(1.0 - float(u[1]))})" for u in uvs
                )
                lines += [
                    '        texCoord2f[] primvars:st = [' + uv_str + '] (',
                    '            interpolation = "vertex"',
                    '        )',
                ]

            mat_idx = prim.get("material", 0)
            tex_info = material_tex_map.get(mat_idx)
            if not tex_info and material_tex_map:
                mat_idx = list(material_tex_map.keys())[0]
                tex_info = material_tex_map[mat_idx]

            tex_filename = tex_info["filename"] if tex_info else None
            mat_name     = "Mat_" + str(mat_idx) if tex_info else "Mat_Default"
            mat_root     = "/Root/Materials/" + mat_name

            lines.append('        rel material:binding = <' + mat_root + '>')

            lines += ['    }', '']

    if meshes_written == 0:
        raise ValueError("Zero valid 3D mesh geometry parsed from GLB (Draco or quantization compression detected)")

    lines += ['    def Scope "Materials"', '    {']

    if not material_tex_map:
        lines += [
            '        def Material "Mat_Default"',
            '        {',
            '            token outputs:surface.connect = </Root/Materials/Mat_Default/PBR.outputs:surface>',
            '',
            '            def Shader "PBR"',
            '            {',
            '                uniform token info:id = "UsdPreviewSurface"',
            '                color3f inputs:diffuseColor = (0.8, 0.8, 0.8)',
            '                float inputs:roughness = 0.5',
            '                float inputs:metallic = 0.0',
            '                token outputs:surface',
            '            }',
            '        }'
        ]
    else:
        written = set()
        for mat_idx, tex_info in material_tex_map.items():
            if mat_idx in written:
                continue
            written.add(mat_idx)
    
            mat_name = "Mat_" + str(mat_idx)
            mat_root = "/Root/Materials/" + mat_name
            tex_arc  = "textures/" + tex_info["filename"]
    
            lines += [
                '        def Material "' + mat_name + '"',
                '        {',
                '            token outputs:surface.connect = <' + mat_root + '/PBR.outputs:surface>',
                '',
                '            def Shader "PBR"',
                '            {',
                '                uniform token info:id = "UsdPreviewSurface"',
                '                color3f inputs:diffuseColor.connect = <' + mat_root + '/Tex.outputs:rgb>',
                '                float inputs:opacity = 1.0',
                '                float inputs:roughness = 0.5',
                '                float inputs:metallic = 0.0',
                '                token outputs:surface',
                '            }',
                '',
                '            def Shader "TexCoords"',
                '            {',
                '                uniform token info:id = "UsdPrimvarReader_float2"',
                '                token inputs:varname = "st"',
                '                float2 outputs:result',
                '            }',
                '',
                '            def Shader "Tex"',
                '            {',
                '                uniform token info:id = "UsdUVTexture"',
                '                asset inputs:file = @' + tex_arc + '@',
                '                float2 inputs:st.connect = <' + mat_root + '/TexCoords.outputs:result>',
                '                token inputs:wrapS = "repeat"',
                '                token inputs:wrapT = "repeat"',
                '                float3 outputs:rgb',
                '            }',
                '        }',
                '',
            ]

    lines += ['    }', '}', '']

    with open(usda_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


# --------------------------------------------------------- USDZ PACKAGING ----

def package_usdz(usda_path, tex_list, output_usdz_path):
    with zipfile.ZipFile(output_usdz_path, "w", compression=zipfile.ZIP_STORED) as zf:
        
        def write_aligned(arcname, file_path):
            with open(file_path, "rb") as f:
                data = f.read()
            
            zinfo = zipfile.ZipInfo(arcname)
            zinfo.compress_type = zipfile.ZIP_STORED
            
            # length of local file header = 30 + filename_length + extra_length
            filename_encoded = zinfo.filename.encode('utf-8')
            header_base_size = 30 + len(filename_encoded)
            
            offset = zf.fp.tell()
            padding_needed = (64 - (offset + header_base_size) % 64) % 64
            if padding_needed > 0:
                if padding_needed < 4:
                    padding_needed += 64
                data_len = padding_needed - 4
                zinfo.extra = struct.pack("<HH", 0x1993, data_len) + (b'\x00' * data_len)
            
            zf.writestr(zinfo, data)

        write_aligned("model.usda", usda_path)
        for tex in tex_list:
            arc_name = "textures/" + tex["filename"]
            write_aligned(arc_name, tex["path"])
            
    return output_usdz_path


# -------------------------------------------------------- FULL PIPELINE ------

def convert_glb_to_usdz(glb_path):
    work_dir = os.path.join(TMP_DIR, str(uuid.uuid4()))
    tex_dir  = os.path.join(work_dir, "textures")
    os.makedirs(tex_dir, exist_ok=True)

    usdz_path = glb_path.replace(".glb", ".usdz")

    try:
        try:
            gltf, bin_data = parse_glb(glb_path)
            exts = gltf.get("extensionsRequired", []) + gltf.get("extensionsUsed", [])
            if any("draco" in e.lower() or "quant" in e.lower() for e in exts):
                raise ValueError("GLB uses Draco or quantization compression, preprocessing required")

            tex_list = extract_textures(gltf, bin_data, tex_dir)
            material_tex_map, mesh_material_map = build_material_tex_map(gltf, tex_list)
            usda_path = os.path.join(work_dir, "model.usda")
            write_usda(usda_path, gltf, bin_data, material_tex_map, mesh_material_map)
        except Exception as pe:
            print(f"Direct GLB conversion failed ({pe}), falling back to preprocess_glb...")
            glb_path = preprocess_glb(glb_path)
            gltf, bin_data = parse_glb(glb_path)
            tex_list = extract_textures(gltf, bin_data, tex_dir)
            material_tex_map, mesh_material_map = build_material_tex_map(gltf, tex_list)
            usda_path = os.path.join(work_dir, "model.usda")
            write_usda(usda_path, gltf, bin_data, material_tex_map, mesh_material_map)

        package_usdz(usda_path, tex_list, usdz_path)

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

    return usdz_path


# ------------------------------------------------------------------- MAIN ----

def convert_s3_glb_to_usdz(s3_key, glb_url=None, watermark=False, watermark_text="Tryitfirstlabs"):
    try:
        clean_key = s3_key.split('?')[0] if s3_key else s3_key
        local_candidate = os.path.join(TMP_DIR, os.path.basename(clean_key))
        if os.path.exists(local_candidate):
            print(f"Found local file, skipping S3 download: {local_candidate}")
            glb_path = local_candidate
        elif os.path.exists(clean_key):
            print(f"Found local file, skipping S3 download: {clean_key}")
            glb_path = clean_key
        else:
            try:
                glb_path = download_from_s3(clean_key)
            except Exception as e:
                print(f"S3 download failed: {e}")
                if glb_url:
                    print(f"Attempting fallback URL download: {glb_url}")
                    glb_path = download_from_url(glb_url)
                else:
                    raise e
            
        if watermark:
            import trimesh
            from watermark import apply_watermark
            print(f"Applying watermark to USDZ GLB: {watermark_text}")
            scene = trimesh.load(glb_path, force='scene', process=False)
            scene = apply_watermark(scene, watermark_text)
            
            watermarked_path = glb_path.replace(".glb", "_watermarked.glb")
            scene.export(watermarked_path, file_type='glb')
            
            if glb_path != local_candidate and glb_path != s3_key:
                try:
                    os.remove(glb_path)
                except OSError:
                    pass
            glb_path = watermarked_path

        usdz_path = convert_glb_to_usdz(glb_path)
        
        # ALWAYS SERVE USDZ LOCALLY TO PREVENT S3 403 ACCESS DENIED ERRORS ON MOBILE AR
        local_filename = os.path.basename(usdz_path)
        target_storage = os.path.join(TMP_DIR, local_filename)
        if os.path.abspath(usdz_path) != os.path.abspath(target_storage):
            shutil.copy(usdz_path, target_storage)
        res_url = f"http://127.0.0.1:5001/models/{local_filename}"
        res_key = local_filename

        for p in [glb_path, usdz_path]:
            if p != local_candidate and p != s3_key and not p.endswith(".usdz"):
                try:
                    os.remove(p)
                except OSError:
                    pass

        return {
            "success":  True,
            "usdz_url": res_url,
            "file_url": res_url,
            "s3_key":   res_key,
        }

    except Exception as e:
        print("Conversion error: " + str(e))
        return {
            "success": False,
            "error":   str(e),
        }

#RANDOM