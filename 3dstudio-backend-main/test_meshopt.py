import subprocess
import trimesh

mesh = trimesh.creation.box()
blob = trimesh.exchange.gltf.export_glb(mesh)
with open("in.glb", "wb") as f:
    f.write(blob)

cmd = ["npx.cmd", "--yes", "@gltf-transform/cli", "optimize", "in.glb", "out_meshopt.glb", "--flatten", "false", "--join", "false", "--palette", "false", "--simplify", "false", "--texture-compress", "false", "--compress", "meshopt"]
print("Running:", " ".join(cmd))
res = subprocess.run(cmd, capture_output=True, text=True)
print("Return code:", res.returncode)
print("Stdout:", res.stdout)
print("Stderr:", res.stderr)
