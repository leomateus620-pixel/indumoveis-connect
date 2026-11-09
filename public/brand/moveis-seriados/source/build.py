"""Build the Móveis e Seriados signature from the included Figtree outlines."""

import hashlib
import json
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


SOURCE = Path(__file__).resolve().parent
DESTINATION = SOURCE.parent
WIDTH, HEIGHT = 424, 130
TITLE, EVENT = "Móveis e Seriados", "Indumóveis"
FONT_SOURCE = "https://github.com/google/fonts/tree/main/ofl/figtree"
PLUM = "#643B54"
GRAPHITE = "#4F433E"
WOOD = "#A77A56"


def outline(font, text, *, size, x, baseline, spacing, color):
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    factor = size / font["head"].unitsPerEm
    paths = []
    for character in text:
        glyph = glyphs[cmap[ord(character)]]
        pen = SVGPathPen(glyphs, ntos=lambda value: f"{value:.3f}".rstrip("0").rstrip("."))
        glyph.draw(TransformPen(pen, (factor, 0, 0, -factor, x, baseline)))
        path = pen.getCommands()
        if path:
            paths.append(f'    <path d="{path}"/>')
        x += glyph.width * factor + spacing
    return "\n".join([f'  <g fill="{color}" aria-hidden="true">', *paths, "  </g>"])


def build():
    font = TTFont(SOURCE / "Figtree.ttf")
    title = outline(
        instantiateVariableFont(font, {"wght": 650}), TITLE,
        size=36.5, x=102, baseline=69, spacing=0.12, color=PLUM,
    )
    event = outline(
        instantiateVariableFont(font, {"wght": 580}), EVENT,
        size=18, x=104, baseline=98, spacing=1.5, color=GRAPHITE,
    )
    signature = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="p12-brand-title p12-brand-description">
  <title id="p12-brand-title">{TITLE} · {EVENT}</title>
  <desc id="p12-brand-description">Assinatura do Pavilhão 12 com três lâminas em ritmo de marcenaria.</desc>
  <g aria-hidden="true" stroke="{WOOD}" stroke-width="1.6" stroke-linejoin="round">
    <path d="M15 94V49l21-15v45Z" fill="#CDA581"/>
    <path d="M38 94V49l21-15v45Z" fill="#DAB997"/>
    <path d="M61 94V49l21-15v45Z" fill="#E9D4BB"/>
    <path d="M15 75l21-15m2 15 21-15m2 15 21-15" fill="none" opacity=".65"/>
  </g>
  <path d="M15 104h22" stroke="{PLUM}" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"/>
{title}
{event}
</svg>
'''
    output = DESTINATION / "moveis-seriados-compact.svg"
    output.write_text(signature, encoding="utf-8")
    manifest = {
        "name": f"{TITLE} · {EVENT}",
        "visibleCopy": [TITLE, EVENT],
        "viewBox": [0, 0, WIDTH, HEIGHT],
        "asset": output.name,
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "format": "SVG with outlined Figtree lettering and a transparent background",
        "palette": {"plum": PLUM, "graphite": GRAPHITE, "wood": WOOD},
        "font": {"family": "Figtree", "weights": [650, 580], "license": "SIL OFL 1.1", "source": FONT_SOURCE},
    }
    (DESTINATION / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
    )


if __name__ == "__main__":
    build()
