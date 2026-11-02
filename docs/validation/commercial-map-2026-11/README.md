# Evidências locais do mapa — 2 de novembro de 2026

Comparação entre a revisão `736b8d426c9e3f4d83ef0321302a0b20621e4183` e o build integrado desta alteração, incluindo arquitetura, paisagem e estruturas permanentes. Os ensaios usaram a saída de produção e dados locais interceptados, com edição fictícia e nenhum espaço comercial persistido. Eles não atestam dados, permissões ou latência do serviço real. Os arquivos JSON comprimidos nesta pasta contêm as amostras brutas, condições e diagnósticos do laboratório; não contêm sessão real ou dados pessoais comerciais.

## Navegação

Chrome 156 em macOS, Apple M5, 16 GiB, renderer identificado `ANGLE Metal Renderer: Apple M5`, DPR 1, canvas de 1200 × 600 CSS pixels. O roteiro aplica a mesma pose inicial, alterna órbitas e zoom por 30 segundos, três vezes por perfil, depois de carregar a cena. Os números abaixo são intervalos entre frames ativos, não tempo de GPU nem latência de entrada. A cadência próxima de 60 Hz está limitada pela apresentação e não comprova custo gráfico nulo.

| Perfil      | p95 antes (ms)     | p95 depois (ms)    | p99 antes/depois (ms) | Pico de draw calls antes/depois | Pico de triângulos antes/depois |
| ----------- | ------------------ | ------------------ | --------------------- | ------------------------------- | ------------------------------- |
| Leve        | 16,7 / 16,8 / 16,7 | 16,7 / 16,7 / 16,8 | 16,8 / 16,8           | 128 / 141                       | 83.511 / 94.717                 |
| Equilibrado | 16,8 / 16,8 / 16,7 | 16,7 / 16,7 / 16,7 | 16,8 / 16,8           | 128 / 141                       | 83.511 / 94.765                 |

Nenhuma rodada registrou intervalo acima de 200 ms. O pico passou de dez para onze texturas e de 10.354.802 para 11.272.306 bytes estimados; isso não é uma medição de VRAM. O p95 da duração de submissão na CPU variou de 1,7–1,8 ms antes a 2,1–2,2 ms depois. O aumento observado de 13 draw calls e até 11.254 triângulos acompanha a ampliação da cena; estes dados não demonstram que não exista impacto em outro hardware. O roteiro usa a mesma câmera comercial para comparação, portanto não mede o custo da Arena ou do setor rural quando vistos de perto, embora a camada esteja carregada.

## Abertura

Três pares alternados antes/depois por viewport, DPR 1. As medidas representam a observação automatizada de uma representação utilizável e do 3D pronto. A execução usa interceptação Playwright, que desabilita o cache HTTP; “retorno” é reentrada no módulo na mesma página, não carregamento HTTP com cache quente. Os números em milissegundos são mediana e intervalo observado; `openings-paired.json.gz` contém todas as seis execuções, inclusive marcas, tarefas longas e recursos locais.

| Viewport          | 3D pronto na abertura antes | 3D pronto na abertura depois | 3D pronto no retorno antes | 3D pronto no retorno depois |
| ----------------- | --------------------------- | ---------------------------- | -------------------------- | --------------------------- |
| 1366 × 768        | 861 (859–866)               | 860 (860–2179)               | 166 (163–1367)             | 1367 (262–1376)             |
| 390 × 844 emulado | 840 (837–845)               | 847 (829–848)                | 1471 (1448–1581)           | 1476 (1470–1480)            |

O preparo de programas essenciais teve mediana de 30 ms antes e 32 ms depois no desktop e de 31 para 32 ms no viewport móvel emulado. Uma abertura desktop posterior levou 2.179 ms, incluindo 1.166 ms aguardando a preparação assíncrona de programas; o retorno desktop também foi variável. O ensaio não identifica a causa desse pico nem permite descartá-lo. Uma série anterior, sem alternância, havia mostrado medianas de 845→1.036 ms e 839→1.124 ms; ela está preservada em `openings-before-clean.json.gz` e `openings-after-definitive.json.gz` como medição intermediária. A diferença não se repetiu nas medianas da série alternada, mas as três amostras e a variabilidade impedem concluir que não exista regressão. A transferência local até a observação do 3D foi aproximadamente 515.172→522.140 bytes nas rodadas alternadas; não equivale ao custo completo do contexto posterior. O ensaio não mede cache HTTP quente real, telefone físico, consumo de bateria, GPU de entrada, P95/P99 de navegação em viewport móvel ou tempo de GPU. Não houve três jornadas pareadas de seleção/ficha em equipamento limitado; as metas de 30 FPS e seleção até 100 ms permanecem sem certificação nessas condições.

Uma revisão manual em viewport horizontal menor motivou ajuste do cabeçalho compacto antes do build cronometrado. O teste visual foi feito na prévia autenticada em uma janela emulada, não em aparelho físico.

## Capturas comparáveis

As imagens usam a mesma câmera, perfil Equilibrado, canvas 1200 × 600 e dados locais. Os JSONs `captures-*.json.gz` registram posição, alvo e a confirmação da pose; as duas versões coincidem nos cinco pares abaixo. As aproximações não substituem uma vistoria física, uma comparação autenticada com a FENASOJA nem vistas de todos os edifícios.

| Vista        | Antes                                         | Depois                                                   |
| ------------ | --------------------------------------------- | -------------------------------------------------------- |
| Geral        | [antes](before-daylight-profile-balanced.png) | [depois](after-definitive-daylight-profile-balanced.png) |
| P1, ângulo A | [antes](before-daylight-roof-P1-a.png)        | [depois](after-definitive-daylight-roof-P1-a.png)        |
| P1, ângulo B | [antes](before-daylight-roof-P1-b.png)        | [depois](after-definitive-daylight-roof-P1-b.png)        |
| P8, ângulo A | [antes](before-daylight-roof-P8-a.png)        | [depois](after-definitive-daylight-roof-P8-a.png)        |
| P8, ângulo B | [antes](before-daylight-roof-P8-b.png)        | [depois](after-definitive-daylight-roof-P8-b.png)        |

O laboratório também buscou e enquadrou [Arena](landmark-arena.png), [Pavilhão 9](landmark-p9.png) e [Pavilhão 5](landmark-p5.png), verificando o alvo da câmera e ausência de falha reportada da camada permanente. Essas três imagens são somente do resultado e não são comparações pareadas. A ligação construída entre Arena e praça e as conexões rurais continuam sendo aproximações de apresentação; não constituem levantamento de implantação ou largura.

Na mesma pose da Arena, a [captura intermediária anterior ao ajuste da chapa](arena-before-roof-relief.png) pode ser comparada à [captura final](landmark-arena.png): o multiplicador de normal e o relevo de fallback foram reduzidos para conter faixas escuras e reduzir o risco de cintilação, mantendo a mesma textura compartilhada. A praça foi acrescentada entre as duas capturas; elas isolam a comparação da cobertura apenas visualmente, não o restante da cena.

Para reproduzir, execute o build de produção, sirva-o com `scripts/serve-commercial-map-build.mjs` e use `scripts/commercial-map-realism-validation.mjs` com `MAP_REALISM_BENCH_ONLY=1`, `MAP_REALISM_OPENINGS_ONLY=1`, `MAP_REALISM_LIGHTING_ONLY=1` ou `MAP_REALISM_LANDMARKS_ONLY=1`, conforme o caso. O próprio harness registra a identidade do renderer: solicitar GPU não garante que ela tenha sido usada. `MAP_REALISM_REFERENCE` reaplica as poses do relatório anterior.
