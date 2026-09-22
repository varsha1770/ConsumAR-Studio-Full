import trimesh
import numpy as np
from PIL import Image, ImageDraw

def create_watermark(text="Tryitfirstlabs"):
    img = Image.new('RGBA', (256, 128), color=(255, 255, 255, 0))
    d = ImageDraw.Draw(img)
    # Since we can't be sure about fonts, just use default
    # But make it big if possible, default font is very small.
    try:
        from PIL import ImageFont
        font = ImageFont.truetype("arial.ttf", 40)
    except:
        font = None
    
    if font:
        d.text((10, 40), text, fill=(0, 0, 0, 255), font=font)
    else:
        d.text((10, 40), text, fill=(0, 0, 0, 255))
        
    # Create plane
    plane = trimesh.creation.box(extents=[1.0, 0.01, 0.5])
    
    # trimesh box doesn't have UVs out of the box that map 1:1 nicely for text on the top face
    # Let's create a simple quad instead
    vertices = np.array([
        [-0.5, 0, -0.25],
        [ 0.5, 0, -0.25],
        [ 0.5, 0,  0.25],
        [-0.5, 0,  0.25]
    ])
    faces = np.array([
        [0, 1, 2],
        [0, 2, 3]
    ])
    uvs = np.array([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1]
    ])
    
    material = trimesh.visual.material.SimpleMaterial(image=img)
    visuals = trimesh.visual.TextureVisuals(uv=uvs, image=img, material=material)
    
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, visual=visuals)
    
    # Try exporting to see if it works
    scene = trimesh.Scene(mesh)
    scene.export("test_watermark.glb")
    print("Success! Created test_watermark.glb")

create_watermark()
