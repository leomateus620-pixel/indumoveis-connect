# Santa Rosa vista do parque

O ponto de observação fica nas quadras centrais do Parque de Exposições, em **27,8450421° S, 54,4785109° O**. A oeste e noroeste encontram-se glebas agrícolas e faixas arborizadas. Olhando para sul e sudeste, a malha residencial ocupa o primeiro plano exterior. Os prédios mais altos pertencem a grupos localizados dentro dessa malha. O recorte óptico foi preparado com imagens de verão separadas por 13 dias, com talhões verdes e trechos de terra exposta na mesma composição. [Vistas na rota](validation/santa-rosa/validacao-mapa.md) · [Integração do solo, dos cartões e das alturas](validation/santa-rosa/integracao.md) · [Créditos e licenças distribuídos](../public/landscape/santa-rosa/creditos.txt)

## Norte, escala e controles

O sistema de produção é uma projeção azimutal equidistante sobre WGS84, centrada no observador. O centro corresponde a **(95, 28)** em XZ do parque. Uma unidade horizontal da cena representa aproximadamente **2,199 m**. Para aplicar um deslocamento de um metro a leste, multiplica-se o vetor XZ **(−0,48783, +0,87294)** por 0,454816. Para um metro ao norte, usa-se **(+0,87294, +0,48783)**. Assim, +X aponta aproximadamente a 330,8° e +Z a 60,8°. As distâncias locais vêm do registro das duas junções em `urbanReference.ts`; as coordenadas comerciais pertencem a uma planta esquemática.

A ilha circular da Benvenuto permite medir a translação residual da pancromática CBERS L4. Ajustando um círculo aos dois arcos do OSM, seu centro no raster de 2 m cai em (1167,18; 1124,25) pixels desde a quina superior esquerda. Na pancromática de fevereiro o anel está centrado em (1170,00; 1120,50) pixels. O processamento desloca somente a banda PAN 5,64 m a oeste e 7,50 m ao sul. As grades Sentinel, WorldCover e DSM conservam seu registro original.

Duas leituras independentes em lados diferentes permitem conferir a transformação. No centro da cobertura da Arena, a separação observada é de cerca de 5 m. No meio do trecho curto ao norte da pista campeira, é de cerca de 2 m. A extremidade de solo da pista admite incerteza de alguns pixels. A concordância das direções e a posição da ilha permitem detectar inversão lateral, giro de quarto de volta e erro grosseiro de escala. Os valores descrevem a correspondência visual entre a planta e este produto óptico. [Controle ampliado nas três feições](validation/santa-rosa/controles-territoriais.webp) · [Pontos medidos](validation/santa-rosa/controles-territoriais.json)

## Oito linhas de visada

Os percentuais se referem à área de cada leque de 45° entre 400 m e 2 km. Cada distância da tabela é a primeira superfície que atinge a maior elevação angular na **linha central** desse leque, desde 950 m até 25 km. Quinas de telhado, cristas e corredores arborizados variam ao longo de cada setor. Um ângulo negativo indica que o horizonte observado está abaixo da horizontal do olho.

| Rumo | Território imediato além do parque | Crista a 16 m AGL · distância, cota, ângulo | Crista a 72 m AGL · distância, cota, ângulo |
| --- | --- | --- | --- |
| N · 0° | Maciços de árvores (48%) entre lavouras (35%) e campos. Uma elevação próxima encobre a sucessão de parcelas no nível baixo. | 1,55 km · 350 m · +0,41° | 9,48 km · 329 m · −0,44° |
| NE · 45° | Lavouras (54%) em glebas com vias de acesso, mata (28%) e poucas manchas construídas. A subida abre uma longa visada rural. | 2,31 km · 355 m · +0,38° | 24,38 km · 345 m · −0,23° |
| L · 90° | Ocupação baixa e galpões intercalados com mata (38%), manchas urbanizadas (25%) e lavouras (22%). | 3,13 km · 350 m · +0,19° | 20,38 km · 335 m · −0,26° |
| SE · 135° | Arruamento e bairros baixos (54% urbanizado), com copas e corredores verdes (40%). A crista central que se vê além deles é agrícola. | 14,40 km · 378 m · +0,09° | 19,96 km · 384 m · −0,12° |
| S · 180° | Frente urbana mais extensa (64%); compactação de quarteirões ao sul, com edifícios mais altos em azimutes específicos e relevo rural atrás. | 19,52 km · 377 m · +0,02° | 19,52 km · 377 m · −0,14° |
| SO · 225° | Na direção da pista, bairros e vias ocupam 40% do leque, com mata em 35%. Bosques e relevo ocultam partes da cidade atrás das coberturas. | 22,00 km · 367 m · −0,03° | 22,00 km · 367 m · −0,17° |
| O · 270° | Lavouras (48%) e matas entre glebas (33%); as vias e a ocupação esparsa ficam abaixo da linha de relevo. | 18,92 km · 340 m · −0,08° | 23,24 km · 338 m · −0,25° |
| NO · 315° | Atrás da Arena predominam lavoura (59%) e mata (30%); apenas 1,4% da área próxima é urbanizada. A copa da primeira encosta interrompe vistas dos talhões. | 11,16 km · 303 m · −0,23° | 19,46 km · 281 m · −0,42° |

A análise guarda também as alturas de 40 e 110 m usadas na conferência visual, as cristas secundárias expostas e a cobertura até 25 km. Quando o máximo coincide com 25 km, o dado indica o limite do estudo e o horizonte pode continuar além da amostra. As cotas usam o datum vertical EGM2008 do DSM. O traçado incorpora curvatura terrestre e supõe refração nula. [Perfis com a linha de visada nas duas alturas](validation/santa-rosa/perfis-relevo.webp) · [Resultados por azimute e faixa de distância](validation/santa-rosa/sightlines.json)

## Composição das imagens

A banda pancromática de 2 m do **CBERS-4A/WPM, 12/02/2024**, resolve a geometria das vias e telhados. Os canais RGB da aquisição **Sentinel-2B de 30/01/2024**, tile 21JYK, fornecem a cor ortorretificada e a camada regional. O uso da banda monocromática original elimina as franjas vermelhas e cianas que aparecem em alguns telhados no produto PCA fusionado. A transferência de contraste mantém a luminância visível da vegetação junto ao detalhe espacial da PAN, cujo sensor alcança o infravermelho próximo. O navegador recebe três janelas quadradas, centradas no mesmo ponto e orientadas ao norte. [CBERS L4](https://data.inpe.br/bdc/stac/v1/collections/CB4A-WPM-L4-DN-1/items/CBERS_4A_WPM_20240212_211_148_L4) · [Sentinel L2A](https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2B_21JYK_20240130_0_L2A)

| Janela | Extensão | Detalhada | Compacta |
| --- | --- | --- | --- |
| Imediata | 4,096 × 4,096 km | 2048² · 2 m/px | 512² · 8 m/px |
| Intermediária | 8,192 × 8,192 km | 2048² · 4 m/px | 512² · 16 m/px |
| Regional | 50 × 50 km | 2048² · 24,4 m/px | 512² · 97,7 m/px |

O **Copernicus GLO-30**, DSM do acervo AWS da edição 2021 com observações TanDEM-X de 2011–2015, fornece a superfície regional, inclusive a contribuição de copas. Para as encostas próximas, uma grade de 512² amostras guarda a cota relativa à referência de 323 m sobre 8,192 km. Cada nível do PNG equivale a um metro e 128 é o nível do parque. A fonte de 30 m foi reamostrada para manter o mesmo registro da ortofoto. [Especificação e atribuição do Copernicus DEM](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM)

A produção do panorama usa os contornos observados da Microsoft e a presença e altura estimadas pelo **Open Buildings 2.5D de 2023**. O manifesto define a banda 2 como altura em metros e a banda 3 como confiança de presença. Dentro de cada contorno, seleciona-se o percentil 65 dos pixels com presença ≥0,6 e altura ≥2 m, exigindo pelo menos dois pixels válidos. A base de uma construção é estimada a partir do mínimo local suavizado do DSM. A superfície final é o máximo entre DSM e base acrescida da altura, evitando somar duas vezes um telhado já presente na superfície. O algoritmo calcula o ponto atingido pelo raio, o tom das faces segundo a normal e o véu atmosférico em função da distância. Alturas altas no Brasil carregam incerteza do modelo; os grupos de edifícios não receberam nomes de marcos individuais. [Footprints Microsoft](https://github.com/microsoft/GlobalMLBuildingFootprints) · [Open Buildings 2.5D, resolução e limitações](https://sites.research.google/gr/open-buildings/temporal/)

Nos arquivos **horizon-low** e **horizon-high**, a coluna inicial é o norte verdadeiro, a longitude cresce para leste e cada volta ocupa exatamente 360°. O topo está a +8° e a base a −16°. A faixa detalhada contém 8192 × 512 pixels e a compacta 2048 × 256. O céu fica transparente. A altura de 16 m corresponde a 7,3 unidades do mapa e a de 72 m a 32,7, cobrindo a posição baixa junto ao limite e as vistas oblíquas dos anexos. A diferença angular máxima entre as duas silhuetas excede um grau e a ordem de cristas expostas muda. Os PNGs de profundidade guardam, em escala logarítmica de 950 m a 25 km, a distância da primeira interseção para as duas alturas. O renderizador reprojeta a amostra pela profundidade quando o observador se move e seleciona a superfície visível. Nos prédios com mais de 12 m e altura e contorno observados, faixas de material fotográfico local são amostradas segundo o eixo principal do footprint e a altura da face, com filtragem proporcional à distância. A aparência das janelas corresponde a material representativo de Santa Rosa; a geometria e o alcance visível do telhado vêm do cálculo de visibilidade. Para as fachadas próximas, os cartões georreferenciados assumem o primeiro plano externo. A contribuição adicional dos prédios ao panorama entra gradualmente entre 1,4 e 1,5 km.

Na fotografia CBERS o Sol estava a 66,6° de azimute e 61,6° de elevação, e na Sentinel a 76,8° e 60,5°. Ambas iluminam do quadrante leste. A luz do parque vem de cerca de 106° a 45° de elevação. As sombras próximas do modelo 3D seguem essa luz; no terreno exterior o ajuste de exposição e contraste atenua a diferença angular e a textura conserva a iluminação registrada. WorldCover 2021 distingue áreas construídas, lavouras e cobertura arbórea para o estudo setorial. O Earth forneceu a conferência visual separada das imagens de produção. [WorldCover v200](https://doi.org/10.5281/zenodo.7254221)

## Regeneração

A geração usa Python e dependências geográficas fora do bundle do aplicativo. Os URLs completos das cenas, tiles e bandas estão em `scripts/santa-rosa/sources.py`. O acesso remoto ocorre ao preparar os arquivos; a rota solicita apenas os recursos locais. A primeira execução pode baixar centenas de MB de janelas e blocos de imagens. O cache identifica cada janela por fonte, bandas, projeção, resolução e reamostragem. A conferência em 17/11/2026 começou com um diretório vazio, baixou as janelas e o CHM, validou o checksum dos footprints e regenerou os treze rasters de terreno, panorama e profundidade. Usando esses mesmos dados e a máscara registrada, uma segunda execução em diretório de saída isolado reconstruiu os dois atlas de cartões e o índice binário em 11,6 s. A geração identificou 3.753 edificações e 1.421 grupos de copas. Os SHA-256 dos dezesseis arquivos coincidiram com os distribuídos. [Dimensões, hashes e verificação da emenda norte](validation/santa-rosa/rasters.json)

```sh
python3 -m venv /tmp/indumoveis-santa-rosa-env
source /tmp/indumoveis-santa-rosa-env/bin/activate
pip install -r scripts/santa-rosa/requirements.txt
python scripts/santa-rosa/build.py --cache /tmp/indumoveis-santa-rosa-dados
PYTHON=python3 node scripts/build-commercial-landscape-mask.mjs
python scripts/santa-rosa/settlement.py --cache /tmp/indumoveis-santa-rosa-dados
python scripts/santa-rosa/review.py --cache /tmp/indumoveis-santa-rosa-dados
```

A geração chama a extração dos footprints de fevereiro de 2026 e valida o SHA-256 do tile da Microsoft. A máscara usa a geometria do parque e do entorno já modelado. Os cartões usam o modelo de altura de copa Meta/WRI e os contornos locais. O atlas de material de fachada já consta em `scripts/santa-rosa/fachadas-santa-rosa.webp`. Para reconstruí-lo a partir do original licenciado, execute `python scripts/santa-rosa/facades.py ORIGINAL.jpg` antes de gerar os cartões. [Foto de Loco085, 11/02/2017, CC BY-SA 3.0](https://commons.wikimedia.org/wiki/File:Santa_Rosa_-_RS_-_Panor%C3%A1mica_centro.jpg) · [Altura de copa WRI/Meta](https://registry.opendata.aws/dataforgood-fb-forests/)
