"""Bake registered near-neighbourhood roof and canopy impostors for the low park orbit."""

import argparse
import json
from functools import lru_cache
from pathlib import Path

import numpy as np
from canopies import canopies
from footprints import load_footprints
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates, minimum_filter
from sources import load_source

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/landscape/santa-rosa"
MAP = ROOT / "src/features/commercial-map/assets"
SCALE = 0.4548161444
EAST, NORTH = (
    np.array([-0.4878298036, 0.8729387623]),
    np.array([0.8729387623, 0.4878298036]),
)
ORIGIN = np.array([95.0, 28.0])
MAX_RADIUS = 1500
# The low oblique sees the fronts and a small part of each roof. At steep angles the
# renderer hands over to the registered photo where the roof is visible in plan.
SLOPE = np.tan(np.deg2rad(7.0))


def pixel(en, extent, size):
    return ((en / [extent, -extent] + 0.5) * size).astype(int).clip(0, size - 1)


def colours(photo, en):
    p = pixel(en, 4096, len(photo))
    return photo[p[..., 1], p[..., 0], :].astype("float32")


def shape_pixels(ring, extent, size):
    """Source cells inside the true footprint and only those cells."""
    points = (ring / [extent, -extent] + 0.5) * size
    lo = np.floor(points.min(0)).astype(int).clip(0, size - 1)
    hi = np.ceil(points.max(0)).astype(int).clip(0, size - 1)
    patch = Image.new("1", tuple(hi - lo + 1))
    ImageDraw.Draw(patch).polygon([tuple(x) for x in points - lo - 0.5], fill=1)
    y, x = np.nonzero(np.asarray(patch))
    return y + lo[1], x + lo[0]


@lru_cache(maxsize=1)
def foliage_texture():
    # A real front-facing canopy material exposes leaf clusters absent from nadir images.
    patch = np.asarray(
        Image.open(Path(__file__).with_name("folhagem-santa-rosa.webp")).convert("L"),
        dtype="float32",
    )
    fine = gaussian_filter(patch, 0.9) / np.maximum(7.0, gaussian_filter(patch, 7.0))
    return np.clip(fine, 0.66, 1.45)


def canopy_image(
    photo, canopy_height, ring, center, right, direction, height, xxgrid, yygrid
):
    """Orthographically ray-cast measured crowns. Front lobes can hide the back row."""
    h, w = xxgrid.shape
    x_axis = xxgrid[0]
    radial = (ring - center) @ direction
    span = max(np.ptp(radial), 1.0)
    depths = np.linspace(radial.min(), radial.max(), min(150, max(8, int(span * 1.15))))
    points = center + x_axis[None, :, None] * right + depths[:, None, None] * direction
    coord = (points / [4096, -4096] + 0.5) * 2048 - 0.5
    chm = map_coordinates(
        canopy_height, coord.transpose(2, 0, 1)[::-1], order=1, mode="nearest"
    )
    # Use the exact group footprint so neighbouring trees at a different depth stay independent.
    outline = Image.new("L", (w, len(depths)))
    tx = ((ring - center) @ right - x_axis[0]) / max(np.ptp(x_axis), 1.0) * (w - 1)
    ImageDraw.Draw(outline).polygon(
        list(zip(tx, (radial - depths[0]) / span * (len(depths) - 1))), fill=255
    )
    inside = np.array(outline) > 0
    padded = np.pad(inside, 1)
    from scipy.ndimage import distance_transform_edt

    edge = distance_transform_edt(
        padded,
        sampling=(span / max(1, len(depths) - 1), np.ptp(x_axis) / max(1, w - 1)),
    )[1:-1, 1:-1]
    rounding = np.sqrt(
        np.clip(edge / np.maximum(1.1, np.minimum(height * 0.26, 3.8)), 0, 1)
    )
    top = np.minimum(chm, height * 1.12) * (0.34 + 0.66 * rounding)
    rgb = colours(photo, points)
    # The WRI height gradient supplies the small sunlit and shaded ridges of neighbouring crowns.
    ds, dt = np.gradient(
        gaussian_filter(top, 0.7),
        max(0.5, span / (len(depths) - 1)),
        max(0.5, np.ptp(x_axis) / (w - 1)),
    )
    sun_h = np.array([-0.82, 0.57])
    facing = (
        0.78 - 0.52 * (dt * (sun_h @ right) + ds * (sun_h @ direction))
    ) / np.sqrt(1 + dt * dt + ds * ds)
    irradiance = 0.82 + 0.23 * np.clip(facing, -0.65, 1)
    # Sunlit leaf clusters are brighter at the actual optical peaks, not uniformly along the top.
    grey = rgb @ np.array([0.2126, 0.7152, 0.0722])
    local = grey - gaussian_filter(grey, 1.9)
    green = (
        inside
        & (rgb[:, :, 1] > 0.92 * rgb[:, :, 0])
        & (rgb[:, :, 1] > 0.92 * rgb[:, :, 2])
        & (grey < 175)
    )
    oak = (
        np.median(rgb[green], axis=0)
        if np.count_nonzero(green) > 2
        else np.array([72.0, 83.0, 60.0])
    )
    # A footprint beside a bright road can straddle soil or masonry in another acquisition.
    # Keep the measured vegetated colour; use luminance for the illuminated crown surface.
    rgb = 0.38 * np.where(green[:, :, None], rgb, oak) + 0.62 * oak
    leaf = foliage_texture()

    # Bi-directional mirrored tiling avoids straight seams at the repeat of the photo sample.
    def mirror(coords, size):
        return np.abs((np.floor(coords).astype(int) % (2 * size)) - size).clip(
            0, size - 1
        )

    leaf_x = (xxgrid + 0.12 * yygrid + center[0] * 0.43) * 12
    leaf_y = (yygrid + center[1] * 0.41) * 12
    top += np.clip(local / 24, -0.48, 0.48)
    floor = np.maximum(0.5, top * (0.16 + 0.26 * (1 - rounding)))
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    # Trunk at the optically identified group's highest measured return.
    peak = np.unravel_index(np.argmax(np.where(inside, top, 0)), top.shape)
    trunk_at = x_axis[peak[1]]
    stem = (
        (np.abs(xxgrid - trunk_at) < max(0.12, height * 0.022))
        & (yygrid > depths[peak[0]] * SLOPE)
        & (yygrid < height * 0.52)
    )
    rgba[stem] = [92, 83, 68, 255]
    for k, d in reversed(list(enumerate(depths))):
        z = yygrid - d * SLOPE
        visible = inside[k] & (top[k] >= z) & (floor[k] <= z) & (top[k] > 1.3)
        if not np.any(visible):
            continue
        v = np.clip((z - floor[k]) / np.maximum(1, top[k] - floor[k]), 0, 1)
        # Lower branches receive light from the neighbouring crowns and sky.
        light = irradiance[k] * (0.74 + 0.26 * v) + np.clip(local[k] / 190, -0.09, 0.09)
        frontal_detail = leaf[
            mirror(leaf_y + d * 2.9, leaf.shape[0]),
            mirror(leaf_x + d * 3.8, leaf.shape[1]),
        ]
        shade = light * (0.32 + 0.68 * frontal_detail)
        rgba[:, :, :3][visible] = (
            (rgb[k] * shade[:, :, None]).clip(0, 255).astype("uint8")[visible]
        )
        rgba[:, :, 3][visible] = 255
    return Image.fromarray(rgba)


def split_at_ridge(ring, offsets, sign):
    result = []
    for i, a in enumerate(ring):
        j = (i + 1) % len(ring)
        b = ring[j]
        qa, qb = sign * offsets[i], sign * offsets[j]
        if qa >= 0:
            result.append(a)
        if (qa < 0) != (qb < 0):
            result.append(a + (b - a) * (qa / (qa - qb)))
    return np.asarray(result)


def roof_image(photo, ring, center, right, direction, height, xgrid, ygrid):
    """Project roof slopes, eaves and visible facades from the observed plan silhouette."""
    from facades import wall_patch

    h, w = xgrid.shape
    x0, x1 = xgrid[0, 0], xgrid[0, -1]
    y0, y1 = ygrid[-1, 0], ygrid[0, 0]

    def screen(x, y):
        return np.column_stack(
            ((x - x0) / (x1 - x0) * (w - 1), (y1 - y) / (y1 - y0) * (h - 1))
        )

    def mask(x, y):
        image = Image.new("L", (w, h))
        ImageDraw.Draw(image).polygon([tuple(p) for p in screen(x, y)], fill=255)
        return image

    rel = ring - center
    # Plan PCA gives the long direction of the roof, independent of azimuth.
    short = np.linalg.eigh(np.cov(rel.T))[1][:, 0]
    offset = rel @ short
    middle = (offset.min() + offset.max()) * 0.5
    offset -= middle
    half_width = max(2.0, np.max(abs(offset)))
    ys, xs = shape_pixels(ring, 4096, len(photo))
    median = np.median(photo[ys, xs], axis=0)
    # Low roofs get two illustrated pitches along the footprint. Wider sheds remain low
    # and multi-storey urban envelopes keep a level roof at the measured height.
    pitch = min(half_width * 0.30, height * 0.26, 3.6) if height < 12 else 0.0
    t = rel @ right
    r = rel @ direction
    long_span = np.ptp(rel @ np.array([-short[1], short[0]]))
    industrial = (
        long_span > 34 and 2 * half_width > 10 and height < min(14.0, 0.27 * long_span)
    )
    eave = height - pitch
    fragments = []
    seed = round((center[0] + 2048) * 101 + (center[1] + 2048) * 37)
    for i, a in enumerate(rel):
        j = (i + 1) % len(rel)
        dx = t[j] - t[i]
        if abs(dx) < 0.1:
            continue
        length = np.linalg.norm(rel[j] - a)
        lo, hi = sorted([t[i], t[j]])
        fraction = np.clip((xgrid - t[i]) / dx, 0, 1)
        depth = r[i] + fraction * (r[j] - r[i])
        roof_z = (
            height
            - pitch
            * np.abs(offset[i] + fraction * (offset[j] - offset[i]))
            / half_width
        )
        visible = (
            (xgrid >= lo)
            & (xgrid <= hi)
            & (ygrid >= depth * SLOPE)
            & (ygrid <= roof_z + depth * SLOPE)
        )
        if not np.any(visible):
            continue
        side = (rel[j] - a) / max(length, 1)
        shade = 0.83 + 0.18 * abs(side @ np.array([0.86, 0.51]))
        tex = np.asarray(
            wall_patch(
                max(4, int(length * 2)),
                max(4, int(eave * 2)),
                length,
                eave,
                median,
                seed + i,
                industrial=industrial,
            ).convert("RGB")
        )
        # Inverse mapping for the projected quadrilateral; retain the sample's aspect in metres.
        uu = (fraction * (tex.shape[1] - 1)).astype(int)
        v = np.clip((ygrid - depth * SLOPE) / max(eave, 1), 0, 1)
        vv = ((1 - v) * (tex.shape[0] - 1)).astype(int)
        colour = tex[vv, uu] * shade
        eave_shadow = (ygrid - depth * SLOPE) > roof_z - max(
            0.25, min(0.7, eave * 0.07)
        )
        colour[eave_shadow] *= 0.76
        fragments.append(
            (
                (r[i] + r[j]) * 0.5,
                Image.fromarray(colour.clip(0, 255).astype("uint8")),
                Image.fromarray(visible.astype("uint8") * 255),
            )
        )
    for sign in [-1, 1] if pitch else [1]:
        side = split_at_ridge(ring, offset, sign) if pitch else ring
        if len(side) < 3:
            continue
        delta = side - center
        grad = -sign * pitch * short / half_width
        intercept = height + sign * pitch * middle / half_width
        roof_z = intercept + delta @ grad
        denom = SLOPE + direction @ grad
        if abs(denom) < 0.005:
            continue
        d = (ygrid - intercept - xgrid * (right @ grad)) / denom
        points = center + xgrid[:, :, None] * right + d[:, :, None] * direction
        rgb = colours(photo, points) * 0.84 + median * 0.16
        shade = np.clip(0.99 - 0.28 * grad @ np.array([-0.82, 0.57]), 0.83, 1.13)
        fragments.append(
            (
                (delta @ direction).mean() - 0.005,
                Image.fromarray((rgb * shade).clip(0, 255).astype("uint8")),
                mask(delta @ right, roof_z + (delta @ direction) * SLOPE),
            )
        )
    out = Image.new("RGBA", (w, h))
    for depth, patch, alpha in sorted(fragments, key=lambda element: -element[0]):
        out.paste(patch, mask=alpha)
    return out


def make_sprite(photo, canopy_height, ring, height, kind):
    center = ring.mean(0)
    direction = center / np.linalg.norm(center)
    right = np.array([direction[1], -direction[0]])
    t = (ring - center) @ right
    r = (ring - center) @ direction
    t0, t1 = t.min(), t.max()
    y0, y1 = (
        r.min() * SLOPE,
        height * (1.14 if kind == "crown" else 1) + r.max() * SLOPE,
    )
    if t1 - t0 < 2 or y1 - y0 < 1.8:
        return None
    # Allocate texels according to the actual projected size in the oblique cameras.
    scale = min(
        4.0,
        1400 / max(80, np.linalg.norm(center) - 140),
        320 / (t1 - t0),
        150 / (y1 - y0),
    )
    w, h = max(5, round((t1 - t0) * scale)), max(5, round((y1 - y0) * scale))
    xx, yy = np.meshgrid(np.linspace(t0, t1, w), np.linspace(y1, y0, h))
    if kind == "roof":
        image = roof_image(photo, ring, center, right, direction, height, xx, yy)
    else:
        image = canopy_image(
            photo, canopy_height, ring, center, right, direction, height, xx, yy
        )
    return image, center + (t0 + t1) * 0.5 * right, t1 - t0, y1 - y0, y0


def substrate(centres, frame):
    # Interpolate exactly the same graded triangles as createRegionalRelief, including
    # the diagonal chosen by PlaneGeometry. A card at the foot of a slope cannot float
    # just because an intervening 30 m DSM cell is higher than the displayed triangle.
    relief = np.asarray(Image.open(OUT / "relief.png"), dtype="float32")
    grade = (
        np.asarray(Image.open(MAP / "landscape-mask.png"), dtype="float32")[:, :, 1]
        / 255
    )
    uv = (np.sign(centres) * np.power(np.abs(centres / 4096), 1 / 1.6) + 1) * 52
    ix = np.floor(uv)
    fx, fy = (uv - ix).T

    def corner(dx, dy):
        unit = (ix + [dx, dy]) / 52 - 1
        metres = np.sign(unit) * np.abs(unit) ** 1.6 * 4096
        coords = (metres / [8192, -8192] + 0.5) * 512 - 0.5
        height = map_coordinates(relief, coords.T[::-1], order=1, mode="nearest") - 128
        world = ORIGIN + SCALE * (
            metres[:, 0, None] * EAST + metres[:, 1, None] * NORTH
        )
        maskcoords = (world - frame["origin"]) - 0.5
        return height * map_coordinates(
            grade, maskcoords.T[::-1], order=1, mode="nearest"
        )

    return (
        (1 - np.maximum(fx, fy)) * corner(0, 0)
        + np.minimum(fx, fy) * corner(1, 1)
        + np.maximum(fx - fy, 0) * corner(1, 0)
        + np.maximum(fy - fx, 0) * corner(0, 1)
    )


def generate(cache):
    photo = np.asarray(Image.open(OUT / "near-detail.webp").convert("RGB"))
    mask = np.asarray(Image.open(MAP / "landscape-mask.png"))[:, :, 0]
    frame = json.loads((MAP / "landscape-mask.json").read_text())
    height, presence = load_source(cache, "building")
    surface = load_source(cache, "relief")[0]
    floor = gaussian_filter(minimum_filter(surface, size=3), sigma=1)
    candidates = []
    for f in load_footprints(cache):
        ring = np.asarray(f["geometry"]["coordinates"][0][:-1])
        center = ring.mean(0)
        if np.linalg.norm(center) > MAX_RADIUS:
            continue
        ys, xs = shape_pixels(ring, 8192, len(height))
        valid = presence[ys, xs] >= 0.6
        predicted = height[ys, xs][valid]
        h = f["properties"]["height"]
        if not h and len(predicted):
            h = float(np.percentile(predicted, 70))
        if h and 2.2 <= h < 120:
            candidates.append((ring, h, "roof"))
    candidates.extend((ring, h, "crown") for ring, h in canopies(cache, photo))
    records = []
    counts = {"roof": 0, "crown": 0}
    canopy_height = np.load(cache / "canopy-v1.npy", mmap_mode="r")[0]
    for ring, h, kind in candidates:
        center = ring.mean(0)
        rad = np.linalg.norm(center)
        if rad < 35 or rad > MAX_RADIUS:
            continue
        en = np.vstack([center, ring, (ring + np.roll(ring, 1, axis=0)) * 0.5])
        world = ORIGIN + SCALE * (en[:, 0, None] * EAST + en[:, 1, None] * NORTH)
        ix = np.rint(world - frame["origin"]).astype(int)
        ix[:, 0] = ix[:, 0].clip(0, mask.shape[1] - 1)
        ix[:, 1] = ix[:, 1].clip(0, mask.shape[0] - 1)
        if np.max(mask[ix[:, 1], ix[:, 0]]) > 5:
            continue
        result = make_sprite(photo, canopy_height, ring, h, kind)
        if not result:
            continue
        image, anchor, w, depth, y0 = result
        x, y = pixel(center, 50000, len(surface))
        # The DSM may already contain part of the roof/crown. Sink the image back into
        # that existing surface by its locally supported fraction, bounded by its own height.
        y0 -= np.clip(surface[y, x] - floor[y, x], 0, h * 0.7)
        records.append((image, [*anchor, w, depth, y0]))
        counts[kind] += 1
    print("Cards before packing", counts, flush=True)
    records.sort(key=lambda r: -r[0].height)

    # Choose the highest common sampling density that fits the fixed device budget.
    # Preserve each geographical width/height as only the texture sample count changes.
    def rows_for(factor):
        x = y = row = 2
        for im, _ in records:
            w = max(3, round(im.width * factor))
            h = max(3, round(im.height * factor))
            if x + w + 2 > 2048:
                y += row + 4
                x = 2
                row = 0
            x += w + 4
            row = max(row, h)
        return y + row + 2

    factor = 1.0
    while rows_for(factor) > 2048:
        factor *= 0.94
    if factor < 1.0:
        records = [
            (
                im.resize(
                    (
                        max(3, round(im.width * factor)),
                        max(3, round(im.height * factor)),
                    ),
                    Image.Resampling.LANCZOS,
                ),
                shape,
            )
            for im, shape in records
        ]
    atlasSize = 2048
    atlas = Image.new("RGBA", (atlasSize, atlasSize))
    x = y = 2
    row = 0
    packed = []
    for image, shape in records:
        w, h = image.size
        if x + w + 2 > atlasSize:
            y += row + 4
            x = 2
            row = 0
        if y + h + 2 > atlasSize:
            raise ValueError("Increase atlas capacity or lower texels per metre")
        atlas.paste(image, (x, y))
        packed.append(
            [
                *shape,
                (x + 0.5) / atlasSize,
                1 - (y + h - 0.5) / atlasSize,
                (w - 1) / atlasSize,
                (h - 1) / atlasSize,
            ]
        )
        x += w + 4
        row = max(row, h)
    # Same UVs at both quality levels. The transparent gutter prevents neighbour bleed.
    for name, size, quality, alpha in [
        ("compact", 1024, 78, 70),
        ("detail", 2048, 86, 94),
    ]:
        atlas.resize((size, size), Image.Resampling.LANCZOS).save(
            OUT / f"settlement-{name}.webp",
            quality=quality,
            alpha_quality=alpha,
            method=6,
        )
    buffer = np.asarray(packed, dtype="<f4")
    buffer[:, 4] += substrate(buffer[:, :2], frame)
    buffer.tofile(OUT / "settlement.bin")
    print(f"{len(packed)} registered impostors, {counts}")
    return counts


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    generate(parser.parse_args().cache)
