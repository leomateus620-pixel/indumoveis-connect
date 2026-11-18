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
    lower_en = en[boundary] - outward * np.minimum(1.4, h[boundary, None] * 0.15)
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
        points * weight[:, None], triangles, target_count=49000
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
    appearance = np.column_stack((np.clip(colours, 20, 178), np.full(len(colours), 5)))
    return (
        np.vstack((points, supports)),
        np.vstack((triangles, stem_faces.reshape(-1, 3))).astype(np.uint32),
        np.vstack((appearance, np.tile([78, 69, 53, 6], (len(supports), 1)))),
        count,
    )
