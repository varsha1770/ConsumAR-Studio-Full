from PIL import Image, ImageDraw, ImageFont, ImageOps
import os

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

def create_tiled_watermark():
    logo = generate_text_logo("TryitFirstLabs")
    if not logo: return
    logo = logo.rotate(30, expand=True, resample=Image.BICUBIC)
    
    # Create a 1024x1024 tiled watermark image
    w, h = 1024, 1024
    pattern = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    
    l_w = 200
    l_h = int(logo.height * (l_w / logo.width))
    scaled_logo = logo.resize((l_w, l_h), Image.LANCZOS)
    
    row_count = 0
    for y in range(-l_h, h + l_h, l_h + 15):
        x_offset = int(l_w / 2) if row_count % 2 == 1 else 0
        for x in range(-l_w, w + l_w, l_w + 25):
            pattern.paste(scaled_logo, (x + x_offset, y), scaled_logo)
        row_count += 1
        
    pattern.save("watermark_tiled.png")
    print("watermark_tiled.png generated successfully.")

create_tiled_watermark()
