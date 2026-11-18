# Como a paisagem chega a /mapa

Na vista oblíqua, a maquete cobre a imagem no perímetro físico dos lotes, vias, bosque, equipamentos e casas modeladas. Fora desse contorno, os primeiros quilômetros usam o modelo de superfície Copernicus. A malha de 104 × 104 células concentra amostras perto do parque. O desnível passa gradualmente do piso horizontal da maquete às cotas medidas ao longo de cerca de 105 m de terreno exterior. A imagem se fixa ao ponto do terreno na projeção azimutal equidistante do parque.

Até 1,5 km, telhados, paredes e copas ocupam uma malha indexada em coordenadas de mundo. Cada parede compartilha os limites da cobertura e as fundações alcançam o triângulo de terreno local. A altura do dossel delimita os grupos de copas. A opacidade e a posição dessas superfícies se conservam durante a órbita. As formas das construções e a paleta dos telhados vêm das observações locais. A inclinação de uma cobertura e os acabamentos das fachadas são ilustrativos.

No teste de origem, a casa em 27,847071° S, 54,473890° O ocupa um contorno de 8,71 × 14,91 m. No commit `04db129`, uma imagem de 50 × 20 pixels condensava a cobertura e a fachada a 7° de inclinação sobre um plano radial. O ângulo da câmera podia reduzir sua dimensão aparente a uma linha. Na vista superior o shader a apagava, expondo a ortofoto de 2 m/px no detalhado e 8 m/px no compacto. Hoje, as duas águas e as paredes da casa se encontram nas mesmas arestas, e o telhado amostra o mesmo albedo registrado do solo. O processamento desconta da altura estimada a parte já presente no DSM. O material fotográfico das paredes é representativo. No imóvel em 27,847370° S, 54,474975° O, a sobreposição das datas ainda dá um tom esverdeado à cobertura.

No setor rural, o agrupamento em 27,839826° S, 54,482633° O ocupava 72 × 19 pixels no atlas detalhado. A geração percorria o dossel ao longo da linha de visada e guardava um único perfil. Agora, o gerador conserva a altura e os contornos de ocupação das células WRI/Meta de 2 m, exclui os telhados observados e reduz a triangulação segundo a distância ao parque. Pequenos agrupamentos isolados recebem um fuste ilustrativo sob o seu máximo local. A poda, a espécie e a forma de cada árvore individual exigem observações de campo mais recentes.

A figura de inspeção decodifica os arquivos distribuídos. As três projeções centrais isolam a geometria com cor plana. As duas colunas finais mostram recortes das capturas reais de 1464 × 897 pixels, nas mesmas coordenadas da tela e com a iluminação Quente. [Origem, atlas anterior, malha e percurso](../santa-rosa-movimento/cobertura-e-dossel.webp)

A mesma malha inclui 453 construções mais altas entre 1,5 e 4 km. O gerador usa o contorno e a altura estimada para representar cada edifício com paredes e cobertura. Retira essas fachadas da imagem panorâmica. Quando a câmera cruza a faixa de 40 a 48 m, o teste de profundidade continua a projetar uma única torre. O modelo de superfície conserva as cotas até 4,096 km. A névoa e a iluminação dos dois modos se aplicam à distância de cada feição.

O albedo da divisa ocupa uma janela de 1,28 km. Os mosaicos maiores se encontram entre 1,45 e 1,99 km e entre 3,45 e 3,98 km do centro. A partir de 1,35 km, o relevo combina a imagem aérea com os panoramas de encostas e ocupação baixa. Estes usam azimute verdadeiro, elevações de −16° a +8° e linhas de visada até 25 km. Cada projeção, a 16 ou 72 m, guarda a profundidade da primeira superfície em cada direção. Nos texels transparentes do céu, a profundidade continua a da crista daquela coluna. Isso mantém a referência da borda ao reprojetar.

O plano horizontal do parque termina na moldura geográfica da máscara. No ensaio da avenida a 24 m de altura, ocultar apenas esse plano na versão anterior mudava 7.917 dos 52.800 pixels da faixa urbana (diferença acima de oito níveis em algum canal). Depois, esse valor foi zero nas cinco alturas testadas. O topo do prédio em 27,864323° S, 54,467276° O conservou os mesmos valores ao forçar cada panorama e ao desligar a reprojeção. [Recortes na escala nativa](../santa-rosa-movimento/isolamento-horizonte.webp) · [Medidas e coordenadas](../santa-rosa-movimento/isolamento-horizonte.json)

## Regenerar o recorte e as imagens de ocupação

Na raiz do repositório, ative o ambiente Python indicado no [procedimento geográfico](../../commercial-map-santa-rosa.md) e instale as dependências JavaScript do projeto. Gere primeiro os insumos e os mosaicos de verão com o pipeline geográfico. Use a mesma pasta de cache em todos os comandos Python.

```sh
PYTHON=python3 node scripts/build-commercial-landscape-mask.mjs
python3 scripts/santa-rosa/frontage.py --cache /caminho/para/cache
python3 scripts/santa-rosa/settlement.py --cache /caminho/para/cache
python3 scripts/santa-rosa/check_settlement.py --cache /caminho/para/cache --captures artifacts.local/santa-rosa-movimento docs/validation/santa-rosa-movimento/cobertura-e-dossel.webp
```

A máscara registra o peso do solo modelado no canal vermelho, a transição altimétrica no verde e o contato com a via no azul. A mistura do solo usa cerca de 4,4 m para o asfalto e 8,8 m para as bordas vegetadas.

O gerador de ocupação grava vértices, índices e materiais em `settlement.bin`, com coordenadas em oitavos de metro. São 4.222 construções e 827 conjuntos de vegetação em um desenho indexado, com 82.987 vértices, 121.491 triângulos e 2.287.762 bytes de atributos e índices. O arquivo comprimido tem 596.819 bytes. Os atlas de material medem 128 × 256 no compacto e 256 × 512 no detalhado. Medem 5.340 e 13.880 bytes em disco e substituem os atlas de figuras de 512.008 e 1.795.418 bytes da referência. O desenho se mantém nas duas resoluções. Para reproduzir a textura de fachadas e folhagens a partir da fotografia original, execute `python3 scripts/santa-rosa/facades.py /caminho/para/foto-original.jpg`. [Atribuições e licenças](../../../public/landscape/santa-rosa/creditos.txt)

## Carregamento e inspeção

O primeiro quadro comercial válido dispara o carregamento compacto. A sessão envia uma textura à GPU por vez e prepara os programas antes de exibir o conjunto. O detalhe depende do perfil, da largura efetiva do buffer, da memória informada pelo dispositivo e da dimensão máxima de textura. A geometria e as texturas compactas começam a carregar em paralelo. O detalhe pronto espera o fim do gesto para substituir o compacto. Uma mudança isolada de resolução de tela conserva o nível de paisagem já carregado. A saída cancela requisições e libera texturas, materiais, índices e buffers da sessão.

Em `/mapa?mapDiagnostics=1`, `window.__indumoveisMap.landscape` informa o nível pedido e o apresentado, o instante da apresentação compacta e final, a soma dos corpos dos arquivos lidos, a estimativa de armazenamento das texturas RGBA8 com mipmaps e seu pico na troca, além da contagem e dos bytes dos registros de ocupação. O benchmark registra os valores de transferência medidos pelo navegador separadamente. [Medições atuais e comparativos](../santa-rosa-movimento/README.md)

Com um build de produção servido em cada porta, o ensaio abaixo desliga uma camada por vez exclusivamente no navegador de teste. A câmera sobe por 24, 40, 44, 48 e 72 m. Ele grava o mosaico, os dois panoramas, o relevo, as fachadas e a composição com e sem a névoa de solo. A dispersão atmosférica presente na imagem geográfica já foi aplicada na geração. O comparativo verifica o corpo da torre e a faixa do horizonte nas duas versões.

```sh
MAP_BASE_URL=http://127.0.0.1:4311 MAP_ARTIFACT_DIR=artifacts.local/horizonte-antes node scripts/commercial-map-horizon-isolation.mjs
MAP_BASE_URL=http://127.0.0.1:4315 MAP_ARTIFACT_DIR=artifacts.local/horizonte-depois node scripts/commercial-map-horizon-isolation.mjs
python3 scripts/santa-rosa/check_horizon.py artifacts.local/horizonte-antes artifacts.local/horizonte-depois artifacts.local/horizonte-comparado
```
