"""Bake one indexed world-space mesh of the measured neighbourhood envelopes."""

import argparse
import gzip
import json
import struct
from pathlib import Path

import mapbox_earcut
import numpy as np
from build import footprint_heights, fuse_pan, grid_samples
from canopies import canopy_surface, load_canopy_height
from footprints import load_footprints
from PIL import Image, ImageDraw, ImageOps
from scipy.ndimage import gaussian_filter, map_coordinates, minimum_filter
from sources import SCENE_AXES, SCENE_ORIGIN, SCENE_SCALE, load_source

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/landscape/santa-rosa"
ASSETS = ROOT / "src/features/commercial-map/assets"
MAX_RADIUS = 1500


class Terrain:
    """Sample the very triangles used by createRegionalRelief, including their grade."""

    def __init__(self):
        self.mask = np.asarray(
            Image.open(ASSETS / "landscape-mask.png"), dtype=np.float32
        )
        self.origin = json.loads((ASSETS / "landscape-mask.json").read_text())["origin"]
        unit = np.linspace(-1, 1, 105)
        grid = np.sign(unit) * np.abs(unit) ** 1.6 * 4096
        east, north = np.meshgrid(grid, grid)
        en = np.column_stack((east.ravel(), north.ravel()))
        relief = np.asarray(Image.open(OUT / "relief.png"), dtype=np.float32)
        uv = (en / [8192, -8192] + 0.5) * 512 - 0.5
        heights = map_coordinates(relief, uv.T[::-1], order=1, mode="nearest") - 128
        grade = self.mask_at(en, 1, linear=True) / 255
        self.vertices = (heights * grade).reshape(105, 105)

    def mask_at(self, en, channel, linear=False):
        world = SCENE_ORIGIN + SCENE_SCALE * (
            en[:, 0, None] * SCENE_AXES[0] + en[:, 1, None] * SCENE_AXES[1]
        )
        pixels = world - self.origin - 0.5
        return map_coordinates(
            self.mask[:, :, channel],
            pixels.T[::-1],
            order=int(linear),
            mode="nearest",
        )

    def elevation(self, en):
        uv = (np.sign(en) * np.abs(en / 4096) ** (1 / 1.6) + 1) * 52
        xy = np.floor(uv).astype(int)
        fx, fy = (uv - xy).T
        x, y = xy.T
        v = self.vertices
        return (
            (1 - np.maximum(fx, fy)) * v[y, x]
            + np.minimum(fx, fy) * v[y + 1, x + 1]
            + np.maximum(fx - fy, 0) * v[y, x + 1]
            + np.maximum(fy - fx, 0) * v[y + 1, x]
        )


def interior_pixels(ring, extent, size):
    pixels = (ring / [extent, -extent] + 0.5) * size
    lo = np.floor(pixels.min(0)).astype(int).clip(0, size - 1)
    hi = np.ceil(pixels.max(0)).astype(int).clip(0, size - 1)
    patch = Image.new("1", tuple(hi - lo + 1))
    ImageDraw.Draw(patch).polygon([tuple(p) for p in pixels - lo - 0.5], fill=1)
    y, x = np.nonzero(patch)
    return y + lo[1], x + lo[0]


def roof_envelope(ring, height, terrain):
    # The roof height stays level over sloping terrain; short foundation skirts
    # penetrate the visible relief along the whole edge, including long sheds.
    ground = terrain.elevation(np.vstack((ring, (ring + np.roll(ring, 1, axis=0)) / 2)))
    peak = max(ground.mean() + height, ground.max() + 1.5)
    following = np.roll(ring, -1, axis=0)
    if np.sum(ring[:, 0] * following[:, 1] - ring[:, 1] * following[:, 0]) < 0:
        ring = ring[::-1]
    n = len(ring)
    lengths = np.linalg.norm(np.roll(ring, -1, axis=0) - ring, axis=1)
    pitch = (
        min(height * 0.23, lengths.min() * 0.15, 2.8) if n == 4 and height < 12 else 0
    )
    base = np.column_stack((ring, np.full(n, ground.min() - 1.5)))
    eaves = np.column_stack((ring, np.full(n, peak - pitch)))
    vertices = [*base, *eaves]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.extend(((i, j, n + j), (i, n + j, n + i)))
    if pitch:
        # A ridge over the shorter pair of opposite ends preserves all four
        # measured corners, and each gable meets its two slopes at shared vertices.
        a = int((lengths[0] + lengths[2]) > (lengths[1] + lengths[3]))
        b, c, d = [(a + i) % 4 for i in (1, 2, 3)]
        vertices.extend(
            [(*((ring[a] + ring[b]) / 2), peak), (*((ring[c] + ring[d]) / 2), peak)]
        )
        a, b, c, d = [i + n for i in (a, b, c, d)]
        faces.extend(((a, b, 8), (c, d, 9), (b, c, 9), (b, 9, 8), (d, a, 8), (d, 8, 9)))
    else:
        top = mapbox_earcut.triangulate_float64(
            ring.copy(), np.array([n], dtype=np.uint32)
        )
        faces.extend(n + top.reshape(-1, 3))
    return np.asarray(vertices), np.asarray(faces, dtype=np.uint32)


def materials():
    # Each tile has a mirrored gutter at every edge. Two atlas sizes share UVs,
    # so the already-published geometry never changes between budget levels.
    from facades import ATLAS, SAMPLES, TILE

    facades = Image.open(ATLAS).convert("RGB")
    tiles = [
        facades.crop((0, i * TILE[1], TILE[0], (i + 1) * TILE[1]))
        for i in range(len(SAMPLES))
    ]
    tiles.append(
        Image.open(Path(__file__).with_name("folhagem-santa-rosa.webp")).convert("RGB")
    )
    atlas = Image.new("RGB", (256, 512))
    for i, tile in enumerate(tiles):
        tile = tile.resize((112, 112), Image.Resampling.LANCZOS)
        if i == 5:
            tile = ImageOps.grayscale(tile)
            # Leaf texture modulates colour from the local optical crop.
            a = np.asarray(tile, dtype=np.float32)
            tile = Image.fromarray(
                np.clip(175 + (a - a.mean()) * 1.6, 60, 240).astype("uint8")
            ).convert("RGB")
        block = np.pad(np.asarray(tile), ((8, 8), (8, 8), (0, 0)), mode="reflect")
        atlas.paste(Image.fromarray(block), ((i % 2) * 128, (i // 2) * 128))
    for level, width in (("compact", 128), ("detail", 256)):
        atlas.resize((width, width * 2), Image.Resampling.LANCZOS).save(
            OUT / f"settlement-{level}.webp", quality=86, method=6
        )


def generate(cache):
    # Use the optical observation for colours/vegetation, independent of the road overlay.
    rgb = load_source(cache, "far").transpose(1, 2, 0)
    photo, stops = fuse_pan(load_source(cache, "pan")[0], rgb, 4096)
    middle, _ = fuse_pan(load_source(cache, "pan-mid")[0], rgb, 8192, stops)
    footprints = load_footprints(cache)
    _, estimates = footprint_heights(cache, footprints)
    height, presence = load_source(cache, "building")
    # DSM elevations can already contain part of a building. Project only the
    # additional supported height, matching the raycaster's underlying-ground estimate.
    surface = load_source(cache, "relief")[0]
    raised = surface - gaussian_filter(minimum_filter(surface, size=3), sigma=1)
    terrain = Terrain()
    positions, attributes, indices = [], [], []
    vertex_count = 0
    roofs = 0
    distant = 0
    for idx, f in enumerate(footprints, 1):
        ring = np.asarray(f["geometry"]["coordinates"][0][:-1])
        center = ring.mean(0)
        radius = np.linalg.norm(center)
        tower = radius > MAX_RADIUS
        if radius > 4000 or (tower and not 12 < estimates[idx] < 120):
            continue
        if (
            terrain.mask_at(
                np.vstack((ring, center, (ring + np.roll(ring, 1, axis=0)) / 2)), 0
            ).max()
            > 5
        ):
            continue
        measured = estimates[idx] if tower else f["properties"]["height"]
        if not measured:
            y, x = interior_pixels(ring, 8192, len(height))
            observations = height[y, x][presence[y, x] >= 0.6]
            if not len(observations):
                continue
            measured = np.percentile(observations, 70)
        if not 2.2 <= measured < 120:
            continue
        in_dem = grid_samples(raised, center[:1], center[1:], 50000)[0]
        # A fully embedded structure contributes no second roof above the DSM.
        exposed = max(0.2, measured - max(0.0, in_dem))
        points, faces = roof_envelope(ring, exposed, terrain)
        image, extent = (middle, 8192) if tower else (photo, 4096)
        y, x = interior_pixels(ring, extent, len(image))
        colour = np.median(image[y, x], axis=0)
        width = np.max(np.linalg.norm(np.roll(ring, -1, axis=0) - ring, axis=1))
        tile = 4 if width > 32 and measured < 12 else (0, 1, 2, 3, 3)[roofs % 5]
        if tower:
            tile = (0, 1, 3)[idx % 3]
            distant += 1
        positions.append(points)
        attributes.append(np.tile([*colour, tile], (len(points), 1)))
        indices.append(faces + vertex_count)
        vertex_count += len(points)
        roofs += 1
    points, faces, canopy_appearance, stands = canopy_surface(
        footprints, photo, load_canopy_height(cache), terrain, MAX_RADIUS
    )
    positions.append(points)
    attributes.append(canopy_appearance)
    indices.append(faces + vertex_count)
    xyz = np.round(np.concatenate(positions) * 8).astype("<i2")
    rgba = np.concatenate(attributes).astype("uint8")
    faces = np.concatenate(indices).astype("<u4")
    header = struct.pack("<4sIIII", b"SRM1", roofs, stands, len(xyz), faces.size)
    # Axis-major deltas keep the transferred compact geometry small. Decoding
    # restores the exact signed-eighth-metre coordinates used by both profiles.
    coords = np.diff(xyz.T, axis=1, prepend=np.zeros((3, 1), dtype="<i2"))
    index = np.diff(faces.ravel(), prepend=np.zeros(1, dtype="<u4"))
    payload = header + coords.tobytes() + rgba.tobytes() + index.tobytes()
    (OUT / "settlement.bin").write_bytes(
        gzip.compress(payload, compresslevel=9, mtime=0)
    )
    materials()
    print(
        f"{roofs} roofs ({distant} distant towers), {stands} stands, {len(xyz)} vertices, {len(faces)} triangles",
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    generate(parser.parse_args().cache)
