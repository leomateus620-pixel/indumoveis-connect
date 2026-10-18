# Mapa comercial — terreno e navegação delimitada

Validação local de 17/10/2026. O baseline visual é o código aprovado em `8e2be3557225ef967d443b2fb4e73ef0269a5f11`, construído de um arquivo Git isolado. O comparativo final de desempenho usa `origin/main` em `0936587`, construído separadamente com as mesmas dependências e a mesma interface do build final; a implantação do mapa é idêntica entre esses baselines. Não houve alteração de dados no banco: autenticação e REST são interceptados pelo laboratório; somente fixtures locais, com mutações bloqueadas.

## Referências e diagnóstico

Os anexos foram identificados pelo conteúdo: `Captura de Tela 2026-10-17 às 19.25.31.png` mostra a implantação quase superior e a separação P1/P14; `Captura de Tela 2026-10-17 às 19.28.31.png` mostra a vista oblíqua afastada com a placa; `Captura de Tela 2026-10-17 às 19.27.33.png` mostra a interface superior e uma órbita longitudinal, também com a placa exposta. São referências visuais, sem novas coordenadas ou inventário cadastral.

- `data/territory.ts`: polígonos, identificadores, paisagismo, pavilhões e limites existentes. A unidade é esquemática, **10 pontos PDF**, não metro. O mundo usa `[x, 0, y]` da planta.
- `MapRenderer.tsx`: geometria da antiga placa retangular, cena Three, câmera perspectiva, um único OrbitControls, seleção por lista explícita de meshes, iluminação e ciclo de renderização sob demanda. Os pisos comerciais e o pavimento são separados da antiga placa.
- `pavement.ts` e `surfaceMaterials.ts`: pavimentação agrupada, texturas locais, luz incidente e perfis gráficos existentes. `architecture.ts` e `vegetation.ts` mantêm os volumes e o paisagismo aprovados.
- `navigation.ts`: enquadramento e parâmetros compartilhados de distância, inclinação e pan. A nova restrição é aplicada a gestos, comandos e amostras das animações, sem outro controlador.
- `terrain.ts`: camada de entorno, proteção dos pisos internos, material, textura e descarte. As coordenadas de textura são ancoradas no mundo.

A auditoria não encontrou código de gesto alterando posições, rotações ou escalas da implantação. A movimentação aparente vinha do alvo orbital com margem ampla e do afastamento dependente do foco anterior. A regressão agora registra matrizes de mundo do conjunto comercial antes/depois de órbita, pan e zoom; a fonte territorial também é comparada. Não se atribui à falta de solo uma alteração de geometria que não foi observada.

## Método e limites das medições

A máquina medida foi um Apple M5, macOS Darwin 25.6.0, 10 processadores lógicos, 16 GiB de memória, Chrome 155.0.8059.80 com ANGLE/SwiftShader. O runner [commercial-map-terrain-validation.mjs](../scripts/commercial-map-terrain-validation.mjs) usa o mesmo aparelho, executável Chromium, renderer, DPR CSS 1, viewports, dados e roteiro antes/depois. Renderização por **ANGLE/SwiftShader em software**, no Mac disponível; isso não comprova desempenho de uma GPU ou aparelho móvel físico. Viewports mobile e eventos de toque são emulação, quando usados. Fontes externas são bloqueadas, usando os fallbacks existentes.

As cinco comparações 3D reservam Canvas de **1200 × 600 px**, mantendo a altura natural da toolbar. A câmera e o alvo completos do baseline são reaplicados; o relatório registra `samePose` e falha se a posição for corrigida por limites diferentes. Há recortes geral, oblíquo baixo, perímetro, aproximação e afastamento equivalentes. Os extremos novos têm capturas próprias, porque os limites mudaram intencionalmente.

O comparativo final de navegação usa **três trechos de 15 s por perfil e por build**, com gestos contínuos, as mesmas poses iniciais e perfis Leve/Equilibrado. Os trechos de 1 s dentro da matriz funcional são somente smoke tests e não entram nas estatísticas de desempenho. Não é input-to-photon. Draw calls, triângulos e bytes estimados de texturas vêm do renderer e dos recursos alocados; não equivalem à memória total do processo ou da GPU. Aberturas frias usam contextos novos; reentradas quentes usam navegação SPA no mesmo contexto. Foram ampliadas de três para cinco amostras por viewport/estado após variação superior a 5%. O primeiro mapa útil pode ser o SVG de preparação; a prontidão do 3D é registrada separadamente. O tempo de ambiente pronto inclui agendamento e caminho da interface; preparação síncrona é uma medida separada quando instrumentada.

A verificação de reabertura compara contextos ativos e totais residentes após saídas/reentradas SPA. Um platô desses valores não é prova de ausência de todo vazamento de heap. O Mac físico disponível também foi exercitado com a GPU **Apple M5 via ANGLE Metal**, confirmada pelo próprio contexto: órbita, pan, zoom, seleção, presets, tela cheia, três reentradas e repouso sem loop. São comandos automatizados, sem ensaio manual de trackpad. Nenhum dispositivo Android/iPhone/Safari físico foi testado.

## Execução reproduzível

```sh
MAP_BASE_URL=http://127.0.0.1:4174 MAP_TERRAIN_PHASE=before node scripts/commercial-map-terrain-validation.mjs
MAP_BASE_URL=http://127.0.0.1:4175 MAP_TERRAIN_PHASE=after MAP_TERRAIN_REFERENCE=artifacts.local/commercial-map-terrain/before/terrain-validation.json node scripts/commercial-map-terrain-validation.mjs
MAP_BASE_URL=http://127.0.0.1:4175 MAP_TERRAIN_PHASE=after-openings MAP_TERRAIN_OPENINGS_ONLY=1 node scripts/commercial-map-terrain-validation.mjs
```

Os builds são servidos pelo adaptador local existente `scripts/serve-commercial-map-build.mjs`. A cópia do baseline e saídas intermediárias ficam em `artifacts.local/`, ignorado pelo Git. As primeiras iterações encontraram fissuras de rasterização em triângulos externos muito estreitos e um tom ciano indevido da iluminação ambiente global sobre materiais Lambert. Esses builds intermediários foram rejeitados na inspeção visual. A implementação final usa base contínua e aplica o ambiente filtrado somente às famílias de materiais apropriadas, mantendo os pisos e o paisagismo internos legíveis. A preparação dos mapas ricos ocorre depois do primeiro 3D utilizável, respeitando gestos ativos. Dois buffers CPU determinísticos de 1.310.720 bytes são reutilizados nas reentradas; cada renderer cria e descarta suas próprias texturas de GPU. Esse cache limitado é contabilizado separadamente da estimativa de texturas.

## Desempenho medido

O roteiro de navegação parte da mesma câmera geral, Canvas 1200×600, DPR 1 e posição de ponteiro; alterna órbita e roda. Os trechos foram medidos após o enriquecimento adiado dos mapas. A última alteração só antecipa a compilação dos mesmos programas antes do primeiro draw; o smoke do build final verifica a mesma assinatura de draws e recursos depois do preparo. Os relatórios brutos preservam o asset efetivamente executado em cada série. A tabela usa a mediana das três repetições de 15 s de cada perfil. As medições em software têm quantização perceptível no ritmo do display; não são convertidas em uma promessa de FPS em aparelhos físicos.

| Perfil      | Intervalo p50 antes → depois | Intervalo p95 antes → depois | Variação do p95 | Frames >200 ms |
| ----------- | ---------------------------: | ---------------------------: | --------------: | -------------: |
| Leve        |               16,7 → 33,3 ms |               33,3 → 33,4 ms |           +0,3% |          0 → 0 |
| Equilibrado |               33,3 → 33,3 ms |               33,4 → 33,4 ms |            0,0% |          0 → 0 |

O p95 ficou dentro da margem de 5% avaliada para a navegação. **O p50 do Leve piorou no renderer em software**; não se declara ganho de fluidez. O acréscimo de duas chamadas e 344 triângulos sustenta terreno, céu e sombra diurna com recursos compartilhados. O pipeline continua sob demanda: no Leve, o contador de frames permaneceu igual durante 350 ms de repouso após a preparação opcional. O sol e a contagem de preparações do ambiente também permaneceram iguais depois de presets e órbita.

| Recursos de pico do mesmo roteiro   |     Antes |    Depois |
| ----------------------------------- | --------: | --------: |
| Draw calls                          |        49 |        51 |
| Triângulos                          |    12.498 |    12.842 |
| Texturas                            |         8 |        10 |
| Bytes estimados de texturas e alvos | 5.253.806 | 9.983.322 |
| Cache CPU de pixels do entorno      |         0 | 1.310.720 |

Os mapas e o ambiente são preparados depois da primeira representação utilizável; o benchmark de navegação aguarda esse preparo. O cache CPU tem exatamente dois buffers e não cresce com gestos ou reaberturas. Sombras do enorme entorno, SSR, espelhos, pós-processamento e downloads de ambiente não foram habilitados.

## Abertura e preparação

As tabelas abaixo usam cinco amostras por linha, no renderer em software. “Útil” é o primeiro mapa visível e seus controles, incluindo o SVG durante o preparo. “3D” exige a apresentação após três draws reais. A preparação assíncrona essencial permite usar a interface enquanto os programas são preparados; nenhum prazo de fallback foi ampliado.

| Viewport / estado       | Útil mediana antes → depois | 3D mediana antes → depois | Ambiente pronto antes → depois |
| ----------------------- | --------------------------: | ------------------------: | -----------------------------: |
| Desktop 1366×768 · frio |                868 → 458 ms |            991 → 1.157 ms |               2.247 → 2.083 ms |
| Desktop · reentrada SPA |                754 → 340 ms |            880 → 1.023 ms |               1.489 → 1.856 ms |
| Mobile 390×844 · frio   |                715 → 248 ms |              828 → 939 ms |               1.963 → 1.663 ms |
| Mobile · reentrada SPA  |            1.492 → 1.296 ms |          1.618 → 2.035 ms |               2.357 → 2.794 ms |

A disponibilidade do primeiro mapa útil melhorou nas quatro medianas. **A prontidão do 3D piorou entre 13% e 26%** no renderer em software; não se afirma que esse critério ficou dentro de 5%. A primeira amostra fria desktop levou 4.890 ms ao 3D, enquanto as quatro seguintes ficaram entre 1.112 e 1.190 ms. A distribuição completa e os piores valores estão no JSON; uma mediana sozinha não representa essa dispersão.

| Preparação final (mediana)               | Desktop frio / quente | Mobile frio / quente |
| ---------------------------------------- | --------------------: | -------------------: |
| Programas essenciais, elapsed assíncrono |        68,7 / 26,2 ms |       61,3 / 25,2 ms |
| Pixels/mapas do terreno                  |         26,2 / 0,1 ms |        26,5 / 0,0 ms |
| Céu procedural                           |         38,7 / 0,1 ms |        39,7 / 0,0 ms |
| Ambiente filtrado e compilação opcional  |      274,7 / 110,4 ms |     202,5 / 388,3 ms |

A última linha inclui espera de compilação da API pública, e não apenas CPU. O tempo “ambiente pronto” da primeira tabela inclui agendamento e os comandos do roteiro de seleção do perfil Equilibrado; não é a mesma métrica. O baseline não possuía instrumentação separada de CPU de preparação, portanto não é inventado um antes para essas rubricas.

Uma execução intermediária teve **um timeout não caracterizado** ao aguardar o 3D em uma reentrada mobile em software. Na ocasião, não havia captura de diagnóstico do estágio; sua causa exata não foi demonstrada. O relatório bruto dessa ocorrência foi preservado. Após adicionar captura de estado e limpeza do contexto em falhas, a série final de cinco amostras passou nas vinte aberturas/reentradas; isso não apaga a ocorrência anterior nem autoriza declarar ausência total de falhas históricas.

## Testes e evidências

A matriz funcional do asset final `MapRenderer-FjKZ31fU.js` passou em **11/11 cenários**, as falhas/perfis de iluminação em **4/4**, a série de abertura em **10/10** (vinte aberturas/reentradas) e o smoke Metal em **2/2**, sem erros JavaScript não tratados nessas execuções finais. A seleção começou na representação `preparing`; o lote 70 continuou selecionado após o 3D apresentar. O cenário usa o primeiro mapa real, sem atraso artificial. Sua duração inclui diversos comandos automatizados de busca e não é tratada como latência de um clique.

O conjunto comercial conservou suas matrizes de mundo depois de órbita, pan e zoom. A fonte territorial permaneceu idêntica, SHA-256 `db70a5cb1362b3cfdeadfea02bfc2b8f54c497ad9c36216907174226886eaa11`. P1 e P14 continuam separados; o inventário, os lotes brancos, as ruas e os pisos claros legítimos foram preservados. O picking atingiu diretamente o lote 70 e retornou `null` em uma região apenas de entorno.

A inspeção das cinco vistas com a mesma câmera encontrou continuidade do chão sem placa residual ou fissuras. O horizonte no limite de inclinação apresenta céu azul e nuvens suaves, mantendo o parque visível. Os pares de cobertura de P1 e P8 foram abertos nos dois azimutes: o brilho muda com a observação sem piso molhado ou lavagem ciano das áreas internas. Os três perfis conservam a implantação e a paleta; os cenários de falha mantêm seleção e navegação.

As fontes de dados/API, arquitetura geométrica, autenticação e SQL não foram alteradas. A verificação final passou: **118 testes automatizados em 19 arquivos** (5,68 s), TypeScript sem emissão, lint dos 13 arquivos TS/TSX alterados e do runner, e build de produção do asset final. As provas de source/bundle registram os assets de cada build e os tamanhos sem inferir desempenho a partir de bytes.

| Evidência                              | Arquivo                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Geral, mesmo ângulo antes/depois       | [comparison-overview.png](validation/commercial-map-terrain/comparison-overview.png)                                                                                                                                                                                                       |
| Oblíqua baixa, mesmo ângulo            | [comparison-low-oblique.png](validation/commercial-map-terrain/comparison-low-oblique.png)                                                                                                                                                                                                 |
| Perímetro próximo                      | [comparison-perimeter.png](validation/commercial-map-terrain/comparison-perimeter.png)                                                                                                                                                                                                     |
| Aproximação e afastamento equivalentes | [aproximação](validation/commercial-map-terrain/comparison-near.png), [afastamento](validation/commercial-map-terrain/comparison-far.png)                                                                                                                                                  |
| Inclinação máxima e céu                | [daylight-horizon-allowed.png](validation/commercial-map-terrain/daylight-horizon-allowed.png)                                                                                                                                                                                             |
| Cobertura P1 sob duas direções         | [ângulo A](validation/commercial-map-terrain/daylight-roof-P1-a.png), [ângulo B](validation/commercial-map-terrain/daylight-roof-P1-b.png)                                                                                                                                                 |
| Cobertura P8 sob duas direções         | [ângulo A](validation/commercial-map-terrain/daylight-roof-P8-a.png), [ângulo B](validation/commercial-map-terrain/daylight-roof-P8-b.png)                                                                                                                                                 |
| Mobile e tela cheia                    | [entrada vertical](validation/commercial-map-terrain/entry-390.png), [tela cheia](validation/commercial-map-terrain/mobile-fullscreen.png)                                                                                                                                                 |
| Sem mapas, falha do céu e ambiente     | [mapas](validation/commercial-map-terrain/daylight-all-maps-off.png), [céu](validation/commercial-map-terrain/daylight-sky-failure.png), [ambiente](validation/commercial-map-terrain/daylight-environment-failure.png)                                                                    |
| Resumo e prova de integridade          | [summary.json](validation/commercial-map-terrain/summary.json), [source-and-bundle-proof.json](validation/commercial-map-terrain/source-and-bundle-proof.json)                                                                                                                             |
| Relatórios completos comprimidos       | [funcional](validation/commercial-map-terrain/final-functional.json.gz), [iluminação](validation/commercial-map-terrain/final-lighting.json.gz), [navegação](validation/commercial-map-terrain/final-bench.json.gz), [aberturas](validation/commercial-map-terrain/final-openings.json.gz) |

O [manifesto das imagens](validation/commercial-map-terrain/image-manifest.json) fornece dimensões, origem e hashes das capturas. O [registro da ocorrência intermediária em software](validation/commercial-map-terrain/initial-software-opening-anomaly.json.gz) mantém o timeout anterior. As evidências rejeitadas de calibração não são usadas para aprovar o build final.

A execução final com GPU Apple M5/Metal apresentou primeiro mapa útil em 196 ms e 3D em 480 ms. Três reentradas SPA ficaram em 223, 154 e 260 ms até o 3D. São amostras do build final no desktop disponível, **sem baseline GPU anterior equivalente**; não entram na tabela comparativa em software e não são usadas para afirmar aceleração entre versões. O teste confirmou um contexto ativo por abertura, recursos estáveis e repouso sem renderização contínua.

No Canvas de comparação, o envelope medido foi: aproximação mínima global de 15,392 unidades, fit de 276,586 e afastamento máximo de 373,391 (`1,35 × fit`). A inclinação máxima é 1,3823 rad (79,2° desde a vertical). As ações repetidas atingiram exatamente os limites, sem continuar acumulando movimento. Ângulos mais baixos têm folga de telhado específica, portanto a menor distância efetiva pode aumentar. Esses valores usam unidades da planta, não metros; o envelope muda com o viewport e a área livre dos painéis.
