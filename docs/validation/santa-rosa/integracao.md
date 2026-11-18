# Como a paisagem chega a /mapa

Na vista oblíqua, a maquete cobre a imagem no perímetro físico dos lotes, vias, bosque, equipamentos e casas modeladas. Fora desse contorno, os primeiros quilômetros usam o modelo de superfície Copernicus. A malha de 104 × 104 células concentra amostras perto do parque. O desnível passa gradualmente do piso horizontal da maquete às cotas medidas ao longo de cerca de 105 m de terreno exterior. A imagem se fixa ao ponto do terreno na projeção azimutal equidistante do parque.

Até 1,5 km, o segundo plano tem imagens individuais de coberturas e copas. O atlas usa o contorno e a altura de cada feição, a cor da ortofoto e materiais fotográficos locais para as faces que o satélite observa de cima. Os imóveis baixos podem ter coberturas ilustradas em duas águas, orientadas pelo eixo longo do contorno. As paredes recebem amostras retificadas de fachadas de Santa Rosa em escala métrica. A inclinação do telhado e a distribuição de vãos são estimativas visuais. A copa de cada agrupamento resulta da projeção das alturas observadas, com sombreamento entre os lobos e textura de folhagem. Uma máscara exclui as feições sobrepostas à implantação modelada. Cada imagem fica na sua coordenada e cada base acompanha o triângulo de terreno que aparece na tela. Todas são desenhadas em um lote de instâncias com teste de profundidade.

Ao subir, a área projetada dos cartões diminui e a fotografia passa a mostrar os telhados e ruas em planta. No solo, a mistura de resoluções ocorre entre 1,45 e 1,99 km e entre 3,45 e 3,98 km do centro. A partir de 1,35 km, o renderizador compara a profundidade da primeira superfície registrada no panorama com a interseção do raio no terreno. Uma encosta próxima pode ocultar um prédio situado mais longe. Acima de 3,65 km, a composição distante assume o horizonte. Os raios de solo que ultrapassam o volume de recorte da câmera continuam no shader do céu até a borda da área estudada.

A panorâmica recortada usa o azimute verdadeiro no eixo horizontal. A faixa vertical vai de −16° a +8°. Cada texel guarda a distância horizontal à primeira superfície visível. O shader corrige a direção de amostragem pela posição e altura atuais da câmera em duas iterações. Predomina a projeção baixa até 40 m de altura e a alta acima de 48 m. Na faixa intermediária, ambas usam o mesmo raio físico ao interpolar. Acima dela aparece o céu da PR 27. Natural e Quente compartilham os recursos e usam os valores de luz, atmosfera e exposição já animados pelo mapa.

## Regenerar o recorte e as imagens de ocupação

Na raiz do repositório, ative o ambiente Python indicado no [procedimento geográfico](../../commercial-map-santa-rosa.md) e instale as dependências JavaScript do projeto. Gere primeiro os insumos e os mosaicos de verão com o pipeline geográfico. Use a mesma pasta de cache em todos os comandos Python.

```sh
PYTHON=python3 node scripts/build-commercial-landscape-mask.mjs
python3 scripts/santa-rosa/settlement.py --cache /caminho/para/cache
```

O primeiro comando lê as geometrias reais de circulação, edificações e vegetação exportadas pelos módulos TypeScript e grava a máscara PNG e a sua extensão XZ no módulo do mapa. O canal vermelho controla a transição do albedo ao longo de cerca de 22 m fora do último objeto modelado. O canal verde registra a transição altimétrica.

O segundo comando usa os contornos Microsoft, as alturas Open Buildings Temporal, o modelo de altura de dossel WRI/Meta, a superfície regional e o mosaico próximo. Ele grava o atlas nos dois níveis de resolução e a posição, as dimensões e a janela UV de cada figura em `settlement.bin`. Os pequenos materiais locais de fachada e folhagem acompanham o código. Para recriá-los a partir da fotografia original, execute `python3 scripts/santa-rosa/facades.py /caminho/para/foto-original.jpg`. O utilitário confere a identidade do arquivo antes do recorte. [Atribuições e licenças](../../../public/landscape/santa-rosa/creditos.txt)

## Carregamento e inspeção

O primeiro quadro comercial válido dispara o carregamento compacto. A sessão envia uma textura à GPU por vez e prepara os programas antes de exibir o conjunto. O detalhe depende do perfil, da largura efetiva do buffer, da memória informada pelo dispositivo e da dimensão máxima de textura. O nível compacto continua visível durante uma troca. A saída cancela requisições e libera texturas, materiais, índices e buffers da sessão.

Em `/mapa?mapDiagnostics=1`, `window.__indumoveisMap.landscape` informa o nível pedido e o apresentado, o instante da apresentação compacta e final, a soma dos corpos dos arquivos lidos, a estimativa de armazenamento das texturas RGBA8 com mipmaps e seu pico na troca, além da contagem e dos bytes dos registros de ocupação. O benchmark registra os valores de transferência medidos pelo navegador separadamente. [Medições e comparativos](validacao-mapa.md)
