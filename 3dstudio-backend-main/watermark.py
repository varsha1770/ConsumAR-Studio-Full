import os
import numpy as np
import trimesh
from PIL import Image, ImageDraw, ImageOps, ImageFont

def generate_text_logo(text, flip=False):
    """ Generates the logo as an image. """
    try:
        if not text: text = "TryitFirstLabs"
        img = Image.new("RGBA", (1200, 300), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        font_paths = [
            "C:\\Windows\\Fonts\\arialbd.ttf", 
            "C:\\Windows\\Fonts\\arial.ttf", 
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
            "arial.ttf"
        ]
        font = None
        for p in font_paths:
            try:
                if os.path.exists(p):
                    font = ImageFont.truetype(p, 160)
                    break
            except: continue
        if not font: font = ImageFont.load_default()
        
        # V145: FULL BLACK COLOR (requested)
        draw.text((10, 10), text, font=font, fill=(0, 0, 0, 255))
        
        bbox = img.getbbox()
        if bbox: 
            img = img.crop(bbox)
            if flip: img = ImageOps.mirror(img)
            return img
        return None
    except: return None

def is_mirrored(matrix):
    """ Detects if a transformation matrix causes mirroring. """
    try: return np.linalg.det(matrix[:3, :3]) < 0
    except: return False

def apply_branding(scene, watermark_text):
    """
    V145: Enhanced Texture-Based Branding with Mirror Correction.
    Tiles the watermark directly onto the model's fabric/textures.
    """
    print(f"DEBUG: apply_branding (texture-mode) started for text='{watermark_text}'")
    try:
        logo_normal = generate_text_logo(watermark_text, flip=False)
        logo_mirrored = generate_text_logo(watermark_text, flip=True)
        if not logo_normal: return
        
        # Tilt for style
        logo_normal = logo_normal.rotate(30, expand=True, resample=Image.BICUBIC)
        logo_mirrored = logo_mirrored.rotate(-30, expand=True, resample=Image.BICUBIC)
        
        processed_textures = {}
        textures_applied = 0
        
        # Traverse the scene graph to find mirrored nodes
        # We'll map geometry names to their mirroring status
        geom_mirrored = {}
        for node in scene.graph.nodes:
            # Get world transform for this node from scene graph
            # scene.graph.get(node) returns (transform_to_world, geometry_name)
            node_data = scene.graph.get(node)
            if node_data and len(node_data) > 0:
                transform = node_data[0]
                geometry_name = node_data[1] if len(node_data) > 1 else None
                
                if geometry_name:
                    det = np.linalg.det(transform[:3, :3])
                    # Use a small epsilon. If det is 0, it's likely a malformed matrix; assume not mirrored.
                    mirrored = det < -0.0001
                    if mirrored:
                        geom_mirrored[geometry_name] = True
                    print(f"DEBUG: Node '{node}' (geom='{geometry_name}') det={det:.6f} mirrored={mirrored}")
                    # print(f"DEBUG: Matrix:\n{transform}") # Uncomment if still 0.0000
        
        for name, geom in scene.geometry.items():
            if not hasattr(geom, 'visual') or not hasattr(geom.visual, 'material'): continue
            
            mat = geom.visual.material
            if not hasattr(mat, 'baseColorTexture') or mat.baseColorTexture is None: continue
            
            # V150: ADVANCED UV MIRROR DETECTION
            # Check if UVs are mirrored by comparing UV winding to vertex winding
            use_mirrored_logo = geom_mirrored.get(name, False)
            if not use_mirrored_logo and hasattr(geom, 'faces') and len(geom.faces) > 0:
                try:
                    # Check first 5 faces for robustness
                    sample_faces = geom.faces[:5]
                    mirror_votes = 0
                    for f in sample_faces:
                        v = geom.vertices[f]
                        uv = geom.visual.uv[f]
                        # 2D cross product in UV space
                        uv_area = (uv[1][0] - uv[0][0]) * (uv[2][1] - uv[0][1]) - (uv[1][1] - uv[0][1]) * (uv[2][0] - uv[0][0])
                        print(f"DEBUG: Face UV area={uv_area:.6f}")
                        # If UV area sign is opposite to normal direction, it's mirrored
                        if uv_area < 0: mirror_votes += 1 # Standard GLB UV winding is usually negative-Y
                    
                    if mirror_votes > 2:
                        use_mirrored_logo = True
                        print(f"DEBUG: UV Mirroring detected for geometry '{name}'")
                except Exception as uv_err:
                    print(f"DEBUG: UV check failed for {name}: {uv_err}")

            tex = mat.baseColorTexture
            tex_id = id(tex)
            
            # V160: DIAGNOSTIC - FORCE NORMAL
            # We are forcing the normal logo to see if the engine's internal mirroring is the cause.
            logo_to_use = logo_normal
            
            if tex_id in processed_textures:
                mat.baseColorTexture = processed_textures[tex_id]
                textures_applied += 1
                continue
                
            try:
                base_img = tex.convert("RGBA")
                w, h = base_img.size
                
                # Proportional scaling
                l_w = max(100, int(w / 4)) 
                l_h = int(logo_to_use.height * (l_w / logo_to_use.width))
                scaled_logo = logo_to_use.resize((l_w, l_h), Image.LANCZOS)
                
                # Tiling logic (Increased Density)
                row_count = 0
                for y in range(-l_h, h + l_h, l_h + 10):
                    x_offset = int(l_w / 2) if row_count % 2 == 1 else 0
                    for x in range(-l_w, w + l_w, l_w + 15):
                        base_img.paste(scaled_logo, (x + x_offset, y), scaled_logo)
                    row_count += 1
                
                processed_textures[tex_id] = base_img
                mat.baseColorTexture = base_img
                textures_applied += 1
            except Exception as e:
                print(f"DEBUG: Error branding texture for {name}: {e}")
        
        print(f"DEBUG: Texture branding complete. Applied to {textures_applied} textures.")
        
        # ALWAYS add the physical plane for redundancy
        add_physical_watermark(scene, watermark_text)
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"DEBUG: apply_branding failed: {e}")

def add_physical_watermark(scene, watermark_text):
    """ Adds a textured plane at the base as a fallback. """
    try:
        geoms = {n: g for n, g in scene.geometry.items() if "watermark" not in n.lower()}
        all_v = [g.vertices for g in geoms.values() if hasattr(g, 'vertices') and len(g.vertices) > 0]
        if not all_v: return
        v_stack = np.vstack(all_v)
        v_min, v_max = v_stack.min(axis=0), v_stack.max(axis=0)
        center = (v_min + v_max) / 2.0
        extents = v_max - v_min
        
        plane_w, plane_d = max(extents[0] * 3.0, 2.0), max(extents[2] * 3.0, 2.0)
        plane = trimesh.creation.box(extents=[plane_w, 0.002, plane_d])
        
        logo = generate_text_logo(watermark_text)
        if not logo: return
        logo = logo.rotate(30, expand=True, resample=Image.BICUBIC)
        
        tex_size = 1024
        pattern = Image.new("RGBA", (tex_size, tex_size), (255, 255, 255, 0))
        l_w = 200
        l_h = int(logo.height * (l_w / logo.width))
        scaled_logo = logo.resize((l_w, l_h), Image.LANCZOS)
        row_count = 0
        for y in range(-l_h, tex_size + l_h, l_h + 15):
            x_offset = int(l_w / 2) if row_count % 2 == 1 else 0
            for x in range(-l_w, tex_size + l_w, l_w + 25):
                pattern.paste(scaled_logo, (x + x_offset, y), scaled_logo)
            row_count += 1
            
        material = trimesh.visual.material.PBRMaterial(baseColorTexture=pattern, alphaMode='BLEND', doubleSided=True)
        uvs = plane.vertices[:, [0, 2]] / [plane_w, plane_d] + 0.5
        plane.visual = trimesh.visual.TextureVisuals(uv=uvs, material=material)
        pos = center.copy()
        pos[1] = v_min[1] + 0.01 
        plane.apply_translation(pos)
        scene.add_geometry(plane, node_name="watermark_plane", geom_name="watermark_plane")
        print("DEBUG: Fallback physical watermark added.")
    except: pass
