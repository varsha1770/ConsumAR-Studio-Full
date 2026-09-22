import trimesh
from PIL import Image, ImageDraw, ImageFont
import numpy as np

def create_watermark_texture(text):
    # Create an image with transparent background
    width = 1024
    height = 256
    img = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    
    try:
        # Try to load a generic sans-serif font if available
        font = ImageFont.truetype("arial.ttf", 120)
    except IOError:
        # Fallback to default if not found (though it will be small, so we scale image instead)
        font = ImageFont.load_default()
        
    # Calculate text size and position
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    
    x = (width - text_w) / 2
    y = (height - text_h) / 2
    
    # Draw text (semi-transparent grey/white)
    draw.text((x, y), text, font=font, fill=(180, 180, 180, 200)) 
    return img

def apply_watermark(scene, text="Tryitfirstlabs"):
    if not isinstance(scene, trimesh.Scene):
        return scene

    img = create_watermark_texture(text)
    
    material = trimesh.visual.material.PBRMaterial(
        baseColorTexture=img,
        alphaMode='BLEND',
        metallicFactor=0.0,
        roughnessFactor=1.0,
        doubleSided=True
    )
    
    bounds = scene.bounds
    if bounds is None:
        return scene
        
    extents = scene.extents
    
    # Size based on the largest dimension of the scene
    w = max(extents) * 1.2
    h = w * (img.height / img.width)
    
    # Create quad in XZ plane (assuming Y is up)
    vertices = np.array([
        [-w/2, 0, -h/2],
        [ w/2, 0, -h/2],
        [ w/2, 0,  h/2],
        [-w/2, 0,  h/2]
    ])
    faces = np.array([[0, 1, 2], [0, 2, 3]])
    uv = np.array([[0, 1], [1, 1], [1, 0], [0, 0]])
    
    # Position slightly below the model's minimum Y
    min_y = bounds[0][1]
    offset = max(extents) * 0.02
    vertices[:, 1] = min_y - offset
    
    # Center the plane below the model's centroid (XZ)
    centroid = scene.centroid
    vertices[:, 0] += centroid[0]
    vertices[:, 2] += centroid[2]
    
    watermark_mesh = trimesh.Trimesh(
        vertices=vertices,
        faces=faces,
        visual=trimesh.visual.TextureVisuals(uv=uv, material=material)
    )
    
    scene.add_geometry(watermark_mesh, node_name='CONSUMAR_WATERMARK')
    
    return scene
