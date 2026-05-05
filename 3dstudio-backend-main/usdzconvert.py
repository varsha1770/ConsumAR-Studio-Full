import trimesh
import numpy as np
import os
import uuid
import zipfile
import sys
import json
import traceback
import shutil
import requests

# Reference Draco Injection
try:
    import dracox
    trimesh.exchange.gltf.draco = dracox
except: pass

def download_from_s3_smart(s3_key):
    """ V15: High-Performance S3 Linker """
    try:
        from s3_utils import download_from_s3
        return download_from_s3(s3_key)
    except Exception as e:
        print(f"DEBUG: S3_Utils import failed in child. Falling back to local check. Error: {e}")
        tmp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "storage")
        clean_key = s3_key.strip("'\"")
        if os.path.exists(clean_key): return clean_key
        alt = os.path.join(tmp_dir, os.path.basename(clean_key))
        if os.path.exists(alt): return alt
        return s3_key

def convert_glb_to_usdz(input_path, watermark=True):
    """ V65: Reference Hybrid (Complete Build) """
    try:
        # V76: Disable processing to ensure V16 Texture Lock is preserved
        scene = trimesh.load(input_path, force='scene', process=False)
        all_v = []
        for name, geom in scene.geometry.items():
            if hasattr(geom, 'vertices') and len(geom.vertices) > 0:
                nodes = [n for n in scene.graph.nodes if scene.graph.get(n)[1] == name]
                if not nodes: nodes = [name]
                for node in nodes:
                    try:
                        t = scene.graph.get(node)[0]
                        all_v.append(trimesh.transform_points(geom.vertices, t))
                    except: all_v.append(geom.vertices)
        if not all_v: raise RuntimeError("No geometry")
        all_v_stacked = np.vstack(all_v)
        rmin, rmax = all_v_stacked.min(axis=0), all_v_stacked.max(axis=0)
        ext = rmax - rmin
        scale = 100.0 if np.max(ext) < 5.0 else 1.0
        cx, cz, gy = (rmax[0]+rmin[0])/2.0, (rmax[2]+rmin[2])/2.0, rmin[1]
        
        usda = ['#usda 1.0', '(', '    defaultPrim = "Root"', '    metersPerUnit = 0.01', '    upAxis = "Y"', ')', 'def Xform "Root"', '{']
        mats_lines = ['    def Scope "Materials"', '    {']
        geom_lines, temp_files = [], []
        meshes = scene.dump(concatenate=False)
        for i, mesh in enumerate(meshes):
            mname, mroot = f"Mat_{i}", f"/Root/Materials/Mat_{i}"
            tex_fn = None
            if hasattr(mesh.visual, 'material'):
                mat = mesh.visual.material
                img = next((getattr(mat, a) for a in ['baseColorTexture','image','diffuseTexture'] if getattr(mat, a)), None)
                if img:
                    tex_fn = f"tex_{i}_{str(uuid.uuid4())[:8]}.png"
                    save_p = os.path.join(os.path.dirname(input_path), tex_fn)
                    img.convert('RGBA').save(save_p); temp_files.append(save_p)
            mats_lines += [f'        def Material "{mname}"', '        {', f'            token outputs:surface.connect = <{mroot}/PBR.outputs:surface>', '            def Shader "PBR"', '            {', '                uniform token info:id = "UsdPreviewSurface"', '                color3f inputs:diffuseColor = (1, 1, 1)', '                float inputs:opacity = 1.0', '                token outputs:surface']
            if tex_fn: mats_lines += [f'                color3f inputs:diffuseColor.connect = <{mroot}/Tex.outputs:rgb>']
            mats_lines += ['            }']
            if tex_fn:
                mats_lines += ['            def Shader "TexCoords"', '            {', '                uniform token info:id = "UsdPrimvarReader_float2"', '                token inputs:varname = "st"', '                float2 outputs:result', '            }', '            def Shader "Tex"', '            {', '                uniform token info:id = "UsdUVTexture"', f'                asset inputs:file = @textures/{tex_fn}@', f'                float2 inputs:st.connect = <{mroot}/TexCoords.outputs:result>', '                float3 outputs:rgb', '            }']
            mats_lines += ['        }']
            v_fin = (mesh.vertices * scale) - [cx*scale, gy*scale, cz*scale]
            pts = [f"({v[0]:.4f},{v[1]:.4f},{v[2]:.4f})" for v in v_fin]
            idx = mesh.faces.flatten().tolist()
            geom_lines += [f'    def Mesh "Mesh_{i}"', '    {', f'        int[] faceVertexCounts = [{", ".join(["3"]*len(mesh.faces))}]', '        int[] faceVertexIndices = [']
            for k in range(0, len(idx), 20): geom_lines += [f'            {", ".join(map(str, idx[k:k+20]))},']
            geom_lines += ['        ]', '        point3f[] points = [']
            for k in range(0, len(pts), 5): geom_lines += [f'            {", ".join(pts[k:k+5])},']
            geom_lines += ['        ]']
            if hasattr(mesh.visual, 'uv') and mesh.visual.uv is not None:
                uvs = [f"({u:.4f},{1.0-v:.4f})" for u, v in mesh.visual.uv[mesh.faces.flatten()]]
                geom_lines += ['        texCoord2f[] primvars:st = [']
                for k in range(0, len(uvs), 10): geom_lines += [f'            {", ".join(uvs[k:k+10])},']
                geom_lines += ['        ] (interpolation = "faceVarying")']
            geom_lines += [f'        rel material:binding = <{mroot}>', '    }']
        if watermark:
            wm_root = "/Root/Materials/WatermarkMat"
            mats_lines += [
                f'        def Material "WatermarkMat"',
                '        {',
                f'            token outputs:surface.connect = <{wm_root}/PBR.outputs:surface>',
                '            def Shader "PBR"',
                '            {',
                '                uniform token info:id = "UsdPreviewSurface"',
                f'                color3f inputs:diffuseColor.connect = <{wm_root}/Tex.outputs:rgb>',
                f'                float inputs:opacity.connect = <{wm_root}/Tex.outputs:a>',
                '                float inputs:opacityThreshold = 0.1',
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
                '                asset inputs:file = @watermark_tiled.png@',
                f'                float2 inputs:st.connect = <{wm_root}/TexCoords.outputs:result>',
                '                float3 outputs:rgb',
                '                float outputs:a',
                '            }',
                '        }'
            ]
            
            # Dynamic bounds for USDZ watermark (1 unit = 1cm if metersPerUnit=0.01)
            # Expand watermark to 3x footprint
            hw = max((ext[0] * scale) * 1.5, 100.0) # 100cm min
            hd = max((ext[2] * scale) * 1.5, 100.0) # 100cm min
            wm_pts = [f"({-hw:,.2f},-0.20,{hd:,.2f})", f"({hw:,.2f},-0.20,{hd:,.2f})", f"({hw:,.2f},-0.20,{-hd:,.2f})", f"({-hw:,.2f},-0.20,{-hd:,.2f})"]
            u_tile, v_tile = max((2*hw) / 50.0, 1.0), max((2*hd) / 50.0, 1.0) # 1 tile per 50cm
            
            geom_lines += [
                '    def Mesh "WatermarkFloor"',
                '    {',
                '        int[] faceVertexCounts = [4]',
                '        int[] faceVertexIndices = [0, 3, 2, 1]',
                f'        point3f[] points = [{", ".join(wm_pts)}]',
                f'        texCoord2f[] primvars:st = [(0,0), ({u_tile:.1f},0), ({u_tile:.1f},{v_tile:.1f}), (0,{v_tile:.1f})] (interpolation = "faceVarying")',
                f'        rel material:binding = <{wm_root}>',
                '    }'
            ]
        usda += geom_lines + mats_lines + ['    }', '}']
        usda_p = input_path.replace(".glb", ".usda")
        with open(usda_p, 'w') as f: f.write("\n".join(usda))
        out_z = input_path.replace(".glb", ".usdz")
        with zipfile.ZipFile(out_z, 'w', zipfile.ZIP_STORED) as zf:
            zf.write(usda_p, os.path.basename(usda_p))
            wm_img = os.path.join(os.path.dirname(__file__), "watermark_tiled.png")
            if os.path.exists(wm_img): zf.write(wm_img, "watermark_tiled.png")
            for t in temp_files: zf.write(t, "textures/" + os.path.basename(t))
        try: os.remove(usda_p)
        except: pass
        return out_z
    except: traceback.print_exc(); return None

def convert_s3_glb_to_usdz(glb_p, watermark=True):
    actual = download_from_s3_smart(glb_p)
    out = convert_glb_to_usdz(actual, watermark=watermark)
    if out:
        fn = os.path.basename(out)
        return {"success": True, "s3_key": out, "filename": fn, "url": f"http://127.0.0.1:5001/models/{fn}"}
    return {"success": False, "error": "Failed"}

if __name__ == "__main__":
    try:
        data = json.load(sys.stdin)
        print(json.dumps(convert_s3_glb_to_usdz(data.get("s3_key"), watermark=data.get("watermark", True))))
    except Exception as e: print(json.dumps({"success": False, "error": str(e)}))