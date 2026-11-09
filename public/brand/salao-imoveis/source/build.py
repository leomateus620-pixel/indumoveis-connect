"""Deterministic Salão de IMÓVEIS lockups and access badges. Python 3 + fonttools."""
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
WORDS = ['Salão de', 'IMÓVEIS']
ACCESS_SIZE = (92, 104)
ACCESS_BADGES = (
    (3, 'esquerda', 'M66 25H26m8-8-8 8 8 8'),
    (8, 'direita', 'M26 25H66m-8-8 8 8-8 8'),
)

def load_font(filename, copy, weight):
    path = SOURCE / filename
    typeface = TTFont(path)
    if 'fvar' not in typeface:
        return typeface
    typeface = instantiateVariableFont(typeface, {'wght': weight}, inplace=False)
    subsetter = Subsetter(options=Options())
    subsetter.populate(text=copy)
    subsetter.subset(typeface)
    typeface.save(path)
    return TTFont(path)

font = load_font('Figtree.ttf', ''.join(WORDS), 500)
access_font = load_font('Figtree-Acessos.ttf', 'Pavilhão38', 600)

def outline(text, size, x, baseline, tracking=0, fill='#302C2F', typeface=font):
    glyphs = typeface.getGlyphSet()
    cmap = typeface.getBestCmap()
    factor = size / typeface['head'].unitsPerEm
    paths=[]
    for char in text:
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (factor,0,0,-factor,x,baseline)))
        data=pen.getCommands()
        if data:
            paths.append(f'<path d="{data}"/>')
        x += glyphs[name].width*factor+tracking
    return f'<g fill="{fill}" aria-label="{escape(text)}">'+''.join(paths)+'</g>'


def make(compact=False, monochrome=False):
    ink='#302C2F'
    plum=ink if monochrome else '#643B54'
    bronze=ink if monochrome else '#8B7B65'
    if compact:
        w,h=324,112
        text=outline('Salão de',22,117,38,.4,ink)+outline('IMÓVEIS',43,115,84,1.7,plum)
        graphic=f'<g fill="none" stroke="{bronze}" stroke-width="1.65" stroke-linejoin="miter"><path d="M17 91V39H43V19H71V91H91V30H71M43 39V91M17 67H71M43 91H91"/><path d="M10 99H98" stroke-width="1"/></g>'
    else:
        w,h=430,148
        text=outline('Salão de',29,158,51,.55,ink)+outline('IMÓVEIS',58,155,113,2.2,plum)
        graphic=f'<g fill="none" stroke="{bronze}" stroke-width="1.9" stroke-linejoin="miter"><path d="M23 120V51H58V25H95V120H122V39H95M58 51V120M23 89H95M58 120H122"/><path d="M14 131H132" stroke-width="1.1"/></g>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-labelledby="salao-title"><title id="salao-title">Salão de IMÓVEIS</title><desc>Assinatura horizontal do Salão de Imóveis. Tipografia vetorial e composição abstrata de planos de fachada urbana.</desc>{graphic}{text}</svg>\n'

def centered_access_text(text, size, baseline):
    glyphs = access_font.getGlyphSet()
    cmap = access_font.getBestCmap()
    units_per_em = access_font['head'].unitsPerEm
    text_width = sum(glyphs[cmap[ord(char)]].width for char in text) * size / units_per_em
    x = (ACCESS_SIZE[0] - text_width) / 2
    return outline(text, size, x, baseline, fill='#643B54', typeface=access_font)

def make_access_badge(pavilion, side, arrow):
    width, height = ACCESS_SIZE
    label = centered_access_text('Pavilhão', 18.5, 62)
    number = centered_access_text(str(pavilion), 35, 92)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title-p{pavilion} desc-p{pavilion}">
  <title id="title-p{pavilion}">Acesso ao Pavilhão {pavilion}</title>
  <desc id="desc-p{pavilion}">Passagem lateral à {side} do Salão de Imóveis.</desc>
  <rect x="1" y="1" width="{width - 2}" height="{height - 2}" rx="11" fill="#FCFBF8" stroke="#B8AA9D" stroke-width="2"/>
  <path d="{arrow}" fill="none" stroke="#643B54" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M36 42h20" fill="none" stroke="#8B7B65" stroke-width="1.6" stroke-linecap="round"/>
  <g aria-hidden="true">
    {label}
    {number}
  </g>
</svg>
'''

variants=[('salao-imoveis-primary',False,False),('salao-imoveis-compact',True,False),('salao-imoveis-monochrome',False,True)]
for name,compact,mono in variants:
    (ROOT/f'{name}.svg').write_text(make(compact,mono))

access_files = []
for pavilion, side, arrow in ACCESS_BADGES:
    path = ROOT / f'acesso-pavilhao-{pavilion}.svg'
    path.write_text(make_access_badge(pavilion, side, arrow))
    access_files.append({
        'name': path.name,
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'viewBox': [0, 0, *ACCESS_SIZE],
        'label': f'Pavilhão {pavilion}',
        'side': side,
    })

manifest={
 'name':'Salão de IMÓVEIS',
 'visibleCopy':WORDS,
 'format':'Original font outlines and geometric line composition in SVG; transparent background; no embedded raster',
 'palette':{'graphite':'#302C2F','plum':'#643B54','urbanLine':'#8B7B65','suggestedBackground':'#F8F6F1'},
 'fonts':[
     {'family':'Figtree','weight':weight,'license':'SIL OFL 1.1','source':'https://github.com/google/fonts/tree/main/ofl/figtree'}
     for weight in (500, 600)
 ],
 'files':[{'name':name+'.svg','sha256':hashlib.sha256((ROOT/(name+'.svg')).read_bytes()).hexdigest(),'viewBox':[0,0,324,112] if compact else [0,0,430,148]} for name,compact,_ in variants] + access_files,
 'provenance':'Deterministic typesetting using licensed font curves and abstract facade planes. Not raster tracing. Creative Production exact-content and deterministic-exports instructions applied.',
 'capabilityNote':'creative_production_board is not exposed by this session; no interactive board was created.'
}
(ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
