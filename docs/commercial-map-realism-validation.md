# Mapa comercial — validação da fase de realismo

A fase parte do commit `930088e`, já com o terreno contínuo, céu diurno e navegação delimitada. Sua árvore é idêntica a `main` em `f07adf4`, após o merge da PR #4. O build anterior foi preservado em `artifacts.local/commercial-map-realism/baseline-output`. A comparação desta fase não reutiliza métricas das entregas anteriores para aprovar os novos materiais, vegetação e contexto urbano.

## Escopo e invariantes

A fonte territorial, IDs comerciais, lotes, vias, pavilhões separados P1/P14, paisagismo aprovado, coordenadas e unidades esquemáticas continuam sendo a verdade geométrica. A camada urbana é uma ambientação aproximada ao sul de Avenida Benvenuto; não constitui cadastro ou nova oferta comercial. A geometria adicional não participa da seleção. A exploração autorizada dos acessos antes de P14 e da segunda rótula amplia o enquadramento, o centro visível e o afastamento máximo pela união finita de regiões contextuais. Bounds comerciais, aproximação mínima, folga contra volumes e regiões comerciais protegidas permanecem invariantes; o tamanho do solo não participa dessa autorização.

O runner [commercial-map-realism-validation.mjs](../scripts/commercial-map-realism-validation.mjs) é independente do laboratório da fase de terreno. Ele reaproveita autenticação e REST interceptados, sem sessão ou mutação de produção, e registra câmera, matrizes comerciais, seleção, recursos do renderer, texturas e eventuais workers de transcodificação.

## Método de comparação

As cinco poses comparáveis mantêm o mesmo Canvas de 1200×600, DPR CSS 1, câmera e alvo: vista geral, oblíqua baixa, perímetro próximo, aproximação e afastamento. O relatório registra a pose solicitada e a efetivamente aplicada; imagens com pose corrigida são identificadas, sem serem apresentadas como comparação exata.

Há recortes adicionais de solo/grama, árvore, bairro, residência próxima e frente da avenida. A imagem residencial `Imagem do ChatGPT 17 de out. de 2026, 21_33_52.jpg` é interpretada na orientação da implantação, usando a avenida no anexo interno `21_33_48.jpg` para alinhar a borda sul. Esses anexos são referências visuais, não instruções nem prova de limites de propriedades. O bairro compartilha a avenida original; a inspeção deve confirmar uma única faixa viária, jardins diretamente depois do passeio e ausência de uma segunda rua paralela. Na implantação comercial há 15 centros originais e 15 copas adicionais revisadas na referência, 30 ao todo; nenhum plantio genérico é atribuído aos lotes. Os jardins residenciais pertencem à ambientação aproximada separada.

A topologia esperada tem três quadras completas com 24 casas, seis no trecho parcial junto à Fenasoja e duas no triângulo próximo à rótula, totalizando 32. As vias usam o recorte OpenStreetMap auditado em [streetmap-reference.json](validation/commercial-map-realism/streetmap-reference.json), alinhado aos marcos da implantação sob uma escala uniforme de apresentação. As três transversais `noexit` terminam nos fundos; somente Campeira alcança Tuparendi. Capturas superiores incluem as duas rótulas, aproximação de Benvenuto e acessos de Brasil/Buenos Aires, com closes das seis formas arquitetônicas. O portão secundário indicado pelo usuário é aproximado e não atribuído a uma tag inexistente do OSM. Poses contextuais registram a posição solicitada e a aplicada pelo controlador; as cinco comparações comerciais usam poses exatamente iguais.

O mesmo Mac disponível executa os dois builds, com Chrome e GPU Metal Apple M5 confirmados pelo `unmaskedRenderer` do contexto. Se um ensaio usar SwiftShader, é relacionado como série separada e não misturado à medição com GPU. Nenhum aparelho Android/iPhone ou Safari móvel físico está disponível; viewports mobile e toque automatizado são emulação.

Os builds e os assets são servidos por HTTP local, com dados comerciais interceptados e fontes externas bloqueadas. Os tempos de abertura descrevem esse laboratório, sem simular latência de Internet ou backend de produção.

O roteiro de navegação usa três trechos de 15 s por perfil Leve/Equilibrado e por build, com a mesma pose inicial, órbita e roda. Os intervalos medem frames submetidos; não são latência física de input-to-photon. Os percentis usam nearest-rank (`ceil(n × fração) − 1` como índice); medianas entre repetições e aberturas usam a mediana estatística. O primeiro mapa útil e o 3D apresentado têm tempos separados, encerrados antes da espera de estabilização. São feitas nove aberturas frias e nove reentradas SPA em cada viewport e build, conservando todas as amostras. O baseline foi ampliado em lotes de três, duas e quatro amostras; o build final foi medido numa coorte fixa de nove. A dispersão do observador inicialmente excedeu 5%, justificando ampliar os dois lados antes de concluir. A amostragem encerra em nove, independentemente do resultado, sem selecionar os melhores tempos. A interceptação das fixtures desabilita o cache HTTP do Playwright: “quente” significa reentrada na mesma página com módulos já carregados, sem afirmar cache HTTP aquecido.

Draw calls, triângulos, texturas, bytes residentes estimados, tamanho de buffer/DPR e metadados de LOD/resolução adaptativa são registrados no mesmo roteiro. Tamanhos de arquivos transferidos são separados de memória após a transcodificação. O registro de rede inclui KTX2, Basis, WASM e imagens; a instrumentação de Worker conta criação, encerramento e workers ainda ativos, sem alterar a implementação do decodificador. Os timestamps de cada abertura verificam que o atlas, o módulo do decoder, o chunk urbano opcional e todos os workers novos só começam depois do primeiro 3D válido em cargas frias. Nas reentradas SPA o módulo urbano já pode estar residente. `environmentReadyMs` inclui automação de menu/polling e é um limite observado; `environmentReadySinceOpeningMs` usa a conclusão no relógio do renderer, sem esse acréscimo.

A extensão de timer GPU é consultada sem emitir queries. `renderDurations` mede submissão na CPU, não duração GPU. A memória GPU não é acessível por esse WebGL; os bytes são estimativas dos recursos conhecidos. `performance.memory`, quando disponível, é heap JavaScript possivelmente arredondado e não substitui essa medida.

## Matriz funcional e falhas

A matriz mantém os testes anteriores de órbita/pan/zoom, bounds comerciais, envelope finito do contexto, testemunha de superfície útil projetada no viewport, matrizes comerciais, busca/seleção, picking direto do lote, presets, pinça sintética, resize, orientação vertical, tela cheia, repouso sob demanda e reabertura. A seleção iniciada no mapa de preparação deve permanecer no handoff para o 3D. Há também dois ensaios funcionais controlados que retêm a resposta HTTP do módulo 3D enquanto o usuário faz pan ou seleciona um lote no SVG; depois verificam o alvo preservado ou o lote visível e selecionável. Esse bloqueio serve apenas para exercitar o handoff e não entra nas métricas de abertura.

As capturas enriquecidas e o benchmark de navegação aguardam a conclusão opcional `realism.ready`; a abertura inicial e o teste de primeiro gesto não aguardam recursos cosméticos. Os cenários `mapPbr=fail` e uma resposta HTTP 404 real para `surfaces-512-normal.ktx2` precisam continuar com cores/mapas básicos, navegação e seleção, sem reportar falsamente o atlas como carregado ou deixar workers ativos. Reaberturas verificam que recursos e workers não crescem continuamente; isso não equivale a uma prova geral de ausência de vazamentos no heap.

A aprovação de material, cobertura da grama, leitura das copas e encaixe urbano depende da inspeção visual das capturas reais. Os testes de constantes e orçamento não substituem essa inspeção.

## Reprodução

```sh
MAP_BASE_URL=http://127.0.0.1:4190 MAP_REALISM_PHASE=before MAP_REALISM_BENCH_MS=1000 node scripts/commercial-map-realism-validation.mjs
MAP_BASE_URL=http://127.0.0.1:4190 MAP_REALISM_PHASE=before-bench MAP_REALISM_BENCH_ONLY=1 MAP_REALISM_BENCH_MS=15000 node scripts/commercial-map-realism-validation.mjs
MAP_BASE_URL=http://127.0.0.1:4206 MAP_REALISM_PHASE=after MAP_REALISM_REFERENCE=artifacts.local/commercial-map-realism/before/realism-validation.json MAP_REALISM_BENCH_MS=1000 node scripts/commercial-map-realism-validation.mjs
MAP_BASE_URL=http://127.0.0.1:4206 MAP_REALISM_PHASE=after-details MAP_REALISM_DETAIL_ONLY=1 node scripts/commercial-map-realism-validation.mjs
```

O ambiente usa por padrão a GPU do host (`MAP_BROWSER_GPU=hardware`) e grava a identificação efetiva. Uma solicitação de hardware não é aceita como prova sem a identificação retornada pelo contexto.

## Resultados finais — build 4206

Build medido: `4206`, renderer `MapRenderer-4N7Y9kMw.js`, no mesmo Mac Apple M5 / 16 GB, Darwin `25.6.0` (kernel), Chrome `155.0.8059.80`, ANGLE Metal confirmado. A [prova de fonte e bundles](validation/commercial-map-realism/source-and-bundle-proof.json) relaciona os hashes ao baseline `930088e`, ao candidato urbano `4199` e aos chunks finais. O grafo estático do núcleo soma **214.334 bytes gzip**; esse valor exclui o módulo urbano opcional, registrado separadamente. Os resultados de builds intermediários permanecem fora do pacote final.

O laboratório concluiu **49/49 verificações**, sem exceções JavaScript ou erros de compilação de shader capturados: seis navegações medidas, 18 pares de abertura, 14 verificações funcionais, três cenários de material, quatro de iluminação, três ensaios de estresse por software e uma troca Auto→manual→Auto. Esse total funcional não significa aprovação da meta de fluidez por software. O checkpoint do projeto concluiu **216/216 testes em 34 arquivos**, TypeScript, lint dos arquivos alterados e build de produção.

### Navegação, preservação e falhas

As cinco comparações comerciais usam exatamente a mesma câmera, alvo e Canvas. `territory.ts`, `geometry.ts` e `architecture.ts` são idênticos byte a byte ao baseline. A derivação topológica de pavimentos também permanece igual; a opção externa suprime apenas a antiga linha da borda sul onde a ampliação autorizada da avenida encontra o asfalto original. As matrizes comerciais registradas permanecem invariantes após órbita, pan, zoom e gestos combinados. Busca, seleção de lotes periféricos e P14, hover, clique, presets e reset continuam funcionais; P1 e P14 permanecem separados.

No Canvas comparável, a distância atingiu os limites de `15,3919` e `521,6239` unidades. O limite superior e o enquadramento `386,3881` incluem a exploração contextual autorizada; a aproximação mínima e a folga contra volumes `6,5536` continuam iguais. As 97 regiões comerciais protegidas permanecem; a união navegável finita tem 189 regiões, sem usar o tamanho do terreno como autorização de pan. A inclinação máxima `1,3823 rad` foi exercitada com três azimutes, sem borda de solo ou visão inferior nas capturas. Viewport vertical, rotação de orientação, pinça automatizada e tela cheia mantêm seleção e limites.

Os ensaios controlados no SVG confirmam que pan e seleção anteriores ao primeiro 3D são preservados. Um ponteiro mantido por 650 ms adia o preparo opcional; após a conclusão e repouso, o contador de frames ficou em 128 durante 350 ms em Leve. O vetor solar e o número de preparações do ambiente não mudam com órbita ou presets. No Detalhado, a sombra solar estática permanece com uma atualização, sem redesenho de sombra causado pela navegação.

A falha injetada `mapPbr=fail` e o HTTP 404 real do mapa normal KTX2 mantêm o mapa utilizável e a seleção do lote 70. O diagnóstico informa fallback procedural, `loaded=false` e zero workers ativos. Um **HTTP 404 real do chunk urbano** também preserva o núcleo comercial e a seleção, registrando `context-preparation` sem exceção não tratada. Falhas de céu/ambiente e mapas de superfície desligados preservam o solo básico. Em cargas frias, as requisições do atlas, do chunk urbano e os workers novos começam depois do primeiro 3D válido; os workers terminam após a transcodificação.

Quatro reentradas SPA apresentaram o mesmo plateau de **102 geometrias, dez texturas, 21 programas e 10.354.802 bytes estimados**, com um contexto ativo e zero workers ativos. O número cumulativo de contextos criados cresce porque cada abertura possui um contexto novo; os anteriores são desligados. A correção de profundidade aplica `polygonOffset(1,2)` somente ao solo externo e elimina o vazamento serrilhado através do concreto próximo de P14/P12, sem mudar elevações ou a fonte comercial.

O módulo urbano foi separado do layout leve e carregado após a apresentação válida do núcleo. O primeiro 3D usa apresentação difusa progressiva para lotes, base e detalhes; os materiais PBR são preparados em repouso e substituídos sem alterar a geometria ou o picking. A geometria urbana indexada reduz **131.145 entradas expandidas para 64.768 vértices únicos**, mantendo 43.715 triângulos e 36 batches preparados. Os testes reexpandem índices e comparam todos os atributos e a ordem, incluindo o prefixo essencial de LOD; não se afirma identidade dos buffers brutos após essa indexação.

### Cadência e orçamento no Metal

São três repetições de 15 s por linha e build. Cada célula p95 apresenta a mediana das três repetições; todas as distribuições constam dos relatórios brutos.

| Perfil      | p50 antes → depois | p95 antes → depois | Variação p95 | Pausas acima de 200 ms |
| ----------- | ------------------ | ------------------ | ------------ | ---------------------- |
| Leve        | 16,7 → 16,7 ms     | 16,8 → 16,7 ms     | −0,6%        | 0 → 0                  |
| Equilibrado | 16,7 → 16,7 ms     | 16,7 → 16,7 ms     | 0,0%         | 0 → 0                  |

O critério de até 5% de piora do p95 é atendido nessa GPU. A quantização próxima ao VSync não demonstra custo gráfico nulo nem garante 60 FPS em outro aparelho. O pico passou de **51 para 128 draw calls** e de **12.842 para 83.511 triângulos**. As texturas continuam em dez, com bytes estimados de **9.983.322 para 10.354.802** (+371.480 bytes; +3,7%). O contexto residencial usa zero textura própria; seus contatos solares usam um batch estático. O p95 de submissão CPU final tem mediana de **2,3 ms em Leve e 1,8 ms em Equilibrado**; o benchmark original não registrava essa coluna, portanto não há comparação causal de CPU. A extensão de timer GPU existe, mas não foi usada para medir a duração GPU. O heap JavaScript observado variou aproximadamente de 37 a 61 MB entre repetições, sem equivaler a memória GPU ou prova de ausência de vazamentos.

O refinamento urbano é comparado separadamente ao candidato `4199`, que já possuía as vias OSM e 17 casas. Com 32 casas, copas persistentes, cinco palmeiras, jardins e contatos solares, o p95 mediano permanece **16,7 ms** nos dois perfis; draw calls passam de 122 para 128, mantendo o mesmo orçamento de textura. As três poses incrementais são iguais; essa comparação não substitui o baseline comercial original.

### Abertura: nove amostras em cada condição

Tempos em milissegundos, mediana antes → depois. “Útil” é o primeiro mapa interativo, que pode ser SVG; “3D” é a apresentação validada da cena, sem aguardar o enriquecimento opcional. As larguras desktop/mobile são 1366/390 px, com alturas 768/844 px.

| Viewport / estado | Primeiro mapa útil      | Primeiro 3D             | Ambiente concluído no relógio do renderer |
| ----------------- | ----------------------- | ----------------------- | ----------------------------------------- |
| Desktop frio      | 168,0 → 174,9 (+4,1%)   | 246,5 → 257,7 (+4,5%)   | 660,3 → 719,4                             |
| Desktop SPA       | 46,3 → 50,6 (+9,5%)     | 221,1 → 236,2 (+6,8%)   | 519,6 → 584,8                             |
| Mobile frio       | 171,6 → 169,2 (−1,4%)   | 252,7 → 252,1 (−0,2%)   | 662,3 → 715,2                             |
| Mobile SPA        | 1277,7 → 1287,4 (+0,8%) | 1456,2 → 1474,7 (+1,3%) | 1738,6 → 1802,1                           |

As medianas frias atendem ao limite relativo de 5%. **A reentrada desktop não atende:** +4,4 ms para o primeiro mapa útil e +15,1 ms para o 3D. O intervalo útil frio observado foi 162,1–218,5 ms no baseline e 162,5–206,1 ms no final. A série final conserva um outlier mobile SPA de **2.572,4 ms até o 3D**, com 1.120,2 ms de preparo dos programas essenciais. Essa dispersão não elimina os resultados nem permite atribuir toda diferença a uma única função. A série mobile SPA inclui navegação da interface emulada antes da reentrada; não representa uma carga HTTP em cache nem deve ser comparada diretamente ao desktop frio.

Uma rechecagem separada do baseline, com três pares por viewport nas condições atuais do Chrome, permanece no pacote sem substituir as nove amostras originais. As medianas frias útil/3D foram 175,2/254,9 ms no desktop e 170,5/254,2 ms no mobile; os dados reforçam a necessidade de informar dispersão e não selecionar a série mais favorável.

O enriquecimento opcional termina depois do primeiro 3D e acrescenta aproximadamente **53–65 ms** à mediana da conclusão do ambiente (aproximadamente +4–13%, conforme viewport/estado). Em aberturas frias, as medianas finais de preparo de terreno/céu/ambiente são **24,9–25,1 / 34,6–34,7 / 26,5–26,7 ms**; programas essenciais, **31,0–31,4 ms**. Na reentrada, terreno e céu reutilizam o preparo de CPU e ficam em zero; os novos recursos GPU continuam pertencendo à instância e são liberados ao fechar. Os tempos completos observados de `realism.ready`, incluindo interação/polling, permanecem no JSON; não são apresentados como tempo puro de geração.

### Limitação real em renderização por software

A série separada com SwiftShader usa Automático, 20 s de gestos reais automatizados e 1,5 s de estabilização, sem injetar atrasos sintéticos. O Canvas e o 3D permaneceram disponíveis. No ensaio primário, o p50/p95 passa de **33,3/33,4 ms para 33,3/50,0 ms**. A meta global de até 5% de piora do p95 **não é atendida**. Nos últimos 240 frames finais, o p95 foi 49,9 ms; nos últimos 60, p50/p95 foram 33,3/33,5 ms. A janela final curta não substitui a distribuição completa nem comprova 30 FPS estáveis.

A política inicia em DPR 0,5, também observado no começo do ensaio; caiu para **0,4 em cerca de 4,4 s**, permanecendo assim. O perfil econômico reconhece renderização por software somente em Automático e usa apresentação difusa com albedo/cor e geometria preservados, sem mapas de relevo/roughness/AO ou ambiente por material. Os materiais PBR canônicos continuam pertencendo à instância e voltam no perfil manual. A troca em repouso **Auto→Leve manual→Auto** preservou instância, alvo, distância e seleção do lote 70, restaurando o buffer em manual e reduzindo-o novamente em Auto.

No stress, o buffer final de 517×260 atende uma região CSS de aproximadamente 1294×651: cerca de **40% da resolução linear e 16% dos pixels**. A imagem preserva a continuidade, mas perde nitidez e legibilidade de legendas. O p95 de submissão CPU final foi aproximadamente 0,5 ms, sem medir execução GPU. O cenário passa a continuidade funcional, **não a meta global de desempenho nem equivalência de qualidade**. As duas repetições adicionais também sustentaram o 3D, ambas com p95 global e dos últimos 60 frames de 50,0 ms, terminando em DPR 0,4. Seus dados completos ficam em relatórios separados; a primeira permanece a série primária. Não se declara suporte fluido a renderização por software, telefone físico ou iOS a partir desse laboratório.

## Evidências selecionadas

- [Vista inicial final](validation/commercial-map-realism/realism-normal-initial.webp) e [contexto residencial intermediário](validation/commercial-map-realism/urban-mid.webp).
- Comparações do baseline `930088e`: [geral](validation/commercial-map-realism/comparison-overview.webp), [oblíqua baixa](validation/commercial-map-realism/comparison-low-oblique.webp), [perímetro](validation/commercial-map-realism/comparison-perimeter.webp), [aproximação](validation/commercial-map-realism/comparison-near.webp) e [afastamento](validation/commercial-map-realism/comparison-far.webp).
- Refinamento urbano `4199` → final: [topologia completa](validation/commercial-map-realism/comparison-urban-topology.webp), [contexto oblíquo](validation/commercial-map-realism/comparison-urban-context.webp) e [casas próximas](validation/commercial-map-realism/comparison-urban-close.webp).
- Closes finais: [grama](validation/commercial-map-realism/realism-normal-grass-close.webp), [árvore](validation/commercial-map-realism/realism-normal-tree-close.webp), [concreto sem vazamento](validation/commercial-map-realism/realism-normal-concrete-close.webp), [segunda rótula](validation/commercial-map-realism/realism-normal-roundabout-secondary.webp), [coberturas e sombras](validation/commercial-map-realism/realism-detailed-roof-shadows.webp), [horizonte permitido](validation/commercial-map-realism/daylight-horizon-allowed.webp) e [vertical em tela cheia](validation/commercial-map-realism/mobile-fullscreen.webp).
- [Stress SwiftShader com DPR 0,4](validation/commercial-map-realism/software-auto-dpr-0.4.webp), identificado como apresentação de resolução reduzida.

O [resumo estruturado](validation/commercial-map-realism/summary.json) vincula 17 relatórios brutos `.json.gz`, condições, medições, checks e câmera. O [manifesto de imagens](validation/commercial-map-realism/image-manifest.json) registra fontes, recortes e hashes. As WebP são lossless, com pixels nativos e sem redimensionamento; alguns closes usam o mesmo recorte antes/depois indicado no manifesto. O gzip dos relatórios remove apenas espaços do JSON, preservando todos os valores verificados no manifesto. Referências OSM, escala de apresentação e limites de inferência estão em [commercial-map-urban.md](commercial-map-urban.md).
