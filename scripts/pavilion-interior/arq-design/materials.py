"""Seamless physical swatches, packed as one portable color and ORM atlas."""

import math
import bpy
import numpy as np

# The eight columns and four rows share a swatch library across all spaces.
# Revisions replace the art inside this dedicated exhibition scene.
for item in list(bpy.data.objects):
    if item.name.startswith("ARQ_"):
        bpy.data.objects.remove(item, do_unlink=True)
for collection in (bpy.data.materials, bpy.data.images):
    for item in list(collection):
        if item.name.startswith("ARQ_"):
            collection.remove(item, do_unlink=True)

swatches = {
    "oak": ("#a28a70", "wood"),
    "walnut": ("#68503f", "wood"),
    "maple": ("#c2b5a0", "wood"),
    "travertine": ("#d5cebe", "stone"),
    "slate": ("#69736e", "stone"),
    "stone": ("#afa9a0", "stone"),
    "warmstone": ("#baafa1", "stone"),
    "terrazzo": ("#c5beb3", "terrazzo"),
    "clay": ("#a67965", "stone"),
    "linen": ("#e7dfca", "weave"),
    "boucle": ("#c4b39e", "weave"),
    "moss": ("#75806a", "weave"),
    "rust": ("#a05b43", "weave"),
    "mustard": ("#ac976b", "weave"),
    "ink": ("#414748", "weave"),
    "oxblood": ("#724853", "weave"),
    "rug": ("#ba9b82", "rug"),
    "tealrug": ("#75867e", "rug"),
    "marble": ("#e5e0d1", "marble"),
    "brass": ("#b99a67", "metal"),
    "iron": ("#414744", "metal"),
    "ceramic": ("#dedccd", "glaze"),
    "glass": ("#9eb4af", "glaze"),
    "foliage": ("#587957", "leaf"),
    "leaflight": ("#82935a", "leaf"),
    "paper": ("#e7ddc8", "plain"),
    "rattan": ("#c39d69", "cane"),
    "plaster": ("#e1d8c7", "stone"),
    "grout": ("#a69a8b", "stone"),
    "blue": ("#57778b", "weave"),
    "pattern": ("#aa9581", "pattern"),
    "leather": ("#975d3c", "leather"),
}
index = {key: i for i, key in enumerate(swatches)}
tile = 128
width, height = tile * 8, tile * 4
Y, X = np.mgrid[0:tile, 0:tile].astype("float32") / tile
tau = 2 * math.pi
rng = np.random.default_rng(20261120)
color = np.ones((height, width, 4), dtype="float32")
orm = np.ones_like(color)
for name, (hexcolor, kind) in swatches.items():
    rgb = np.array([int(hexcolor[j : j + 2], 16) / 255 for j in (1, 3, 5)])
    rough, metal = 0.78, 0.0
    grain = rng.random((tile, tile)) - 0.5
    wave = np.sin(tau * X) * np.cos(tau * Y)
    if kind == "wood":
        knots = np.sin(tau * (2 * X + Y)) * 0.3 + np.sin(tau * (X - 2 * Y)) * 0.13
        rings = np.cos(tau * (11 * Y + knots + 0.15 * np.sin(tau * X)))
        detail = (
            0.14 * rings + 0.06 * np.sin(tau * (30 * Y + knots * 2)) + 0.045 * grain
        )
        rough = 0.56
    elif kind in ("weave", "rug", "cane", "pattern", "leather"):
        detail = 0.075 * (np.sin(tau * 31 * X) + np.sin(tau * 29 * Y)) + 0.10 * grain
        if kind == "cane":
            detail += 0.15 * np.cos(tau * 8 * (X + Y)) * np.cos(tau * 8 * (X - Y))
        if kind in ("pattern", "rug"):
            detail += (
                0.18 * (np.cos(tau * (X + Y) * 3) * np.cos(tau * (X - Y) * 3) > 0.52)
                - 0.05
            )
            detail += 0.17 * ((Y > 0.05) & (Y < 0.08)) + 0.12 * (
                (Y > 0.92) & (Y < 0.95)
            )
        if kind == "leather":
            rough = 0.49
    elif kind in ("stone", "marble", "terrazzo"):
        veins = np.sin(
            tau
            * (2 * Y + X + 0.16 * np.sin(tau * 2 * X) + 0.13 * np.sin(tau * (X - Y)))
        )
        frequencies = np.fft.fftfreq(tile) * tile
        spectrum = np.fft.fft2(grain)
        smoothing = np.exp(
            -0.14 * (frequencies[:, None] ** 2 + frequencies[None, :] ** 2)
        )
        sediment = np.fft.ifft2(spectrum * smoothing).real
        sediment /= max(0.001, float(sediment.std()))
        detail = 0.024 * grain + 0.018 * sediment
        if kind == "marble" or name == "travertine":
            detail -= 0.13 * np.maximum(0, 1 - 9 * np.abs(veins))
        if kind == "terrazzo":
            for j in range(230):
                cx, cy = rng.random(2)
                rad = rng.uniform(0.004, 0.018)
                detail += float(rng.uniform(-0.38, 0.26)) * (
                    (X - cx) ** 2 + (Y - cy) ** 2 < rad**2
                )
        rough = 0.46 if kind == "marble" else 0.76
    elif kind in ("metal", "glaze"):
        detail = 0.02 * grain + 0.012 * wave
        rough, metal = (0.36, 0.68) if kind == "metal" else (0.28, 0.04)
    elif kind == "leaf":
        detail = 0.14 * wave + 0.07 * np.cos(tau * (X - 0.6 * abs(Y - 0.5)) * 9)
        rough = 0.57
    else:
        detail = 0.025 * grain
    j = index[name]
    ys = slice((j // 8) * tile, (j // 8 + 1) * tile)
    xs = slice((j % 8) * tile, (j % 8 + 1) * tile)
    color[ys, xs, :3] = np.clip(rgb * (1 + detail[:, :, None]), 0, 1)
    orm[ys, xs, 1] = np.clip(rough + grain * 0.035, 0, 1)
    orm[ys, xs, 2] = metal


def packed(name, values, colorspace):
    image = bpy.data.images.new(name, width=width, height=height, alpha=True)
    image.colorspace_settings.name = colorspace
    # These 8-bit byte images receive authored sRGB or data channel values.
    image.pixels.foreach_set(values.ravel())
    image.update()
    image.pack()
    return image


mat = bpy.data.materials.new("ARQ_Materiais_da_mostra")
mat.use_nodes = True
nt = mat.node_tree
shader = nt.nodes.get("Principled BSDF")
albedo = nt.nodes.new("ShaderNodeTexImage")
albedo.image = packed("ARQ_Materiais_cor", color, "sRGB")
nt.links.new(albedo.outputs["Color"], shader.inputs["Base Color"])
values = nt.nodes.new("ShaderNodeTexImage")
values.image = packed("ARQ_Materiais_OMR", orm, "Non-Color")
separate = nt.nodes.new("ShaderNodeSeparateColor")
nt.links.new(values.outputs["Color"], separate.inputs["Color"])
nt.links.new(separate.outputs["Green"], shader.inputs["Roughness"])
nt.links.new(separate.outputs["Blue"], shader.inputs["Metallic"])
