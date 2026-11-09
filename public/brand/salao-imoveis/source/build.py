"""Export the Salão de Imóveis identity and wayfinding from local Figtree outlines."""

import hashlib
import json
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parent
WORDS = ("Salão de", "IMÓVEIS")
INK = "#302C2F"
PLUM = "#643B54"
BRONZE = "#796751"
IVORY = "#FAF6EE"
ASH = "#C4AE98"
ACCESS_SIZE = (92, 104)
ACCESS_BADGES = (
    (3, "esquerda", "M66 25H26m8-8-8 8 8 8"),
    (8, "direita", "M26 25H66m-8-8 8 8-8 8"),
)
LOCKUPS = (
    ("salao-imoveis-primary", (430, 148), False),
    ("salao-imoveis-compact", (324, 112), False),
    ("salao-imoveis-monochrome", (430, 148), True),
)


def outline(face, text, size, x, baseline, *, fill=INK, tracking=0, centered=False, tabular=False):
    glyphs = face.getGlyphSet()
    cmap = face.getBestCmap()
    names = [cmap[ord(character)] for character in text]
    if tabular:
        table = face["GSUB"].table
        mapping = {
            glyph: replacement
            for record in table.FeatureList.FeatureRecord
            if record.FeatureTag == "tnum"
            for index in record.Feature.LookupListIndex
            for subtable in table.LookupList.Lookup[index].SubTable
            for glyph, replacement in subtable.mapping.items()
        }
        names = [mapping[name] for name in names]
    factor = size / face["head"].unitsPerEm
    if centered:
        width = sum(glyphs[name].width for name in names) * factor
        x -= (width + (len(names) - 1) * tracking) / 2
    paths = []
    for name in names:
        pen = SVGPathPen(glyphs, ntos=lambda number: f"{number:.3f}".rstrip("0").rstrip("."))
        glyphs[name].draw(TransformPen(pen, (factor, 0, 0, -factor, x, baseline)))
        if data := pen.getCommands():
            paths.append(f'    <path d="{data}"/>')
        x += glyphs[name].width * factor + tracking
    return "\n".join([f'  <g fill="{fill}" aria-hidden="true">', *paths, "  </g>"])


def gallery_mark(scale, monochrome):
    stroke = INK if monochrome else BRONZE
    fills = (
        (INK, "0.08"), (INK, "0.14"), (INK, "0.04"), (INK, "0.12"), (INK, "0.17")
    ) if monochrome else (
        ("#F1E8DA", "1"), ("#E0CEBA", "1"), (IVORY, "1"), ("#E8D8C5", "1"), ("#D8BFA7", "1")
    )
    panel, flank, top, fascia, side = [
        f'fill="{color}" fill-opacity="{opacity}"' for color, opacity in fills
    ]
    occlusion = '''    <defs>
      <mask id="salao-panel-mask" x="0" y="0" width="100" height="105" maskUnits="userSpaceOnUse">
        <rect width="100" height="105" fill="white"/>
        <path d="M22 62 70 51l25 13v12L47 88 22 74Z" fill="black" stroke="black" stroke-width="1.8"/>
      </mask>
    </defs>''' if monochrome else ""
    mask = ' mask="url(#salao-panel-mask)"' if monochrome else ""
    return f'''  <g transform="translate(2 4) scale({scale})" stroke="{stroke}" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">
{occlusion}
    <g{mask}>
      <path d="M16 15H66V78H16Z" {panel}/>
      <path d="M66 15l20 12v56L66 78Z" {flank}/>
      <path d="M24 31H56M24 43H56M24 55H44" fill="none" stroke-width="1.05" opacity=".6"/>
    </g>
    <path d="M27 73v13m24 1v10m36-19v10" fill="none" stroke-linecap="round" stroke-width="2.25"/>
    <path d="M22 62 70 51l25 13-48 12Z" {top}/>
    <path d="M22 62l25 14v12L22 74Z" {side}/>
    <path d="M47 76l48-12v12L47 88Z" {fascia}/>
    <path d="m70 70 0 12M59 79l4-1m15-4 4-1" fill="none" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M10 100H99" fill="none" stroke-width="1.05" opacity=".7"/>
  </g>'''


def make_lockup(lead, title, size, monochrome):
    width, height = size
    compact = width == 324
    if compact:
        first = outline(lead, WORDS[0], 22.5, 115, 40, tracking=0.24)
        second = outline(title, WORDS[1], 44, 112, 85, tracking=1.1, fill=INK if monochrome else PLUM)
    else:
        first = outline(lead, WORDS[0], 30, 154, 53, tracking=0.33)
        second = outline(title, WORDS[1], 58, 150, 113, tracking=1.4, fill=INK if monochrome else PLUM)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="salao-title salao-desc">
  <title id="salao-title">Salão de IMÓVEIS</title>
  <desc id="salao-desc">Assinatura horizontal com um painel de exposição e um aparador em planos de madeira e mineral.</desc>
{gallery_mark(1 if compact else 1.31, monochrome)}
{first}
{second}
</svg>
'''


def make_access(label_face, number_face, pavilion, side, arrow):
    width, height = ACCESS_SIZE
    label = outline(label_face, "Pavilhão", 18.5, 46, 62, centered=True)
    number = outline(number_face, str(pavilion), 37, 46, 92, centered=True, tabular=True, fill=PLUM)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title-p{pavilion} desc-p{pavilion}">
  <title id="title-p{pavilion}">Acesso ao Pavilhão {pavilion}</title>
  <desc id="desc-p{pavilion}">Passagem lateral à {side} do Salão de Imóveis.</desc>
  <rect x="1.1" y="3.6" width="89.8" height="99.3" rx="10.5" fill="{ASH}" stroke="{BRONZE}" stroke-width="1.4"/>
  <rect x="1.1" y="1.1" width="89.8" height="98.5" rx="10.5" fill="{IVORY}" stroke="{BRONZE}" stroke-width="1.4"/>
  <path d="{arrow}" fill="none" stroke="{INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"/>
  <path d="M33 42h26" fill="none" stroke="{BRONZE}" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"/>
{label}
{number}
</svg>
'''


def export_svg(name, size, svg, **metadata):
    path = ROOT / name
    path.write_text(svg, encoding="utf-8")
    return {
        "name": name,
        "viewBox": [0, 0, *size],
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        **metadata,
    }


def main():
    with TTFont(SOURCE / "Figtree.ttf") as font:
        lead, title, label, digits = [
            instantiateVariableFont(font, {"wght": weight}) for weight in (540, 620, 660, 730)
        ]
        files = [
            export_svg(f"{name}.svg", size, make_lockup(lead, title, size, mono))
            for name, size, mono in LOCKUPS
        ]
        files.extend(
            export_svg(
                f"acesso-pavilhao-{pavilion}.svg",
                ACCESS_SIZE,
                make_access(label, digits, pavilion, side, arrow),
                label=f"Pavilhão {pavilion}",
                side=side,
            )
            for pavilion, side, arrow in ACCESS_BADGES
        )
    manifest = {
        "name": "Salão de IMÓVEIS",
        "visibleCopy": WORDS,
        "format": "SVG com curvas de fonte, fundo transparente e sem raster incorporado",
        "palette": {
            "graphite": INK,
            "plum": PLUM,
            "brushedBronze": BRONZE,
            "ivory": IVORY,
            "ash": ASH,
        },
        "font": {
            "family": "Figtree",
            "weights": [540, 620, 660, 730],
            "numerals": "tnum",
            "license": "SIL OFL 1.1",
            "source": "https://github.com/google/fonts/tree/main/ofl/figtree",
        },
        "files": files,
        "provenance": "Composição de galeria e mobiliário. Exportação determinística a partir dos contornos da fonte licenciada, conforme Creative Production exact-content e deterministic-exports.",
        "capabilityNote": "creative_production_board indisponível nesta sessão.",
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
