"""Regenerate the verified Pavilhão 1 revision from the supplied vector PDF.

Requires PyMuPDF. Run from repository root:
  python extract-plan.py /absolute/path/to/Mostra.pdf

Coordinates are native PDF points, not physical measures. Identity/declared
areas are an explicit reviewed catalogue and are never inferred from geometry.
"""
from pathlib import Path
import fitz,json,hashlib,sys
source=sys.argv[1] if len(sys.argv)>1 else 'docs/references/pavilion-1/mostra-arq-design.pdf'
expected_sha256='088ab9d98e61ed98c98b45834c5813416d9fd09a10af195aeeae29bfc9a4c02a'
if hashlib.sha256(Path(source).read_bytes()).hexdigest()!=expected_sha256:
 raise ValueError('Source differs from the reviewed revision; review geometry and create a new revision first.')
p=fitz.open(source)[0]; drawings=p.get_drawings()
R=lambda x:round(x,3)
def path(items):
 out=[];last=None
 def point(p):return f'{R(p.x)} {R(p.y)}'
 for it in items:
  if it[0]=='l':
   if last!=it[1]:out.append('M'+point(it[1]))
   out.append('L'+point(it[2]));last=it[2]
  elif it[0]=='c':
   if last!=it[1]:out.append('M'+point(it[1]))
   out.append('C'+' '.join(point(q) for q in it[2:]));last=it[-1]
  elif it[0]=='re':
   r=it[1];out.append(f'M{R(r.x0)} {R(r.y0)}H{R(r.x1)}V{R(r.y1)}H{R(r.x0)}Z');last=None
  elif it[0]=='qu':
   q=it[1];out.append('M'+point(q.ul)+'L'+point(q.ur)+'L'+point(q.lr)+'L'+point(q.ll)+'Z');last=None
 return ' '.join(out)
# CAD structural strokes, glazing and door swings. Gray dimensions, hatch and
# olive repeated circulation arrows are intentionally not presentation geometry.
# Native drawing 1504 is the reception's non-structural wavy boundary.
wallPaths=[];doorPaths=[];thinPaths=[];seen=set();stats={'wall':0,'door':0,'glazing':0}
door_boxes=[(130,183,159,236),(157,348,189,412),(1013,347,1042,434),(684,126,704,161),(831,126,851,162),(353,452,377,488),(584,452,603,472),(519,484,543,505)]
for i,d in enumerate(drawings):
 if d['color']!=(0,0,0) or i in (1070,1071):continue
 r=d['rect']
 if r.x0<39 or r.x1>1042 or r.y0<76 or r.y1>505:continue
 if r.width<.3 and r.height<.3:continue
 # Exclude dimension-only lower arrow and stray text outlines.
 if i>=2097:continue
 s=path(d['items'])
 if not s or s in seen:continue
 seen.add(s)
 is_door=any(r.x0>=a and r.y0>=b and r.x1<=c and r.y1<=e for a,b,c,e in door_boxes) and d['width']<.3
 if is_door:doorPaths.append(s);stats['door']+=1
 elif d['width']>=.4:wallPaths.append(s);stats['wall']+=1
 else:thinPaths.append(s);stats['glazing']+=1
curve=[(R(it[1].x),R(it[1].y)) for it in drawings[1504]['items']]
curve.append((R(drawings[1504]['items'][-1][2].x),R(drawings[1504]['items'][-1][2].y)))
curvePath=path(drawings[1504]['items'])
architecture=[{'id':'source-walls','kind':'wall','path':' '.join(wallPaths),'strokeWidth':.75}, {'id':'source-glazing-and-columns','kind':'wall','path':' '.join(thinPaths),'strokeWidth':.32}, {'id':'source-door-swings','kind':'door','path':' '.join(doorPaths),'strokeWidth':.5}, {'id':'reception-salon-divider','kind':'guide','path':curvePath,'strokeWidth':.7}, {'id':'main-access','kind':'access','path':'M1045 306 H1028 M1033 301 L1028 306 L1033 311','label':'Acesso principal','labelAt':[1042,283]}, {'id':'north-service-access','kind':'access','path':'M693 110 V122 M689 118 L693 122 L697 118','label':'Acesso de serviço','labelAt':[733,110]}, {'id':'south-service-access','kind':'access','path':'M532 512 V498 M528 502 L532 498 L536 502','label':'Acesso de serviço','labelAt':[565,520]}, {'id':'exit','kind':'access','path':'M114 493 V509 M110 505 L114 509 L118 505','label':'Saída','labelAt':[114,520]}]
def poly(points):return 'M'+' L'.join(f'{x} {y}' for x,y in points)+' Z'
def rect(x,y,a,b):return [[x,y],[a,y],[a,b],[x,b]]
def part(code,points,kind='interior'):
 return {'id':f'{code}:{kind}','kind':kind,'path':poly(points),'polygon':points+[points[0]]}
def env(code,name,kind,area,label,points,function=None):
 d={'id':f'indumoveis:pavilion:1:environment:{code}','code':code,'name':name,'kind':kind,'declaredAreaM2':area,'label':label,'parts':[part(code,points)]}
 if function:d['functionLabel']=function
 return d
# Measured inner faces in native PDF points. Source's actual non-rectangular
# reception/salon polyline is shared in opposite directions; hit surfaces touch
# but never overlap. Areas below are documentary values, not polygon products.
envs=[
 env('01','Recepção','commercial',111.66,[932,177],[[849.931,127.17],[1013.851,127.17]]+list(reversed(curve)),'Recepção'),
 env('02','Espaço 02','commercial',47.50,[808,223],rect(767.611,160.17,848.371,305.73)),
 env('03','Espaço 03','commercial',47.50,[725,223],rect(685.291,160.17,766.051,305.73)),
 env('04','Espaço 04','commercial',74.81,[643,207],rect(602.971,127.17,683.731,305.73)),
 env('05','Espaço 05','commercial',74.81,[561,207],rect(520.651,127.17,601.411,305.73)),
 env('06','Espaço 06','commercial',47.50,[561,370],rect(520.651,307.41,601.411,453.09)),
 env('07','Espaço 07','commercial',47.50,[479,370],rect(438.331,307.41,519.091,453.09)),
 env('08','Espaço 08','commercial',74.81,[479,207],rect(438.331,127.17,519.091,305.73)),
 env('09','Espaço 09','commercial',74.81,[396,207],rect(356.011,127.17,436.771,305.73)),
 env('10','Espaço 10','commercial',47.50,[396,370],rect(356.011,307.41,436.771,453.09)),
 env('11','Espaço 11','commercial',69.17,[314,378],rect(273.451,274.53,354.451,485.97)),
 env('12','Espaço 12','commercial',129.43,[272,188],rect(190.531,127.17,354.451,272.97)),
 env('13','Espaço 13','commercial',69.48,[231,378],rect(190.531,274.53,271.891,485.97)),
 env('14','Café','commercial',254.81,[102,328],[[39.691,124.05],[131.971,124.05],[131.971,275.49],[187.411,275.49],[187.411,409.89],[39.691,409.89]],'Café'),
 env('15','Banheiros','support',32.33,[160,162],rect(133.411,125.61,187.411,273.93),'Ambiente de apoio'),
 env('salon','Salão de Design','hall',None,[808,399],[[602.971,307.41],[849.931,307.41]]+curve+[[1013.851,485.97],[602.971,485.97]],'Salão'),
 env('corredor-superior','Corredor de serviço','circulation',None,[767,143],rect(685.291,127.17,848.371,158.61)),
 env('corredor-inferior','Corredor de serviço','circulation',None,[479,471],rect(356.011,454.53,601.411,485.97)),
 env('vestibulo-saida','Saída','circulation',None,[114,453],rect(41.251,411.45,187.411,484.41)),
]
for code,x0,x1 in [('12',197.251,354.331),('09',355.891,436.651),('08',438.211,519.091),('05',520.651,601.411),('04',602.971,683.731)]:
 next(e for e in envs if e['code']==code)['parts'].append(part(code,rect(x0,78.45,x1,124.05),'external'))
plan={'id':'indumoveis:pavilion:1:mostra-arq-design','revision':1,'pavilionNumber':1,'bounds':{'minX':28,'minY':66,'maxX':1080,'maxY':532},'source':{'revisionName':'mostra-arq-design-1-2026-11-08','document':'Mostra Arq&Design 1 (1).pdf','page':1,'sha256':hashlib.sha256(Path(source).read_bytes()).hexdigest(),'pageWidth':R(p.rect.width),'pageHeight':R(p.rect.height),'coordinateSystem':'PDF points; origin top-left; x right; y down; no metric conversion'},'environments':envs,'architecture':architecture}
Path('src/features/pavilion-interior/plan.generated.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n')
print(stats,'json bytes',Path('src/features/pavilion-interior/plan.generated.json').stat().st_size)
