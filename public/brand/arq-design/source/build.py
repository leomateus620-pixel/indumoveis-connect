"""Build the ARQ & Design SVG lockups. Pass --png to export raster copies as well."""
from pathlib import Path
from html import escape
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.subset import Options, Subsetter
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'source'
WORDS = ['ARQ &', 'Design', 'Indumóveis']
GRAPHITE = '#302C2F'
PLUM = '#643B54'
PROJECTION = '#8B7466'
PAPER = '#F8F6F1'

def load_font(name, weight):
    path = SOURCE / f'{name}.ttf'
    font = TTFont(path)
    if 'fvar' in font:
        font = instantiateVariableFont(font, {'wght': weight}, inplace=False)
        subsetter = Subsetter(options=Options())
        subsetter.populate(text=''.join(WORDS))
        subsetter.subset(font)
        font.save(path)
        font = TTFont(path)
    return font

sans = load_font('Figtree', 500)
serif = load_font('CormorantGaramond', 500)

def outline(text, font, size, x, baseline, tracking=0, fill=GRAPHITE):
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    factor = size / font['head'].unitsPerEm
    paths=[]
    for char in text:
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs)
        transformed=TransformPen(pen, (factor,0,0,-factor,x,baseline))
        glyphs[name].draw(transformed)
        data=pen.getCommands()
        if data:
            paths.append(f'<path d="{data}"/>')
        x += glyphs[name].width*factor+tracking
    return f'<g fill="{fill}" aria-label="{escape(text)}">'+''.join(paths)+'</g>'


def make(compact=False, monochrome=False):
    accent = GRAPHITE if monochrome else PLUM
    guide = GRAPHITE if monochrome else PROJECTION
    if compact:
        w, h = 244, 186
        lines = [
            outline(WORDS[0], sans, 37, 18, 54, 1),
            outline(WORDS[1], serif, 80, 15, 116, -.6, accent),
            outline(WORDS[2], sans, 22, 18, 156, .7),
        ]
        projections = 'M18 14H232V59M232 126V172H151'
        corners = 'M217 14H232V29M232 157V172H217'
    else:
        w, h = 360, 282
        lines = [
            outline(WORDS[0], sans, 52, 28, 80, 1.5),
            outline(WORDS[1], serif, 116, 24, 174, -.8, accent),
            outline(WORDS[2], sans, 28, 28, 229, 1.1),
        ]
        projections = 'M28 24H341V88M341 190V256H212M15 24H21M341 264V271'
        corners = 'M320 24H341V45M341 235V256H320'

    graphic = (
        f'<g fill="none" aria-hidden="true">'
        f'<path d="{projections}" stroke="{guide}" stroke-width="2"/>'
        f'<path d="{corners}" stroke="{accent}" stroke-width="4"/>'
        '</g>'
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}" role="img" aria-labelledby="brand-title">'
        '<title id="brand-title">ARQ &amp; Design Indumóveis</title>'
        '<desc>Assinatura vertical da Mostra ARQ &amp; Design da Indumóveis. '
        'Tipografia vetorial e linhas de projeção arquitetônica.</desc>'
        f'{graphic}{"".join(lines)}</svg>\n'
    )


def export_rasters(variants):
    from io import BytesIO
    from cairosvg import svg2png
    from PIL import Image, ImageDraw, ImageFont

    labels = ['Principal', 'Compacta', 'Uma cor']
    preview = Image.new('RGB', (1100, 440), PAPER)
    draw = ImageDraw.Draw(preview)
    font = ImageFont.load_default(size=17)
    for index, ((name, _, _), label) in enumerate(zip(variants, labels)):
        svg = ROOT / f'{name}.svg'
        svg2png(url=str(svg), scale=3, write_to=str(svg.with_suffix('.png')))

        center = 185 + index * 365
        draw.text((center, 33), label, fill=GRAPHITE, font=font, anchor='mm')
        for width, top in [(270, 64), (100, 316)]:
            tile = Image.open(BytesIO(svg2png(url=str(svg), output_width=width))).convert('RGBA')
            preview.paste(tile, (center - width // 2, top), tile)
    draw.line((34, 292, 1066, 292), fill=PROJECTION, width=1)
    preview.save(ROOT / 'identity-preview.png')

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--png', action='store_true', help='Export PNG copies and a review sheet using CairoSVG and Pillow')
args = parser.parse_args()

variants = [('arq-design-primary',False,False),('arq-design-compact',True,False),('arq-design-monochrome',False,True)]
for name,compact,mono in variants:
    (ROOT / f'{name}.svg').write_text(make(compact,mono), encoding='utf-8')
manifest={
    'name':'ARQ & Design Indumóveis','visibleCopy':WORDS,
    'format':'SVG with original font outlines; transparent background; no embedded raster',
    'palette':{'graphite':GRAPHITE,'plum':PLUM,'projection':PROJECTION,'suggestedBackground':PAPER},
    'fonts':[
        {'family':'Cormorant Garamond','weight':500,'license':'SIL OFL 1.1','source':'https://github.com/google/fonts/tree/main/ofl/cormorantgaramond'},
        {'family':'Figtree','weight':500,'license':'SIL OFL 1.1','source':'https://github.com/google/fonts/tree/main/ofl/figtree'},
    ],
    'files':[{'name':name+'.svg','sha256':hashlib.sha256((ROOT/(name+'.svg')).read_bytes()).hexdigest(),'viewBox':[0,0,244,186] if compact else [0,0,360,282]} for name,compact,_ in variants],
    'provenance':'Licensed font curves composed deterministically with section markers and open architectural projections. Creative Production exact-content and deterministic-exports workflow.',
    'capabilityNote':'creative_production_board is not exposed in this session; no board was generated.'
}
(ROOT / 'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n', encoding='utf-8')

if args.png:
    export_rasters(variants)
