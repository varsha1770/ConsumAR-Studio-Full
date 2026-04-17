import trimesh
import numpy as np

# Create a cube of size 1, translated and rotated.
box = trimesh.creation.box(extents=[1,2,3])
# offset it by [10, 0, 0]
box.apply_translation([10, 0, 0])
# create scene and rotate the node!
scene = trimesh.Scene([box])
scene.graph.update(frame_to='geometry_0', matrix=trimesh.transformations.rotation_matrix(np.pi/2, [0,1,0]))

# Simulate resize.py
current_extents = scene.extents
centroid = scene.bounding_box.centroid

print(f"Original Extents: {current_extents}")
print(f"Original Centroid: {centroid}")

target_dims = [2, 4, 6]

from trimesh import transformations

sx = target_dims[0] / current_extents[0] if current_extents[0] != 0 else 1.0
sy = target_dims[1] / current_extents[1] if current_extents[1] != 0 else 1.0
sz = target_dims[2] / current_extents[2] if current_extents[2] != 0 else 1.0

scale_matrix = transformations.scale_matrix(sx, [0,0,0])
scale_matrix[0,0] = sx
scale_matrix[1,1] = sy
scale_matrix[2,2] = sz

scene.apply_transform(scale_matrix)

print(f"New Geometry vertices max: {scene.geometry[list(scene.geometry.keys())[0]].vertices.max(axis=0)}")
print(f"New Extents BEFORE export: {scene.extents}")

scene.export("test_out.glb")

scene2 = trimesh.load("test_out.glb", force='scene', process=False)
print(f"Extents AFTER export: {scene2.extents}")
