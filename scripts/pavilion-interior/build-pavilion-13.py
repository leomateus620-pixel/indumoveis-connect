"""Build the reviewed P13 schematic from its exact documentary source.

Requires PyMuPDF. From repository root:
  python scripts/pavilion-interior/build-pavilion-13.py [source.pdf]

Every module has the same presentation width and height, by explicit request.
These local units are not PDF points, metres or a basis for area calculation.
"""
from pathlib import Path
import argparse
import hashlib
import json
import fitz

EXPECTED_SHA256 = "5d33bd55d353021ba18f6e3cc6114544723f8ed292b149e0aab628625187ef67"
DEFAULT_SOURCE = Path("docs/references/pavilion-13/salao-imoveis-rev07.pdf")
OUTPUT = Path("src/features/pavilion-interior/pavilion13.generated.json")
MODULE_WIDTH = 112
MODULE_HEIGHT = 30
COLUMN_X = {"left": 80, "center": 304, "right": 528}
UPPER_TOP = 120
LOWER_TOP = 714
CENTER_TOP = 210
SOURCE_GROUPS = [(1, 4), (10, 14), (15, 18), (30, 35), (63, 66), (67, 70)]


def rect(x, y, width=MODULE_WIDTH, height=MODULE_HEIGHT):
    return [[x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y]]


def svg_path(points):
    return "M" + " L".join(f"{x} {y}" for x, y in points[:-1]) + " Z"


def environment(number, column, index, top):
    code = f"{number:02d}"
    x, y = COLUMN_X[column], top + index * MODULE_HEIGHT
    polygon = rect(x, y)
    return {
        "id": f"indumoveis:pavilion:13:environment:{code}",
        "code": code,
        "name": f"Lote {code}",
        "kind": "commercial",
        "declaredAreaM2": None,
        "label": [x + MODULE_WIDTH / 2, y + MODULE_HEIGHT / 2],
        "parts": [{"id": f"{code}:interior", "kind": "interior", "path": svg_path(polygon), "polygon": polygon}],
    }


def build(source):
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != EXPECTED_SHA256:
        raise ValueError("Different source: review geometry and create a new immutable revision first.")
    document = fitz.open(stream=raw, filetype="pdf")
    if len(document) != 1:
        raise ValueError("The reviewed source must have exactly one page.")
    page = document[0]
    text = page.get_text()
    for token in ["PAVILHÃO 13 - SALÃO DE IMÓVEIS", "Entrada do Pavilhão", "Fundos do Pavilhão"]:
        if token not in text:
            raise ValueError("Expected documentary topology missing.")
    drawings = page.get_drawings()
    if len(drawings) != 390:
        raise ValueError("Unexpected vector drawing revision.")
    # Check the three documentary column origins before normalizing the
    # presentation. The center is wider in the source; its final module width
    # is deliberately equal to the lateral columns, never a physical measure.
    for index, x in [(320, 397.124), (354, 235.075), (378, 92.425)]:
        if abs(drawings[index]["rect"].x0 - x) > 0.002:
            raise ValueError("Documentary column anchors changed.")

    environments = []
    for column, sequence, top in [
        ("right", range(29, 14, -1), UPPER_TOP),
        ("right", range(14, 0, -1), LOWER_TOP),
        ("center", range(51, 29, -1), CENTER_TOP),
        ("left", range(52, 67), UPPER_TOP),
        ("left", range(67, 81), LOWER_TOP),
    ]:
        environments.extend(environment(number, column, index, top) for index, number in enumerate(sequence))
    environments.sort(key=lambda e: e["code"])

    architecture = [
        {
            "id": "p13:perimeter",
            "kind": "wall",
            "path": "M80 120H220 M276 120H444 M500 120H640 M80 120V570 M80 714V1164H220 M276 1164H444 M500 1164H640V714 M640 570V120",
            "strokeWidth": 1.6,
        },
        {
            "id": "p13:rear-double-doors",
            "kind": "door",
            "path": "M220 120V92 C235.464 92 248 104.536 248 120 M276 120V92 C260.536 92 248 104.536 248 120 M444 120V92 C459.464 92 472 104.536 472 120 M500 120V92 C484.536 92 472 104.536 472 120",
            "strokeWidth": 0.9,
        },
        {
            "id": "p13:rear-label",
            "kind": "access",
            "path": "M248 90V106 M244 102L248 106L252 102 M472 90V106 M468 102L472 106L476 102",
            "label": "Fundos do pavilhão",
            "labelAt": [360, 72],
            "strokeWidth": 0.9,
        },
        {
            "id": "p13:main-entrance",
            "kind": "access",
            "path": "M248 1190V1172 M244 1176L248 1172L252 1176 M472 1190V1172 M468 1176L472 1172L476 1176",
            "label": "Entrada do pavilhão",
            "labelAt": [360, 1202],
            "strokeWidth": 0.9,
        },
        {
            "id": "p13:left-transverse-circulation",
            "kind": "guide",
            "path": "M64 642H288",
            "label": "Circulação",
            "labelAt": [176, 666],
            "strokeWidth": 0.65,
        },
        {
            "id": "p13:right-transverse-circulation",
            "kind": "guide",
            "path": "M432 642H656",
            "label": "Circulação",
            "labelAt": [544, 666],
            "strokeWidth": 0.65,
        },
    ]
    return {
        "id": "indumoveis:pavilion:13:salao-imoveis",
        "revision": 2,
        "pavilionNumber": 13,
        "bounds": {"minX": 32, "minY": 52, "maxX": 688, "maxY": 1230},
        "source": {
            "revisionName": "pavilhao-13-rev07-2026-08-17-display-v2",
            "document": "Pav 13 - 07 - 17.08.26.pdf",
            "page": 1,
            "sha256": EXPECTED_SHA256,
            "pageWidth": round(page.rect.width, 3),
            "pageHeight": round(page.rect.height, 3),
            "coordinateSystem": "Local schematic units; origin top-left; x right; y down; uniform 112 by 30 modules; no metric conversion",
        },
        "environments": environments,
        "architecture": architecture,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--render-source", type=Path, help="Optional PNG of the source page for documentary comparison.")
    parser.add_argument("--render-plan", type=Path, help="Optional PNG of the generated schematic, with its exact SVG hit geometry.")
    args = parser.parse_args()
    plan = build(args.source)
    OUTPUT.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n")
    print(f"Built {len(plan['environments'])} equal modules; revision {plan['revision']}; {OUTPUT}")
    if args.render_source:
        page = fitz.open(args.source)[0]
        page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(args.render_source)
    if args.render_plan:
        b = plan["bounds"]
        svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{b["minX"]} {b["minY"]} {b["maxX"]-b["minX"]} {b["maxY"]-b["minY"]}"><rect x="32" y="52" width="656" height="1178" fill="#f8f6f1"/>']
        for e in plan["environments"]:
            x, y = e["label"]
            svg.append(f'<path d="{e["parts"][0]["path"]}" fill="#eee6e8" stroke="#bbadb4" stroke-width="0.7"/><text x="{x}" y="{y}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="14" fill="#59404d">{e["code"]}</text>')
        for a in plan["architecture"]:
            svg.append(f'<path d="{a["path"]}" fill="none" stroke="#62565b" stroke-width="{a["strokeWidth"]}"/>')
            if a.get("label"):
                x, y = a["labelAt"]
                svg.append(f'<text x="{x}" y="{y}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#62565b">{a["label"]}</text>')
        svg.append("</svg>")
        rendered = fitz.open(stream="".join(svg).encode(), filetype="svg")
        rendered[0].get_pixmap(matrix=fitz.Matrix(1.25, 1.25)).save(args.render_plan)


if __name__ == "__main__":
    main()
