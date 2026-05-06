from PIL import Image, ImageDraw, ImageFont, ImageOps

def test():
    # Simulate a texture
    base_img = Image.new("RGBA", (1024, 1024), (255, 255, 255, 255))
    draw = ImageDraw.Draw(base_img)
    draw.rectangle([0, 0, 1024, 1024], fill=(200, 200, 200, 255)) # Gray background
    
    # Generate logo
    logo = Image.new("RGBA", (1200, 300), (0, 0, 0, 0))
    d2 = ImageDraw.Draw(logo)
    # Using default font for test
    font = ImageFont.load_default()
    d2.text((10, 10), "TestLogo", font=font, fill=(0, 0, 0, 240))
    bbox = logo.getbbox()
    logo = logo.crop(bbox)
    
    logo = logo.rotate(30, expand=True, resample=Image.BICUBIC)
    
    l_w = 200
    l_h = int(logo.height * (l_w / logo.width))
    scaled_logo = logo.resize((l_w, l_h), Image.LANCZOS)
    
    w, h = base_img.size
    row_count = 0
    for y in range(-l_h, h + l_h, l_h + 15):
        x_offset = int(l_w / 2) if row_count % 2 == 1 else 0
        for x in range(-l_w, w + l_w, l_w + 25):
            base_img.paste(scaled_logo, (x + x_offset, y), scaled_logo)
        row_count += 1
        
    base_img.save("test_out.png")
    print("Done")

test()
