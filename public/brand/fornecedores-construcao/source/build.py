"""Build the Pavilhão 8 signature and access signs from local Figtree outlines."""

import hashlib
import json
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


SOURCE = Path(__file__).resolve().parent
DESTINATION = SOURCE.parent
WAYFINDING_DESTINATION = DESTINATION.parent / "pavilion-wayfinding"
VIEW_BOX = (0, 0, 320, 92)
BADGE_VIEW_BOX = (0, 0, 62, 68)
WAYFINDING_VIEW_BOX = (0, 0, 64, 26)
COPY = ("Fornecedores &", "Construção Civil", "Indumóveis")
ACCESS_SIGNS = (
    (13, "esquerda", "M43 14H19m6-6-6 6 6 6"),
    (12, "direita", "M19 14H43m-6-6 6 6-6 6"),
)
WAYFINDING_SIGNS = (
    ("entrada", "Entrada", "#315D51", "#F2F7F3", "#AABDB2", "M13 8V6h5v14h-5v-2M5 13h9m-3-3 3 3-3 3"),
    ("saida", "Saída", "#884F41", "#FCF4EF", "#CCB1A5", "M10 8V6H5v14h5v-2m-1-5h9m-3-3 3 3-3 3"),
    ("servico", "Serviço", "#645749", "#F7F3EB", "#C4B8A8", "M7 20V6h10v14M5 20h14m-6-7h1"),
)
GRAPHITE = "#302C2F"
PLUM = "#643B54"
STONE = "#826B5B"
FONT_SOURCE = "https://github.com/google/fonts/tree/main/ofl/figtree"


def draw_text(font, text, *, weight, size, x, baseline, color, spacing=0, centered=False):
    face = instantiateVariableFont(font, {"wght": weight})
    glyphs = face.getGlyphSet()
    cmap = face.getBestCmap()
    scale = size / face["head"].unitsPerEm
    if centered:
        advance = sum(glyphs[cmap[ord(character)]].width for character in text) * scale
        x -= (advance + (len(text) - 1) * spacing) / 2
    paths = []
    for character in text:
        glyph = glyphs[cmap[ord(character)]]
        pen = SVGPathPen(glyphs, ntos=lambda value: f"{value:.3f}".rstrip("0").rstrip("."))
        glyph.draw(TransformPen(pen, (scale, 0, 0, -scale, x, baseline)))
        data = pen.getCommands()
        if data:
            paths.append(f'    <path d="{data}"/>')
        x += glyph.width * scale + spacing
    return '\n'.join([f'  <g fill="{color}" aria-hidden="true">', *paths, '  </g>'])


def build_svg(font):
    _, _, width, height = VIEW_BOX
    name, title, event = COPY
    name_paths = draw_text(font, name, weight=540, size=26, x=82, baseline=30, spacing=0.14, color=GRAPHITE)
    title_paths = draw_text(font, title, weight=660, size=30, x=82, baseline=57, spacing=0.14, color=PLUM)
    event_paths = draw_text(font, event, weight=570, size=15.5, x=82, baseline=81, spacing=1.5, color="#5D4F49")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="p8-signature-title p8-signature-description">
  <title id="p8-signature-title">Fornecedores &amp; Construção Civil · Indumóveis</title>
  <desc id="p8-signature-description">Assinatura horizontal com três fiadas em composição escalonada.</desc>
  <g aria-hidden="true">
    <path d="M13 48H35V65H13Z" fill="#E9DCE1"/>
    <path d="M48 31H68V48H48Z" fill="#EFE5D8"/>
    <path d="M13 65V48H61V65Z M20 48V31H68V48H61 M29 31V14H61V31 M48 31V48" fill="none" stroke="{STONE}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M35 48V65 M9 74H69" fill="none" stroke="{PLUM}" stroke-width="2.2" stroke-linecap="round"/>
  </g>
{name_paths}
{title_paths}
{event_paths}
</svg>
'''


def build_access_svg(font, pavilion, side, arrow):
    _, _, width, height = BADGE_VIEW_BOX
    label = draw_text(font, "Pavilhão", weight=650, size=14, x=31, baseline=36.5, color=GRAPHITE, centered=True)
    number = draw_text(font, str(pavilion), weight=680, size=29, x=31, baseline=60.5, color=PLUM, centered=True)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="access-p{pavilion}-title access-p{pavilion}-description">
  <title id="access-p{pavilion}-title">Acesso ao Pavilhão {pavilion}</title>
  <desc id="access-p{pavilion}-description">Passagem lateral à {side} do Pavilhão 8.</desc>
  <rect x="0.75" y="0.75" width="60.5" height="66.5" rx="7" fill="#FBF8F2" stroke="#B6A595" stroke-width="1.5"/>
  <path d="{arrow}" fill="none" stroke="{PLUM}" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M24 23H38" fill="none" stroke="{STONE}" stroke-width="1.4" stroke-linecap="round"/>
{label}
{number}
</svg>
'''


def build_wayfinding_svg(font, slug, title, ink, paper, border, icon):
    _, _, width, height = WAYFINDING_VIEW_BOX
    label = draw_text(font, title, weight=670, size=11, x=21.5, baseline=16.5, color=ink)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="wayfinding-{slug}">
  <title id="wayfinding-{slug}">{title}</title>
  <rect x="0.6" y="0.6" width="62.8" height="24.8" rx="6" fill="{paper}" stroke="{border}" stroke-width="1.2"/>
  <path d="{icon}" fill="none" stroke="{ink}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"/>
{label}
</svg>
'''


def main():
    export = DESTINATION / "fornecedores-construcao-compact.svg"
    access_files = []
    wayfinding_files = []
    WAYFINDING_DESTINATION.mkdir(exist_ok=True)
    with TTFont(SOURCE / "Figtree.ttf") as font:
        export.write_text(build_svg(font), encoding="utf-8")
        for pavilion, side, arrow in ACCESS_SIGNS:
            badge = DESTINATION / f"acesso-pavilhao-{pavilion}.svg"
            badge.write_text(build_access_svg(font, pavilion, side, arrow), encoding="utf-8")
            access_files.append({
                "name": badge.name,
                "viewBox": BADGE_VIEW_BOX,
                "sha256": hashlib.sha256(badge.read_bytes()).hexdigest(),
                "visibleCopy": ("Pavilhão", str(pavilion)),
                "side": side,
            })
        for slug, title, ink, paper, border, icon in WAYFINDING_SIGNS:
            sign = WAYFINDING_DESTINATION / f"{slug}.svg"
            sign.write_text(build_wayfinding_svg(font, slug, title, ink, paper, border, icon), encoding="utf-8")
            wayfinding_files.append({
                "name": f"../pavilion-wayfinding/{sign.name}",
                "viewBox": WAYFINDING_VIEW_BOX,
                "sha256": hashlib.sha256(sign.read_bytes()).hexdigest(),
                "visibleCopy": title,
            })
    manifest = {
        "name": "Fornecedores & Construção Civil · Indumóveis",
        "visibleCopy": COPY,
        "format": "SVG com transparência e curvas de fonte, sem raster incorporado",
        "palette": {"graphite": GRAPHITE, "plum": PLUM, "stone": STONE},
        "font": {"family": "Figtree", "license": "SIL OFL 1.1", "source": FONT_SOURCE},
        "file": {
            "name": export.name,
            "viewBox": VIEW_BOX,
            "sha256": hashlib.sha256(export.read_bytes()).hexdigest(),
        },
        "accessSigns": access_files,
        "sharedWayfinding": wayfinding_files,
    }
    (DESTINATION / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
