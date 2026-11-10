# Mapa comercial — matriz de correção de fidelidade territorial (11/2026)

Escopo: `src/features/commercial-map/`. Unidades do desenho: 1 unidade ≈ 2,2 m (`unitsPerMetre = 0,4548`); x cresce para leste, z para o sul da planta, y para cima. As medições e capturas citadas estão em [commercial-map-fidelity-2026-11.md](commercial-map-fidelity-2026-11.md).

## Arquitetura encontrada

- Um único `WebGLRenderer` (Three.js nativo, sem R3F) em `MapRenderer.tsx`; a planta SVG (`Map2D.tsx`) é o fallback e o modo 2D.
- O cadastro comercial vem de `data/territory.ts` (`ENTITIES`). O renderizador desenha `PARK_RENDER_ENTITIES` (`permanentParkLayout.ts`), em que os edifícios recebem o contorno da planta A2 e os lotes permanecem os objetos originais.
- Edifícios: `architecture.ts` gera baldes por família de material (paredes, tijolo, vidro, cobertura…) e funde tudo em poucas malhas; a cor de vértice multiplica a cor da família.
- Entorno: `urbanReference.ts` (OpenStreetMap projetado por uma âncora), `urbanLayout.ts` + `urbanDistrictReference.ts` (quadras residenciais), `urbanContext.ts` (malhas por agrupamento espacial), `urbanArchitecture.ts`/`urbanLandscape.ts`.
- Rótulos: um atlas de 1024² e uma única malha; números de lote são quads no solo.
- Não há vínculo persistido entre espaços do banco e geometrias (`mapSpaceAssociations` está vazio); nenhuma alteração desta revisão toca dados, RLS ou funções SQL.

## Matriz

| # | Problema observado (linha de base) | Causa | Correção | Onde | Verificação |
|---|---|---|---|---|---|
| 2 | Ruas e casas do entorno deslocadas em relação aos pavilhões e lotes | Âncora OSM alinhada à borda do desenho, não ao território | Uma translação rígida do entorno de (+4,3; +0,5) unidades, sem escala nem rotação. O cadastro é a restrição fixa: nenhum polígono de lote se move | `urbanReference.ts` (`URBAN_REGISTRATION`) | `urbanReference.test.ts`: resíduos dos pontos de controle; hash dos lotes em `permanentPark.test.ts` |
| 3 | Avenida com faixa de estacionamento em calçada, setas e eixo fora de proporção; seguia além do portão como rodovia | Seção desenhada por regra genérica | Seção lida da ortofoto: estacionamento oblíquo sobre o asfalto ao norte, duas faixas por sentido, eixo duplo aberto nas bocas de rua, calçada sul, canteiro. A avenida termina no pórtico; a Avenida dos Imigrantes passa a ser circulação interna | `urbanReference.ts`, `urbanContext.ts`, `pavement.ts`, `parkDetails.ts`, `permanentPark.ts` | `urbanContext.test.ts`, `pavement.test.ts`, `parkDetails.test.ts` |
| 4 | Quadras residenciais com casas repetidas, sem lotes vazios nem cunha junto à rótula | Grade procedural | 39 edificações e 6 lotes sem construção digitalizados telhado a telhado; 7 tipologias; cunha triangular recortada pela diagonal da Av. Tuparendi com massa arbórea | `urbanDistrictReference.ts`, `urbanLayout.ts`, `urbanArchitecture.ts`, `urbanContext.ts` | `urbanContext.test.ts` |
| 5 | "Estrutura B7" genérica | Perfil de apoio padrão | Renomeada para "Centro Administrativo" (ID `indumoveis:support:b7` preservado). Dois pavimentos, fachadas cinza-esverdeadas, faixas de janelas, embasamento terroso, mural na empena norte (Rua Argentina), marquise com escada metálica, anexos de tijolo e jardim | `civicArchitecture.ts`, `architecture.ts`, `data/territory.ts` | `architecture.test.ts`; capturas `administrative-*` |
| 6 | Lotes externos 69 e 70 vendidos como terreno | Cadastro incluía áreas verdes | Retirados da apresentação comercial (lista, busca, rótulo, seleção). Os contornos permanecem como contexto físico: jardim do Centro Administrativo e área verde do setor leste | `data/territory.ts` (`RETIRED_EXTERNAL_LOTS`) | `geometry.test.ts`, `commercialPresentation.test.ts`, `permanentPark.test.ts` |
| 7 | Centro de eventos como galpão de duas águas | Perfil antigo | Cobertura de quatro águas convergindo para lanternim envidraçado, empena transversal de entrada com pano de vidro e pórtico | `civicArchitecture.ts`, `architecture.ts` | `architecture.test.ts`; capturas `event-centre-*` |
| 8 | Estruturas permanentes sem identificação ao clique | Só a busca as localizava | Clique no volume (3D) ou no contorno (2D) mostra uma ficha transitória com o nome; não seleciona nada nem abre consulta comercial. Nenhuma placa permanente foi adicionada | `MapRenderer.tsx`, `Map2D.tsx`, `CommercialMapWorkspace.tsx`, `map.css` | `Map2D.test.tsx`; ensaio no navegador |
| 9 | Asfalto azul-ardósia, lido como molhado | Cor compartilhada com a planta 2D | Asfalto 3D cinza neutro, independente da cor 2D; sem setas nem tracejado central nas ruas internas | `surfaceMaterials.ts`, `parkDetails.ts`, `urbanContext.ts` | `parkDetails.test.ts`, `urbanContext.test.ts` |
| 10 | Retângulos de verde mais escuro e saturado sobre o terreno | Gramado do parque e terreno aberto com paletas diferentes | Um único tom de grama para lotes, canteiros e áreas plantadas, casado com o terreno nas capturas de visão geral | `surfaceMaterials.ts`, `MapRenderer.tsx` | Amostragem de pixels descrita no relatório |
| 11 | Números de lote girando continuamente com o azimute da câmera | Eixos do rótulo derivados da matriz da câmera | Linha de base fixa por lote (aresta de testada), tamanho limitado pelas cordas livres do polígono, inversão única de 180° com histerese, saída progressiva com a distância | `commercialPresentation.ts`, `MapRenderer.tsx` | `commercialPresentation.test.ts`; capturas `lots-*` |
| 12 | Metas de fluidez sem medição | — | Roteiro reproduzível de capturas e gestos, com condições declaradas | `scripts/commercial-map-fidelity-validation.mjs` | Relatório de fidelidade |

## O que não foi alterado

- Nenhum dos 57 lotes remanescentes mudou: o digest SHA-256 do cadastro atual é igual ao do cadastro anterior com apenas 69 e 70 removidos.
- Identificadores de entidades, acesso a dados (`src/lib/api.ts`), autorização (RLS) e funções SQL.
- A imagem de satélite não é usada como textura nem distribuída: serviu apenas de referência de leitura durante a digitalização.
