# Santa Rosa vista do parque

O ponto de observação fica nas quadras centrais do Parque de Exposições, em **27,8450421° S, 54,4785109° O**. A oeste e noroeste encontram-se glebas agrícolas e faixas arborizadas. Olhando para sul e sudeste, a malha residencial ocupa o primeiro plano exterior. Os prédios mais altos pertencem a grupos localizados dentro dessa malha. O recorte óptico foi preparado com imagens de verão separadas por 13 dias, com talhões verdes e trechos de terra exposta na mesma composição. [Vistas e percurso atuais](validation/santa-rosa-movimento/README.md) · [Integração do solo, das construções e do horizonte](validation/santa-rosa/integracao.md) · [Créditos e licenças distribuídos](../public/landscape/santa-rosa/creditos.txt)

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

A banda pancromática de 2 m do **CBERS-4A/WPM, 12/02/2024**, resolve a geometria das vias e telhados. Os canais RGB da aquisição **Sentinel-2B de 30/01/2024**, tile 21JYK, fornecem a cor ortorretificada e a camada regional. O uso da banda monocromática original elimina as franjas vermelhas e cianas que aparecem em alguns telhados no produto PCA fusionado. A transferência de contraste mantém a luminância visível da vegetação junto ao detalhe espacial da PAN, cujo sensor alcança o infravermelho próximo. O navegador recebe quatro janelas quadradas, centradas no mesmo ponto e orientadas ao norte. [CBERS L4](https://data.inpe.br/bdc/stac/v1/collections/CB4A-WPM-L4-DN-1/items/CBERS_4A_WPM_20240212_211_148_L4) · [Sentinel L2A](https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2B_21JYK_20240130_0_L2A)

| Janela | Extensão | Detalhada | Compacta |
| --- | --- | --- | --- |
| Divisa | 1,28 × 1,28 km | 1024² · 1,25 m/px | 512² · 2,5 m/px |
| Imediata | 4,096 × 4,096 km | 2048² · 2 m/px | 512² · 8 m/px |
| Intermediária | 8,192 × 8,192 km | 2048² · 4 m/px | 512² · 16 m/px |
| Regional | 50 × 50 km | 1024² · 48,8 m/px | 512² · 97,7 m/px |

Na janela da divisa, a classificação WorldCover delimita onde a superfície recebe textura de capim, lavoura ou solo exposto. O processamento exclui vias, telhados e copas e guarda o peso do material no canal alfa da mesma imagem. Nos talhões com direção distinguível na pancromática, a textura acompanha essa direção. O espaçamento entre passadas e a granulação abaixo da resolução do sensor são ilustrativos. O renderizador reduz o contraste desse detalhe à medida que cada pixel passa a cobrir mais terreno. [Comparação nas três câmeras dos anexos](validation/arq-design-santa-rosa/README.md)

O **Copernicus GLO-30**, DSM do acervo AWS da edição 2021 com observações TanDEM-X de 2011–2015, fornece a superfície regional, inclusive a contribuição de copas. Para as encostas próximas, uma grade de 512² amostras guarda a cota relativa à referência de 323 m sobre 8,192 km. Cada nível do PNG equivale a um metro e 128 é o nível do parque. A fonte de 30 m foi reamostrada para manter o mesmo registro da ortofoto. [Especificação e atribuição do Copernicus DEM](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM)

A produção do panorama usa os contornos observados da Microsoft e a presença e altura estimadas pelo **Open Buildings 2.5D de 2023**. O manifesto define a banda 2 como altura em metros e a banda 3 como confiança de presença. Dentro de cada contorno, seleciona-se o percentil 65 dos pixels com presença ≥0,6 e altura ≥2 m, exigindo pelo menos dois pixels válidos. A base de uma construção é estimada a partir do mínimo local suavizado do DSM. A superfície final é o máximo entre DSM e base acrescida da altura, evitando somar duas vezes um telhado já presente na superfície. O algoritmo calcula o ponto atingido pelo raio, o tom das faces segundo a normal e o véu atmosférico em função da distância. Alturas altas no Brasil carregam incerteza do modelo; os grupos de edifícios não receberam nomes de marcos individuais. [Footprints Microsoft](https://github.com/microsoft/GlobalMLBuildingFootprints) · [Open Buildings 2.5D, resolução e limitações](https://sites.research.google/gr/open-buildings/temporal/)

Nos arquivos **horizon-low** e **horizon-high**, a coluna inicial é o norte verdadeiro, a longitude cresce para leste e cada volta ocupa exatamente 360°. O topo está a +8° e a base a −16°. A faixa detalhada contém 8192 × 512 pixels e a compacta 2048 × 256. O céu fica transparente. A altura de 16 m corresponde a 7,3 unidades do mapa e a de 72 m a 32,7, cobrindo a posição baixa junto ao limite e as vistas oblíquas dos anexos. A diferença angular máxima entre as duas silhuetas excede um grau e a ordem de cristas expostas muda. Os PNGs de profundidade guardam, em escala logarítmica de 950 m a 25 km, a distância da primeira interseção para as duas alturas. O renderizador reprojeta a amostra pela profundidade quando o observador se move e seleciona a superfície visível. Na divisa e nas torres, paredes e coberturas compartilham a mesma geometria no mundo. As 453 construções entre 1,5 e 4 km com estimativas entre 12 e 120 m entram nessa malha. A cor e os detalhes de fachada usam material representativo de Santa Rosa. Os panoramas compõem os edifícios baixos e o relevo mais distante. [Teste de isolamento da torre e do plano local](validation/santa-rosa/integracao.md)

Na fotografia CBERS o Sol estava a 66,6° de azimute e 61,6° de elevação, e na Sentinel a 76,8° e 60,5°. Ambas iluminam do quadrante leste. A luz do parque vem de cerca de 106° a 45° de elevação. As sombras próximas do modelo 3D seguem essa luz; no terreno exterior o ajuste de exposição e contraste atenua a diferença angular e a textura conserva a iluminação registrada. WorldCover 2021 distingue áreas construídas, lavouras e cobertura arbórea para o estudo setorial. O Earth forneceu a conferência visual separada das imagens de produção. [WorldCover v200](https://doi.org/10.5281/zenodo.7254221)

## Regeneração

A geração usa Python e dependências geográficas fora do bundle do aplicativo. Os URLs completos das cenas, tiles e bandas estão em `scripts/santa-rosa/sources.py`. O acesso remoto ocorre ao preparar os arquivos; a rota solicita apenas os recursos locais. A primeira execução pode baixar centenas de MB de janelas e blocos de imagens. O cache identifica cada janela por fonte, bandas, projeção, resolução e reamostragem. Em 18/11/2026, as regenerações isoladas reproduziram byte a byte os 15 produtos de solo, relevo, profundidade e horizonte, os dois atlas de materiais e a malha de ocupação a partir das janelas geográficas em cache. [Dimensões, hashes e verificação da emenda norte](validation/santa-rosa/rasters.json)

```sh
python3 -m venv /tmp/indumoveis-santa-rosa-env
source /tmp/indumoveis-santa-rosa-env/bin/activate
pip install -r scripts/santa-rosa/requirements.txt
PYTHON=python3 node scripts/build-commercial-landscape-mask.mjs
python scripts/santa-rosa/build.py --cache /tmp/indumoveis-santa-rosa-dados
python scripts/santa-rosa/settlement.py --cache /tmp/indumoveis-santa-rosa-dados
python scripts/santa-rosa/review.py --cache /tmp/indumoveis-santa-rosa-dados
```

A geração chama a extração dos footprints de fevereiro de 2026 e valida o SHA-256 do tile da Microsoft. A máscara usa a geometria do parque e do entorno já modelado. A malha usa o modelo de altura de copa Meta/WRI e os contornos locais. No histórico de 17/11/2026, a versão `04db129` representava 3.753 construções e 1.421 grupos de copas por cartões radiais. A revisão de 18/11 passa a representar 3.769 construções próximas, 453 construções mais altas ao fundo e 827 componentes de dossel contínuo. A divisão anterior por máximos locais e a contagem atual por componentes conectados medem agregações diferentes. [Comparação da origem à tela](validation/santa-rosa-movimento/cobertura-e-dossel.webp) Os recortes fotográficos usados naquela revisão continuam disponíveis com sua atribuição original. [Foto de Loco085, CC BY-SA 3.0](https://commons.wikimedia.org/wiki/File:Santa_Rosa_-_RS_-_Panor%C3%A1mica_centro.jpg)

### Materiais do entorno de 20/11/2026

As fachadas representam quatro tipos de casa, oito famílias de edifícios mais altos e dois tipos de galpão. A largura e a altura observadas orientam a escolha. A altura da parede determina quantos andares aparecem entre o chão e o beiral. Em casas de planta quadrangular, a cobertura pode ter duas ou quatro águas. A cor de cada telhado combina a amostra aérea daquele imóvel com cerâmica, telha cinza, lâmina de zinco ou concreto. São acabamentos ilustrativos de arquitetura regional.

A primeira cena editável no Higgsfield contém 16 módulos em projeção ortográfica. O relevo das telhas e o recorte de quatro copas foram exportados da revisão 1. O acabamento de aparência fotográfica veio de uma prancha de 16 materiais gerada no Higgsfield com GPT Image 2.6, trabalho `276ed4d2-8030-4a1c-a346-75736f284814`. O mestre combinado está em `scripts/santa-rosa/materiais-higgsfield.webp`. Para refazê-lo com a prancha fotográfica e o render ortográfico RGBA de 1536 × 1536 da cena, use `python scripts/santa-rosa/materials.py --photo prancha.png --render render.png`. [Cena Higgsfield de arquitetura e vegetação](https://higgsfield.ai/3d-jutsu/26f8f2ad-8a7d-496b-9521-e1b40f01ed54)

A segunda cena modela os edifícios do centro. Na revisão 2, oito famílias diferem pelo embasamento, recuos, sacadas, brises, esquadrias e cobertura técnica. Predominam alvenaria cinza, concreto claro e vidro fumê. Duas famílias incluem uma faixa estreita de tom azul ou verde mineral. Representam 91 das 453 construções altas entre 1,5 e 4 km. As famílias se ajustam aos contornos, orientações e alturas disponíveis. O desenho individual é uma interpretação, com estudos de massa e acabamento baseados na galeria de uma construtora de Santa Rosa e em uma vista do centro. [Prancha das oito famílias](validation/santa-rosa/torres-higgsfield.webp) · [Cena editável das torres](https://higgsfield.ai/3d-jutsu/a82046ce-228f-43a8-91e3-6e8d2730da7b) · [Galeria de obras da Itamar Engenharia](https://www.itamarengenharia.com.br/galeriaDeObras.php) · [Panorâmica do centro por Loco085](https://commons.wikimedia.org/wiki/File:Santa_Rosa_-_RS_-_Panor%C3%A1mica_centro.jpg)

Para exportar os materiais das torres a partir do `.blend` da revisão 2, execute os comandos abaixo. O exportador mede as seções normalizadas dos edifícios e renderiza suas fachadas frontais e laterais. O empacotamento grava as seções em `torres-higgsfield.json` e as texturas em `torres-higgsfield.webp`. Esses dois arquivos já estão no repositório para as regenerações de rotina.

```sh
blender -b torres.blend -P scripts/santa-rosa/export_towers.py -- /tmp/indumoveis-torres-exportadas
python scripts/santa-rosa/materials.py --towers /tmp/indumoveis-torres-exportadas
```

A malha usa 2.132 volumes de copa recortados sobre células arborizadas do modelo WRI/Meta. Eles acompanham a cota e a abertura disponível em cada ponto. Os grupos de dossel distantes usam textura contínua. Fachadas, coberturas e copas integram uma única malha indexada, com 183.313 vértices, 191.570 triângulos e atlas de 256 × 256 ou 768 × 768 pixels. As 453 construções altas têm embasamento, corpo e coroamento volumétricos. Em 28 delas, com altura estimada de pelo menos 17 m e razão altura/distância de pelo menos 0,014, as lajes em balanço ou brises têm geometria própria. Os demais detalhes são pré-renderizados no atlas. Nas duas panorâmicas, os edifícios mais distantes recebem os mesmos materiais orientados pelo contorno, e a textura de mata se restringe às áreas arbóreas WorldCover. [Fontes e atribuições](../public/landscape/santa-rosa/creditos.txt)
