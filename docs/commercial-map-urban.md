# Contexto residencial e vias de referência

`urbanLayout.ts` e `urbanReference.ts` mantêm os dados leves de disposição e vias; a fábrica adiada `urbanContext.ts` e seus builders acrescentam conjuntos edificados aproximados, vias de acesso e duas rótulas ao redor da implantação existente. Nenhum desses elementos recebe ID comercial, vínculo de negócio ou área à venda. Os polígonos originais continuam em `data/territory.ts`.

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
| Rua Buenos Aires antes do mapa | `571138889`                          | Serviço automotivo em `X≈−14`, desde Rua Brasil até o nó OSM `8787950880` em `Z≈−60,72`               |

Somente Campeira liga as transversais à Tuparendi. As três vias sem saída não ganham uma rua ligando seus fundos. O circuito menor é uma via `living_street`, fechada e de mão única no OSM, sem tag `junction=roundabout` ou `mini_roundabout`; sua interpretação como segunda rótula também foi confirmada pelo usuário. O portão secundário indicado pelo usuário não possui tag de portão na fonte. Sua representação é aproximada, sem afirmar que seja um equipamento oficialmente mapeado. O nó da âncora principal, por sua vez, contém `barrier=gate / entrance=main`.

A Rua Argentina `571138892` foi examinada e registrada na prova. Todos os seus nós estão em `X≥28,27`; portanto ela não fornece um trecho a oeste de `X=5,8`. Não se inventa uma continuação para preencher esse espaço. Brasil e Buenos Aires possuem tags automotivas, sem conversão indevida em passeio pedestre. O recorte dos acessos usa interpolação nos segmentos da fonte, conservando suas curvas, e não um novo contêiner retangular para o parque.

## Residências e encontro com a implantação

A disposição anterior tinha três quadras com oito casas cada, seis casas no trecho parcial e duas na cunha. Essa grade foi substituída pela adaptação da referência descrita na revisão abaixo, que mantém áreas livres e uma transição institucional explícita. Não há rua adicional no centro ou nos fundos das quadras. As parcelas da cunha são recortadas pelo limite diagonal, evitando jardins ou muros sobre a via.

As seis formas arquitetônicas — pátio, volumes divididos, vila, compacta, dois pavimentos e duas águas — variam em cor, cobertura e proporções. Paredes possuem aberturas, portas/janelas em recesso, caixilhos e peitoris. Coberturas possuem beirais, testeiras, platibandas ou cumeeiras. Varandas, pilares, garagens, jardins, piscinas, arbustos, árvores residenciais e alguns coqueiros pertencem à ambientação, sem correspondência cadastral individual. Os jardins mantêm bordas, caminhos, base de árvore e volumes de copa visíveis nos enquadramentos gerais. Os centros propostos para a borda são filtrados para excluir parcelas e vias, com escalas e posições alternadas para a transição dos fundos. Todas compartilham os buffers/materiais; o contexto urbano não acrescenta textura própria.

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

Cada batch estático é indexado uma única vez com `mergeVertices(..., 1e-6)`, depois de posições, normais, UVs e cores estarem finalizados. O compartilhamento considera todos esses atributos, conservando arestas duras, emendas de UV e a sequência dos triângulos. A indexação é conferida pela suíte, inclusive a fronteira do LOD em índices. A contagem histórica de 43.715 triângulos pertence à implantação anterior de 32 volumes e não deve ser apresentada como medição da revisão atual.

Paredes, coberturas e vidros usam clones dos materiais PBR finais, preservando atlas, ambiente, callbacks de shader e cores de vidro. As cores residenciais ficam nos vértices; UVs seguem unidades do mundo no plano dominante de cada face. Asfalto, concreto e tinta viária são emprestados da biblioteca existente. O módulo libera somente materiais e buffers próprios, com descarte idempotente e rollback em criação parcial.

O LOD considera distância ao alvo e às regiões residenciais: além de 150/230/340 unidades em Leve/Equilibrado/Detalhado, o drawRange remove apenas ornamentos pequenos. Seu limite é um prefixo do buffer de índices (`persistentDetailIndices`), que preserva a mesma ordem de elementos do buffer original. Aberturas principais, beirais, arestas estruturais, troncos, galhos e silhuetas de copas permanecem; o culling de frustum continua ativo. Não se oculta a malha inteira de vegetação ou todos os detalhes arquitetônicos na visão geral. Todas as malhas recusam raycast, possuem `commercialPickable=false`, não recebem `entityId` e não geram sombras dinâmicas. A [política de resolução e shaders para software](commercial-map-performance-budget.md) é independente desse LOD e não altera essas geometrias.

## Contatos solares estáticos

`urbanContact.ts` projeta os oito cantos de cada caixa estrutural na direção oposta ao vetor solar fixo de `DAYLIGHT`. A integração aplica primeiro o espelhamento local usado pela arquitetura e depois sua rotação no mundo. O casco convexo de cada caixa é unido aos demais volumes da casa e, quando necessário, aos vizinhos. Células sem sobreposição impedem escurecimento duplo nas alas e nos pavimentos elevados.

A projeção é preparada uma vez, separada por componentes espaciais. O piso exclui as regiões comerciais protegidas antes de gerar um único batch transparente de contato. Essa aproximação volumétrica não é um mapa dinâmico de sombras: não cria textura, passe de luz, atualização por quadro ou callback de descarte próprio. O solo e a base informam suas elevações reais; as coberturas são aproximadas pelos limites volumétricos disponíveis.

## Verificação

Os testes verificam conexões compartilhadas da fonte OSM, os três términos `noexit`, preservação das curvas, recorte interpolado dos acessos, ajuste dos anéis, ausência de portão secundário indevidamente atribuído ao OSM e invariância da fonte territorial. Os testes residenciais verificam parcelas, formas, materiais/UVs, exclusão do picking, LOD, recursos e descarte. A indexação é conferida expandindo cada batch e comparando atributos/ordem anteriores, tolerância numérica, fronteira do LOD e redução do número de vértices. Os testes de navegação separam os bounds comerciais do envelope finito de exploração.

Fidelidade visual, continuidade dos encontros e fluidez dependem das capturas e medições integradas em [commercial-map-realism-validation.md](commercial-map-realism-validation.md). Nenhum ensaio em viewport emulada comprova desempenho em telefone físico.

Dados de vias: [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright), sob [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). A prova vinculada contém URLs individuais dos nós e vias selecionados.

## Revisão do bairro e seções viárias — 01/11/2026

A fonte arquitetônica foi consultada somente para leitura no checkout FENASOJA `a09a4c68052a7c5fb2a1966d6e1e67980264e8fd`, em `data/lateralResidentialDistrict.ts` e `docs/commercial-map-lateral-residential.md`. O arquivo `urbanDistrictReference.ts` conserva apenas o arranjo interpretativo de envelopes, centros, tipologias e indicação de piscina: não contém cadastros comerciais. A implantação substitui a distribuição modular anterior por quatro setores situados entre as transversais existentes. Cada setor usa uma escala **uniforme** em seus dois eixos e uma translação própria: 0,5 unidade por unidade da fonte em Q2–Q4 e aproximadamente 0,46 em Q5, limitada pelo espaço junto à Rua Fenasoja. Isso é adaptação esquemática por interfaces, **não** uma transformação geográfica comprovada. A cunha continua com dois conjuntos recortados pelo corredor diagonal existente; sua implantação exata e a correspondência individual de volumes exigem comparação autenticada e fonte de campo. Não há afirmação de cadastro residencial.

O inventário interpretativo mantém Q2: 9 conjuntos e duas áreas livres, Q3: 11, Q4: 12 incluindo a cobertura longa e o grande jardim, Q5: 6 residenciais e 2 edifícios institucionais do mesmo conjunto, e a cunha Q1: 2. Não se contam alas como imóveis adicionais. As piscinas são indicadas como detalhe interpretativo e são geradas apenas quando cabem no jardim; sua posição é aproximada. A geometria fonte da avenida e dos lotes comerciais não foi alterada. O envelope de exploração foi estendido para alcançar a transição institucional, sem permitir navegação infinita.

### Auditoria de seção: largura de pista, não passeio

A consulta ao [significado de `width=*` no OSM](https://wiki.openstreetmap.org/wiki/Key%3Awidth) distingue pista entre bordas de passeio e esclarece que `maxwidth=*` restringe veículos. O snapshot local de 18/10/2026 não informa `width`, `est_width` ou `source:width` para os trechos abaixo; `lanes=2` da Musicanto não comprova medida. O valor de 7,4 m vem do modelo autoral FENASOJA, descrito ali como **aproximado**, não de levantamento nem de tag OSM. O fator contextual de 0,454816 unidade/m é o alinhamento de apresentação anterior, sem precisão topográfica. As medições abaixo são pista; a extensão de passeio adicionada pelo renderer permanece de 1,05 unidade no total, dividida nas duas bordas, como representação sem medição confirmada.

| Trecho / IDs OSM                                               | Anterior (unid. cena) | Proposta (m) | Proposta (unid. cena) | Origem / confiança e interface                                                          |
| -------------------------------------------------------------- | --------------------: | -----------: | --------------------: | --------------------------------------------------------------------------------------- |
| Campeira `203230163`                                           |                   5,8 |          7,4 |                 ≈3,37 | Estimativa FENASOJA; pista e passeio gerados pelo mesmo ribbon; entroncamentos mantidos |
| Musicanto `203230209`                                          |                   5,8 |          7,4 |                 ≈3,37 | Mesma estimativa; `noexit=yes`, curva e fim OSM preservados                             |
| 10 de Agosto `203230194`                                       |                   5,8 |          7,4 |                 ≈3,37 | Mesma estimativa; término OSM preservado                                                |
| Fenasoja `203230168`                                           |                   5,8 |          7,4 |                 ≈3,37 | Mesma estimativa; término OSM preservado                                                |
| Benvenuto / Imigrantes e aproximação `953262435`, `1553497179` |                  9,75 | desconhecida |                  9,75 | Mantida a seção esquemática protegida e sua junção, sem declarar largura em metros      |
| Tuparendi `203230187`, `447054088`                             |                   6,4 | desconhecida |                   6,4 | Estimativa de apresentação preexistente; nenhum valor OSM confiável de largura          |
| Brasil `571136683`, acesso `1553497181`, `953224598`           |                   4,2 | desconhecida |                   4,2 | Estimativa anterior mantida; nós, recortes e conexões OSM preservados                   |
| Buenos Aires `571138889` e acessos `833033345`, `833033346`    |                   4,0 | desconhecida |                   4,0 | Estimativa anterior mantida; largura real pendente                                      |
| Retorno Brasil `833033192`                                     |                   3,4 | desconhecida |                   3,4 | Estimativa anterior mantida; largura real pendente                                      |
| Anéis `949273418`, `833033189`, `833033188`                    |             4,2 / 3,6 | desconhecida |             4,2 / 3,6 | Estimativas anteriores; raios ajustados aos nós OSM, largura real pendente              |

Nenhuma dessas larguras é cota oficial. Os setores compartilham as interfaces da malha existente, mas o alinhamento geográfico ainda possui apenas a âncora, orientação e testemunho independente anteriormente descritos; não existem três marcos não colineares homologados nesta revisão. Assim, não se declara encaixe métrico dos setores, nem são movidos os lotes para forçá-lo. Plantas cotadas ou levantamento e comparação renderizada autenticada continuam necessários para resolver conflitos de seção e confirmar fachadas, acessos, quintais e a implantação do campus.
