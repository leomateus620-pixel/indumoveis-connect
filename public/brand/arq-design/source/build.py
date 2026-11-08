"""Deterministic ARQ & Design identity. Python 3 + fonttools. No raster tracing."""
from pathlib import Path
from html import escape
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.subset import Options, Subsetter
import json, hashlib

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'source'
WORDS = ['ARQ &', 'Design', 'Indumóveis']

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

def outline(text, font, size, x, baseline, tracking=0, fill='#302C2F'):
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
    # Each lockup is independently composed; all visible lettering is real font outlines.
    plum = '#302C2F' if monochrome else '#643B54'
    graphite = '#302C2F'
    guide = graphite if monochrome else '#A69C8E'
    if compact:
        w,h=244,186
        lines=[outline('ARQ &',sans,34,20,54,1,graphite),outline('Design',serif,76,17,116,-.4,plum),outline('Indumóveis',sans,15,21,151,1.7,graphite)]
        graphic=f'<g fill="none" stroke="{guide}" stroke-width="1.1"><path d="M20 17H224V67M224 130V168H127"/><path d="M7 17H12M20 4V9M237 168H232M224 181V176"/></g>'
    else:
        w,h=360,282
        lines=[outline('ARQ &',sans,49,31,82,1.9,graphite),outline('Design',serif,114,27,177,-.8,plum),outline('Indumóveis',sans,21,32,227,2.8,graphite)]
        graphic=f'<g fill="none" stroke="{guide}" stroke-width="1.2"><path d="M31 27H331V100M331 193V255H192"/><path d="M14 27H20M31 10V16M348 255H342M331 272V266"/></g>'
    title='ARQ &amp; Design Indumóveis'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-labelledby="brand-title"><title id="brand-title">{title}</title><desc>Assinatura vertical da Mostra ARQ &amp; Design da Indumóveis. Tipografia vetorial e linhas de projeção arquitetônica.</desc>{graphic}'+''.join(lines)+'</svg>\n'

variants = [('arq-design-primary',False,False),('arq-design-compact',True,False),('arq-design-monochrome',False,True)]
for name,compact,mono in variants:
    (ROOT / f'{name}.svg').write_text(make(compact,mono))
manifest={
    'name':'ARQ & Design Indumóveis','visibleCopy':WORDS,
    'format':'SVG with original font outlines; transparent background; no embedded raster',
    'palette':{'graphite':'#302C2F','plum':'#643B54','projection':'#A69C8E','suggestedBackground':'#F8F6F1'},
    'fonts':[
        {'family':'Cormorant Garamond','weight':500,'license':'SIL OFL 1.1','source':'https://github.com/google/fonts/tree/main/ofl/cormorantgaramond'},
        {'family':'Figtree','weight':500,'license':'SIL OFL 1.1','source':'https://github.com/google/fonts/tree/main/ofl/figtree'},
    ],
    'files':[{'name':name+'.svg','sha256':hashlib.sha256((ROOT/(name+'.svg')).read_bytes()).hexdigest(),'viewBox':[0,0,244,186] if compact else [0,0,360,282]} for name,compact,_ in variants],
    'provenance':'Deterministic typographic composition using licensed font curves, not a raster-to-vector conversion. Creative Production exact-content and deterministic-exports workflow.',
    'capabilityNote':'creative_production_board is not exposed in this session; no board was generated.'
}
(ROOT / 'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
