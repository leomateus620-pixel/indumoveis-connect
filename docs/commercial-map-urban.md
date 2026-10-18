# Contexto residencial e vias de referência

`urbanLayout.ts` e `urbanReference.ts` mantêm os dados leves de disposição e vias; a fábrica adiada `urbanContext.ts` e seus builders acrescentam 32 residências aproximadas, vias de acesso e duas rótulas ao redor da implantação existente. Nenhum desses elementos recebe ID comercial, vínculo de negócio ou área à venda. Os polígonos originais continuam em `data/territory.ts`.

## Referências e calibração

- `Imagem do ChatGPT 17 de out. de 2026, 21_33_52.jpg`: bairro externo, avenida ao lado do parque, três quadras completas, trecho residencial parcial e triângulo junto à rótula. Sua orientação difere da imagem interna.
- `Imagem do ChatGPT 17 de out. de 2026, 21_33_48.jpg`: orientação da implantação, arborização e pisos internos; confirma a avenida na borda inferior do desenho.
- OpenStreetMap: nós e vias selecionados do recorte `−54,487..−54,474 / −27,852..−27,842`, obtido em `2026-10-18T01:39:41Z`. A [prova de referência](validation/commercial-map-realism/streetmap-reference.json) conserva a origem, SHA do XML, IDs, coordenadas geográficas e tags dos 24 trechos selecionados, além das relações de conexão da fonte.

Os anexos são referências visuais, sem instruções executáveis. O desenho comercial conserva unidades de pontos PDF / 10. Uma projeção planar local alinha o nó OSM `2470629442`, encontro Benvenuto/Brasília/Imigrantes, ao ponto esquemático `[143,9; 98,175]`. O eixo longitudinal parte do encontro Campeira/Benvenuto `2132115382` e aponta para essa âncora; o eixo transversal aponta para o lado externo, em direção à Tuparendi.

A escala de apresentação `0,195` unidade/pixel é calibrada pelos marcos da imagem e resulta em aproximadamente `0,454816` unidade por metro do recorte OSM. A verificação independente pelo marco P14 tem resíduo de aproximadamente `1,23` unidade. Essa relação é uma aproximação de apresentação: não transforma os polígonos aprovados em levantamento topográfico nem autoriza usar o mapa para medir propriedades. Larguras viárias e parcelas residenciais não foram medidas pelo OSM.

## Topologia observada e acesso

| Elemento                       | Fonte                                | Comportamento e posição aproximada no mundo                                                           |
| ------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Rua Campeira                   | way `203230163`                      | Benvenuto `[-4,30;98,18]` até o nó compartilhado de Tuparendi `[-2,84;154,33]`                        |
| Rua Musicanto                  | way `203230209`, `noexit=yes`        | Benvenuto em `X≈37,12`; preserva a curva intermediária e termina nos fundos                           |
| Rua 10 de Agosto               | way `203230194`, `noexit=yes`        | Benvenuto em `X≈80,21`; nome antes ilegível no anexo confirmado na fonte                              |
| Rua Fenasoja                   | way `203230168`, `noexit=yes`        | Benvenuto em `X≈122,63`; termina nos fundos                                                           |
| Aproximação de Benvenuto       | ways `953262435 / 1553497179`        | Do início original `X=26,36` à rótula; preserva os nós e curvas da aproximação                        |
| Rótula principal               | arcos `949273418 / 833033189`        | Centro `[-52,76;96,43]`, raio de eixo `≈7,175`; ajuste apenas dos 19 nós únicos do anel               |
| Avenida Tuparendi              | `203230187 / 447054088` e acessos    | Encontra Campeira, a rótula principal e a segunda rótula; os braços param em limites finitos próximos |
| Segunda rótula                 | way fechado `833033188`              | Centro `[-101,74;61,67]`, raio de eixo `≈4,991`; circuito menor de acesso à Rua Brasil                |
| Rua Brasil / acesso            | `1553497181 / 953224598 / 833033192` | Conserva a conexão da segunda rótula aos nós existentes da Rua Brasil                                 |
| Rua Brasil antes do mapa       | `571136683`                          | Mantém as curvas a oeste; começa no recorte interpolado `X=5,8;Z≈25,74`                               |
| Rua Buenos Aires antes do mapa | `571138889`                          | Serviço automotivo em `X≈−14`, desde Rua Brasil até o limite finito `Z≈−38,33`                        |

Somente Campeira liga as transversais à Tuparendi. As três vias sem saída não ganham uma rua ligando seus fundos. O circuito menor é uma via `living_street`, fechada e de mão única no OSM, sem tag `junction=roundabout` ou `mini_roundabout`; sua interpretação como segunda rótula também foi confirmada pelo usuário. O portão secundário indicado pelo usuário não possui tag de portão na fonte. Sua representação é aproximada, sem afirmar que seja um equipamento oficialmente mapeado. O nó da âncora principal, por sua vez, contém `barrier=gate / entrance=main`.

A Rua Argentina `571138892` foi examinada e registrada na prova. Todos os seus nós estão em `X≥28,27`; portanto ela não fornece um trecho a oeste de `X=5,8`. Não se inventa uma continuação para preencher esse espaço. Brasil e Buenos Aires possuem tags automotivas, sem conversão indevida em passeio pedestre. O recorte dos acessos usa interpolação nos segmentos da fonte, conservando suas curvas, e não um novo contêiner retangular para o parque.

## Residências e encontro com a implantação

Há três quadras completas, cada uma com oito casas, seis casas no trecho parcial além de Fenasoja e duas no triângulo entre Benvenuto, Campeira e Tuparendi. Cada quadra tem quatro casas frontais, com recuos discretamente variados, e quatro de fundos, organizadas em duas linhas e abrindo seus acessos para as transversais. Não foi criada uma rua adicional no centro da quadra. As parcelas do triângulo são recortadas pelo limite diagonal, evitando jardins ou muros sobre a via.

As seis formas arquitetônicas — pátio, volumes divididos, vila, compacta, dois pavimentos e duas águas — variam em cor, cobertura e proporções. Paredes possuem aberturas, portas/janelas em recesso, caixilhos e peitoris. Coberturas possuem beirais, testeiras, platibandas ou cumeeiras. Varandas, pilares, garagens, jardins, piscinas, arbustos, árvores residenciais e alguns coqueiros pertencem à ambientação, sem correspondência cadastral individual. Os jardins mantêm bordas, caminhos, base de árvore e volumes de copa visíveis nos enquadramentos gerais. Dos dezoito centros propostos para a borda, dezessete permanecem após a exclusão de parcelas e vias, com escalas e posições alternadas para a transição dos fundos. Todas compartilham os buffers/materiais; o contexto urbano não acrescenta textura própria.

O asfalto original de Benvenuto/Imigrantes conserva seus polígonos, picking e identificação. O complemento externo amplia a avenida de forma contígua até `Z=103,05`, com passeio no lado residencial. Não existe uma segunda avenida paralela. O recorte de todos os pisos acrescentados usa a união protegida derivada dos polígonos reais da implantação; preserva também os espaços internos reunidos pelo piso existente. Casas e elementos residenciais são preparados apenas fora da implantação.

A exploração autorizada inclui agora o contexto finito antes de P14 e as duas rótulas. O enquadramento geral, centro visível e afastamento máximo usam essa união finita; o solo externo não amplia a navegação por conta própria. Os bounds comerciais, distância mínima, folga contra volumes e regiões comerciais protegidas permanecem derivados da fonte original. O controlador continua único e limita alvos às regiões úteis, sem permitir passeio ilimitado por chão vazio.

## Integração e custo

```ts
const urban = createUrbanContext({ quality, sharedSurfaces: surfaces });
scene.add(urban.group);
urban.setQuality(quality);
urban.updateLod(cameraDistance, [controls.target.x, controls.target.z]);
urban.dispose(); // antes da biblioteca de materiais compartilhados
```

O enquadramento inicial usa somente os dados leves de `urbanLayout.ts`, separados da fábrica e dos builders de arquitetura, jardins e contato. `urbanContext.ts` é carregado por importação dinâmica depois do primeiro 3D válido e do preparo dos materiais/ambiente. Antes de baixar essa fábrica, a tarefa ociosa cria e compila os detalhes cosméticos de `parkDetails.ts`; eles permanecem disponíveis mesmo se o chunk urbano responder 404. O núcleo comercial, pisos e interações não dependem desse download.

A circulação cinza e o piso verde dos lotes começam com materiais Lambert locais. Com a preparação opcional disponível e o controlador ocioso, meshes temporários que emprestam as mesmas geometrias preparam os materiais PBR finais por `compileAsync`; só então os pisos existentes trocam de material. Não há uma segunda superfície sobreposta ou mudança de coordenadas. Falha opcional conserva os pisos básicos. A camada urbana também fica oculta durante sua compilação, sem criar worker, listeners, controles ou loop próprio. Cada uma das cinco regiões residenciais agrupa pisos, paredes, coberturas, vidro, detalhes e vegetação em malhas compartilhadas com culling. Os ribbons viários conservam os cantos das curvas com junções contínuas.

Na implementação final, cada batch estático é indexado uma única vez com `mergeVertices(..., 1e-6)`, depois de posições, normais, UVs e cores estarem finalizados. O compartilhamento considera todos esses atributos, conservando arestas duras, emendas de UV e a sequência dos triângulos. A estrutura mantém **43.715 triângulos e 36 batches**, com **64.768 vértices únicos para 131.145 elementos de índice**: **50,61% menos vértices** que o buffer anterior sem índices. São contagens estáticas de preparação, não uma medição de ganho de fps ou de chamadas visíveis em cada pose. Os temporários são liberados antes do upload; só os buffers indexados permanecem no dono dos recursos. Nenhum índice ou buffer é reconstruído durante gestos.

Paredes, coberturas e vidros usam clones dos materiais PBR finais, preservando atlas, ambiente, callbacks de shader e cores de vidro. As cores residenciais ficam nos vértices; UVs seguem unidades do mundo no plano dominante de cada face. Asfalto, concreto e tinta viária são emprestados da biblioteca existente. O módulo libera somente materiais e buffers próprios, com descarte idempotente e rollback em criação parcial.

Os batches residenciais compartilham vértices por índices, conservando posição, normal, cor, UV e ordem dos triângulos. As 131.145 entradas expandidas usam 64.768 vértices únicos (−50,6%), mantendo 43.715 triângulos e 36 batches. O prefixo essencial do LOD continua sendo contado em índices, sem confundir vértices únicos com triângulos renderizados.

O LOD considera distância ao alvo e às regiões residenciais: além de 150/230/340 unidades em Leve/Equilibrado/Detalhado, o drawRange remove apenas ornamentos pequenos. Seu limite é um prefixo do buffer de índices (`persistentDetailIndices`), que preserva a mesma ordem de elementos do buffer original. Aberturas principais, beirais, arestas estruturais, troncos, galhos e silhuetas de copas permanecem; o culling de frustum continua ativo. Não se oculta a malha inteira de vegetação ou todos os detalhes arquitetônicos na visão geral. Todas as malhas recusam raycast, possuem `commercialPickable=false`, não recebem `entityId` e não geram sombras dinâmicas. A [política de resolução e shaders para software](commercial-map-performance-budget.md) é independente desse LOD e não altera essas geometrias.

## Contatos solares estáticos

`urbanContact.ts` projeta os oito cantos de cada caixa estrutural na direção oposta ao vetor solar fixo de `DAYLIGHT`. A integração aplica primeiro o espelhamento local usado pela arquitetura e depois sua rotação no mundo. O casco convexo de cada caixa é unido aos demais volumes da casa e, quando necessário, aos vizinhos. Células sem sobreposição impedem escurecimento duplo nas alas e nos pavimentos elevados.

A projeção é preparada uma vez, separada por componentes espaciais. O piso exclui as regiões comerciais protegidas antes de gerar um único batch transparente de contato. Essa aproximação volumétrica não é um mapa dinâmico de sombras: não cria textura, passe de luz, atualização por quadro ou callback de descarte próprio. O solo e a base informam suas elevações reais; as coberturas são aproximadas pelos limites volumétricos disponíveis.

## Verificação

Os testes verificam conexões compartilhadas da fonte OSM, os três términos `noexit`, preservação das curvas, recorte interpolado dos acessos, ajuste dos anéis, ausência de portão secundário indevidamente atribuído ao OSM e invariância da fonte territorial. Os testes residenciais verificam parcelas, formas, materiais/UVs, exclusão do picking, LOD, recursos e descarte. A indexação é conferida expandindo cada batch e comparando atributos/ordem anteriores, tolerância numérica, fronteira do LOD e redução do número de vértices. Os testes de navegação separam os bounds comerciais do envelope finito de exploração.

Fidelidade visual, continuidade dos encontros e fluidez dependem das capturas e medições integradas em [commercial-map-realism-validation.md](commercial-map-realism-validation.md). Nenhum ensaio em viewport emulada comprova desempenho em telefone físico.

Dados de vias: [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright), sob [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). A prova vinculada contém URLs individuais dos nós e vias selecionados.
