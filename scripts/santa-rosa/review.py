"""Plot independent registration checks and visible ridge profiles from the same inputs."""

import argparse
import hashlib
import json
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from build import EVIDENCE, OUT, ROOT, SECTORS, ray_data, skyline_angle
from PIL import Image
from pyproj import Transformer
from sources import CRS

NORTH = np.array([0.8729387623, 0.4878298036])
EAST = np.array([-0.4878298036, 0.8729387623])
SCALE = 0.4548161444
ORIGIN = np.array([95, 28])
# Manual observations in the final 2048² orthophoto, pixel edges measured from
# its NW corner. Roof centre, midpoint of the short northern track boundary,
# centre of the island. The island alone fixes the separate L4 PAN translation; the other two points are holdouts.
OBSERVED = [(932.9, 907.5), (942.0, 1063.6), (1167.18, 1124.25)]


def from_world(poly):
    delta = (np.array(poly) - ORIGIN) / SCALE
    return np.stack([1024 + (delta @ EAST) / 2, 1024 - (delta @ NORTH) / 2], axis=-1)


def polygon_centroid(p):
    q = np.roll(p, -1, axis=0)
    twice_area = p[:, 0] * q[:, 1] - q[:, 0] * p[:, 1]
    return np.sum((p + q) * twice_area[:, None], axis=0) / (3 * np.sum(twice_area))


def roundabout():
    # The same two OSM arcs used by fitCircle in urbanReference. Here we
    # reconstruct their centre geodetically, independently of the scene fit.
    text = (ROOT / "src/features/commercial-map/urbanReference.ts").read_text()
    nodes = {
        k: (float(lo), float(la))
        for k, lo, la in re.findall(r'"(\d+)": \[(-?\d+\.\d+), (-?\d+\.\d+)\]', text)
    }
    ids = set()
    for way in ["949273418", "833033189"]:
        ids.update(
            re.findall(r'"(\d+)"', text.split(f'"{way}": {{')[1].split("tags:")[0])
        )
    coord = Transformer.from_crs(4326, CRS, always_xy=True)
    e, n = np.array([coord.transform(*nodes[k]) for k in sorted(ids)]).T
    system = np.stack([2 * e, 2 * n, np.ones_like(e)], axis=1)
    e0, n0, _ = np.linalg.lstsq(system, e * e + n * n, rcond=None)[0]
    r = np.mean(np.hypot(e - e0, n - n0)) / 2
    c = np.array([1024 + e0 / 2, 1024 - n0 / 2])
    a = np.arange(65) * 2 * np.pi / 64
    return c + np.stack([r * np.cos(a), r * np.sin(a)], axis=1), c


def controls():
    tech = json.loads(
        (
            ROOT / "docs/validation/park-registration-2026-11-02/park-technical.json"
        ).read_text()
    )
    arena = from_world(
        next(x["polygon"] for x in tech["inventory"] if x["id"] == "arena")
    )
    pista = from_world(
        next(x["polygon"] for x in tech["openAreas"] if x["id"] == "PISTA-CAMPEIRA")
    )
    rotula, rotula_center = roundabout()
    return [
        ("Arena", arena, polygon_centroid(arena)),
        ("Pista campeira", pista, pista[:2].mean(axis=0)),
        ("Rotatória da Benvenuto", rotula, rotula_center),
    ]


def draw_controls():
    image = np.asarray(Image.open(OUT / "near-detail.webp"))
    fig = plt.figure(figsize=(12, 6), layout="constrained")
    gs = fig.add_gridspec(2, 3, height_ratios=[1.2, 1])
    ax = fig.add_subplot(gs[0, :])
    ax.imshow(image, extent=(0, 2048, 2048, 0))
    ax.set_xlim(855, 1225)
    ax.set_ylim(1172, 855)
    ax.axis("off")
    table = []
    wgs = Transformer.from_crs(CRS, 4326, always_xy=True)
    for i, (name, poly, ref) in enumerate(controls()):
        obs = np.array(OBSERVED[i])
        distance = np.linalg.norm(ref - obs) * 2
        lon, lat = wgs.transform((ref[0] - 1024) * 2, (1024 - ref[1]) * 2)
        table.append(
            {
                "feature": name,
                "registeredPx": np.round(ref, 2).tolist(),
                "observedPx": obs.tolist(),
                "residualM": round(distance, 1),
                "referenceLonLat": [round(lon, 7), round(lat, 7)],
            }
        )
        loop = np.vstack([poly, poly[0]])
        ax.plot(*loop.T, lw=0.9, color="#ffda72")
        ax.text(
            ref[0] + 5,
            ref[1] - 6,
            name,
            fontsize=8,
            bbox={"facecolor": "#172129", "alpha": 0.8, "pad": 2, "edgecolor": "none"},
            color="white",
        )
        inset = fig.add_subplot(gs[1, i])
        inset.imshow(image, extent=(0, 2048, 2048, 0), interpolation="nearest")
        inset.plot(*loop.T, lw=1, color="#ffda72", label="Traçado registrado")
        inset.scatter(*ref, marker="+", c="#ffda72", s=110)
        inset.scatter(*obs, marker="x", c="#65dcf3", s=58)
        radius = [35, 32, 24][i]
        inset.set_xlim(ref[0] - radius, ref[0] + radius)
        inset.set_ylim(ref[1] + radius * 0.7, ref[1] - radius * 0.7)
        inset.axis("off")
        inset.set_title(f"{name}   ·   {distance:.1f} m", fontsize=11)
    fig.suptitle(
        "Registro do parque na imagem de produção\n"
        "Norte para cima   ·   2 m/pixel   ·   + registro do modelo   × leitura da imagem",
        fontsize=14,
    )
    fig.savefig(EVIDENCE / "controles-territoriais.webp", dpi=150, format="webp")
    plt.close(fig)
    (EVIDENCE / "controles-territoriais.json").write_text(
        json.dumps(table, ensure_ascii=False, indent=2) + "\n"
    )


def plot_relief(cache):
    rays, ranges, ground, _ = ray_data(cache, None, None)
    heights, *_ = rays(np.arange(8) * 45, False)
    fig, axes = plt.subplots(
        4, 2, figsize=(12, 10), sharex=True, sharey=True, layout="constrained"
    )
    km = ranges / 1000.0
    for i, ax in enumerate(axes.flat):
        z = heights[i]
        ax.fill_between(km, 110, z, color="#cad5b7")
        ax.plot(km, z, color="#54653c", lw=0.75)
        for agl, color in [(16, "#ab492c"), (72, "#24687f")]:
            angles = skyline_angle(z, ranges, ground + agl)
            hit = np.argmax(angles)
            d = ranges[: hit + 1]
            # Plot the same straight sight ray in the local-level frame used in
            # the numeric raycast, then restore curvature to the EGM2008 plot.
            line = (
                ground
                + agl
                + d * np.tan(np.deg2rad(angles[hit]))
                + d * d / (2 * 6371008.8)
            )
            ax.plot(d / 1000, line, color=color, lw=0.85, ls="--")
            ax.scatter(km[hit], z[hit], s=22, color=color)
        ax.set_title(f"{SECTORS[i]}  ·  {45 * i}°", loc="left", fontsize=10)
        ax.grid(axis="y", alpha=0.18)
    fig.supxlabel("Distância geodésica desde o parque (km)")
    fig.supylabel("Elevação da superfície (m, EGM2008)")
    fig.suptitle(
        "Qual crista chega ao horizonte?\nRaios que tangenciam a silhueta observada a 16 m (ocre) e 72 m (azul)",
        fontsize=15,
    )
    fig.savefig(EVIDENCE / "perfis-relevo.webp", dpi=150, format="webp")
    plt.close(fig)


def raster_report():
    """Check the encoded, distributed images, including angular wrap at north."""
    report = {"assets": {}, "panoramas": {}}
    for path in sorted(OUT.iterdir()):
        if path.suffix not in (".webp", ".png") or path.name.startswith("settlement-"):
            continue
        with Image.open(path) as image:
            report["assets"][path.name] = {
                "dimensions": image.size,
                "bytes": path.stat().st_size,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
            if path.name.startswith("horizon-"):
                a = np.asarray(image.convert("RGBA"))[:, :, 3] >= 128
                if np.any(a[0]) or np.any(np.max(a, axis=0) == 0):
                    raise ValueError(f"Incomplete 360° coverage in {path}")
                ridge = 8 - (np.argmax(a, axis=0) + 0.5) * 24 / a.shape[0]
                report["panoramas"][path.name] = {
                    "opaqueRidgeMinDeg": round(float(ridge.min()), 3),
                    "opaqueRidgeMaxDeg": round(float(ridge.max()), 3),
                    "adjacentNorthSeamDeltaDeg": round(
                        float(abs(ridge[0] - ridge[-1])), 3
                    ),
                    "sourceAngularSampleDeg": round(360 / a.shape[1], 6),
                }
    (EVIDENCE / "rasters.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--cache", type=Path, required=True)
    cache = p.parse_args().cache
    draw_controls()
    plot_relief(cache)
    raster_report()
