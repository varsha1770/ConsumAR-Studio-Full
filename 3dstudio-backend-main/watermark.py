import os
import numpy as np
from PIL import Image, ImageDraw, ImageOps, ImageFont

def generate_text_logo(text, flip=False):
    try:
        if not text: text = "TryitFirstLabs"
        img = Image.new("RGBA", (1200, 300), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        font_paths = ["C:\\Windows\\Fonts\\arialbd.ttf", "C:\\Windows\\Fonts\\arial.ttf", "arial.ttf"]
        font = None
        for p in font_paths:
            try:
                if os.path.exists(p):
                    font = ImageFont.truetype(p, 160)
                    break
            except: continue
        if not font: font = ImageFont.load_default()
        draw.text((10, 10), text, font=font, fill=(128, 128, 128, 240))
        bbox = img.getbbox()
        if bbox: 
            img = img.crop(bbox)
            if flip: img = ImageOps.mirror(img)
            return img
        return None
    except: return None

def is_mirrored(matrix):
    try: return np.linalg.det(matrix[:3, :3]) < 0
    except: return False

def apply_texture_branding(scene, watermark_text):
    print(f"DEBUG: apply_texture_branding started with text='{watermark_text}'")
    try:
        logo_normal = generate_text_logo(watermark_text, flip=False)
        logo_flipped = generate_text_logo(watermark_text, flip=True)
        if not logo_normal:
            print("DEBUG: generate_text_logo returned None!")
            return
        
        logo_normal = logo_normal.rotate(30, expand=True, resample=Image.BICUBIC)
        logo_flipped = logo_flipped.rotate(-30, expand=True, resample=Image.BICUBIC)
        processed_textures = {}
        
        textures_applied = 0
        for name, geom in scene.geometry.items():
            if not hasattr(geom, 'visual') or not hasattr(geom.visual, 'material'): continue
            
            mat = geom.visual.material
            if not hasattr(mat, 'baseColorTexture') or mat.baseColorTexture is None: continue
            
            tex = mat.baseColorTexture
            tex_state = id(tex)
            if tex_state in processed_textures:
                mat.baseColorTexture = processed_textures[tex_state]
                textures_applied += 1
                continue
                
            try:
                base_img = tex.convert("RGBA")
                if max(base_img.size) > 2048:
                    base_img.thumbnail((2048, 2048), Image.LANCZOS)
                
                w, h = base_img.size
                l_w = max(60, int(w / 5)) # Slightly larger logo
                l_h = int(logo_normal.height * (l_w / logo_normal.width))
                scaled_normal = logo_normal.resize((l_w, l_h), Image.LANCZOS)
                scaled_flipped = logo_flipped.resize((l_w, l_h), Image.LANCZOS)
                
                row_count = 0
                for y in range(-l_h, h + l_h, l_h + 15):
                    x_offset = int(l_w / 2) if row_count % 2 == 1 else 0
                    col_count = 0
                    for x in range(-l_w, w + l_w, l_w + 25):
                        logo_to_paste = scaled_normal if (row_count + col_count) % 2 == 0 else scaled_flipped
                        base_img.paste(logo_to_paste, (x + x_offset, y), logo_to_paste)
                        col_count += 1
                    row_count += 1
                
                processed_textures[tex_state] = base_img
                mat.baseColorTexture = base_img
                textures_applied += 1
            except Exception as e:
                print(f"DEBUG: Watermark application error for geom {name}: {e}")
                continue
        print(f"DEBUG: Watermark applied to {textures_applied} textures.")
    except Exception as e:
        print(f"DEBUG: apply_texture_branding crashed: {e}")
