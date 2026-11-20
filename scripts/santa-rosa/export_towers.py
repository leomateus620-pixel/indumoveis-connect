"""Blender exporter for the Santa Rosa tower library, Higgsfield 3D Jutsu revision 2.

blender -b torres.blend -P export_towers.py -- /tmp/torres-exportadas
Produces eight pairs of front and return swatches, eight full elevations and normalized
geometry measured from the committed scene. Runtime uses the baked exports.
"""

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

dest = Path(sys.argv[sys.argv.index("--") + 1])
dest.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 6
scene.cycles.use_denoising = False
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = True
groups = sorted(
    (c for c in bpy.data.collections if "sr_family" in c),
    key=lambda c: c["sr_family"],
)
families = []
for c in groups:
    for other in groups:
        other.hide_render = other != c
    ox, oy = c["sr_origin"]
    w, d, h = c["sr_dimensions"]
    parts = []
    for obj in c.objects:
        if "sr_role" not in obj:
            continue
        corners = [obj.matrix_world @ Vector(p) for p in obj.bound_box]
        lx, ly, lz = (min(p[k] for p in corners) for k in range(3))
        hx, hy, hz = (max(p[k] for p in corners) for k in range(3))
        box = [
            ((hx + lx) / 2 - ox) / w,
            ((hy + ly) / 2 - oy) / d,
            lz / h,
            (hx - lx) / w,
            (hy - ly) / d,
            (hz - lz) / h,
        ]
        parts.append(
            {
                "role": obj["sr_role"],
                "box": [round(v, 4) for v in box],
                "finish": c["sr_palette"].split(",").index(obj["sr_colour"]),
            }
        )
    families.append(
        {"name": c["sr_name"], "palette": c["sr_palette"].split(","), "parts": parts}
    )
    i = c["sr_family"]
    camera = bpy.data.objects[c["sr_patch_camera"]]
    scene.camera = camera
    scene.render.resolution_x = scene.render.resolution_y = 256
    scene.render.filepath = str(dest / f"swatch-{i}.png")
    bpy.ops.render.render(write_still=True)
    return_cam = camera.copy()
    return_cam.data = camera.data.copy()
    scene.collection.objects.link(return_cam)
    side_target = Vector((ox, oy, h * 0.49))
    return_cam.location = side_target + Vector((65, 0, 0))
    return_cam.rotation_euler = (
        (side_target - return_cam.location).to_track_quat("-Z", "Y").to_euler()
    )
    return_cam.data.ortho_scale = d * 0.76
    scene.camera = return_cam
    scene.render.filepath = str(dest / f"return-{i}.png")
    bpy.ops.render.render(write_still=True)
    # A separate camera shows the entire three-dimensional family with podium,
    # open balconies, contrasting return and technical roof.
    review_cam = camera.copy()
    review_cam.data = camera.data.copy()
    scene.collection.objects.link(review_cam)
    target = Vector((ox, oy, h * 0.5))
    review_cam.location = target + Vector((w * 0.86, -85.0, h * 0.39))
    review_cam.rotation_euler = (
        (target - review_cam.location).to_track_quat("-Z", "Y").to_euler()
    )
    review_cam.data.ortho_scale = max(1.18 * h, w * 1.28)
    scene.camera = review_cam
    scene.render.resolution_x = scene.render.resolution_y = 384
    scene.render.filepath = str(dest / f"elevation-{i}.png")
    bpy.ops.render.render(write_still=True)
(dest / "torres-higgsfield.json").write_text(
    json.dumps(families, ensure_ascii=False, separators=(",", ":")) + "\n"
)
