import trimesh
import dracox
import numpy as np

trimesh.exchange.gltf.draco = dracox

mesh = trimesh.creation.box()

# See what parameters export_glb accepts for draco
try:
    print("Testing default export...")
    blob1 = trimesh.exchange.gltf.export_glb(mesh)
    print(f"Default export size: {len(blob1)} bytes")
    
    print("Testing draco export (extension_draco=True)...")
    blob2 = trimesh.exchange.gltf.export_glb(mesh, extension_draco=True)
    print(f"Draco export size: {len(blob2)} bytes")
except Exception as e:
    print(f"Error: {e}")
