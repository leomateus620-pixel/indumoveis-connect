"""Fit the exported Higgsfield architectural sections to individual measured roofs."""

import json
from functools import lru_cache
from pathlib import Path

import mapbox_earcut
import numpy as np

SOURCE = Path(__file__).with_name("torres-higgsfield.json")


@lru_cache(maxsize=1)
def families():
    return json.loads(SOURCE.read_text())


def family_at(centre, width, height):
    # A stable spatial seed avoids ordering buildings by the source tile's rows.
    e, n = np.rint(centre * 2).astype(int)
    seed = ((int(e) * 73856093) ^ (int(n) * 19349663)) & 0xFFFFFFFF
    seed ^= seed >> 16
    if height > 35 and width < 22:
        candidates = (1, 5, 2, 6, 3, 0, 1, 5)
    elif width > 30 and height < 18:
        candidates = (7, 4, 0, 3, 2, 6, 7, 4)
    else:
        candidates = (0, 1, 2, 3, 4, 5, 6, 7)
    return candidates[seed % len(candidates)]


def contains(vertices, x, y):
    following = np.roll(vertices, -1, axis=0)
    a = vertices[:, 1] - y
    b = following[:, 1] - y
    crosses = (a > 0) != (b > 0)
    x0 = vertices[crosses, 0]
    along = a[crosses] / (a[crosses] - b[crosses])
    return np.count_nonzero(x0 + along * (following[crosses, 0] - x0) > x) % 2 == 1


def tower_envelope(ring, height, measured, terrain, family, detailed):
    design = families()[family]
    palette = np.array(
        [[int(c[i : i + 2], 16) for i in (0, 2, 4)] for c in design["palette"]]
    )
    edges = np.roll(ring, -1, axis=0) - ring
    signed_area = np.sum(ring[:, 0] * edges[:, 1] - ring[:, 1] * edges[:, 0]) / 2
    if signed_area < 0:
        ring = ring[::-1]
        edges = np.roll(ring, -1, axis=0) - ring
    long_edge = edges[np.argmax(np.linalg.norm(edges, axis=1))]
    across = long_edge / np.linalg.norm(long_edge)
    behind = np.array([-across[1], across[0]])
    if np.dot(behind, ring.mean(0)) < 0:
        across, behind = -across, -behind
    axes = np.stack((across, behind))
    local = ring @ axes.T
    extent = np.maximum(np.ptp(local, axis=0), 0.1)
    offset = (local.max(0) + local.min(0)) / 2
    outline = (local - offset) / extent
    ground = terrain.elevation(np.vstack((ring, ring + edges / 2)))
    base = ground.min() - 1.5
    peak = max(ground.mean() + height, ground.max() + 1.5)
    rise = peak - base
    rectangularity = abs(signed_area) / np.prod(extent)
    # On a deep L-shaped footprint the centre of its bounding box can be in a
    # courtyard. Keep stepped sections anchored inside the actual building.
    anchor = np.zeros(2)
    if not contains(outline, 0, 0):
        interior = [p for p in outline * 0.99 if contains(outline, *p)]
        anchor = (
            min(interior, key=lambda p: np.linalg.norm(p)) if interior else outline[0]
        )
    points, appearance, triangles = [], [], []
    square = np.array([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]])
    for part in design["parts"]:
        role = part["role"]
        if role == "relief" and not detailed:
            continue
        x, y, z, w, d, h = part["box"]
        if role == "mass":
            shape = (outline - anchor) * [w, d] + anchor + [x, y]
            if rectangularity < 0.80 and z > 0:
                candidate = (outline - anchor) * min(w, d) + anchor
                # Retain the outer footprint if an inset would bridge a courtyard.
                shape = (
                    candidate
                    if all(contains(outline, *p) for p in candidate)
                    else outline
                )
        else:
            shape = square * [w, d] + [x, y]
            if rectangularity < 0.80 and not all(contains(outline, *p) for p in shape):
                if role == "relief":
                    continue
                # Keep technical roofs inside a concave outline as well.
                shape = (outline - anchor) * min(w, d) * 0.67 + anchor
                if not all(contains(outline, *p) for p in shape):
                    shape = outline
        xy = (shape * extent + offset) @ axes
        bottom, top = base + z * rise, base + (z + h) * rise
        colour = palette[part["finish"]]
        count = len(xy)
        upper_index = len(points)
        points.extend(np.column_stack((xy, np.full(count, top))))
        appearance.extend([(*colour, 11)] * count)
        top_faces = mapbox_earcut.triangulate_float64(
            xy.copy(), np.array([count], dtype=np.uint32)
        )
        triangles.extend(upper_index + top_faces.reshape(-1, 3))
        # Wall UVs turn a corner independently while the roofline remains exact.
        for i in range(count):
            j = (i + 1) % count
            first = len(points)
            points.extend(
                [(*xy[i], bottom), (*xy[j], bottom), (*xy[j], top), (*xy[i], top)]
            )
            if role == "mass" and z > 0:
                edge = (shape[j] - shape[i]) * extent
                length = np.linalg.norm(edge)
                facing = -edge[0] / max(0.01, length)
                side = 0 if facing < -0.50 else (2 if facing > 0.50 else 1)
                repeat = min(7, max(1, round(length / 18)))
                courses = min(15, max(1, round(measured * h / 14.0)))
                encoding = family + side * 8 + repeat * 32
                appearance.extend(
                    [
                        (u, v, encoding, 10 + 16 * courses)
                        for u, v in ((0, 0), (255, 0), (255, 255), (0, 255))
                    ]
                )
            else:
                appearance.extend([(*colour, 11)] * 4)
            triangles.extend(
                [(first, first + 1, first + 2), (first, first + 2, first + 3)]
            )
    return np.asarray(points), np.asarray(triangles), np.asarray(appearance)
