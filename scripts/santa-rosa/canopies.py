"""Canopy clusters for the offline midground image bake in local E/N metres."""

from pathlib import Path

import numpy as np
import rasterio as rio
from footprints import load_footprints
from rasterio.enums import Resampling
from rasterio.features import rasterize, shapes
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


def canopies(cache, near_rgb):
    """Yield the footprint of each observed leafy group and its crown height."""
    heights = read_grid(
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
    roofs = rasterize(
        ((f["geometry"], 1) for f in load_footprints(cache)),
        out_shape=heights.shape,
        transform=TRANSFORM,
        dtype="uint8",
    )
    colour = np.asarray(near_rgb, dtype=np.float32)
    if colour.shape != (PIXELS, PIXELS, 3):
        raise ValueError("Expected the 4096 m north-up CBERS/Sentinel RGB crop at 2 m")
    red, green, blue = np.moveaxis(colour, -1, 0)
    # Cross-date test. Real canopy can be very dark; reject bare red soil,
    # pale industrial roofs and new structures in the newer roof inventory.
    leaf = (green > 0.88 * red) & (green > 0.89 * blue)
    shrub = (heights >= 4) & (roofs == 0) & leaf
    cover = nd.binary_closing(shrub, iterations=1) & (roofs == 0)
    height = nd.gaussian_filter(np.where(cover, heights, 0).astype(np.float32), 1.4)
    # Separate broad stands at their observed local maxima (typically several
    # adjoining crowns). Smaller isolated street trees keep their own maxima.
    maxima = cover & (height == nd.maximum_filter(height, size=13)) & (height >= 3)
    maxima_labels, n = nd.label(maxima)
    if not n:
        return
    centres = np.asarray(nd.center_of_mass(maxima, maxima_labels, np.arange(1, n + 1)))
    seeds = np.zeros(heights.shape, dtype=np.int32)
    rr, cc = np.rint(centres).astype(int).T
    seeds[rr, cc] = np.arange(1, n + 1)
    nearest = nd.distance_transform_edt(
        seeds == 0, return_distances=False, return_indices=True
    )
    groups = np.where(cover, seeds[nearest[0], nearest[1]], 0).astype(np.int32)
    crown_height = nd.maximum(height, groups, np.arange(1, n + 1))
    for geometry, group in shapes(groups, mask=cover, transform=TRANSFORM):
        ring = np.asarray(geometry["coordinates"][0], dtype=np.float32)
        east, north = ring.T
        area = abs(np.sum(east[:-1] * north[1:] - east[1:] * north[:-1])) * 0.5
        if area >= 20:
            yield ring, float(crown_height[int(group) - 1])
