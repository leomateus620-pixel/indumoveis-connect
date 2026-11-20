"""Bake skylight contact from the registered height pass and encode both plan LODs."""

import argparse
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageFilter

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("renders", type=Path)
parser.add_argument("out", type=Path)
args = parser.parse_args()
heights = np.asarray(
    Image.open(args.renders / "height.png").convert("L"), dtype=np.float32
) * (32 / 255)
# Surfaces above the current pixel occlude light from that azimuth. Evaluate
# the hemisphere at two points per plan unit, independent of display density.
occlusion = np.zeros_like(heights)
for azimuth in np.linspace(0, 2 * math.pi, 16, endpoint=False):
    horizon = np.zeros_like(heights)
    for radius in (2, 4, 8, 15, 28):
        dx = round(radius * math.cos(azimuth))
        dy = round(radius * math.sin(azimuth))
        neighbor = np.roll(heights, (dy, dx), axis=(0, 1))
        rise = np.maximum(0, neighbor - heights - 0.20)
        angle = np.arctan(rise / (radius * 0.5))
        np.maximum(horizon, angle, out=horizon)
    occlusion += np.sin(horizon)
ambient = np.clip(1 - 0.59 * occlusion / 16, 0, 1)
mask = Image.fromarray((255 * ambient).astype("uint8")).filter(
    ImageFilter.GaussianBlur(0.6)
)
color = Image.open(args.renders / "color.png").convert("RGBA")
h, w = color.height, color.width
pixels = np.array(color, copy=True)
# Apply the mask in strips to bound authoring memory on large source images.
high = np.asarray(mask.resize(color.size, Image.Resampling.BILINEAR))
for y in range(0, h, 128):
    rgb = pixels[y : y + 128, :, :3].astype("float32")
    rgb *= high[y : y + 128, :, None] / 255
    pixels[y : y + 128, :, :3] = np.rint(rgb).astype("uint8")
plan = Image.fromarray(pixels)
for name, size in [
    ("arq-design-plan", (2104, 932)),
    ("arq-design-plan-detail", (4208, 1864)),
]:
    version = plan.resize(size, Image.Resampling.LANCZOS) if size != plan.size else plan
    version.save(args.out / (name + ".webp"), "WEBP", quality=86, method=6, exact=True)
