"""Extract P3's 142 individual lots from the reviewed revision 06 PDF.

Usage: python scripts/pavilion-interior/build-pavilion-3.py source.pdf
Requires PyMuPDF. Coordinates are drawing points, never a metric conversion.
Commercial areas come from the separately reconciled module table.
"""
import argparse
import hashlib
import json
from pathlib import Path

import fitz

SOURCE_SHA = "b7afd7a651d95b666ed16d004a15a5bf225dd1d1809fb2d436e62e05ac8bcb12"
OUTPUT = Path("src/features/pavilion-interior/pavilion3.generated.json")
FLOOR = "M39 114.5H517.5V752H406.5V742H351.5V752H63V158H39Z"
PERIMETER = "M189.5 114.5H39V158H63V752H170 M242 752H271 M343 752H351.5V742H406.5V752H517.5V491 M517.5 404.7V114.5H386.4 M344 114.5H310 M280 114.5H232"


def path(points):
    return "M" + " L".join(f"{x} {y}" for x, y in points[:-1]) + " Z"


def lot(number, left, top, right, bottom, sector):
    code = str(number)
    points = [[round(x, 3), round(y, 3)] for x, y in
              [(left, top), (right, top), (right, bottom), (left, bottom), (left, top)]]
    return {
        "id": f"indumoveis:pavilion:3:environment:{code}", "code": code,
        "name": f"Lote {code}", "kind": "commercial", "declaredAreaM2": 5,
        "functionLabel": sector, "label": [round((left + right) / 2, 3), round((top + bottom) / 2, 3)],
        "parts": [{"id": f"{code}:interior", "kind": "interior", "path": path(points), "polygon": points}],
    }


def expand(drawings, blocks, sector):
    """Reconcile sub-point gaps/overlaps between touching PDF rectangles."""
    boxes = [drawings[index]["rect"] for index, _, _ in blocks]
    edges = [boxes[0].y0]
    for previous, current in zip(boxes, boxes[1:]):
        if abs(previous.y1 - current.y0) > 0.6:
            raise ValueError("Unexpected gap: review source blocks")
        edges.append((previous.y1 + current.y0) / 2)
    edges.append(boxes[-1].y1)
    for i, (_, first, last) in enumerate(blocks):
        step = 1 if first <= last else -1
        numbers = list(range(first, last + step, step))
        height = (edges[i + 1] - edges[i]) / len(numbers)
        for j, number in enumerate(numbers):
            yield lot(number, boxes[i].x0, edges[i] + j * height, boxes[i].x1,
                      edges[i] + (j + 1) * height, sector)


def build(source):
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA:
        raise ValueError("Source changed; review before creating another immutable revision")
    document = fitz.open(stream=raw, filetype="pdf")
    page = document[0]
    drawings = page.get_drawings()
    if len(document) != 1 or len(drawings) != 533 or "ÁREA TOTAL: 1.155 m²" not in page.get_text():
        raise ValueError("Unexpected plan revision")
    left = [(459-i, 38-i, 38-i) for i in range(8)] + [
        (494, 30, 30), (493, 29, 29), (497, 28, 28), (496, 27, 27), (495, 26, 26),
        (451, 25, 25), (450, 24, 24), (449, 23, 23), (475, 22, 22), (474, 21, 21),
        (473, 20, 20), (472, 19, 19), (471, 18, 18), (482, 17, 13), (481, 12, 9),
        (492, 8, 5), (491, 4, 1),
    ]
    environments = list(expand(drawings, left, "Lateral oeste"))
    environments += list(expand(drawings,
        [(384-i, 105+i, 105+i) for i in range(16)] + [(368, 121, 124)], "Lateral leste · fundos"))
    environments += list(expand(drawings,
        [(367, 125, 130), (520, 131, 136)] + [(519-i, 137+i, 137+i) for i in range(6)],
        "Lateral leste · entrada"))
    # Two 33-module faces, with paired codes summing to 143. Combined source
    # blocks 39–41/102–104, 62–66/77–81 and 67–76 remain individually selectable.
    # Use shared edges for both faces; preserve the four source block anchors.
    anchors = [drawings[513]["rect"].y0, drawings[513]["rect"].y1,
               (drawings[504]["rect"].y1 + drawings[503]["rect"].y0) / 2,
               drawings[503]["rect"].y1, drawings[512]["rect"].y1]
    edges = []
    for start, end, count in zip(anchors, anchors[1:], [3, 20, 5, 5]):
        edges.extend(start + (end - start) * i / count for i in range(count))
    edges.append(anchors[-1])
    x0, x1 = drawings[503]["rect"].x0, drawings[503]["rect"].x1
    mid = (x0 + x1) / 2
    for i in range(33):
        environments.append(lot(39+i, x0, edges[i], mid, edges[i+1], "Ilha central · oeste"))
        environments.append(lot(104-i, mid, edges[i], x1, edges[i+1], "Ilha central · leste"))
    environments.sort(key=lambda e: int(e["code"]))
    assert [int(e["code"]) for e in environments] == list(range(1, 143))
    return {
        "id": "indumoveis:pavilion:3:comercio-construcao", "revision": 1, "pavilionNumber": 3,
        "totalAreaM2": 1155, "bounds": {"minX": 24, "minY": 78, "maxX": 546, "maxY": 784},
        "source": {"revisionName": "pavilhao-3-rev06-2026-09-23", "document": "Pav 3 - 06 - 23.09.2026 (1).pdf",
                   "page": 1, "sha256": SOURCE_SHA, "pageWidth": round(page.rect.width, 3),
                   "pageHeight": round(page.rect.height, 3),
                   "coordinateSystem": "Native PDF points; shared edges reconciled; x right, y down; no metric conversion"},
        "environments": environments,
        "architecture": [
            {"id": "p3:floor-outline", "kind": "guide", "path": FLOOR},
            {"id": "p3:perimeter", "kind": "wall", "path": PERIMETER, "strokeWidth": 2.6},
            {"id": "p3:support", "kind": "guide", "path": "M39 114.5H131.25V157.3H39Z"},
            {"id": "p3:rear-doors", "kind": "door", "path": "M189.5 114.5V91.3L210.7 113.5L232 91.3V114.5 M344 114.5V91.3L365.2 113.5L386.4 91.3V114.5", "strokeWidth": 0.7},
            {"id": "p3:main-entrance", "kind": "access", "path": "M206 772V753 M307 772V753", "label": "Entrada do pavilhão", "labelAt": [256, 772]},
            {"id": "p3:rear-exit", "kind": "access", "path": "M295 113V94", "label": "Fundos do pavilhão", "labelAt": [295, 94]},
            {"id": "p3:right-passage", "kind": "guide", "path": "M444 448H534", "label": "Acesso ao Pavilhão 13", "labelAt": [487, 448]},
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    plan = build(args.source)
    OUTPUT.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n")
    print(f"Built {len(plan['environments'])} lots; 710 m² commercial area")
