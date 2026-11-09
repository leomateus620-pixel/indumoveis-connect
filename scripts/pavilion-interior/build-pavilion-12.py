"""Rebuild the 254-module Indumóveis P12 plan from its reviewed vector PDF.

Requires PyMuPDF. Run from the repository root and supply the local PDF path.
The output is in PDF drawing points, independent of any real-world area.
"""

import argparse
from html import escape
import hashlib
import json
from pathlib import Path

import fitz

SOURCE_NAME = "Pav 12 - 07 - 14.09.26 (1).pdf"
SOURCE_SHA = "f933d506774daf59c7cdd2749bea6eafd3784de10f2a99a814abf76e2db96c37"
OUTPUT = Path("src/features/pavilion-interior/pavilion12.generated.json")
BOUNDS = {"minX": 8, "minY": 61, "maxX": 814, "maxY": 553}
FLOOR_OUTLINE = (
    "M72.118 71.881 L782.58 71.881 L782.58 541.126 L72.118 541.126 "
    "L72.118 343.746 L13.519 343.746 L13.519 272.657 L72.118 272.657 Z"
)


def svg_number(value):
    return f"{value:.3f}".rstrip("0").rstrip(".")


def svg_point(point):
    return " ".join(svg_number(value) for value in point)


def source_path(drawing):
    """Keep source line and Bézier coordinates while grouping SVG strokes."""
    path = []
    previous = None
    for operation, *points in drawing["items"]:
        if operation not in ("l", "c"):
            raise ValueError(f"Unexpected operation {operation} in an architectural drawing")
        if points[0] != previous:
            path.append("M" + svg_point(points[0]))
        if operation == "l":
            path.append("L" + svg_point(points[1]))
        else:
            path.append("C" + " ".join(svg_point(point) for point in points[1:]))
        previous = points[-1]
    return " ".join(path)


def number_run(first, last):
    step = 1 if last >= first else -1
    return range(first, last + step, step)


def lot(number, left, top, right, bottom, row):
    code = str(number)
    polygon = [
        [round(left, 3), round(top, 3)],
        [round(right, 3), round(top, 3)],
        [round(right, 3), round(bottom, 3)],
        [round(left, 3), round(bottom, 3)],
    ]
    path = "M" + " L".join(svg_point(point) for point in polygon) + " Z"
    return {
        "id": f"indumoveis:pavilion:12:environment:{code}",
        "code": code,
        "name": f"Lote {code}",
        "kind": "commercial",
        "declaredAreaM2": None,
        "functionLabel": row,
        "label": [round((left + right) / 2, 3), round((top + bottom) / 2, 3)],
        "parts": [
            {
                "id": f"{code}:interior",
                "kind": "interior",
                "path": path,
                "polygon": polygon + [polygon[0]],
            },
        ],
    }


def expand_blocks(drawings, blocks, row, top=None, bottom=None):
    """Split each vector block by its reviewed lot run and reconcile shared edges.

    The source has sub-point differences between adjoining vector edges. The
    average is used as one shared edge so clickable polygons never overlap.
    Run groups are contiguous here. An entrance gap is passed as a separate run.
    """
    boxes = [drawings[index]["rect"] for index, _, _ in blocks]
    for (index, _, _), box in zip(blocks, boxes):
        if drawings[index]["items"][0][0] != "re" or box.width < 10 or box.height < 35:
            raise ValueError(f"Unexpected commercial rectangle at drawing {index}")
    edges = [boxes[0].x0]
    for previous, current in zip(boxes, boxes[1:]):
        if abs(previous.x1 - current.x0) > 0.01:
            raise ValueError("Unexpected discontinuity inside a contiguous commercial run")
        edges.append((previous.x1 + current.x0) / 2)
    edges.append(boxes[-1].x1)
    for i, (_, first, last) in enumerate(blocks):
        numbers = number_run(first, last)
        box = boxes[i]
        width = (edges[i + 1] - edges[i]) / len(numbers)
        for offset, number in enumerate(numbers):
            left = edges[i] + offset * width
            right = edges[i + 1] if offset == len(numbers) - 1 else edges[i] + (offset + 1) * width
            yield lot(
                number,
                left,
                box.y0 if top is None else top,
                right,
                box.y1 if bottom is None else bottom,
                row,
            )


def build(source):
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA:
        raise ValueError("Different PDF. Review the new source before publishing another revision.")
    with fitz.open(stream=raw, filetype="pdf") as document:
        if len(document) != 1:
            raise ValueError("Expected the reviewed one-page PDF")
        page = document[0]
        heading = page.get_text()
        if "PAVILHÃO 12 - MÓVEIS E SERIADOS" not in heading or "ÁREA TOTAL: 1.650 m²" not in heading:
            raise ValueError("Unexpected pavilion or total area")
        drawings = page.get_drawings()
        if len(drawings) != 116:
            raise ValueError("Unexpected number of source vector operations")
        page_width, page_height = round(page.rect.width, 3), round(page.rect.height, 3)

    # Indexes refer to native vectors in the hashed PDF. Ranges below are the
    # Indumóveis reading order confirmed for each side of the double islands.
    runs = [
        ([(114, 1, 11), (82, 12, 22)], "Faixa inferior", None, None),
        ([(83, 23, 36)], "Faixa inferior", None, None),
        (
            [(101, 78, 73), (104, 72, 65), (111, 64, 58), (112, 57, 52), (113, 51, 37)],
            "Ilha central inferior · fila inferior",
            384.973,
            427.383,
        ),
        (
            [(101, 79, 84), (102, 85, 85), (103, 86, 86)]
            + [(105 + offset, 87 + offset, 87 + offset) for offset in range(6)]
            + [(111, 93, 99), (112, 100, 105), (113, 106, 120)],
            "Ilha central inferior · fila superior",
            342.562,
            384.973,
        ),
        (
            [(90, 162, 154)]
            + [(97 + offset, 153 - offset, 153 - offset) for offset in range(4)]
            + [(95, 149, 138), (96, 137, 121)],
            "Ilha central superior · fila inferior",
            228.576,
            270.987,
        ),
        (
            [(90, 163, 171)]
            + [(91 + offset, 172 + offset, 172 + offset) for offset in range(4)]
            + [(95, 176, 187), (96, 188, 204)],
            "Ilha central superior · fila superior",
            186.166,
            228.576,
        ),
        (
            [(84, 254, 242), (85, 241, 233), (86, 232, 223), (87, 222, 217), (88, 216, 205)],
            "Faixa superior",
            None,
            None,
        ),
    ]
    environments = sorted(
        (environment for run in runs for environment in expand_blocks(drawings, *run)),
        key=lambda environment: int(environment["code"]),
    )
    if [int(environment["code"]) for environment in environments] != list(range(1, 255)):
        raise ValueError("P12 must have exactly one lot for each code 1 to 254")

    def paths(indices):
        return " ".join(source_path(drawings[index]) for index in indices)

    architecture = [
        {"id": "p12:floor-outline", "kind": "guide", "path": FLOOR_OUTLINE, "strokeWidth": 0.2},
        {"id": "p12:perimeter", "kind": "wall", "path": paths(range(6, 20)), "strokeWidth": 0.42},
        {
            "id": "p12:door-swings",
            "kind": "door",
            "path": paths([*range(24, 36), *range(45, 72), *range(74, 82)]),
            "strokeWidth": 0.36,
        },
        {
            "id": "p12:left-access", "kind": "access", "path": paths([40, 41]),
            "label": "Acesso", "labelAt": [50.41, 306.77], "strokeWidth": 0.42,
        },
        {
            "id": "p12:right-access", "kind": "access", "path": paths([38, 39]),
            "label": "Acesso", "labelAt": [767.99, 306.77], "strokeWidth": 0.42,
        },
        {
            "id": "p12:main-entrance", "kind": "access", "path": paths([36, 37]),
            "label": "Entrada principal", "labelAt": [491.36, 517.72], "strokeWidth": 0.42,
        },
    ]
    return {
        "id": "indumoveis:pavilion:12:moveis-seriados",
        "revision": 1,
        "pavilionNumber": 12,
        "totalAreaM2": 1650,
        "bounds": BOUNDS,
        "source": {
            "revisionName": "pavilhao-12-rev07-2026-09-14",
            "document": SOURCE_NAME,
            "page": 1,
            "sha256": SOURCE_SHA,
            "pageWidth": page_width,
            "pageHeight": page_height,
            "coordinateSystem": "Native PDF points; origin top-left; x right; y down; no conversion to metres",
        },
        "environments": environments,
        "architecture": architecture,
    }


def render_plan(plan, path):
    """Render a reference image from public geometry only."""
    b = plan["bounds"]
    width, height = b["maxX"] - b["minX"], b["maxY"] - b["minY"]
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{b["minX"]} {b["minY"]} {width} {height}">']
    svg.append(f'<rect x="{b["minX"]}" y="{b["minY"]}" width="{width}" height="{height}" fill="#f9f7f3"/>')
    svg.append(f'<path d="{FLOOR_OUTLINE}" fill="#eeeae2"/>')
    for environment in plan["environments"]:
        x, y = environment["label"]
        data = environment["parts"][0]["path"]
        svg.append(f'<path d="{data}" fill="#fdfbf6" stroke="#9a8e86" stroke-width=".45"/>')
        svg.append(f'<text x="{x}" y="{y}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size="6.6" fill="#4c3545">{environment["code"]}</text>')
    for element in plan["architecture"]:
        if element["id"] == "p12:floor-outline":
            continue
        svg.append(f'<path d="{element["path"]}" fill="none" stroke="#493f43" stroke-width="{element["strokeWidth"]}"/>')
    for element in plan["architecture"]:
        if "labelAt" in element:
            x, y = element["labelAt"]
            label_y = y - 18 if element["id"] == "p12:main-entrance" else y + 29
            svg.append(f'<text x="{x}" y="{label_y}" text-anchor="middle" font-family="sans-serif" font-size="7" fill="#5c5253">{escape(element["label"])}</text>')
    svg.append("</svg>")
    with fitz.open(stream="".join(svg).encode(), filetype="svg") as document:
        document[0].get_pixmap(matrix=fitz.Matrix(2, 2)).save(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--render-plan", type=Path, help="Write an optional PNG of the public SVG geometry")
    arguments = parser.parse_args()
    plan = build(arguments.source)
    OUTPUT.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n")
    if arguments.render_plan:
        arguments.render_plan.parent.mkdir(parents=True, exist_ok=True)
        render_plan(plan, arguments.render_plan)
    print(f"Built {len(plan['environments'])} P12 lots in {OUTPUT}")


if __name__ == "__main__":
    main()
