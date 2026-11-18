"""Rectify local Santa Rosa wall materials. All coordinates use the upright photo.

To regenerate the versioned source tiles, run python facades.py IMAGE.jpg.
Loco085's original image and the CC BY-SA 3.0 license are in creditos.txt.
"""

import argparse
import hashlib
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

ATLAS = Path(__file__).with_name("fachadas-santa-rosa.webp")
SOURCE_SHA1 = "c53102cc6c09a3efd489ada25a09b8fb0cac2780"
TILE = (144, 96)
# Coordinates at half native resolution. TL, BL, BR, TR order for Pillow QUAD.
# Metres describe the photographed span and floor cadence, not cadastral dimensions.
SAMPLES = [
    ("reboco com faixa", 9.5, 6.0, (556, 576, 556, 630, 611, 645, 611, 586)),
    ("reboco azul e branco", 10.0, 6.0, (803, 499, 803, 540, 862, 545, 862, 502)),
    ("alvenaria aparente", 7.5, 3.1, (1510, 752, 1510, 791, 1594, 759, 1594, 732)),
    ("parede clara com vãos", 11.5, 3.2, (1160, 823, 1160, 868, 1300, 851, 1300, 809)),
    ("galpão claro", 13.5, 4.8, (1344, 582, 1344, 635, 1396, 636, 1396, 582)),
]


def rebuild(source):
    if hashlib.sha1(source.read_bytes()).hexdigest() != SOURCE_SHA1:
        raise ValueError("Expected the original Santa Rosa panorama by Loco085")
    photo = ImageOps.exif_transpose(Image.open(source)).convert("RGB")
    # Crop inside a leafy crown at the right of the same panorama. Sample only its front
    # reflectance for branches the satellite observes from above.
    photo.crop((3620, 1214, 3750, 1326)).save(
        ATLAS.with_name("folhagem-santa-rosa.webp"), lossless=True, method=6
    )
    atlas = Image.new("RGB", (TILE[0], len(SAMPLES) * TILE[1]))
    for i, (_, _, _, corners) in enumerate(SAMPLES):
        sample = photo.transform(
            TILE,
            Image.Transform.QUAD,
            tuple(2 * n for n in corners),
            Image.Resampling.BICUBIC,
        )
        atlas.paste(sample, (0, i * TILE[1]))
    atlas.save(ATLAS, lossless=True, method=6)


@lru_cache(maxsize=1)
def _materials():
    with Image.open(ATLAS) as atlas:
        return np.asarray(atlas.convert("RGB"))


def wall_patch(
    width_px: int,
    height_px: int,
    width_m: float,
    height_m: float,
    rgb: np.ndarray,
    variation: int,
    industrial: bool = False,
) -> Image.Image:
    """Resample a wall in physical metres before its perspective projection."""
    variation = int(variation)
    if industrial:
        choices = (4,)
    elif width_m > 25 and height_m < 9:
        choices = (3, 4, 4)
    elif height_m > 10:
        choices = (0, 1, 3)
    else:
        choices = (0, 2, 3, 3, 4)
    index = choices[variation % len(choices)]
    _, span_m, floor_m, _ = SAMPLES[index]
    if industrial:
        # A warehouse has longer structural bays and a single facade course.
        span_m = max(span_m, min(width_m, 32.0))
        floor_m = max(height_m, floor_m)
    w, h = max(1, width_px), max(1, height_px)
    # Supersample before reducing for the atlas so distant window rows retain their tone.
    scale = 3
    tw, th = TILE
    x = (
        (np.arange(w * scale) + 0.5) / (w * scale) * width_m / span_m
        + ((variation >> 8) % 19) / 19
    ) * tw
    y = (1 - (1 - (np.arange(h * scale) + 0.5) / (h * scale)) * height_m / floor_m) * th
    pixels = _materials()[
        index * th + (y.astype(int) % th)[:, None], (x.astype(int) % tw)[None, :]
    ]
    color = np.asarray(rgb, dtype=np.float32)[:3]
    if color.max() <= 1:
        color *= 255
    # Preserve the tonal variation within each photograph under the scene's daylight.
    tint = 0.13 * (color - color.mean())
    pixels = np.clip(pixels.astype(np.float32) * 0.88 + 12 + tint, 0, 255).astype(
        "uint8"
    )
    return Image.fromarray(pixels).resize((w, h), Image.Resampling.LANCZOS)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    rebuild(parser.parse_args().source)
