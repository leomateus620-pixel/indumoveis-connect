"""ARQ & Design. Inject the registered plan JSON as PLAN for Higgsfield 3D Jutsu.

Blender (x, -plan_y, height) becomes glTF (x, height, plan_y). Scene scale
represents drawing points, so plan elements retain their original coordinates.
"""

import re

import bpy

scene = bpy.context.scene
bounds = PLAN["bounds"]
parts = {}
for environment in PLAN["environments"]:
    for part in environment["parts"]:
        points = [
            tuple(map(float, pair))
            for pair in re.findall(r"[ML]([\d.\-]+)\s+([\d.\-]+)", part["path"])
        ]
        parts[(environment["code"], part["kind"])] = points

# These three areas and their official names come directly from the plan.
floor_surfaces = {
    "01": "travertine",
    "02": "stone",
    "03": "oak",
    "04": "stone",
    "05": "warmstone",
    "06": "travertine",
    "07": "oak",
    "08": "slate",
    "09": "walnut",
    "10": "travertine",
    "11": "warmstone",
    "12": "maple",
    "13": "stone",
    "14": "terrazzo",
    "15": "stone",
    "salon": "travertine",
}
floor_colors = {
    "maple": (0.60, 0.52, 0.44),
    "travertine": (0.68, 0.54, 0.38),
    "oak": (0.48, 0.30, 0.15),
    "stone": (0.52, 0.51, 0.45),
    "slate": (0.24, 0.28, 0.27),
    "clay": (0.55, 0.29, 0.19),
    "warmstone": (0.57, 0.45, 0.37),
    "walnut": (0.32, 0.19, 0.11),
    "terrazzo": (0.62, 0.54, 0.44),
}
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

for (code, kind), points in parts.items():
    xy = [(x, -y, 0) for x, y in reversed(points)]
    mesh = bpy.data.meshes.new("Plan_" + code)
    mesh.from_pydata(xy, [], [list(range(len(xy)))])
    obj = bpy.data.objects.new("Base_" + code + "_" + kind, mesh)
    scene.collection.objects.link(obj)
    cover = "oak" if kind == "external" else floor_surfaces.get(code, "stone")
    mat = bpy.data.materials.get(cover) or bpy.data.materials.new(cover)
    mat.diffuse_color = (*floor_colors[cover], 1)
    mesh.materials.append(mat)

camera = bpy.data.cameras.new("Plan projection")
camera.type = "ORTHO"
camera.ortho_scale = bounds["maxX"] - bounds["minX"]
camera.clip_end = 5000
cam = bpy.data.objects.new("CAM_Plan", camera)
scene.collection.objects.link(cam)
cam.location = (
    (bounds["maxX"] + bounds["minX"]) / 2,
    -(bounds["maxY"] + bounds["minY"]) / 2,
    1200,
)
cam.rotation_euler = (0, 0, 0)
scene.camera = cam
for name, kind, pos, rot, energy, color in [
    ("LGT_Key", "SUN", (0, 0, 800), (0.55, -0.36, -0.2), 2.2, (1, 0.93, 0.84)),
    ("LGT_Fill", "SUN", (0, 0, 800), (-0.32, 0.42, 0.9), 0.5, (0.82, 0.9, 1.0)),
]:
    light = bpy.data.lights.new(name, kind)
    light.energy = energy
    light.color = color
    light.angle = 0.18 if name == "LGT_Key" else 0.5
    obj = bpy.data.objects.new(name, light)
    scene.collection.objects.link(obj)
    obj.location, obj.rotation_euler = pos, rot
world = bpy.data.worlds.new("Neutral studio")
scene.world = world
world.use_nodes = True
world.node_tree.nodes.get("Background").inputs["Color"].default_value = (
    0.62,
    0.65,
    0.69,
    1,
)
world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.48
scene.render.engine = "CYCLES"
scene.cycles.samples = 10
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.resolution_x = 2104
scene.render.resolution_y = 932
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "AgX"
result = {
    "planRevision": PLAN["revision"],
    "parts": len(parts),
    "bounds": bounds,
    "camera": cam.name,
}
