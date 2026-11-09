"""Rebuild the P8 plan from stroke centerlines of the reviewed vector PDF.

Requires PyMuPDF. Run from the repository root:
    python scripts/pavilion-interior/build-pavilion-8.py
"""

import argparse
import hashlib
import json
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs/references/pavilion-8/fornecedores-construcao-civil-rev02.pdf"
OUTPUT = ROOT / "src/features/pavilion-interior/pavilion8.generated.json"
EXPECTED_SHA256 = "63e3762f7d20b34359f451da1cac63ad7e03327496695106dff4b9c11e239767"
LOT_CODES = ("01", "03", "04", "05", "06", "07", "08")


def path(points):
    return "M" + " L".join(f"{x:.3f} {y:.3f}" for x, y in points)


def centerline(draw, side_indices):
    """Average the two long PDF stroke edges, oriented in increasing y."""
    sides = []
    for i in side_indices:
        command, start, end = draw["items"][i]
        if command != "l":
            raise ValueError("Expected straight stroke edge")
        sides.append(sorted((start, end), key=lambda p: p.y))
    return tuple(((p.x + q.x) / 2, (p.y + q.y) / 2) for p, q in zip(*sides))


def x_at_y(segment, y):
    (x1, y1), (x2, y2) = segment
    return x1 + (y - y1) * (x2 - x1) / (y2 - y1)


def y_at_x(segment, x):
    (x1, y1), (x2, y2) = segment
    return y1 + (x - x1) * (y2 - y1) / (x2 - x1)


def lot(code, corners):
    polygon = [[round(x, 3), round(y, 3)] for x, y in corners]
    polygon.append(polygon[0])
    edges = list(zip(polygon[:-1], polygon[1:]))
    weights = [a[0] * b[1] - b[0] * a[1] for a, b in edges]
    # Centroid in PDF points to place the number. This is not an area measurement.
    label = [round(sum((a[i] + b[i]) * w for (a, b), w in zip(edges, weights)) / (3 * sum(weights)), 3)
             for i in range(2)]
    return {
        "id": f"indumoveis:pavilion:8:environment:{code}",
        "code": code,
        "name": f"Lote {code}",
        "kind": "commercial",
        "declaredAreaM2": None,
        "label": label,
        "parts": [{"id": f"{code}:interior", "kind": "interior", "path": path(polygon[:-1]) + " Z", "polygon": polygon}],
    }


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def arrow(x, y, dx, dy):
    tip = (x + dx, y + dy)
    neck = (tip[0] - dx * 0.32, tip[1] - dy * 0.32)
    wing = (dy * 0.27, -dx * 0.27)
    return path([(x, y), tip]) + " " + path([
        (neck[0] + wing[0], neck[1] + wing[1]), tip, (neck[0] - wing[0], neck[1] - wing[1]),
    ])


def build(source):
    data = source.read_bytes()
    if hashlib.sha256(data).hexdigest() != EXPECTED_SHA256:
        raise ValueError("Different source. Review and publish a new plan revision.")
    with fitz.open(stream=data, filetype="pdf") as doc:
        page = doc[0]
        drawings = page.get_drawings()
        words = {word[4] for word in page.get_text("words")}
        if len(doc) != 1 or page.rotation != 0 or len(drawings) != 358:
            raise ValueError("Unexpected vector drawing revision")
        if not set(LOT_CODES) <= words or "02" in words or "937,32m²" not in words:
            raise ValueError("Unexpected documentary inventory or total area")
        page_width, page_height = round(page.rect.width, 3), round(page.rect.height, 3)

    def bbox(i):
        return drawings[i]["rect"]

    def x_center(i):
        return (bbox(i).x0 + bbox(i).x1) / 2

    def y_center(i):
        return (bbox(i).y0 + bbox(i).y1) / 2

    # Commercial limits trace the inner face of the perimeter and the centerlines
    # of the dividers. The rear/entry baselines come from the inner stroke.
    left, left_aisle = x_center(20), x_center(356)
    right, right_aisle = x_center(52), (bbox(165).x0 + drawings[165]["items"][8][1].x0) / 2
    rear, entry = y_center(3), y_center(340)
    split_04_03, bottom_03 = y_center(357), y_center(43)
    top_01, split_06_07 = y_center(335), y_center(314)
    top_06 = (drawings[313]["items"][6][1].y + drawings[313]["items"][9][1].y) / 2
    lot_05_inner = drawings[165]["items"][8][1]
    top_05 = (bbox(165).y0 + lot_05_inner.y0) / 2
    bottom_05 = (bbox(165).y1 + lot_05_inner.y1) / 2

    slope_01 = centerline(drawings[336], (2, 8))
    slope_07 = centerline(drawings[313], (2, 11))
    slope_08_left = centerline(drawings[353], (2, 5))
    slope_08_right = centerline(drawings[343], (2, 5))
    top_08 = y_center(341)
    entry_01, entry_07 = x_at_y(slope_01, entry), x_at_y(slope_07, entry)
    entry_08_left, entry_08_right = x_at_y(slope_08_left, entry), x_at_y(slope_08_right, entry)
    environments = [
        lot("01", [(left, top_01), (left_aisle, top_01),
                   (left_aisle, y_at_x(slope_01, left_aisle)), (entry_01, entry), (left, entry)]),
        lot("03", rect(left, split_04_03, left_aisle, bottom_03)),
        lot("04", rect(left, rear, left_aisle, split_04_03)),
        lot("05", rect(right_aisle, top_05, right, bottom_05)),
        lot("06", rect(right_aisle, top_06, right, split_06_07)),
        lot("07", [(right_aisle, split_06_07), (right, split_06_07), (right, entry), (entry_07, entry)]),
        lot("08", [(x_at_y(slope_08_left, top_08), top_08), (x_at_y(slope_08_right, top_08), top_08),
                   (entry_08_right, entry), (entry_08_left, entry)]),
    ]

    wall_left, wall_right = x_center(19), x_center(47)
    wall_rear, wall_entry = y_center(33), y_center(346)
    rear_opening = max(bbox(48).x1, bbox(49).x1)
    passages = [
        [(rear_opening, wall_rear), (wall_left, wall_rear), (wall_left, bottom_03)],
        [(wall_left, top_01), (wall_left, wall_entry), (entry_01, wall_entry)],
        [(entry_08_left, wall_entry), (entry_08_right, wall_entry)],
        [(entry_07, wall_entry), (wall_right, wall_entry), (wall_right, top_06)],
        [(wall_right, bottom_05), (wall_right, wall_rear)],
    ]
    center_x = (left + right) / 2
    entry_arrows = " ".join(arrow((a + b) / 2, wall_entry + 20, 0, -13) for a, b in [
        (entry_01, entry_08_left), (entry_08_right, entry_07),
    ])
    architecture = [
        {"id": "p8:perimeter", "kind": "wall", "path": " ".join(path(p) for p in passages), "strokeWidth": 1.4},
        {"id": "p8:main-entrance", "kind": "access", "path": entry_arrows,
         "label": "Entrada do pavilhão", "labelAt": [round(center_x, 3), 803], "strokeWidth": 1.15},
        {"id": "p8:rear-exit", "kind": "access", "path": arrow((rear_opening + wall_right) / 2, wall_rear + 7, 0, -14),
         "label": "Saída dos fundos", "labelAt": [round((right_aisle + right) / 2, 3), 133], "strokeWidth": 1.15},
        {"id": "p8:rear-label", "kind": "access", "path": path([(center_x - 7, 95), (center_x + 7, 95)]),
         "label": "Fundos do pavilhão", "labelAt": [round(center_x, 3), 89], "strokeWidth": 0.8},
        {"id": "p8:left-passage", "kind": "access", "path": arrow(wall_left - 11, (bottom_03 + top_01) / 2, 20, 0),
         "strokeWidth": 1.15},
        {"id": "p8:right-passage", "kind": "access", "path": arrow(wall_right + 11, (bottom_05 + top_06) / 2, -20, 0),
         "strokeWidth": 1.15},
    ]
    return {
        "id": "indumoveis:pavilion:8:fornecedores-construcao-civil",
        "revision": 1,
        "pavilionNumber": 8,
        "totalAreaM2": 937.32,
        "bounds": {"minX": 67, "minY": 78, "maxX": 528, "maxY": 814},
        "source": {
            "revisionName": "pavilhao-08-rev02-2025-11-14",
            "document": "Pav 08 - 02 - 14.11.25.pdf",
            "page": 1,
            "sha256": EXPECTED_SHA256,
            "pageWidth": page_width,
            "pageHeight": page_height,
            "coordinateSystem": "Native PDF drawing points; origin page top-left; x right; y down; no metric conversion",
        },
        "environments": environments,
        "architecture": architecture,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", type=Path, default=SOURCE)
    args = parser.parse_args()
    plan = build(args.source)
    OUTPUT.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n")
    print(f"Built {len(plan['environments'])} PDF-derived lots; revision {plan['revision']}; {OUTPUT.relative_to(ROOT)}")
