"""Build the Pavilhão 8 identity and wayfinding from local Figtree outlines."""

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
NUMBER_VIEW_BOX = (0, 0, 62, 52)
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
MINERAL = "#F2EBDF"
SEAM = "#C1AF9E"
LIP = "#DDD0C1"
TERRACOTTA = "#A45F49"
FONT_SOURCE = "https://github.com/google/fonts/tree/main/ofl/figtree"


def tabular_substitutions(face):
    table = face["GSUB"].table
    return {
        glyph: replacement
        for record in table.FeatureList.FeatureRecord
        if record.FeatureTag == "tnum"
        for index in record.Feature.LookupListIndex
        for subtable in table.LookupList.Lookup[index].SubTable
        for glyph, replacement in subtable.mapping.items()
    }


def draw_text(font, text, *, weight, size, x, baseline, color, spacing=0, centered=False, tabular=False):
    face = instantiateVariableFont(font, {"wght": weight})
    glyphs = face.getGlyphSet()
    cmap = face.getBestCmap()
    scale = size / face["head"].unitsPerEm
    names = [cmap[ord(character)] for character in text]
    if tabular:
        substitutions = tabular_substitutions(face)
        names = [substitutions[name] for name in names]
    if centered:
        advance = sum(glyphs[name].width for name in names) * scale
        x -= (advance + (len(text) - 1) * spacing) / 2
    paths = []
    for name in names:
        glyph = glyphs[name]
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
    name_paths = draw_text(font, name, weight=565, size=26.5, x=85, baseline=30, spacing=0.12, color=GRAPHITE)
    title_paths = draw_text(font, title, weight=710, size=29.4, x=85, baseline=58, spacing=0.06, color=PLUM)
    event_paths = draw_text(font, event, weight=600, size=15, x=85, baseline=81, spacing=1.05, color="#5D4F49")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="p8-signature-title p8-signature-description">
  <title id="p8-signature-title">Fornecedores &amp; Construção Civil · Indumóveis</title>
  <desc id="p8-signature-description">Assinatura horizontal com módulos de alvenaria sobre uma base mineral.</desc>
  <g aria-hidden="true" stroke="{STONE}" stroke-width="1.45" stroke-linejoin="round">
    <path d="M8 68H65l7 5H15Z" fill="#F8F3EA"/>
    <path d="M8 68l7 5h57v5H15l-7-5Z" fill="{LIP}"/>
    <path d="M15 50H61l6 4v14H21l-6-4Z" fill="{LIP}"/>
    <path d="M21 54H67v14H21Z" fill="{MINERAL}"/>
    <path d="M21 34H63l6 4v16H27l-6-4Z" fill="#D2C3B4"/>
    <path d="M27 38H69v16H27Z" fill="#F9F5ED"/>
    <path d="M29 15H56l6 4v19H35l-6-4Z" fill="{LIP}"/>
    <path d="M35 19H62v19H35Z" fill="{MINERAL}"/>
    <path d="M47 38v16M42 54v14" fill="none"/>
  </g>
  <path d="M22 78H37" stroke="{TERRACOTTA}" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"/>
{name_paths}
{title_paths}
{event_paths}
</svg>
'''


def build_access_svg(font, pavilion, side, arrow):
    _, _, width, height = BADGE_VIEW_BOX
    label = draw_text(font, "Pavilhão", weight=640, size=13.5, x=31, baseline=36.5, color=GRAPHITE, centered=True)
    number = draw_text(font, str(pavilion), weight=710, size=29, x=31, baseline=59.5, color=PLUM, centered=True, tabular=True)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="access-p{pavilion}-title access-p{pavilion}-description">
  <title id="access-p{pavilion}-title">Acesso ao Pavilhão {pavilion}</title>
  <desc id="access-p{pavilion}-description">Passagem lateral à {side} do Pavilhão 8.</desc>
  <rect x="1.1" y="2.8" width="59.8" height="64.2" rx="5" fill="{LIP}" stroke="{SEAM}"/>
  <rect x="1.1" y="1" width="59.8" height="63.2" rx="5" fill="#F8F3EA" stroke="{SEAM}"/>
  <path d="{arrow}" fill="none" stroke="{GRAPHITE}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M24 24H38" fill="none" stroke="{TERRACOTTA}" stroke-width="1.5" stroke-linecap="round"/>
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


def build_pavilion_wayfinding_svg(font, slug, title, ink, paper, border, icon):
    _, _, width, height = WAYFINDING_VIEW_BOX
    label = draw_text(font, title, weight=700, size=10.75, x=23.5, baseline=16.6, spacing=-0.1, color=ink)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="p8-wayfinding-{slug}">
  <title id="p8-wayfinding-{slug}">{title}</title>
  <rect x="1" y="2" width="62" height="23" rx="4" fill="{LIP}" stroke="{border}"/>
  <rect x="1" y="0.8" width="62" height="22.4" rx="4" fill="#FBF8F2" stroke="{border}"/>
  <path d="M5 1.3h15.8v21.4H5a3.5 3.5 0 0 1-3.5-3.5V4.8A3.5 3.5 0 0 1 5 1.3Z" fill="{paper}" aria-hidden="true"/>
  <path d="M20.8 1.4v21.2" stroke="{border}" aria-hidden="true"/>
  <path d="{icon}" transform="translate(0.5 -0.8)" fill="none" stroke="{ink}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"/>
{label}
</svg>
'''


def build_number_svg(font):
    _, _, width, height = NUMBER_VIEW_BOX
    number = draw_text(font, "08", weight=700, size=34, x=31, baseline=37.5, color=GRAPHITE, centered=True, tabular=True)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="p8-plate-title">
  <title id="p8-plate-title">Pavilhão 08</title>
  <rect x="1.2" y="2.6" width="59.6" height="48.4" rx="3.5" fill="{LIP}" stroke="{SEAM}"/>
  <rect x="1.2" y="1" width="59.6" height="48" rx="3.5" fill="{MINERAL}" stroke="{SEAM}"/>
  <path d="M6.5 5.8h12" stroke="{TERRACOTTA}" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"/>
{number}
</svg>
'''


def main():
    export = DESTINATION / "fornecedores-construcao-compact.svg"
    number_plate = DESTINATION / "placa-08.svg"
    access_files = []
    wayfinding_files = []
    pavilion_wayfinding_files = []
    WAYFINDING_DESTINATION.mkdir(exist_ok=True)
    with TTFont(SOURCE / "Figtree.ttf") as font:
        export.write_text(build_svg(font), encoding="utf-8")
        number_plate.write_text(build_number_svg(font), encoding="utf-8")
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
            if slug in ("entrada", "saida"):
                pavilion_sign = DESTINATION / f"{slug}.svg"
                pavilion_sign.write_text(build_pavilion_wayfinding_svg(font, slug, title, ink, paper, border, icon), encoding="utf-8")
                pavilion_wayfinding_files.append({
                    "name": pavilion_sign.name,
                    "viewBox": WAYFINDING_VIEW_BOX,
                    "sha256": hashlib.sha256(pavilion_sign.read_bytes()).hexdigest(),
                    "visibleCopy": title,
                })
    manifest = {
        "name": "Fornecedores & Construção Civil · Indumóveis",
        "visibleCopy": COPY,
        "format": "SVG com transparência e curvas de fonte, sem raster incorporado",
        "palette": {
            "graphite": GRAPHITE,
            "plum": PLUM,
            "stone": STONE,
            "mineral": MINERAL,
            "terracotta": TERRACOTTA,
        },
        "font": {"family": "Figtree", "license": "SIL OFL 1.1", "source": FONT_SOURCE, "numerals": "tnum"},
        "file": {
            "name": export.name,
            "viewBox": VIEW_BOX,
            "sha256": hashlib.sha256(export.read_bytes()).hexdigest(),
        },
        "numberPlate": {
            "name": number_plate.name,
            "viewBox": NUMBER_VIEW_BOX,
            "sha256": hashlib.sha256(number_plate.read_bytes()).hexdigest(),
            "visibleCopy": "08",
        },
        "accessSigns": access_files,
        "pavilionWayfinding": pavilion_wayfinding_files,
        "sharedWayfinding": wayfinding_files,
    }
    (DESTINATION / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
