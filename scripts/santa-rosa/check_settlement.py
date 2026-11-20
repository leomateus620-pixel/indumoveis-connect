"""Compare two measured sites with their old atlas card and new distributed geometry."""

import argparse
import gzip
import io
import json
import struct
import subprocess
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from canopies import load_canopy_height
from footprints import load_footprints
from matplotlib.collections import PolyCollection
from PIL import Image
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components
from settlement import OUT, ROOT
from sources import SCENE_AXES, SCENE_ORIGIN, SCENE_SCALE

# The two indices address the immutable float32/UV table from commit 04db129.
SITES = [
    ("Casa junto à rótula", [455.195, -224.8525], 771, 12),
    ("Dossel atrás da Arena", [-406.057, 578.057], 956, 23),
]


def original(name):
    return subprocess.check_output(
        ["git", "show", f"04db129:public/landscape/santa-rosa/{name}"], cwd=ROOT
    )


def decoded_mesh():
    data = gzip.decompress((OUT / "settlement.bin").read_bytes())
    magic, _, _, n, length = struct.unpack_from("<4sIIII", data)
    assert magic == b"SRM1" and len(data) == 20 + n * 10 + length * 4
    positions = np.frombuffer(data, "<i2", 3 * n, 20).reshape(3, n)
    positions = np.cumsum(positions, axis=1, dtype=np.int16).T / 8.0
    rgba = np.frombuffer(data, "u1", 4 * n, 20 + 6 * n).reshape(-1, 4)
    index = np.frombuffer(data, "<u4", length, 20 + 10 * n)
    faces = np.cumsum(index, dtype=np.uint32).reshape(-1, 3)
    assert np.max(faces) < n
    # Material is flat on a triangle. Only the wall course or canopy height
    # may interpolate, otherwise the fragment shader crosses atlas cells.
    material = rgba[:, 3] % 16
    assert np.all(np.ptp(material[faces], axis=1) == 0)
    assert set(np.unique(material)) == {0, 1, 2, 3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15}
    tower_vertices = material == 10
    assert set(np.unique(rgba[tower_vertices, 2] % 8)) == set(range(8))
    assert set(np.unique((rgba[tower_vertices, 2] // 8) % 4)) == {0, 1, 2}
    assert np.max(rgba[material < 8, 3] // 16) > 1
    graph = csr_matrix(
        (np.ones(faces.size), (faces.ravel(), faces[:, [1, 2, 0]].ravel())),
        shape=(n, n),
    )
    _, component = connected_components(graph, directed=False)
    return positions, rgba, faces, component


def screen_crop(pose, vertices):
    """Project the measured feature through the recorded runtime camera."""
    xz = SCENE_ORIGIN + SCENE_SCALE * (
        vertices[:, 0, None] * SCENE_AXES[0] + vertices[:, 1, None] * SCENE_AXES[1]
    )
    world = np.column_stack((xz[:, 0], -0.18 + SCENE_SCALE * vertices[:, 2], xz[:, 1]))
    camera = np.asarray(pose["position"])
    tx, tz = pose["target"]
    forward = [tx, 0, tz] - camera
    forward /= np.linalg.norm(forward)
    right = np.cross(forward, [0, 1, 0])
    right /= np.linalg.norm(right)
    up = np.cross(right, forward)
    ray = world - camera
    depth = ray @ forward
    assert np.all(depth > 0), "Feature behind the recorded camera"
    width, height = pose["buffer"]
    focal = height / (2 * np.tan(np.deg2rad(pose["verticalFovDegrees"]) / 2))
    pixels = np.column_stack(
        (
            width / 2 + focal * (ray @ right) / depth,
            height / 2 - focal * (ray @ up) / depth,
        )
    )
    centre = (pixels.min(axis=0) + pixels.max(axis=0)) / 2
    assert np.all(centre >= 0) and np.all(centre < pose["buffer"]), (
        "Feature outside frame"
    )
    left, top = np.clip(
        np.rint(centre - [36, 22.5]).astype(int), [0, 0], [width - 72, height - 45]
    )
    return (int(left), int(top), int(left + 72), int(top + 45))


def check_tower_materials():
    # Read the actual compressed textures with the same cell and inset sizes
    # as the shader. Mineral masonry should keep its low chroma at both LODs;
    # windows, slabs and recesses should still span distinct light levels.
    for level in ("compact", "detail"):
        with Image.open(OUT / f"settlement-{level}.webp") as texture:
            atlas = texture.convert("RGB")
        cell = atlas.width // 4
        gutter = cell // 16
        content = cell - 2 * gutter
        quadrant = content / 2
        margin = quadrant / 16
        for family in range(8):
            left = (family // 4) * cell + gutter + (family % 2) * quadrant + margin
            top = cell + gutter + (family % 4 // 2) * quadrant + margin
            side = quadrant - 2 * margin
            # First two thirds of each swatch are the front elevation.
            box = tuple(round(p) for p in (left, top, left + 0.64 * side, top + side))
            pixels = np.asarray(atlas.crop(box), dtype=float)
            chroma = float(np.median(np.ptp(pixels, axis=2)))
            light = pixels @ np.array([0.2126, 0.7152, 0.0722])
            spread = float(np.ptp(np.percentile(light, [10, 90])))
            assert chroma <= 12 and spread > 30, (level, family, chroma, spread)


def compare(cache, captures, output):
    check_tower_materials()
    xyz, appearance, faces, component = decoded_mesh()
    centres = xyz[faces].mean(axis=1)
    cards = np.frombuffer(original("settlement.bin"), "<f4").reshape(-1, 9)
    atlas = Image.open(io.BytesIO(original("settlement-detail.webp")))
    aerial = np.asarray(Image.open(io.BytesIO(original("near-detail.webp"))))
    heights = load_canopy_height(cache)
    roof_xy = np.array(SITES[0][1])
    rings = [
        np.asarray(f["geometry"]["coordinates"][0][:-1]) for f in load_footprints(cache)
    ]
    roof = min(rings, key=lambda r: np.linalg.norm(r.mean(0) - roof_xy))

    fig, axes = plt.subplots(2, 7, figsize=(16, 4.8), layout="constrained")
    titles = [
        "Origem geográfica",
        "Atlas anterior",
        "Malha frontal",
        "Perfil da malha",
        "Vista superior",
        "/mapa antes",
        "/mapa depois",
    ]
    for col, title in enumerate(titles):
        axes[0, col].set_title(title, fontsize=12, pad=12)
    for row, (title, xy, record, radius) in enumerate(SITES):
        xy = np.array(xy)
        col, line = (xy / [2.0, -2.0] + 1024).astype(int)
        source = axes[row, 0]
        span = 17 if row == 0 else 21
        crop = (slice(line - span, line + span), slice(col - span, col + span))
        extent = (
            2 * (col - span - 1024),
            2 * (col + span - 1024),
            2 * (1024 - line - span),
            2 * (1024 - line + span),
        )
        if row == 0:
            source.imshow(aerial[crop], extent=extent, interpolation="nearest")
            outline = np.vstack((roof, roof[0]))
            source.plot(*outline.T, color="#f4c654", linewidth=1.5)
            source.set_xlabel("CBERS/Sentinel · contorno Microsoft", fontsize=8)
        else:
            source.imshow(
                heights[crop],
                extent=extent,
                interpolation="nearest",
                cmap="YlGn",
                vmin=0,
                vmax=12,
            )
            source.set_xlabel("Altura WRI/Meta · 0 a 12 m", fontsize=8)
        source.set_ylabel(title, fontsize=10)
        u, v, w, h = cards[record, 5:]
        left, top = round(u * 2048 - 0.5), round((1 - v - h) * 2048 - 0.5)
        sprite = atlas.crop(
            (left, top, left + round(w * 2048) + 1, top + round(h * 2048) + 1)
        )
        axes[row, 1].imshow(sprite, interpolation="nearest")
        axes[row, 1].set_xlabel(f"{sprite.width} × {sprite.height} px", fontsize=9)
        allowed = (
            appearance[faces[:, 0], 3] % 16 < 8
            if row == 0
            else appearance[faces[:, 0], 3] % 16 == 8
        )
        nearest = np.flatnonzero(allowed)[
            np.linalg.norm(centres[allowed, :2] - xy, axis=1).argmin()
        ]
        local = faces[component[faces[:, 0]] == component[faces[nearest, 0]]]
        vertices = xyz[local].copy()
        vertices[:, :, :2] -= xy
        vertices[:, :, 2] -= np.median(vertices[:, :, 2])
        normal = np.cross(
            vertices[:, 1] - vertices[:, 0], vertices[:, 2] - vertices[:, 0]
        )
        normal /= np.maximum(np.linalg.norm(normal, axis=1), 0.001)[:, None]
        colours = appearance[local, :3].mean(axis=1) / 255.0
        if row == 0:
            colours[np.abs(normal[:, 2]) < 0.45] = [0.72, 0.68, 0.63]
        shades = np.clip(
            colours * (0.84 + normal @ np.array([-0.12, 0.12, 0.18]))[:, None], 0, 1
        )
        # Project the same immutable vertices for all three angles. Use flat
        # materials here to expose topology independently of the app's lighting.
        radial = xy / np.linalg.norm(xy)
        for col, yaw, elevation in [(2, 0, 7), (3, 90, 7), (4, 0, 90)]:
            angle, slope = np.deg2rad([yaw, elevation])
            d = (
                np.array(
                    [[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]]
                )
                @ radial
            )
            along = vertices[:, :, :2] @ d
            horizontal = vertices[:, :, :2] @ [d[1], -d[0]]
            vertical = vertices[:, :, 2] * np.cos(slope) + along * np.sin(slope)
            depth = along * np.cos(slope) - vertices[:, :, 2] * np.sin(slope)
            order = np.argsort(-depth.mean(axis=1))
            polygons = PolyCollection(
                np.stack((horizontal, vertical), axis=-1)[order],
                facecolors=shades[order],
                edgecolors="face",
                linewidths=0.2,
            )
            ax = axes[row, col]
            ax.add_collection(polygons)
            ax.set(xlim=(-radius, radius), ylim=(-radius, radius), aspect="equal")
        pose_name = ["divisa", "arena"][row]
        reference = None
        for col, phase in [(5, "before"), (6, "after")]:
            journey = json.loads((captures / phase / "journey.json").read_text())
            pose = next(
                run["poses"][pose_name] for run in journey["entries"] if "poses" in run
            )
            box = screen_crop(pose, xyz[np.unique(local)])
            if reference is not None:
                assert pose == reference, (
                    "The two comparisons require identical cameras"
                )
            reference = pose
            screen = Image.open(captures / phase / (pose_name + ".png"))
            assert screen.size == tuple(pose["buffer"]), (
                "Capture differs from the recorded buffer"
            )
            print(phase, pose_name, box)
            axes[row, col].imshow(screen.crop(box), interpolation="nearest")
            axes[row, col].set_xlabel(f"{pose_name} · 72 × 45 px", fontsize=8)
        for ax in axes[row]:
            ax.set_facecolor("#f2f1eb")
            ax.set_xticks([])
            ax.set_yticks([])
            for border in ax.spines.values():
                border.set_visible(False)
    fig.savefig(output, dpi=140, format="webp")
    plt.close(fig)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--captures", type=Path, required=True)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    compare(args.cache, args.captures, args.output)
