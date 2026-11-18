"""Extract observed roof outlines around the park for offline perspective rendering.

Input is Microsoft Global ML Building Footprints (CDLA Permissive 2.0), a
dated geographic tile. Output coordinates are local east/north metres in the
same azimuthal equidistant frame as the imagery. Height is null if unknown.
"""

import argparse
import gzip
import hashlib
import json
import math
import tempfile
import urllib.request
from pathlib import Path

from pyproj import Transformer
from sources import CRS, LAT, LON

URL = (
    "https://minedbuildings.z5.web.core.windows.net/global-buildings/2026-02-03/"
    "global-buildings.geojsonl/RegionName=Brazil/quadkey=210312012/"
    "part-00012-4feead82-d499-422b-94cb-c036c212127a.c000.csv.gz"
)
SHA256 = "21a24dc97f86eb1c87a22044148b4df74a5de4bc4aee6993ec09b13fa5d181b6"
RADIUS = 4000


def load_footprints(cache):
    """Return projected polygon features. Never requested by the map client."""
    cache = Path(cache)
    cache.mkdir(parents=True, exist_ok=True)
    source = cache / "ms-210312012.geojsonl.gz"
    if not source.exists():
        with tempfile.TemporaryDirectory(dir=cache) as scratch:
            temporary = Path(scratch) / source.name
            urllib.request.urlretrieve(URL, temporary)
            if hashlib.sha256(temporary.read_bytes()).hexdigest() != SHA256:
                raise ValueError(
                    "Microsoft footprint download failed checksum validation"
                )
            temporary.replace(source)

    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest != SHA256:
        raise ValueError(f"Unexpected Microsoft tile checksum {digest} in {source}")
    projected = cache / "buildings-aeqd.json"
    if projected.exists():
        return json.loads(projected.read_text())["features"]
    to_local = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
    features = []
    with gzip.open(source, "rt") as lines:
        for line in lines:
            feature = json.loads(line)
            rings = feature["geometry"]["coordinates"]
            lon, lat = rings[0][0]
            # Loose prefilter before projecting. The single source tile covers
            # the entire 4-km disk, including the urban core south of the park.
            if abs(lat - LAT) > 0.045 or abs(lon - LON) > 0.055:
                continue
            projected_rings = []
            for ring in rings:
                east, north = to_local.transform(*zip(*ring))
                projected_rings.append(
                    [[round(e, 2), round(n, 2)] for e, n in zip(east, north)]
                )
            if min(math.hypot(e, n) for e, n in projected_rings[0]) > RADIUS:
                continue
            attributes = feature["properties"]
            confidence = attributes.get("confidence", -1)
            if 0 <= confidence < 0.65:
                continue
            height = attributes.get("height", -1)
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": projected_rings},
                    "properties": {
                        "height": height if height > 0 else None,
                        "confidence": confidence,
                    },
                }
            )
    document = {
        "type": "FeatureCollection",
        "coordinateFrame": CRS,
        "features": features,
    }
    with tempfile.NamedTemporaryFile(dir=cache, mode="w", delete=False) as output:
        json.dump(document, output, separators=(",", ":"))
    Path(output.name).replace(projected)
    return features


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", required=True, type=Path)
    print(f"{len(load_footprints(parser.parse_args().cache))} building outlines")
