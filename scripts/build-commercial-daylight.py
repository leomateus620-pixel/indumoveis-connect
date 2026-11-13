"""Bake the commercial map's world panorama. Run with NumPy and Pillow."""

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / "src/features/commercial-map/daylightPalette.json").read_text())
OUTPUT = ROOT / "src/features/commercial-map/assets/daylight.png"
WIDTH, HEIGHT = 1024, 512


def smooth(value, low, high):
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def linear(hex_color):
    rgb = np.array([int(hex_color[i:i + 2], 16) for i in (1, 3, 5)]) / 255
    return np.where(rgb < 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)


def mix(a, b, amount):
    return a + (b - a) * amount[..., None]


def sky_gradient(directions):
    """The same linear sky as the startup panorama in daylight.ts."""
    y = directions[..., 1]
    horizon = linear(CONFIG["sky"]["horizon"])
    horizon_y = math.sin(CONFIG["horizonBandRadians"])
    sky = mix(horizon, linear(CONFIG["sky"]["mid"]), smooth(y, horizon_y, CONFIG["skyMidY"]))
    sky = mix(sky, linear(CONFIG["sky"]["zenith"]), smooth(y, CONFIG["skyMidY"], 1))
    sky = mix(sky, linear(CONFIG["ground"]["nearHorizon"]), smooth(-y, horizon_y, 0.42))
    sky = mix(sky, linear(CONFIG["ground"]["nadir"]), smooth(-y, 0.42, 1))
    sun_dot = np.maximum(0, directions @ CONFIG["sunDirection"])
    glow = CONFIG["solarGlow"]
    amount = sun_dot ** glow["exponent"] * glow["amount"] * smooth(y, horizon_y, horizon_y + 0.025)
    return mix(sky, linear(CONFIG["sunColor"]), amount)


def noise(u, v, frequency, field):
    """Smooth value noise, sampled in each cloud's tangent plane."""
    x, y = u * frequency + 37.23, v * frequency + 62.45
    i, j = np.floor(x).astype(int), np.floor(y).astype(int)
    tx, ty = smooth(x - i, 0, 1), smooth(y - j, 0, 1)
    i0, i1 = i % len(field), (i + 1) % len(field)
    j0, j1 = j % len(field), (j + 1) % len(field)
    return (
        (field[i0, j0] * (1 - tx) + field[i1, j0] * tx) * (1 - ty)
        + (field[i0, j1] * (1 - tx) + field[i1, j1] * tx) * ty
    )


# Degrees of azimuth, elevation and angular half-size. The low layer is
# composed for the navigable sky band, with broken blue between cloud groups.
# Smaller distant formations are flatter, while the closer shapes have height.
CLOUDS = [
    (-168, 5.4, 10, 2.5, .72), (-150, 11, 11, 4.8, .75),
    (-137, 3.5, 6, 1.15, .52), (-114, 6.4, 11.5, 3.5, .86),
    (-92, 4.2, 8.0, 1.7, .79), (-76, 10.8, 10, 5.0, .74),
    (-60, 3.6, 8, 1.4, .54), (-34, 5.3, 12.5, 2.7, .86),
    (-14, 14, 14, 6.4, .81), (-8, 3.1, 6, 1.25, .53),
    (16, 6.1, 10, 3.4, .91), (35, 4.0, 6, 1.4, .65),
    (47, 10.7, 13, 5.4, .76), (68, 5.8, 10, 2.6, .82),
    (91, 3.7, 7.3, 1.3, .54), (107, 6.4, 13, 3.7, .89),
    (126, 14.4, 12, 5.3, .81), (130, 3.6, 6.5, 1.45, .56),
    (151, 5.2, 9, 2.7, .83), (173, 3.8, 7, 1.45, .58),
    (-104, 27, 16, 7.5, .62), (-45, 24, 11, 5.0, .58),
    (27, 34, 16, 7.5, .67), (91, 26, 13, 6.4, .72),
    (171, 32, 18, 7.2, .64),
]


def paint_cloud(sky, directions, cloud, seed):
    azimuth, elevation, width, height = np.deg2rad(cloud[:4])
    ca, sa, ce, se = math.cos(azimuth), math.sin(azimuth), math.cos(elevation), math.sin(elevation)
    center = np.array([ca * ce, se, sa * ce])
    horizontal = np.array([-sa, 0, ca])
    vertical = np.array([-ca * se, ce, -sa * se])
    # Evaluate only on the local part of the sphere. The angular basis is
    # continuous over the longitude seam and does not stretch around the poles.
    u, v = (directions @ horizontal) / width, (directions @ vertical) / height
    region = ((directions @ center) > 0.8) & (np.abs(u) < 1.55) & (np.abs(v) < 1.55)
    u, v = u[region], v[region]
    rng = np.random.default_rng(seed)
    field = rng.random((96, 96))
    soft = noise(u, v, 2.8, field)
    fine = noise(u + 8.2, v - 3.1, 6.6, field)
    edge = noise(u - 5.2, v + 7.0, 13.0, field)
    hu = u + (soft - .5) * .21 + (fine - .5) * .09
    hv = v + (fine - .5) * .25 + (soft - .5) * .18
    density = np.zeros_like(u)
    # Overlapping, asymmetric lobes form a continuous optical depth instead
    # of stamping the same outline at every azimuth.
    lobes = rng.integers(5, 10)
    baseline = rng.uniform(-.15, .15)
    for offset in np.linspace(-.84, .84, lobes):
        center_u = offset + rng.uniform(-.09, .09)
        center_v = baseline + rng.uniform(-.26, .19)
        rx, ry = rng.uniform(.21, .48), rng.uniform(.34, .82)
        if abs(offset) < .3:
            center_v += rng.uniform(.02, .35)
        radius = ((hu - center_u) / rx) ** 2 + ((hv - center_v) / ry) ** 2
        density += np.exp(-radius * 2.2) * rng.uniform(.48, .94)
    shape = smooth(1.55 - np.abs(u), 0, .31) * smooth(1.55 - np.abs(v), 0, .35)
    horizon = smooth(directions[region, 1], .026, .063)
    edge_breakup = (soft - .5) * .23 + (fine - .5) * .15 + (edge - .5) * .085
    alpha = smooth(density + edge_breakup, .12, .62) * shape * horizon * cloud[4]
    sun_side = np.clip(np.dot(CONFIG["sunDirection"], horizontal), -.75, .75)
    lit = smooth(v + .22 * sun_side * u + (soft - .5) * .46 + (fine - .5) * .18, -.7, .52)
    underside = linear("#aebdd0")
    sunshine = linear("#fcf9f1")
    shade = mix(underside, sunshine, .31 + lit * .69)
    sky[region] = mix(sky[region], shade, alpha)


def main():
    azimuth = ((np.arange(WIDTH) + .5) / WIDTH - .5) * 2 * math.pi
    elevation = ((np.arange(HEIGHT) + .5) / HEIGHT - .5) * math.pi
    # A south-first image uploads with flipY=false. In the shader v=0 is
    # the ground pole. Both pole rows are exact and independent of azimuth.
    elevation[0], elevation[-1] = -math.pi / 2, math.pi / 2
    az, el = np.meshgrid(azimuth, elevation)
    directions = np.stack([np.cos(az) * np.cos(el), np.sin(el), np.sin(az) * np.cos(el)], axis=-1)
    sky = sky_gradient(directions)
    for index, cloud in sorted(enumerate(CLOUDS), key=lambda entry: entry[1][1], reverse=True):
        paint_cloud(sky, directions, cloud, 24179 + index * 1709)
    srgb = np.where(sky < .0031308, sky * 12.92, 1.055 * sky ** (1 / 2.4) - .055)
    rgb = np.round(np.clip(srgb, 0, 1) * 255).astype(np.uint8)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgb).save(OUTPUT, optimize=True)
    print(f"{OUTPUT.relative_to(ROOT)} {OUTPUT.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
