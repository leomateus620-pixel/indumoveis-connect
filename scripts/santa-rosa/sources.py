"""Read fixed COG windows and reproject each source once. No runtime map service."""

import hashlib
import json
import tempfile
from pathlib import Path

import numpy as np
import rasterio as rio
from rasterio.enums import Resampling
from rasterio.warp import reproject, transform_bounds
from rasterio.windows import Window, from_bounds

LON, LAT = -54.478510885847626, -27.845042119845623
# The registered park drawing. Rows rotate local east/north metres into XZ.
SCENE_SCALE = 0.4548161444
SCENE_AXES = np.array([[-0.4878298036, 0.8729387623], [0.8729387623, 0.4878298036]])
SCENE_ORIGIN = np.array([95., 28.])
CRS = f"+proj=aeqd +lat_0={LAT} +lon_0={LON} +datum=WGS84 +units=m +no_defs"
S2 = "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/21/J/YK/2024/1/S2B_21JYK_20240130_0_L2A/TCI.tif"
CBERS_PAN = "https://data.inpe.br/bdc/data/CB4A-WPM-L4-DN/2024_02/CBERS_4A_WPM_RAW_2024_02_12.13_51_56_ETC2/211_148_0/4_BC_UTM_WGS84/CBERS_4A_WPM_20240212_211_148_L4_BAND0.tif"
WORLD_COVER = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_S30W057_Map.tif"
BUILDINGS = [
    "https://storage.googleapis.com/open-buildings-temporal-data/v1/geotiffs/94f94_2023_06_30/tile_2_ZAsb75Cpg.tif",
    "https://storage.googleapis.com/open-buildings-temporal-data/v1/geotiffs/94fec_2023_06_30/tile_Ueg1K_hnxO4.tif",
]


def dem_url(south):
    name = f"Copernicus_DSM_COG_10_S{south}_00_W055_00_DEM"
    return f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"


def grid_cache_path(cache, key, urls, bands, size, width_m, dtype, nodata, method):
    recipe = json.dumps(
        [CRS, urls, bands, size, width_m, dtype, nodata, method.name],
        separators=(",", ":"),
    )
    fingerprint = hashlib.sha256(recipe.encode()).hexdigest()[:16]
    return cache / f"{key}-{fingerprint}.npy"


def read_grid(cache, key, urls, bands, size, width_m, dtype, nodata, method):
    """Read cloud tiles using bounded windows/overviews before the expensive warp."""
    path = grid_cache_path(
        cache, key, urls, bands, size, width_m, dtype, nodata, method
    )
    if path.exists():
        return np.load(path)
    dest = np.full((len(bands), size, size), nodata, dtype=dtype)
    radius = width_m / 2
    bounds = (-radius, -radius, radius, radius)
    affine = rio.transform.from_bounds(*bounds, size, size)
    with rio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        GDAL_HTTP_TIMEOUT=90,
        GDAL_HTTP_MAX_RETRY=4,
        GDAL_HTTP_RETRY_DELAY=2,
    ):
        for url in urls:
            with rio.open(url) as ds:
                bbox = transform_bounds(CRS, ds.crs, *bounds, densify_pts=50)
                # Add a pixel fringe for the interpolation kernel and retain north-up bounds.
                win = from_bounds(*bbox, transform=ds.transform)
                x0, y0 = int(np.floor(win.col_off)) - 3, int(np.floor(win.row_off)) - 3
                x1 = int(np.ceil(win.col_off + win.width)) + 3
                y1 = int(np.ceil(win.row_off + win.height)) + 3
                win = Window(x0, y0, x1 - x0, y1 - y0).intersection(
                    Window(0, 0, ds.width, ds.height)
                )
                ratio = min(1, size * 1.4 / max(x1 - x0, y1 - y0))
                h, w = max(1, int(win.height * ratio)), max(1, int(win.width * ratio))
                data = ds.read(
                    bands, window=win, out_shape=(len(bands), h, w), resampling=method
                )
                tf = ds.window_transform(win) * rio.Affine.scale(
                    win.width / w, win.height / h
                )
                reproject(
                    source=data,
                    destination=dest,
                    src_transform=tf,
                    src_crs=ds.crs,
                    src_nodata=ds.nodata if ds.nodata is not None else nodata,
                    dst_transform=affine,
                    dst_crs=CRS,
                    dst_nodata=nodata,
                    init_dest_nodata=False,
                    resampling=method,
                    num_threads=2,
                )
    # A hole or partial download in a primary source must fail regeneration visibly.
    if key.startswith("pan") and np.mean(np.all(dest == 0, axis=0)) > 0.01:
        raise ValueError("CBERS coverage below 99%")
    if key not in ("building", "pan", "pan-mid") and np.any(
        np.all(dest == nodata, axis=0)
    ):
        raise ValueError(f"Gap in coverage for {key}")
    with tempfile.NamedTemporaryFile(dir=cache, delete=False) as output:
        np.save(output, dest)
    Path(output.name).replace(path)
    return dest


def load_source(cache, key):
    bilinear, nearest = Resampling.bilinear, Resampling.nearest
    specs = {
        "pan": ([CBERS_PAN], [1], 2048, 4096, "float32", 0, bilinear),
        "pan-mid": ([CBERS_PAN], [1], 2048, 8192, "float32", 0, bilinear),
        "far": ([S2], [1, 2, 3], 4096, 50000, "uint8", 0, bilinear),
        "relief": (
            [dem_url(28), dem_url(29)],
            [1],
            2500,
            50000,
            "float32",
            -9999,
            bilinear,
        ),
        "landCover": ([WORLD_COVER], [1], 2500, 50000, "uint8", 0, nearest),
        # 4-m effective resolution in the urban core; the source samples are nominally 0.5 m.
        "building": (BUILDINGS, [2, 3], 2048, 8192, "float32", -99, nearest),
    }
    return read_grid(cache, key, *specs[key])
