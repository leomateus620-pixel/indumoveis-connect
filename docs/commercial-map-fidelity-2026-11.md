# Mapa comercial — fidelidade territorial: medições e limites (11/2026)

Acompanha a [matriz de correção](commercial-map-correction-matrix.md). Os números abaixo vêm de `scripts/commercial-map-fidelity-validation.mjs`; os resumos estão em [`validation/commercial-map-fidelity/before.json`](validation/commercial-map-fidelity/before.json) e [`after.json`](validation/commercial-map-fidelity/after.json).

## Condições de medição

| Item | Valor |
|---|---|
| Linha de base | `main` em `c73b98a` |
| Máquina | VM Linux, Intel Xeon, 4 núcleos lógicos, 16 GiB, **sem GPU** |
| Navegador | Chrome 156 headless, WebGL 2 por **SwiftShader** (rasterização por software) |
| Aplicação | servidor de desenvolvimento Vite em `127.0.0.1:3000`, rota `/mapa?mapDiagnostics=1`, dados interceptados (sem login nem escrita no banco) |
| Layouts | desktop 1366×768 e mobile 390×844, DPR 1 |
| Capturas | 22 poses fixas por layout, perfil "Detalhado", mesmas poses antes e depois |
| Navegação | perfil automático do produto (neste host cai em "Leve"); 50 passos de arrasto, 50 de órbita, 14 passos de roda; uma execução por fase |

Uma execução por fase não permite separar diferenças pequenas do ruído. Os valores servem para detectar regressões grandes, não para comparar milissegundos.

## Metas de fluidez: o que foi e o que não foi verificado

As metas pedidas são 60 FPS em desktop, 30 FPS ou mais em mobile e resposta em até 100 ms.

- **Resposta à seleção (clique no lote até o quadro seguinte): verificada.** 41 ms → 25 ms no desktop e 18 ms → 18 ms no mobile, dentro do limite de 100 ms mesmo com rasterização por software.
- **Taxa de quadros: não verificada.** Este ambiente não tem GPU. Com SwiftShader, o intervalo mediano entre quadros na visão geral foi de 217 ms no desktop e 117 ms no mobile, antes e depois, ou seja, cerca de 5 e 9 quadros por segundo. Esses números medem o rasterizador por software, não o produto em um aparelho real. As metas de 60 e 30 FPS precisam ser medidas em hardware com GPU (o mesmo roteiro aceita `MAP_BROWSER_GPU=hardware`) antes de qualquer afirmação.
- **Recuperação de nitidez após o gesto: não ocorreu neste host, antes nem depois.** Três segundos após a interação, a resolução adaptativa continuava em 0,4. O comportamento não foi alterado nesta revisão e deve ser reavaliado em hardware com GPU.

O que se pode afirmar é que o custo de cena não cresceu de forma relevante:

| Medida (perfil automático) | Desktop antes | Desktop depois | Mobile antes | Mobile depois |
|---|---|---|---|---|
| Chamadas de desenho, visão geral | 153 | 155 | 154 | 156 |
| Triângulos, visão geral | 247 361 | 252 202 | 245 454 | 249 910 |
| Tempo até mapa utilizável | 3 597 ms | 3 250 ms | 2 566 ms | 2 573 ms |
| Tempo até cena completa | 5 903 ms | 5 321 ms | 4 594 ms | 4 623 ms |
| Intervalo entre quadros, arrasto (p50 / p95) | 217 / 450 ms | 217 / 467 ms | 117 / 267 ms | 117 / 283 ms |
| Intervalo entre quadros, órbita (p50 / p95) | 167 / 433 ms | 183 / 517 ms | 100 / 300 ms | 117 / 283 ms |
| Intervalo entre quadros, roda (p50 / p95) | 33 / 116 ms | 33 / 167 ms | 17 / 33 ms | 17 / 67 ms |
| Resposta à seleção | 41 ms | 25 ms | 18 ms | 18 ms |
| Tarefa longa máxima na carga | 1 123 ms | 945 ms | 811 ms | 768 ms |

A cena ganhou cerca de 2 % de triângulos (arquitetura dos dois edifícios cívicos e jardim) e duas chamadas de desenho (mural/placa e jardim do Centro Administrativo). A carga ainda tem tarefas longas próximas de 1 s na thread principal neste host; isso já existia e não foi tratado aqui.

## Números de lote

Órbita completa de 360° em passos de 10° sobre as quadras (57 lotes):

| Medida | Desktop | Mobile |
|---|---|---|
| Linhas de base distintas por lote | 1 | 1 |
| Orientações distintas por lote | 2 (180° entre si) | 2 |
| Inversões por lote na volta completa | 1 a 2 | 0 a 2 |

Antes, o eixo do número era o vetor "direita" da câmera, então a orientação variava continuamente com o azimute; o renderizador anterior não expõe o eixo, por isso não há número medido para a linha de base.

Consequência assumida da orientação fixa: vistas de lado (perto de 90° da linha de base) mostram os números inclinados na tela, como em uma planta impressa girada. A inversão só acontece além de 105°, com histerese. Números vistos quase ao longo da própria linha de base, ou achatados pela perspectiva abaixo de cerca de 7 px, deixam de ser desenhados.

Exibição progressiva nas capturas (números visíveis / altura do texto em px):

| Pose | Desktop antes | Desktop depois | Mobile antes | Mobile depois |
|---|---|---|---|---|
| Visão geral superior | 2 (8–11) | 0 | 4 (8–11) | 2 (8) |
| Quadras oblíquas | 56 (9–17) | 56 (9–17) | 24 (9–14) | 24 (9–14) |
| Quadras de perto | 16 (8–19) | 16 (8–19) | 4 (8–16) | 4 (8–16) |
| Quadras em ângulo rasante | 20 (5–25) | 18 (8–17) | 8 (7–19) | 7 (11–16) |

## Registro territorial

Referência de leitura: mosaico Esri World Imagery (zoom 18) da área do parque, reamostrado para as coordenadas da planta pela mesma projeção usada para o OpenStreetMap. O pedido citava o Google Earth; foi usada esta imagem aérea equivalente, que pôde ser reprojetada de forma reproduzível. A imagem não está no repositório nem no produto.

Transformação aplicada: translação rígida de (+4,3; +0,5) unidades na âncora do entorno, sem escala nem rotação. Resíduos dos pontos de controle depois da translação:

| Ponto de controle | Resíduo (unidades) | Resíduo (m) |
|---|---|---|
| Cobertura do pavilhão 14 | 0,14 | 0,3 |
| Cobertura do pavilhão 12 | 0,51 | 1,1 |
| Centro Administrativo | 0,22 | 0,5 |
| Centro de Eventos | 0,49 | 1,1 |
| Pórtico do portão principal | 1,60 | 3,5 |

Os quatro telhados ficam dentro da tolerância declarada de 1 unidade. O pórtico fica fora dela: é uma estrutura fina sob copas de árvores e sua posição na planta vem do desenho A2. Não foi forçado a coincidir, porque isso exigiria deformar o cadastro. As leituras são visuais, com incerteza da ordem de 1 unidade; isto é um registro de apresentação, não um levantamento topográfico.

## Aproximações

- **Quadras residenciais:** posição, tamanho, cor de cobertura e ocupação do lote foram lidos da imagem aérea; alturas, número de pavimentos, tipologias e fachadas são interpretação. Piscinas e árvores são indicativas.
- **Centro Administrativo:** proporções, cores, faixas de janelas, marquise, escada e anexos seguem as fotografias; o mural é uma recomposição abstrata das cores e formas, não uma reprodução da obra. O mural e a placa só aparecem quando o navegador oferece canvas 2D.
- **Centro de Eventos:** a cobertura de quatro águas com lanternim e a empena de entrada seguem a imagem aérea; inclinações e alturas são estimadas. O beiral projeta cerca de 20 cm além do contorno registrado.
- **Avenida:** a seção transversal foi lida da imagem; a quantidade de vagas pintadas é proporcional, não uma contagem.
- **Lotes 69 e 70:** saem da apresentação comercial. Como não existe vínculo persistido entre espaços do banco e geometrias do mapa, nenhum dado comercial deixa de ser exibido; registros do banco não foram alterados.
- **Grama:** o tom único foi ajustado comparando pixels do parque e do terreno aberto na captura de visão geral. Canteiro do parque antes: RGB (97, 143, 69); depois: (116, 152, 92). Terreno aberto, igual nas duas fases: (116, 155, 92).

## Como reproduzir

```bash
MAP_BROWSER_GPU=software MAP_BASE_URL=http://127.0.0.1:3000 MAP_FIDELITY_PHASE=after \
  node scripts/commercial-map-fidelity-validation.mjs
```

`MAP_FIDELITY_ONLY=pose1,pose2` restringe as poses, `MAP_FIDELITY_LAYOUT=desktop|mobile` o layout e `MAP_FIDELITY_SKIP_BENCH=1` dispensa a amostragem de navegação. As imagens ficam em `artifacts.local/commercial-map-fidelity/<fase>/` e não são versionadas.

## Verificação automática

`bun run test`: 90 arquivos, 612 testes aprovados. `bunx tsc --noEmit -p .` sem erros. `bun run lint` falha com 1 764 problemas (1 752 erros, 12 avisos), o mesmo total de `main`: nenhum está nos arquivos alterados nesta revisão, que passam isoladamente.
