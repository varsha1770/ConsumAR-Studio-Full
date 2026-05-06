import trimesh
import sys
scene = trimesh.load("storage/07c15a1b-da6a-478b-a3e4-7f59a4bb7b8c_resized.glb")
try:
    print("nodes_geometry:", scene.graph.nodes_geometry)
    print("geometry_nodes:", scene.graph.geometry_nodes)
except Exception as e:
    print("Error:", e)
