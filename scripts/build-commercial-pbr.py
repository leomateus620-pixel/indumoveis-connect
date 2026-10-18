"""Deterministic, local PBR atlas sources and official Basis/KTX2 encoding.

Run with the bundled Python (Pillow + NumPy) and an installed/extracted Khronos
toktx 4.4.2: python scripts/build-commercial-pbr.py --toktx /path/to/toktx
No reference photo is copied into the asset. All samples are authored here.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import shutil

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "commercial-map" / "pbr"
SOURCES = ROOT / "artifacts.local" / "commercial-map-pbr" / "sources"
FAMILIES = ["mineral", "concrete", "asphalt", "paintedMetal", "grass"]


def field(size, seed):
    """Smooth wrapped value field. Fixed integer periods avoid texture seams."""
    rng = np.random.default_rng(seed)
    result = np.zeros((size, size), np.float64)
    for period, amplitude in [(3, .38), (11, .25), (29, .2), (61, .17)]:
        grid = rng.random((period, period))
        axis = np.arange(size) * period / size
        index = np.floor(axis).astype(int)
        t = axis - index
        t = t * t * (3 - 2 * t)
        a, b = index % period, (index + 1) % period
        lower = grid[np.ix_(a, a)] * (1 - t)[None, :] + grid[np.ix_(a, b)] * t[None, :]
        upper = grid[np.ix_(b, a)] * (1 - t)[None, :] + grid[np.ix_(b, b)] * t[None, :]
        result += (lower * (1 - t)[:, None] + upper * t[:, None]) * amplitude
    return result


def tile(size, family):
    n = field(size, 87013 + FAMILIES.index(family) * 739)
    fine = field(size, 11369 + FAMILIES.index(family) * 1783)
    y, x = np.mgrid[:size, :size] / size
    height = (n - .5) * .08
    albedo = .955 + (n - .5) * .075
    roughness = .945 + (fine - .5) * .07
    ao = .97 - np.maximum(0, .5 - n) * .09
    strength = .75
    if family == "concrete":
        # Fine mineral aggregate and a sparse, worn joint. The map is a surface
        # repeat, not a new sidewalk edge or a replacement source polygon.
        joint = np.exp(-np.minimum(x, 1 - x) ** 2 / .000025)
        height = height * .5 - joint * .024
        albedo = .955 + (n - .5) * .10 - joint * .035
        ao -= joint * .07
        strength = .8
    elif family == "asphalt":
        grain = np.sin(x * math.pi * 174 + n * 4) * np.cos(y * math.pi * 166 + fine * 3)
        height += grain * .018
        albedo = .945 + (n - .5) * .12 + grain * .013
        roughness = .98 + (fine - .5) * .035
        strength = .65
    elif family == "paintedMetal":
        ribs = np.cos(x * math.pi * 16)
        height = ribs * .055 + (fine - .5) * .004
        albedo = .975 + ribs * .008 + (n - .5) * .025
        roughness = .89 + (n - .5) * .065
        ao = .985 - (1 - ribs) * .012
        strength = .85
    elif family == "grass":
        fibres = np.sin((x * 123 + y * 37 + n * 4) * math.pi) * np.cos(y * math.pi * 134)
        height = (n - .5) * .09 + fibres * .015
        albedo = .94 + (n - .5) * .13 + fibres * .009
        roughness = .985 + (fine - .5) * .02
        ao = .96 - np.maximum(0, .5 - n) * .11
        strength = .75
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * size * strength
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * size * strength
    normals = np.stack([-dx, -dy, np.ones_like(dx)], axis=-1)
    normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
    normal = np.clip((normals * .5 + .5) * 255, 0, 255).astype(np.uint8)
    color = np.repeat(np.clip(albedo * 255, 0, 255).astype(np.uint8)[..., None], 3, 2)
    if family == "grass":
        color = np.clip(color.astype(float) * [1.0, 1.008, .985], 0, 255).astype(np.uint8)
    orm = np.stack([ao, roughness, np.ones_like(ao)], axis=-1)
    return color, normal, np.clip(orm * 255, 0, 255).astype(np.uint8)


def generate(width):
    tile_size = width // 4
    gutter = tile_size // 16
    inner = tile_size - gutter * 2
    atlases = [np.full((tile_size * 2, width, 3), fill, np.uint8) for fill in [245, 128, 255]]
    atlases[1][..., 2] = 255
    for index, family in enumerate(FAMILIES):
        for atlas, sample in zip(atlases, tile(inner, family)):
            padded = np.pad(sample, ((gutter, gutter), (gutter, gutter), (0, 0)), mode="wrap")
            row, column = divmod(index, 4)
            atlas[row * tile_size:(row + 1) * tile_size, column * tile_size:(column + 1) * tile_size] = padded
    return atlases


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--toktx", required=True)
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    SOURCES.mkdir(parents=True, exist_ok=True)
    assets = []
    for width in [512, 1024]:
        for kind, pixels in zip(["albedo", "normal", "orm"], generate(width)):
            source = SOURCES / f"surfaces-{width}-{kind}.png"
            target = OUTPUT / f"surfaces-{width}-{kind}.ktx2"
            Image.fromarray(pixels).save(source)
            # Explicit input transfer function: normals/AO/roughness are linear
            # data. RGB normals retain xyz, avoiding a shader-specific RG swizzle.
            command = [args.toktx, "--t2", "--encode", "uastc", "--uastc_quality", "2", "--zcmp", "12", "--genmipmap", "--filter", "box", "--threads", "1", "--assign_oetf", "srgb" if kind == "albedo" else "linear", "--assign_primaries", "bt709", str(target), str(source)]
            subprocess.run(command, check=True, capture_output=True)
            data = target.read_bytes()
            assets.append({"file": target.name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    manifest = {"generator": "scripts/build-commercial-pbr.py", "encoder": "Khronos toktx 4.4.2 / UASTC LDR + Zstandard12, 1 thread", "families": FAMILIES, "layout": {"columns": 4, "rows": 2, "gutterFraction": 1 / 16}, "assets": assets}
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    # Decoder stays version-matched to the installed Three addon. No remote
    # runtime dependency or package/version change is required by this pipeline.
    decoder_source = ROOT / "node_modules" / "three" / "examples" / "jsm" / "libs" / "basis"
    decoder_target = OUTPUT.parent / "basis"
    decoder_target.mkdir(parents=True, exist_ok=True)
    for filename in ["basis_transcoder.js", "basis_transcoder.wasm", "README.md"]:
        shutil.copyfile(decoder_source / filename, decoder_target / filename)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
