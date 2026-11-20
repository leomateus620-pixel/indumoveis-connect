"""Resolve the immediate park frontage from registered optical and plan observations."""

import argparse
import json
from pathlib import Path

import numpy as np
from canopies import CANOPY_URL
from footprints import load_footprints
from PIL import Image, ImageDraw
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.transform import from_origin
from scipy import ndimage as nd
from sources import CRS, SCENE_AXES, SCENE_ORIGIN, SCENE_SCALE, WORLD_COVER, read_grid

# One temporary sample per metre. North is the top edge of every source.
EXTENT = 1280
ORIGIN = EXTENT // 2
TRANSFORM = from_origin(-ORIGIN, ORIGIN, 1, 1)
ROADS = Path(__file__).with_name("frontage-roads.geojson")


def resolve_roads(photo, canopy, roofs):
    """The optical width is a corridor. Its inner part has reliable road colour."""
    features = json.loads(ROADS.read_text())["features"]
    project = Transformer.from_crs(4326, CRS, always_xy=True)
    paths = Image.new("I", (EXTENT, EXTENT))
    draw = ImageDraw.Draw(paths)
    for idx, feature in enumerate(features, 1):
        coords = feature["geometry"]["coordinates"]
        e, n = project.transform(*np.array(coords).T)
        points = list(zip(e + ORIGIN - 0.5, ORIGIN - n - 0.5))
        # Use the lower quartile and leave one native PAN pixel for the two
        # partly covered shoulders. The observed corridor can include parking.
        width = round(feature["properties"]["interquartileWidthM"][0] - 2)
        draw.line(points, fill=idx, width=width, joint="curve")
    paths = np.asarray(paths)
    # Union before antialiasing so two centrelines share one intersection.
    coverage = nd.gaussian_filter((paths > 0).astype("float32"), 0.7)
    clear = (roofs == 0) & (canopy < 3)
    centre = clear & (paths > 0) & (nd.distance_transform_edt(paths > 0) >= 2)
    # Preserve directional variation in the PAN. Correct mixed roof/soil
    # chroma towards the actual observed median of each open road run.
    result = photo.copy()
    for idx in range(1, len(features) + 1):
        cells = centre & (paths == idx)
        if np.count_nonzero(cells) < 6:
            continue
        rgb = np.median(photo[cells], axis=0)
        mask = (paths == idx) & clear
        light = np.sum(photo[mask] * [0.2126, 0.7152, 0.0722], axis=1)
        mid = rgb @ [0.2126, 0.7152, 0.0722]
        tone = rgb * 0.38 + mid * 0.62 + 0.30 * (light[:, None] - mid)
        weight = coverage[mask, None] * 0.86
        result[mask] += weight * (tone - photo[mask])
    return result, paths


def crop_passes(luminance, cropland):
    """Broad planting passes follow the dominant direction in the registered PAN.

    Below its native resolution these are representative material variations.
    Leave small patches and fields without a reliable direction untouched.
    """
    groups, count = nd.label(cropland)
    result = np.zeros(luminance.shape, dtype="float32")
    gradient_y, gradient_x = np.gradient(nd.gaussian_filter(luminance, 1.5))
    for label, box in enumerate(nd.find_objects(groups, count), 1):
        if box is None:
            continue
        patch = groups[box] == label
        if patch.sum() < 1500:
            continue
        inner = nd.binary_erosion(patch, iterations=3)
        gx, gy = gradient_x[box][inner], gradient_y[box][inner]
        if gx.size < 100:
            continue
        # The positive eigenvector is across, rather than along, optical lines.
        xx, yy, xy = np.mean(gx * gx), np.mean(gy * gy), np.mean(gx * gy)
        alignment = np.hypot(xx - yy, 2 * xy) / max(0.01, xx + yy)
        if alignment < 0.12:
            continue
        angle = 0.5 * np.arctan2(2 * xy, xx - yy)
        y, x = np.indices(patch.shape, dtype="float32")
        along = y * np.cos(angle) - x * np.sin(angle)
        across = x * np.cos(angle) + y * np.sin(angle)
        phase = across * (2 * np.pi / (5.5 + label % 4)) + 0.5 * np.sin(along / 31)
        shape = 0.70 * np.cos(phase) + 0.30 * np.cos(2 * phase + 0.4)
        result[box][patch] = shape[patch] * min(1.0, alignment * 2.5)
    return result


def generate(cache, output):
    # Crop only the 1280-m square. Resize guides the sensor colour onto the
    # grid used by the three independent observations below.
    source = Image.open(output / "near-detail.webp").convert("RGB")
    native_width = EXTENT // 2
    start = (source.width - native_width) // 2
    source = source.crop((start, start, start + native_width, start + native_width))
    photo = np.array(
        source.resize((EXTENT, EXTENT), Image.Resampling.BICUBIC), dtype="float32"
    )
    footprints = load_footprints(cache)
    roofs = rasterize(
        ((f["geometry"], i) for i, f in enumerate(footprints, 1)),
        out_shape=(EXTENT, EXTENT),
        transform=TRANSFORM,
        dtype="int32",
    )
    chm = read_grid(
        cache,
        "canopy-frontage",
        [CANOPY_URL],
        [1],
        EXTENT,
        EXTENT,
        "uint8",
        255,
        Resampling.bilinear,
    )[0].astype("float32")
    result, roads = resolve_roads(photo, chm, roofs)

    # Fix colour at each observed footprint from its interior pixels. These
    # never include its neighbouring road. Keep roof slopes in the photograph.
    inner = nd.minimum_filter(roofs, size=3) == roofs
    interior = np.where(inner, roofs, 0)
    ids = np.unique(interior[interior != 0])
    roof_rgb = np.zeros((len(footprints) + 1, 3), dtype="float32")
    for channel in range(3):
        roof_rgb[ids, channel] = nd.mean(photo[:, :, channel], interior, ids)
    roof = np.isin(roofs, ids)
    result[roof] += 0.35 * (roof_rgb[roofs[roof]] - result[roof])

    # Only optical vegetation confirmed by measured canopy elevation casts a
    # relief tone. A bare gap between adjacent crowns keeps the photograph.
    red, green, blue = photo.transpose(2, 0, 1)
    leaf = (green > 0.88 * red) & (green > 0.89 * blue) & (roofs == 0)
    soft_height = nd.gaussian_filter(chm, 1.0)
    dy, dx = np.gradient(soft_height)
    cover = np.clip((chm - 2.0) / 4.0, 0.0, 1.0) * leaf
    sun = (-0.9 * dx + 0.39 * dy) / np.sqrt(1.0 + dx * dx + dy * dy)
    result *= (1.0 + cover * (0.18 * sun - 0.045))[:, :, None]

    # Blue is the true continuation of a mapped corridor through the end of
    # the last modelled asphalt polygon, registered to the drawing like red
    # (albedo) and green (height). Match the exposed neutral asphalt locally,
    # fading back to the photographed surface over ~33 m. Trees/roofs keep
    # their optical occlusion on the far side of this transition.
    assets = Path(__file__).resolve().parents[2] / "src/features/commercial-map/assets"
    frame = json.loads((assets / "landscape-mask.json").read_text())
    mask = np.array(Image.open(assets / "landscape-mask.png"))[:, :, 2]
    iy, ix = np.indices((EXTENT, EXTENT))
    e, n = ix + 0.5 - ORIGIN, ORIGIN - iy - 0.5
    xz = (
        SCENE_ORIGIN
        + SCENE_SCALE * (e[:, :, None] * SCENE_AXES[0] + n[:, :, None] * SCENE_AXES[1])
        - frame["origin"]
        - 0.5
    )
    contact = (
        nd.map_coordinates(
            mask.astype("float32"),
            xz.transpose(2, 0, 1)[::-1],
            order=1,
            mode="constant",
        )
        / 255.0
    )
    factor = contact * (1 - cover) * (roofs == 0)
    result += factor[:, :, None] * (np.array([101.0, 100.0, 98.0]) - result) * 0.94

    # Gate sub-texel ground detail with surveyed land cover and the observed
    # road/roof/canopy exclusions. The same colour texture carries this weight
    # in its unused alpha channel, so switching LOD needs no extra sampler.
    land = read_grid(
        cache,
        "land-cover-frontage",
        [WORLD_COVER],
        [1],
        128,
        EXTENT,
        "uint8",
        0,
        Resampling.nearest,
    )[0]
    fields = np.isin(land, (30, 40, 60)).repeat(10, axis=0).repeat(10, axis=1)
    protected = nd.maximum_filter((roads > 0) | (roofs > 0) | (chm >= 3), size=9)
    open_land = nd.gaussian_filter((fields & ~protected).astype("float32"), 3)
    open_land[protected] = 0
    chroma = np.max(photo, axis=2) - np.min(photo, axis=2)
    open_land *= np.clip((chroma - 5) / 15, 0, 1) * (1 - contact)
    # Restore local contrast already present in the registered imagery.
    result += (
        open_land[:, :, None] * 0.42 * (photo - nd.gaussian_filter(photo, (3, 3, 0)))
    )
    crop = (land == 40).repeat(10, axis=0).repeat(10, axis=1) & ~protected
    passes = crop_passes(
        photo @ np.array([0.2126, 0.7152, 0.0722], dtype="float32"), crop
    )
    result *= 1 + (0.12 * passes * open_land)[:, :, None]
    image = Image.fromarray(np.rint(result).clip(0, 255).astype("uint8"))
    field_mask = Image.fromarray(np.rint(255 - 160 * open_land).astype("uint8"))
    for level, size, quality in [("compact", 512, 82), ("detail", 1024, 90)]:
        annotated = image.resize((size, size), Image.Resampling.LANCZOS)
        annotated.putalpha(field_mask.resize((size, size), Image.Resampling.BOX))
        annotated.save(
            output / f"frontage-{level}.webp",
            quality=quality,
            method=6,
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    args = parser.parse_args()
    from build import OUT

    generate(args.cache, OUT)
