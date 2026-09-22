import trimesh

try:
    print("Loading centered.glb...")
    scene = trimesh.load('centered.glb', force='scene')
    for geom in scene.geometry.values():
        if hasattr(geom, 'visual') and hasattr(geom.visual, 'material'):
            geom.visual.material.baseColorFactor = [255, 128, 0, 255]
    print("Exporting orange.glb...")
    scene.export('orange.glb')
    print("Done!")
except Exception as e:
    import traceback
    traceback.print_exc()
