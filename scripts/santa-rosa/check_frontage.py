"""Re-measure optical road widths in the registered CBERS PAN, in metres."""

import argparse
import json
from pathlib import Path

import numpy as np
from frontage import EXTENT, ROADS
from pyproj import Transformer
from scipy.ndimage import map_coordinates, shift
from sources import CRS, load_source


def widths(pan, vertices):
    offsets = np.arange(-16, 17)
    measured = []
    for a, delta in zip(vertices, np.diff(vertices, axis=0)):
        length = np.linalg.norm(delta)
        if length < 18:
            continue
        tangent = delta / length
        normal = np.array([tangent[1], -tangent[0]])
        for along in np.arange(8.0, length - 8.0, 8.0):
            center = a + along * tangent
            if np.max(abs(center)) > EXTENT / 2 - 3:
                continue
            e, n = (center + offsets[:, None] * normal).T
            radiance = map_coordinates(pan, [1023.5 - n / 2, 1023.5 + e / 2], order=1)
            minimum = np.argmin(radiance[13:20]) + 13
            edges = []
            for side in [radiance[minimum::-1], radiance[minimum:]]:
                contrast = np.percentile(side[4:15], 85) - side[0]
                if contrast < 25:
                    break
                crossing = np.flatnonzero(side >= side[0] + 0.5 * contrast)
                if not len(crossing) or crossing[0] > 10:
                    break
                edges.append(crossing[0])
            if len(edges) == 2 and sum(edges) >= 5:
                offset = offsets[minimum] + (edges[1] - edges[0]) / 2
                if abs(offset) <= 3:
                    measured.append(sum(edges))
    return measured


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", required=True, type=Path)
    cache = parser.parse_args().cache
    pan = shift(load_source(cache, "pan")[0], (3.75, -2.82), order=1, mode="nearest")
    project = Transformer.from_crs(4326, CRS, always_xy=True)
    count = 0
    for way in json.loads(ROADS.read_text())["features"]:
        vertices = np.column_stack(
            project.transform(*np.array(way["geometry"]["coordinates"]).T)
        )
        sample = widths(pan, vertices)
        stats = way["properties"]
        assert len(sample) == stats["transects"], way["id"]
        assert np.median(sample) == stats["opticalWidthM"], way["id"]
        assert np.allclose(
            np.percentile(sample, [25, 75]), stats["interquartileWidthM"], atol=0.051
        )
        count += len(sample)
    print(f"{count} cross-sections matched the widths in {ROADS.name}")
