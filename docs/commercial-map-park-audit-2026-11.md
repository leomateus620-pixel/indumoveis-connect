# Parque 3D — diagnóstico e limites da adaptação

## Revisões e base protegida

Destino: `736b8d426c9e3f4d83ef0321302a0b20621e4183` (árvore limpa antes da tarefa). A referência FENASOJA foi consultada sem alterações: checkout local `a09a4c68052a7c5fb2a1966d6e1e67980264e8fd`; o HEAD remoto consultado era `6d284e9ed491cfa6171a9fe377051b556ea6e73c`. Os dois mapas publicados estavam acessíveis em sessões já autenticadas. As vistas gerais e superiores foram observadas na passagem de 01 para 02/11/2026; elas não são um levantamento dimensional nem imagens com escala equivalente.

O exportador `scripts/commercial-map-source-audit.mjs` registrou, antes da edição, SHA-256 `c6d2ecb439fc39dd9ac449267472d99cf62b6e6fe50e9b7b7eed8668c70bb88b` para os atributos territoriais protegidos e `db70a5cb1362b3cfdeadfea02bfc2b8f54c497ad9c36216907174226886eaa11` para a fonte, com 59 envelopes e 70 números. A assinatura cobre limites, árvores, IDs, polígonos, âncoras, números, acessos, áreas declaradas, rótulos e localização. Vínculos persistidos e status são resolvidos pela aplicação e não são exportados com dados pessoais.

O referencial comercial é PDF/10, com mundo `(x, altura, y)`; não é métrico. O ajuste global anterior entre seis pavilhões foi rejeitado por RMS de 23,41 pontos PDF e pior resíduo de 39,66 pontos, conforme [fontes](commercial-map-sources.md). Isso impede afirmar o encaixe de um parque completo por simples cópia de coordenadas. As correspondências arquitetônicas não implicam equivalência cadastral; particularmente, o apoio B7 não é o B7 da referência.

## Inventário comparativo

Prioridades: P1 = leitura e implantação comercial; P2 = circulação e arquitetura de apoio; P3 = contexto complementar. “Pendente” indica que a conferência espacial necessária ainda não foi concluída; não significa que um volume genérico seja uma reconstrução validada.

| Estrutura/área | Localização na referência | Estado inicial no destino | Ação | Origem | Adaptação / evidência | Prioridade |
| --- | --- | --- | --- | --- | --- | --- |
| P1 / Mostra | Núcleo ao lado do bosque e P14 | Shell próprio; Mostra identificada no P1 | Melhorar acabamento | `pavilionArchitecture2026.ts`, planta Indumóveis | Perfil local no footprint protegido; fachadas e alturas interpretativas | P1 |
| P14, P12 | Frente do núcleo junto à avenida | Shells individuais | Melhorar acabamento | Planta e catálogo de pavilhões | P14↔B2 é identificado na fonte; fachada e encaixe ainda exigem conferência. Não inventar porta ou mudar implantação | P1 |
| P8, P13, P3 | Sequência de coberturas contíguas | Footprints contíguos, inspeção de coberturas | Melhorar acabamento e conferir junções | `pavilionConnectedComplex.ts` e planta | Sem novos corredores ou deformação de lotes; conferir faces também com telhados ocultos | P1 |
| Lotes e ruas comerciais | Malha interna | 59 envelopes, 70 números; geometria e seleção próprias | Preservar | `territory.ts`, dados e associações Indumóveis | Não importar numeração, marcas ou status da referência | P1 |
| Benvenuto, Imigrantes, rótulas e transversais | Frente do parque e bairro | Rede contextual existente, alinhamento esquemático | Corrigir interfaces documentadas | Extrato OSM e `urbanReference.ts` | Nó compartilhado e términos `noexit`; larguras sem tag são estimativas, não cotas | P2 |
| Bairro lateral | Faixa entre avenida e fundos | Residências determinísticas e parcelas simplificadas | Adaptar por setor | `lateralResidentialDistrict.ts`, OSM e imagem superior | Não fechar fundos com rua fictícia; casas e anexos não são automaticamente imóveis distintos | P2 |
| Centro de Eventos | Conjunto permanente na referência | Área de eventos existente na planta | Adaptar | Catálogo e cena FENASOJA; confirmação do usuário de que corresponde à área protegida | Conservar o polígono, a seleção e os vínculos existentes; detalhes e encaixe são de apresentação | P2 |
| Café, Bar e Restaurante | Ao lado do bosque e da Calçada do Arvoredo | Três apoios com IDs próprios | Melhorar acabamento | Restaurante Central C2/Pizzaria C3 e planta Indumóveis | Correspondência de conjunto plausível pela posição; não há equivalência comprovada de cada subdivisão. Não é a Alameda D1 | P2 |
| Alameda Gastronômica e Casa/Sede | Conjuntos permanentes em outros setores da referência | Sem correspondência individual demonstrada | Adaptar como contexto | Catálogo FENASOJA | Volumes de apresentação por setores, sem afirmar equivalência cadastral; encaixe e distâncias reais pendentes | P2 |
| Etnias, Arena e Mirante | Setor complementar da referência | Ausentes como conjuntos identificados | Completar como contexto | `StrategicLandmarks.tsx`, `SicrediArena.tsx`, `MirantePavilion.tsx` | Arena sem `ArenaRoofBrand`; modelos e implantação esquemáticos, sujeitos à conferência visual e de campo | P2 |
| Exporural e Espaço do Automóvel | Áreas externas da referência | Malha comercial própria e áreas de apoio | Adaptar terreno, vias e pavilhões; preservar base | Planta Indumóveis e referência | P9, P7, P6/P10/P11 e P5 e nove trechos viários; sem lotes, ocupações ou status FENASOJA | P1 |
| Bosques, calçada, jardins e portões | Entorno dos edifícios e vias | Vegetação e superfícies existentes | Preservar e harmonizar | Planta, referências e bibliotecas locais | Distribuição e alturas são representação, não inventário botânico | P3 |
| Estacionamento posterior | Extremo superior da referência | Não montado como camada específica | Excluir do reaproveitamento | Vista FENASOJA | Não incluir bolsões, veículos, vagas ou controles posteriores; pintura viária própria continua | P1 |

O inventário não substitui vistas de detalhe, verificação de colisões ou ensaios de desempenho. A entrega deve manter expressas quaisquer linhas ainda pendentes.

O usuário esclareceu durante a execução que estruturas do mesmo parque podem ter nomes diferentes nos dois sistemas e autorizou a representação do Centro de Eventos sobre a própria área protegida correspondente. Essa autorização não altera o cadastro comercial nem comprova automaticamente a correspondência dos demais ativos.

Uma consulta adicional à fonte identifica B1–B6 como P1, P14, P12, P8, P13 e P3, respectivamente; o B7 da FENASOJA é o Pavilhão 4 e não o apoio B7 do destino. A Sede B12 e o Palco B13 ocupam um setor comparável ao Mão na Massa e áreas adjacentes, mas essa proximidade não identifica cada estrutura. A camada contextual representa Arena, Mirante, etnias e Alameda D1 em posições setoriais esquemáticas; sua correspondência exata com a planta comercial e suas distâncias reais continuam pendentes. Ver [implantação e origens](commercial-map-permanent-park.md).
