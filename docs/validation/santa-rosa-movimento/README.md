# Santa Rosa vista do parque em movimento

O percurso começa na avenida, passa pelos pavilhões, sobe sobre a divisa, abre em direção à Arena e volta pelo mesmo arco. O parque continua delimitando o alvo de navegação. As duas versões foram gravadas a partir das mesmas coordenadas, com a iluminação Quente. [Percurso contínuo, antes à esquerda e depois à direita](percurso.mp4)

| Vista | Referência para acompanhar | Antes | Depois |
| --- | --- | --- | --- |
| Avenida | Topo das torres no rumo da cidade | [Abrir avenida](avenida-antes.webp) | [Abrir avenida](avenida-depois.webp) |
| Pavilhões | Quadras e corredor de vegetação atrás das coberturas | [Abrir pavilhões](pavilhoes-antes.webp) | [Abrir pavilhões](pavilhoes-depois.webp) |
| Arena | Copas, telhados, caminhos e talhões no rumo rural | [Abrir Arena](arena-antes.webp) | [Abrir Arena](arena-depois.webp) |
| Divisa | Saída da Tuparendi, rótula e cruzamento seguinte | [Abrir divisa](divisa-antes.webp) | [Abrir divisa](divisa-depois.webp) |

Os arquivos individuais conservam os 1464 × 897 pixels do buffer. O vídeo reduz as duas vistas na mesma proporção para facilitar a comparação. A referência principal é o código de `04db129`, integrado em `main` por `ee0fe02`. A PR 27 antecede o primeiro horizonte geográfico. [Comparação histórica](../santa-rosa/validacao-mapa.md)

## O que mudou durante o percurso

- **Rua.** Os 33 eixos OSM aceitos passaram por 552 seções de conferência na banda pancromática CBERS. A nova janela de 1,28 km preserva a cor do solo, os contornos de cobertura e os vazios do dossel. No fim da Tuparendi, a máscara deixava gramado depois do asfalto modelado. O recorte agora segue a continuidade observada da via. [Registro, escala projetada e limites da fonte](divisa.md)
- **Telhados e copas.** Um cartão vertical perdia quase toda a área quando a câmera via a casa de lado. Uma malha compartilhada passou a ligar paredes e telhados aos contornos e alturas disponíveis. O dossel segue a altura medida e conserva aberturas entre grupos. Os dois perfis usam as mesmas coordenadas e um único desenho para toda a ocupação. [Da fonte às vistas frontal, lateral e superior](cobertura-e-dossel.webp)
- **Cidade.** A filtragem da máscara projetava o terreno do parque sobre a cidade em ângulos rasantes. A máscara tem suporte geográfico explícito. As 453 torres modeladas entre 1,5 e 4 km foram retiradas das duas panorâmicas e usam profundidade própria. Desligar o plano local passou a alterar zero pixels na faixa de controle nas cinco alturas entre 24 e 72 m, em Natural. [Isolamento das camadas](isolamento-horizonte.webp) · [Medidas da torre](isolamento-horizonte.json)
- **Órbita.** No teste de pressão induzida, o perfil Automático trocava o buffer de 1318 × 703 para 1186 × 632 e descartava o entorno detalhado. A mudança de orçamento de pixels agora conserva os materiais carregados. O detalhe pronto espera o fim do gesto e a primeira camada compacta pode aparecer assim que estiver disponível. A redução de resolução continua imediata em rasterização por software ou travamento severo do hardware. [Estados observados durante o giro](medicoes.json)

## Desempenho

Cada célula mostra **antes → depois**. Chrome 157, Apple M5, ANGLE/Metal, escala de dispositivo 1, servidor de produção local e dados comerciais de teste. O celular foi emulado com viewport de 390 × 844 e buffer de 390 × 689 no mesmo computador.

| Perfil | Cache HTTP | Primeiro quadro (ms) | Entorno final (ms) | Transferência (MB) | Pico estimado de texturas (MiB) | Quadro p95 (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Desktop detalhado | frio | 832 → 834 | 2484 → 2271 | 7,289 → 4,922 | 174,3 → 138,8 | 16,7 → 16,7 |
| Desktop detalhado | quente | 770 → 771 | 2371 → 2188 | 0,016 → 0,016 | 174,3 → 138,8 | 16,7 → 16,7 |
| Celular emulado | frio | 813 → 817 | 1317 → 1325 | 2,564 → 2,508 | 28,8 → 24,7 | 16,7 → 16,7 |
| Celular emulado | quente | 769 → 769 | 1289 → 1278 | 0,016 → 0,016 | 28,8 → 24,7 | 16,7 → 16,7 |

O primeiro quadro útil é a apresentação que habilita os controles. O roteiro arrasta a câmera enquanto o entorno ainda está pendente. O tempo final termina no primeiro desenho do nível solicitado. Os bytes somam as transferências dos recursos da aplicação na mesma origem durante a abertura. No cache quente, a paisagem teve zero bytes de transferência. O pico estima as texturas da cena e a sobreposição dos níveis durante o upload. O p95 usa intervalos entre quadros submetidos ao longo de uma passagem de 11,4 s por perfil e cache, com a gravação de vídeo em uma passagem separada. Os tempos representam esta execução local. [Condições, poses, estados e recursos por arquivo](medicoes.json)

O móvel físico e o reconhecimento por moradores continuam por verificar. Ruas estreitas sob copas, caminhos rurais e telhados recentes que divergem entre as datas das fontes ainda dependem de ortofoto mais recente e com licença de redistribuição. Os materiais de fachada representam construções de Santa Rosa, e suas alturas e acabamentos são estimativas. [Fontes e atribuições](../../../public/landscape/santa-rosa/creditos.txt)

## Repetir a comparação

Compile as duas revisões com a configuração pública do projeto. Use o adaptador e o roteiro desta PR para os dois builds. Em um terminal por build, sirva o respectivo diretório de saída. Em outro, execute o percurso com a porta e a fase correspondentes. O roteiro usa a autenticação e o inventário de teste da fixture.

```sh
MAP_HTTP_CACHE=1 node scripts/serve-commercial-map-build.mjs 4313 /caminho/antes/.output
MAP_HTTP_CACHE=1 node scripts/serve-commercial-map-build.mjs 4317 /caminho/depois/.output
```

```sh
MAP_BASE_URL=http://127.0.0.1:4313 MAP_LANDSCAPE_PHASE=before MAP_LANDSCAPE_TASK=journey node scripts/commercial-map-landscape-validation.mjs
MAP_BASE_URL=http://127.0.0.1:4317 MAP_LANDSCAPE_PHASE=after MAP_LANDSCAPE_TASK=journey node scripts/commercial-map-landscape-validation.mjs
```

Para reproduzir a pressão induzida de 41 ms por quadro, use `MAP_LANDSCAPE_TASK=pressure` nas mesmas portas. A execução grava os estados em `pressure.json`, fora da medição do p95 do percurso.
