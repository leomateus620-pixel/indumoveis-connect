"""WRI/Meta canopy surfaces in local east/north metres."""

from pathlib import Path

import numpy as np
import rasterio as rio
from rasterio.enums import Resampling
from rasterio.features import rasterize
from scipy import ndimage as nd
from sources import read_grid

# WRI and Meta canopy height model v1. A value in the source is a model
# estimate in metres above ground. The polygons below are crown groups.
CANOPY_URL = (
    "https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/"
    "alsgedi_global_v6_float/chm/210312012.tif"
)
EXTENT = 4096
PIXELS = 2048
TRANSFORM = rio.transform.from_bounds(-2048, -2048, 2048, 2048, PIXELS, PIXELS)


def load_canopy_height(cache):
    return read_grid(
        Path(cache),
        "canopy-v1",
        [CANOPY_URL],
        [1],
        PIXELS,
        EXTENT,
        "uint8",
        255,
        Resampling.bilinear,
    )[0]


def crown_caps(keep, heights, rgb, terrain):
    """Small alpha-cut domes on measured canopy cells, in the same indexed draw."""
    # Prefer observed local peaks, then fill broad continuous stands. A crown's
    # horizontal reach is bounded by its distance to a clearing or building.
    distance = nd.distance_transform_edt(keep) * 2
    top = nd.gaussian_filter(heights.astype(np.float32) * keep, 0.65)
    y, x = np.nonzero(keep[::2, ::2])
    y, x = 2 * y, 2 * x
    radius = np.hypot(x - 1023.5, y - 1023.5) * 2
    near = radius < 1300
    y, x, radius = y[near], x[near], radius[near]
    peak = top[y, x] >= nd.maximum_filter(top, 3)[y, x] - 0.1
    priority = peak * 25 + top[y, x] + np.minimum(distance[y, x], 8) - radius / 1600
    # Keep the render budget proportional to screen size. Each spatial cell
    # elects its most legible peak; cells away from the park are larger.
    grid_m = np.where(radius < 600, 13, np.where(radius < 900, 23, 37))
    key = np.column_stack((grid_m, np.floor(x * 2 / grid_m), np.floor(y * 2 / grid_m)))
    ranked = np.argsort(-priority, kind="stable")
    _, unique = np.unique(key[ranked], axis=0, return_index=True)
    elected = ranked[np.sort(unique)]
    # Preserve close edges first if a future canopy release has more stands.
    elected = elected[np.argsort(radius[elected], kind="stable")][:2400]
    covered = np.zeros_like(keep)
    selected = []
    for i in elected:
        row, col = int(y[i]), int(x[i])
        if covered[row, col]:
            continue
        h = heights[row, col]
        r = min(2.3 + h * 0.30, distance[row, col] * 1.2 + 0.8, 8.0)
        spacing = r * (0.73 + 0.34 * radius[i] / 1300)
        cells = int(np.ceil(spacing / 2))
        yy, xx = np.ogrid[-cells : cells + 1, -cells : cells + 1]
        covered[row - cells : row + cells + 1, col - cells : col + cells + 1] |= (
            xx * xx + yy * yy
        ) * 4 <= spacing**2
        selected.append((row, col, r))
    selected = np.asarray(selected)
    y, x = selected[:, 0].astype(int), selected[:, 1].astype(int)
    centres = np.column_stack(((x - 1023.5) * 2, (1023.5 - y) * 2))
    # The atlas carries individual tuft boundaries. Each mapped cap has its
    # own stable bearing, optical brightness and one of four editable finishes.
    heading = ((x * 37 + y * 61) % 89) / 89 * 2 * np.pi
    r = selected[:, 2]
    crest = heights[y, x]
    base = terrain.elevation(centres) + crest
    depth = np.minimum(crest * 0.62, r * 1.27)
    angle = np.arange(8) * np.pi / 4
    ring = np.column_stack((np.cos(angle), np.sin(angle)))
    local = np.vstack(([[0, 0]], ring * 0.63, ring))
    geo_angle = heading[:, None] + np.arctan2(local[:, 1], local[:, 0])
    reach = np.linalg.norm(local, axis=1)[None, :] * r[:, None]
    xx = centres[:, 0, None] + reach * np.cos(geo_angle)
    yy = centres[:, 1, None] + reach * np.sin(geo_angle)
    zz = base[:, None] - depth[:, None] * np.r_[0.0, np.full(8, 0.18), np.ones(8)]
    points = np.stack((xx, yy, zz), axis=-1).reshape(-1, 3)
    i = np.arange(8)
    j = (i + 1) % 8
    facets = np.vstack(
        (
            np.column_stack((np.zeros_like(i), i + 1, j + 1)),
            np.column_stack((i + 1, i + 9, j + 9)),
            np.column_stack((i + 1, j + 9, j + 1)),
        )
    )
    faces = (facets + np.arange(len(r))[:, None, None] * len(local)).reshape(-1, 3)
    appearance = np.empty((len(r), len(local), 4), dtype=np.uint8)
    appearance[:, :, :2] = np.round((local * 0.5 + 0.5) * 255)
    appearance[:, :, 2] = np.clip(
        np.sum(rgb[y, x] * [0.2126, 0.7152, 0.0722], axis=1), 0, 255
    ).astype("uint8")[:, None]
    appearance[:, :, 3] = (12 + ((x // 2) * 11 + (y // 2) * 17) % 4)[:, None]
    return points, faces, appearance.reshape(-1, 4)


def canopy_surface(footprints, photo, heights, terrain, radius):
    """Build crown volumes from occupied 2 m cells. Openings remain boundaries."""
    import fast_simplification

    roofs = rasterize(
        ((f["geometry"], 1) for f in footprints),
        out_shape=heights.shape,
        transform=TRANSFORM,
        dtype="uint8",
    )
    rgb = photo.astype(np.float32)
    red, green, blue = np.moveaxis(rgb, -1, 0)
    y, x = np.indices(heights.shape)
    keep = (
        (heights >= 4)
        & (heights < 80)
        & (roofs == 0)
        & (green > red * 0.88)
        & (green > blue * 0.89)
        & (np.hypot(x - 1023.5, y - 1023.5) * 2 <= radius)
    )
    iy, ix = np.nonzero(keep)
    en = np.column_stack(((ix - 1023.5) * 2, (1023.5 - iy) * 2))
    keep[iy, ix] &= terrain.mask_at(en, 0) <= 5
    groups, count = nd.label(keep)
    group_sizes = np.bincount(groups[keep], minlength=count + 1)
    keep &= group_sizes[groups] >= 5
    count = int((group_sizes >= 5).sum())
    # Follow the actual edges of the 2 m observation, including internal holes.
    y, x = np.nonzero(keep)
    stride = PIXELS + 1
    # Vertex winding is counterclockwise in geographic E/N.
    nw = y * stride + x
    quads = np.column_stack((nw, nw + stride, nw + stride + 1, nw + 1))
    ids, quad = np.unique(quads, return_inverse=True)
    quad = quad.reshape(-1, 4)
    cy, cx = np.divmod(ids, stride)
    en = np.column_stack(((cx - PIXELS / 2) * 2.0, (PIXELS / 2 - cy) * 2.0))
    denom = nd.gaussian_filter(keep.astype(np.float32), 1)
    above = nd.gaussian_filter(heights.astype(np.float32) * keep, 1) / np.maximum(
        denom, 0.01
    )
    source_xy = np.stack((cy - 0.5, cx - 0.5))
    h = nd.map_coordinates(above, source_xy, order=1)
    # Heights at the edge represent a whole source cell. Round its outer
    # shoulders over the observed distance to the first unoccupied cell.
    inside = nd.map_coordinates(nd.distance_transform_edt(keep) * 2, source_xy, order=1)
    h *= 0.60 + 0.40 * np.sqrt(np.clip(inside / np.maximum(1.5, 0.32 * h), 0, 1))
    z = terrain.elevation(en)
    # Smooth stair-stepped exterior vertices along their own boundary, leaving
    # every open hole and each stand's topology intact. Build a tapering skirt.
    pad = np.pad(keep, 1)
    border = []
    for i, (dy, dx) in enumerate(((0, -1), (1, 0), (0, 1), (-1, 0))):
        rows = ~pad[y + 1 + dy, x + 1 + dx]
        border.append(quad[rows][:, [i, (i + 1) % 4]])
    border = np.vstack(border)
    boundary, edge = np.unique(border, return_inverse=True)
    edge = edge.reshape(-1, 2)
    neighbours = np.zeros((len(boundary), 2))
    valence = np.zeros(len(boundary))
    for i in (0, 1):
        np.add.at(neighbours, edge[:, i], en[border[:, 1 - i]])
        np.add.at(valence, edge[:, i], 1)
    en[boundary] = 0.48 * en[boundary] + 0.52 * neighbours / valence[:, None]
    h[boundary] *= 0.77
    # An outward normal to each CCW edge identifies the same side of internal
    # gaps as the contour. A skirt curls slightly inward below the crown.
    normals = np.diff(en[border], axis=1)[:, 0, ::-1] * [1, -1]
    outward = np.zeros_like(neighbours)
    for i in (0, 1):
        np.add.at(outward, edge[:, i], normals)
    outward /= np.maximum(0.01, np.linalg.norm(outward, axis=1, keepdims=True))
    lower_en = en[boundary] - outward * np.minimum(3.2, h[boundary, None] * 0.26)
    # Make room below the observed height for scalloped crowns inside
    # the close band. Far stands retain their measured top envelope.
    cap_weight = np.clip((1350 - np.linalg.norm(en, axis=1)) / 85, 0, 1)
    h *= 1 - 0.085 * cap_weight
    points = np.vstack(
        (
            np.column_stack((en, z + h)),
            np.column_stack((lower_en, z[boundary] + h[boundary] * 0.16)),
        )
    )
    lower = edge + len(en)
    triangles = np.vstack(
        (
            quad[:, [0, 1, 2]],
            quad[:, [0, 2, 3]],
            np.column_stack((lower[:, 0], lower[:, 1], border[:, 1])),
            np.column_stack((lower[:, 0], border[:, 1], border[:, 0])),
        )
    )
    # Weight the physical error by viewing distance when simplifying, then
    # invert the continuous radial transform. A gap near the Arena gets more
    # vertices than an equally wide gap one kilometre beyond it.
    weight = 1.0 / (1.0 + np.linalg.norm(points[:, :2], axis=1) / 650.0)
    points, triangles = fast_simplification.simplify(
        points * weight[:, None], triangles, target_count=36500
    )
    points /= (1.0 - np.linalg.norm(points[:, :2], axis=1) / 650.0)[:, None]
    sample = np.stack((1023.5 - points[:, 1] / 2, 1023.5 + points[:, 0] / 2))
    colours = np.column_stack(
        [
            nd.map_coordinates(
                nd.gaussian_filter(rgb[:, :, i] * keep, 1.6)
                / np.maximum(nd.gaussian_filter(keep.astype(np.float32), 1.6), 0.01),
                sample,
                order=1,
            )
            for i in range(3)
        ]
    )
    h_at = nd.map_coordinates(above, sample, order=1)
    fraction = np.clip(
        (points[:, 2] - terrain.elevation(points[:, :2])) / np.maximum(1, h_at), 0, 1.1
    )
    colours *= 0.77 + 0.23 * fraction[:, None]
    # Published coordinates do not identify individual stems in a forest.
    # Give only small isolated crowns one support, below their highest return.
    small = np.flatnonzero((group_sizes >= 5) & (group_sizes <= 72))
    peaks = np.asarray(nd.maximum_position(heights, labels=groups, index=small))
    top_height = heights[peaks[:, 0], peaks[:, 1]].astype(float)
    centres = np.column_stack(((peaks[:, 1] - 1023.5) * 2, (1023.5 - peaks[:, 0]) * 2))
    bases = terrain.elevation(centres)
    spoke = (
        np.array([[1, 0], [-0.5, 0.866], [-0.5, -0.866]])[None, :, :]
        * np.clip(top_height * 0.032, 0.14, 0.43)[:, None, None]
    )
    corners = centres[:, None, :] + spoke
    stem = np.tile(corners, (1, 2, 1))
    stem_z = np.column_stack(
        (
            np.broadcast_to((bases - 0.5)[:, None], (len(bases), 3)),
            np.broadcast_to((bases + 0.72 * top_height)[:, None], (len(bases), 3)),
        )
    )
    supports = np.dstack((stem, stem_z)).reshape(-1, 3)
    template = np.array(
        [[0, 1, 4], [0, 4, 3], [1, 2, 5], [1, 5, 4], [2, 0, 3], [2, 3, 5]]
    )
    stem_faces = (
        template[None, :, :] + np.arange(len(bases))[:, None, None] * 6 + len(points)
    )
    appearance = np.column_stack(
        (np.clip(colours, 20, 178), 8 + 16 * np.rint(np.clip(fraction, 0, 1) * 15))
    )
    caps, cap_faces, cap_appearance = crown_caps(keep, heights, rgb, terrain)
    return (
        np.vstack((points, supports, caps)),
        np.vstack(
            (
                triangles,
                stem_faces.reshape(-1, 3),
                cap_faces + len(points) + len(supports),
            )
        ).astype(np.uint32),
        np.vstack(
            (appearance, np.tile([78, 69, 53, 9], (len(supports), 1)), cap_appearance)
        ),
        count,
    )
