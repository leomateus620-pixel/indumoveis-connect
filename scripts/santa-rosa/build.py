"""Build static, north-up aerials and cylindrical landscapes from licensed observations."""

import argparse
import json
from pathlib import Path

import numpy as np
from footprints import load_footprints
from frontage import generate as generate_frontage
from PIL import Image
from rasterio.features import rasterize
from rasterio.transform import from_origin
from scipy.ndimage import gaussian_filter, map_coordinates, minimum_filter, shift
from scipy.signal import find_peaks
from sources import LAT, LON, load_source

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/landscape/santa-rosa"
EVIDENCE = ROOT / "docs/validation/santa-rosa"
HIGH, LOW = 8, -16  # degrees from horizontal; positive = above eye
RADIUS = 25000
BAND_WIDTH, BAND_HEIGHT = 8192, 512
SECTORS = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"]
COVER = {
    10: "árvores",
    20: "arbustos",
    30: "campo",
    40: "lavoura",
    50: "urbanizado",
    60: "solo exposto",
    80: "água",
    90: "área úmida",
}


def grid_samples(grid, east, north, width, order=1):
    size = grid.shape[-1]
    ij = [(0.5 - north / width) * size - 0.5, (0.5 + east / width) * size - 0.5]
    return map_coordinates(grid, ij, order=order, mode="nearest", prefilter=False)


def save_webp(image, name, compact, detail):
    for suffix, width, quality in [("compact", compact, 80), ("detail", detail, 88)]:
        h = max(1, round(width * image.height / image.width))
        if name.startswith("horizon-") and suffix == "compact":
            h = 256
        im = image.resize((width, h), Image.Resampling.LANCZOS)
        im.save(
            OUT / f"{name}-{suffix}.webp", quality=quality, method=6, alpha_quality=100
        )


def luminance(rgb):
    return 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]


def expose(rgb):
    # Lift shadows and protect highlights to match the contrast of nearby
    # roofs. The same transfer curve is applied in all three aerial windows.
    source = rgb.astype("float32")
    light = luminance(source)
    value = 37 + 182 * np.power(np.clip(light / 255, 0, 1), 0.78)
    return np.clip(
        value[:, :, None] + 0.63 * (source - light[:, :, None]), 0, 250
    ).astype("uint8")


def fuse_pan(pan, far, width, stops=None):
    # One translation measured against the OSM island on the orthorectified
    # 12-Feb PAN. Move its content west and south; Sentinel stays in its CRS.
    gsd = width / pan.shape[0]
    pan = shift(
        pan, (7.50 / gsd, -5.64 / gsd), order=1, mode="nearest", prefilter=False
    )
    offsets = (np.arange(pan.shape[0], dtype="float32") + 0.5) * gsd - width / 2
    e, n = np.meshgrid(offsets, -offsets)
    rgb = np.stack(
        [grid_samples(far[:, :, i], e, n, 50000) for i in range(3)], axis=-1
    ).astype("float32")
    light = luminance(rgb)
    present = pan > 0
    if stops is None:
        stops = (*np.percentile(pan[present], [4, 92]), *np.percentile(light, [4, 92]))
    pan_lo, pan_hi, ref_lo, ref_hi = stops
    calibrated = np.clip(
        (pan - pan_lo) * (ref_hi - ref_lo) / (pan_hi - pan_lo) + ref_lo, 0, 255
    )
    # WPM PAN includes near infrared. Preserve visible brightness in broad
    # canopies and the narrow high-resolution edges of streets and rooflines.
    base = gaussian_filter(calibrated, sigma=5.4 / gsd)
    sharpened = 0.68 * light + 0.32 * base + 0.94 * (calibrated - base)
    local = np.where(present, sharpened, light)
    return expose(local[:, :, None] + rgb - light[:, :, None]), stops


def photo_grid(cache):
    true_colour = load_source(cache, "far").transpose(1, 2, 0)
    near, stops = fuse_pan(load_source(cache, "pan")[0], true_colour, 4096)
    mid, _ = fuse_pan(load_source(cache, "pan-mid")[0], true_colour, 8192, stops)
    far = expose(true_colour)
    for name, rgb in [("near", near), ("mid", mid), ("far", far)]:
        # At this distance the measured panorama carries the skyline. Keep the
        # full Sentinel grid for the offline projection and a smaller ground fallback.
        save_webp(Image.fromarray(rgb), name, 512, 1024 if name == "far" else 2048)
    return near, mid, far


def footprint_heights(cache, footprints):
    """One robust height per measured footprint, shared by mesh and panorama."""
    heights, confidences = load_source(cache, "building")
    labels = rasterize(
        ((f["geometry"], i + 1) for i, f in enumerate(footprints)),
        out_shape=heights.shape,
        transform=from_origin(-4096, 4096, 4, 4),
        fill=0,
        dtype="int32",
    )
    known = (labels > 0) & (confidences >= 0.6) & (heights >= 2)
    # Sort by roof, then height. The 65th percentile is insensitive to isolated
    # high pixels and to mixed pixels at the boundary of adjacent roofs.
    ids, h = labels[known], heights[known]
    sort = np.lexsort((h, ids))
    roof_ids, begin, count = np.unique(ids[sort], return_index=True, return_counts=True)
    estimate = np.zeros(len(footprints) + 1, dtype="float32")
    enough = count >= 2
    estimate[roof_ids[enough]] = h[sort[begin + (count * 0.65).astype(int)]][enough]
    return labels, estimate


def ray_data(cache, near, far, mid=None):
    surface = load_source(cache, "relief")[0]
    cover = load_source(cache, "landCover")[0]
    # Surface includes canopy/roofs. Infer only a local underlying ground for
    # building pixels, then take the maximum; adding heights to DSM doubles roofs.
    floor = gaussian_filter(minimum_filter(surface, size=3), sigma=1)
    # Aggregate relative heights over *observed* Microsoft roof outlines. The
    # same roof receives one robust height instead of isolated predicted pixels
    # turning into needles. Unmeasured roofs retain the existing DSM silhouette.
    footprints = load_footprints(cache)
    labels, estimate = footprint_heights(cache, footprints)
    mass = estimate[labels]
    center_radii = np.array(
        [
            0,
            *(
                np.linalg.norm(np.mean(f["geometry"]["coordinates"][0][:-1], axis=0))
                for f in footprints
            ),
        ]
    )
    in_mesh = (estimate > 12) & (estimate < 120) & (center_radii <= 4000)
    background_mass = np.where(in_mesh, 0, estimate)[labels]
    # Smoothed footprint edge normals determine which vertical faces receive
    # the shared easterly key light. The sign of rows is opposite true north.
    dy, dx = np.gradient(gaussian_filter(mass, sigma=0.85))
    side_luminance = np.clip(
        (-0.96 * dx - 0.27 * dy) / np.maximum(np.hypot(dx, dy), 0.1), 0, 1
    )
    # Median around the central pedestrian/lot area avoids a single roof return.
    c = surface.shape[0] // 2
    ground = float(np.median(surface[c - 1 : c + 2, c - 1 : c + 2]))
    # 2 m near steps retain building edges; increase with the samples' true GSD.
    ranges = np.r_[
        np.arange(950, 4096, 2),
        np.arange(4096, 9000, 10),
        np.arange(9000, RADIUS, 20),
        RADIUS,
    ]

    def rays(degrees, colour=True):
        radians = np.deg2rad(degrees)
        e, n = np.sin(radians)[:, None] * ranges, np.cos(radians)[:, None] * ranges
        dsm = grid_samples(surface, e, n, 50000)
        tree_or_land = grid_samples(cover, e, n, 50000, 0)
        building = grid_samples(background_mass if colour else mass, e, n, 8192, 0)
        building[(abs(e) >= 4096) | (abs(n) >= 4096)] = 0
        # Sightline analytics include all measured roofs in front of the observer.
        if colour:
            # The nearby settlement and the taller city buildings have closed world-space
            # meshes. Repeating a facade in the panorama would leave a second silhouette.
            building *= np.clip((ranges - 1450) / 100, 0, 1)
        roofs = grid_samples(floor, e, n, 50000) + building
        z = np.where(building > 0, np.maximum(dsm, roofs), dsm)
        if not colour:
            return z, dsm, tree_or_land, building
        # Colour sample and depth belong to the same first intersection.
        d = np.maximum(abs(e), abs(n))
        weight = np.clip((2048 - d) / 220, 0, 1)
        mid_weight = np.clip((4096 - d) / 440, 0, 1)
        side = grid_samples(side_luminance, e, n, 8192, 1)
        rgb = []
        for i in range(3):
            coarse = grid_samples(far[:, :, i], e, n, 50000)
            middle = grid_samples(mid[:, :, i], e, n, 8192)
            coarse = middle * mid_weight + coarse * (1 - mid_weight)
            fine = grid_samples(near[:, :, i], e, n, 4096)
            rgb.append(coarse * (1 - weight) + fine * weight)
        return (
            z,
            building,
            np.stack(rgb, axis=-1),
            side,
        )

    offsets = (np.arange(512, dtype="float32") + 0.5) * 16 - 4096
    east, north = np.meshgrid(offsets, -offsets)
    height_grid = grid_samples(surface, east, north, 50000) - ground
    encoded = np.clip(np.rint(height_grid) + 128, 0, 255).astype("uint8")
    Image.fromarray(encoded).save(OUT / "relief.png")
    return rays, ranges, ground, cover


def skyline_angle(z, ranges, eye):
    # Apparent elevation uses geometric curvature; refraction varies with weather.
    drop = ranges * ranges / (2 * 6371008.8)
    return np.rad2deg(np.arctan2(z - drop - eye, ranges))


def panorama(rays, ranges, ground):
    # Sample actual centres. The last column borders the first at geographic north.
    size = BAND_WIDTH * 2
    directions = (np.arange(size) + 0.5) * 360 / size
    elevations = HIGH - (np.arange(BAND_HEIGHT * 2) + 0.5) * (HIGH - LOW) / (
        BAND_HEIGHT * 2
    )
    images = [np.zeros((BAND_HEIGHT * 2, size, 4), dtype="uint8") for _ in range(2)]
    ridges = np.zeros((2, size))
    depth_pixels = np.full((BAND_HEIGHT * 2, size, 3), 255, dtype="uint8")
    depth_pixels[:, :, 2] = 0
    encoded_depth = np.rint(255 * np.log(ranges / 950) / np.log(RADIUS / 950)).astype(
        "uint8"
    )
    for start in range(0, size, 64):
        z, building, rgb, side = rays(directions[start : start + 64])
        for index, agl in enumerate([16, 72]):
            angles = skyline_angle(z, ranges, ground + agl)
            envelope = np.maximum.accumulate(angles, axis=1)
            ridges[index, start : start + 64] = envelope[:, -1]
            for j in range(len(angles)):
                k = np.searchsorted(envelope[j], elevations)
                visible = k < len(ranges)
                k = k[visible]
                depth = ranges[k]
                sample = rgb[j, k]
                # The aerial colour is a roof measurement. At a steep rise into
                # a building mask the eye sees a shaded façade, not the rooftop.
                absolute = (
                    ground
                    + agl
                    + depth * np.tan(np.deg2rad(elevations[visible]))
                    + depth * depth / (2 * 6371008.8)
                )
                below_roof = np.maximum(z[j, k] - absolute, 0)
                wall_weight = np.where(building[j, k] > 2, np.clip(below_roof, 0, 1), 0)
                height_fraction = 1 - np.clip(
                    below_roof / np.maximum(building[j, k], 1), 0, 1
                )
                wall_tone = 0.72 + 0.24 * side[j, k] + 0.06 * height_fraction
                wall_rgb = (sample * 0.58 + [71, 72, 70]) * wall_tone[:, None]
                sample += (wall_rgb - sample) * wall_weight[:, None]
                # Moderate terrestrial scattering retains different ridgelines
                # behind valleys. No sun, cloud or photographed sky in the band.
                transmission = 0.88 * np.exp(-depth / 18000)
                colour = sample * transmission[:, None] + np.array([174, 192, 193]) * (
                    1 - transmission[:, None]
                )
                column = images[index][:, start + j]
                column[visible, :3] = colour.clip(0, 255)
                # At angles below the first radial sample the ray would
                # see nearby ground already supplied by the aerial layer. Fade
                # the cropped edge over 0.15° instead of extruding a 950 m wall.
                edge = np.clip(1 + (elevations[visible] - angles[j, 0]) / 0.15, 0, 1)
                column[visible, 3] = np.round(255 * edge)
                # Extend the measured ridge into the transparent sky. A ray arriving
                # above a crest must follow its surface as the eye moves; a synthetic
                # 25-km sky depth here used to tear or double the edge of that crest.
                depth_pixels[:, start + j, index] = encoded_depth[np.argmax(angles[j])]
                depth_pixels[visible, start + j, index] = np.where(
                    column[visible, 3] > 0, encoded_depth[k], encoded_depth[0]
                )
    for i, name in enumerate(["horizon-low", "horizon-high"]):
        save_webp(Image.fromarray(images[i]), name, 2048, BAND_WIDTH)
    for name, dim in [("compact", (2048, 256)), ("detail", (4096, 512))]:
        # Preserve actual first-hit distances at object boundaries. A lower
        # resolution pixel represents a centre ray, not an average with sky.
        Image.fromarray(depth_pixels).resize(dim, Image.Resampling.NEAREST).save(
            OUT / f"depth-{name}.png"
        )
    return ridges


def relief_report(rays, ranges, ground, cover, ridges):
    d = (np.arange(cover.shape[0], dtype="float32") + 0.5) / cover.shape[
        0
    ] * 50000 - 25000
    e, n = d[None, :], -d[:, None]
    rho = np.hypot(e, n)
    azimuth = (np.rad2deg(np.arctan2(e, n)) + 22.5) % 360
    report = {
        "originWgs84": [LON, LAT],
        "originSceneXZ": [95, 28],
        "parkSurfaceM": round(ground, 1),
        "radiusM": RADIUS,
        "minimumPanoramaRangeM": 950,
        "heightsAGLm": [16, 72],
        "maxSilhouetteChangeDeg": round(float(np.max(abs(ridges[0] - ridges[1]))), 3),
        "sectors": [],
    }
    for i, name in enumerate(SECTORS):
        deg = i * 45
        sector = {
            "direction": name,
            "centralTrueAzimuthDeg": deg,
            "landCoverByArea": {},
            "sightlines": [],
        }
        for label, lo, hi in [
            ("0.4–2 km", 400, 2000),
            ("2–8 km", 2000, 8000),
            ("8–25 km", 8000, 25000),
        ]:
            sample = cover[
                (azimuth >= i * 45)
                & (azimuth < (i + 1) * 45)
                & (rho >= lo)
                & (rho < hi)
            ]
            sector["landCoverByArea"][label] = {
                k: round(float(np.mean(sample == v) * 100), 1)
                for v, k in COVER.items()
                if np.sum(sample == v)
            }
        z, _, classes, buildings = rays(np.array([deg]), False)
        for agl in [16, 40, 72, 110]:
            angles = skyline_angle(z[0], ranges, ground + agl)
            hit = int(np.argmax(angles))
            # Secondary exposed ridge crests on the centreline. Peaks behind
            # the nearer skyline never qualify, even when taller above sea level.
            peaks, _ = find_peaks(angles, prominence=0.035)
            envelope = np.maximum.accumulate(angles)
            candidates = [
                p for p in peaks if abs(angles[p] - envelope[p]) < 0.0001 and p < hit
            ]
            separated = []
            for p in reversed(candidates):
                if ranges[hit] - ranges[p] >= 300 and all(
                    abs(ranges[q] - ranges[p]) >= 300 for q in separated
                ):
                    separated.append(p)
                if len(separated) == 3:
                    break

            points = [
                {
                    "distanceM": int(ranges[k]),
                    "surfaceM": round(float(z[0, k]), 1),
                    "angleDeg": round(float(angles[k]), 3),
                    "cover": COVER.get(int(classes[0, k]), "outra"),
                    "estimatedBuildingHeightM": round(float(buildings[0, k]), 1),
                }
                for k in [hit, *sorted(separated)]
            ]
            sector["sightlines"].append(
                {
                    "heightAGLm": agl,
                    "horizon": points[0],
                    "nearerVisibleCrests": points[1:],
                }
            )
        report["sectors"].append(sector)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cache",
        required=True,
        type=Path,
        help="local scratch directory for source windows",
    )
    args = parser.parse_args()
    for path in [args.cache, OUT, EVIDENCE]:
        path.mkdir(parents=True, exist_ok=True)
    near, mid, far = photo_grid(args.cache)
    generate_frontage(args.cache, OUT)
    rays, ranges, ground, cover = ray_data(args.cache, near, far, mid)
    ridges = panorama(rays, ranges, ground)
    report = relief_report(rays, ranges, ground, cover, ridges)
    (EVIDENCE / "sightlines.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    )
    print(f"Assets written to {OUT}; observation surface {ground:.1f} m")


if __name__ == "__main__":
    main()
