# Parque — diagnóstico e correção territorial de novembro de 2026

## Revisões e escopo

A implementação parte de Indumóveis `f0d565096c07523dd209db288f764cfeda7b32b7`, revisão citada pelo usuário e confirmada no checkout de destino. O HEAD remoto/main da referência FENASOJA é `6d284e9ed491cfa6171a9fe377051b556ea6e73c`. O checkout de referência local estava em `6481952ecac1be48777e410a558363fabeac36a9`; seus arquivos físicos relevantes foram comparados ao conteúdo remoto citado, normalizando CRLF/LF, sem diferenças nesses arquivos. Alterações locais preexistentes da referência permaneceram intocadas. Não houve commit, modificação, publicação ou escrita de dados na FENASOJA.

O proprietário confirmou a mesma base de quadras físicas para os dois eventos e autorizou corrigir posições e orientações estruturais. Isso substitui a premissa anterior de manter os setores separados para não tocar entidades existentes. A proteção incide nos lotes e seus dados, não em distâncias esquemáticas erradas entre equipamentos.

## Anexos e precisão

Foram inspecionados os seis prints, o PDF comercial A2 e a planta geral A3 em imagem. As câmeras dos prints têm rotações próprias; não são orientação geográfica. A planta geral anexada é uma imagem raster de baixa resolução, não um segundo PDF vetorial.

| Fonte                  | Conferência atual                                                                                                                    | Condição                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF A2                 | SHA256 `895a6d7a60d411ac3152403e2b5319eb8637bd38d0749f89509bd5dafb5b23b6`; página única, rotação de 270°, normalizada em 1684 × 1191 | PDF híbrido: curvas/linhas vetoriais e imagens embutidas; não tomar imagem redimensionada como escala nominal precisa                                                                                                             |
| Planta geral A3 raster | SHA256 do arquivo local `789e197e5d5ca4722d653957ab4f4e01895f98d68b09c27b19fba0174fdc38bf`                                           | Difere do SHA256 `15bd752d4f6dfc1ede839d773858d210262fb562468e9a544b907e4ef5e32aed` informado no briefing. A correspondência visual foi considerada, mas não se declara identidade binária; ela não governou o ajuste dimensional |
| FENASOJA código        | Revisão `6d284e9ed491cfa6171a9fe377051b556ea6e73c`                                                                                   | Identidades, traçados e detalhes arquitetônicos; retângulos periféricos aproximados conferidos contra A2 antes da adaptação                                                                                                       |
| Indumóveis cadastro    | 59 envelopes, 70 números                                                                                                             | Geometria, identidade, áreas, agrupamentos, vínculos comerciais e caminhos de acesso a dados protegidos                                                                                                                           |

O documento anterior descrevia inspeções de mapas publicados de outra preparação. Esta evidência corresponde aos arquivos, à implementação local e às capturas/medições registradas na validação atual; não usa aquela descrição como prova de inspeção autenticada ou publicação desta branch.

## Proteção comercial

A assinatura comercial separada é `01b9fc09a1a915761dbb9334e90c83e58b4dd9bab2436552cf10fff307ad563b`. A assinatura territorial legada `c6d2ecb439fc39dd9ac449267472d99cf62b6e6fe50e9b7b7eed8668c70bb88b` permaneceu preservada. Árvores, acessos e infraestrutura que a assinatura antiga também abrangia não impedem as correções estruturais autorizadas na apresentação.

`territory.ts` continua a fonte comercial. Os lotes retornam os próprios objetos aprovados na adaptação de apresentação. O código não grava cadastros para simular encaixe, não desloca lotes individualmente e não altera edição, empresas, vendas, contratos, estados ou seleção. O backend, as regras de autorização e os caminhos de API permanecem fora do escopo desta alteração.

## Registro espacial executado

O registro físico principal usa a A2 normalizada, com 16 cantos I/D/J/E e três controles independentes L/F. A similaridade única tem escala 0.2576707743974469 e rotação −0.25108498313103755°. RMS do ajuste 0.2830 u.d.; máximo 0.4997 u.d. RMS independente 0.6689 u.d.; máximo 0.7640 u.d. O limite de revisão 1.2 u.d. deriva de aproximadamente meia largura do corredor Argentina aprovado. O ajuste não implica precisão topográfica nem metragem de campo.

A conversão do desenho de código FENASOJA para A2 é uma transformação afim comum e rastreável, separada do ajuste físico. Os controles periféricos identificaram discrepâncias nos retângulos do código; portanto P9, equipamentos e setores com fonte A2 direta usam seus contornos A2 na apresentação. Não se oculta o resíduo com uma translação por setor. A rejeição anterior de um ajuste por pavilhões não invalida o novo registro pelas quadras compartilhadas.

O relatório gerado [park-correspondence.md](validation/park-registration-2026-11-02/park-correspondence.md), o [SVG técnico](validation/park-registration-2026-11-02/park-technical.svg) e o [JSON](validation/park-registration-2026-11-02/park-technical.json) documentam todas as peças, lotes associados, vias limítrofes, extensões, marcos, frentes e resíduos. O lote 57 corresponde a um subconjunto de O, o 70 a A e o 69 à faixa física de apoios P3/B11. As frações de interseção 93.724%, 99.785% e 97.408% explicitam os pequenos resíduos; não se declara igualdade entre um subconjunto e a quadra inteira.

## Inventário e correções

| Conjunto                 | Fonte/identidade                | Tratamento físico                                                                                                                                           |
| ------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1/P14/P12/P8/P13/P3     | B1/B2/B3/B4/B5/B6               | Footprints A2 de apresentação; frentes explícitas para circulação interna; cumeeira, frente e entradas separadas; P8–P13–P3 preservam arestas e identidades |
| Exporural                | R/S, P9/P7/P6–P10–P11/P5        | Peças físicas, vias brancas periféricas e transversais e construções permanentes; sem parcelamento comercial rural                                          |
| Alameda/Mirante/Arena    | D1/D3/F                         | Footprints A2 diretos, detalhes adaptados das reconstruções verificadas; Arena sem logo de cobertura                                                        |
| Casa/Sede/Palco          | B12/B13                         | Conjunto físico ao lado da circulação interna, sem duplicar Mão na Massa ou equipamentos sob nomes semelhantes                                              |
| Cozinha da Soja          | B7/P4                           | Identidade própria, distinta da Sede e do apoio B7 Indumóveis                                                                                               |
| Centro administrativo    | B11                             | Usa o responsável visual do apoio B7 Indumóveis, sem outra cópia do mesmo edifício                                                                          |
| Centro de Eventos        | C1                              | Usa a entidade existente e footprint A2 de apresentação                                                                                                     |
| Café/Bar/Restaurante     | C2/C3 conjunto na fonte         | Três responsáveis existentes preservados; correspondência individual pendente, sem criar prédio conjunto duplicado                                          |
| Etnias e praça           | C5/C6/C7/C8, B29                | Footprints A2 diretos e circulação do conjunto, com clareira cívica e acessos respeitados                                                                   |
| Portões                  | A1–A11                          | Passagens e direções na A2, distinguindo círculo técnico, código e abertura; arquitetura não inferida dos símbolos                                          |
| Bosques                  | Maciços A2 e fontes verificadas | Distribuição orgânica de apresentação dentro de polígonos documentados, excluindo copas sobre lotes, vias, passeios, equipamentos, clareiras e entradas     |
| Estacionamento posterior | Bolsões e vias de vagas         | Excluídos; acessos e contorno do parque preservados, incluindo a curva A6                                                                                   |

As quadras de contexto representam apenas a organização física, sem números, compradores, reservas, estados, valores ou marcas comerciais da FENASOJA. Os códigos físicos da tabela são técnicos e não criam cadastros nem capturam seleção de lotes.

## Rede e validação

As separações brancas são ruas, conforme esclarecimento do proprietário. A extração híbrida respeita a borda vetorial 5308 e os furos verdes das quadras. A largura é medida na fonte calibrada e registrada em unidades de desenho, com alargamentos de encontros separados da mediana do corredor. A sinalização interna é retirada pela classe física da via; sinalização externa pertinente mantém responsável próprio.

O refinamento visual RDP limita a simplificação dos anéis rasterizados a 0.75 ponto A2, mantendo os dados brutos. A medição foi 3040 → 2287 vértices e desvio máximo de 0.193130 u.d. antes do recorte de proteção comercial. O critério é relativo à evidência raster extraída, separado da tolerância de registro de 1.2 u.d. Não se suavizam lotes, footprints vetoriais ou quadras para acomodar modelos. [A conferência dos anéis](validation/park-registration-2026-11-02/road-contour-review.json) preserva os 39 furos e não utiliza `make_valid` ou `buffer` para ocultar uma geometria inválida.

A auditoria física considera a união de pisos reais, remove os polígonos de lotes e construções e propõe percursos numa grade conservadora erodida de 0.125 u.d., com quatro vizinhos. Cada segmento central e as laterais a ±0.035 u.d. são repartidos em todos os cruzamentos com bordas de pisos e obstáculos. O interior de cada intervalo de classificação constante precisa estar apoiado no piso vetorial exato. Essa prova analítica substitui a amostragem uniforme anterior de 0.08 u.d.; o teste de regressão inclui um vão de 0.04 u.d. que aquela amostragem pulava. O campo `sampleStep` no JSON permanece apenas como histórico, não é o critério de aprovação atual. A grade pertence apenas à auditoria: não cria superfície ou funcionalidade de rotas no mapa. Um bounds próximo ou uma reta através de gramado não prova conexão. O resultado final é publicado pelo exportador com `--connectivity`; permissão operacional de veículos, horários de portões, rampas, níveis e cercamentos exigem evidência específica além da planta.

O resultado final verificou 73/73 âncoras, cobrindo todos os 11 portões, os 6 pavilhões prioritários, 19 equipamentos e as 37 peças das 22 quadras físicas. O Portão 2 utiliza a cadeia pedonal; a ligação veicular não é atribuída a esse trajeto. Os outros dez portões alcançam também a rede geométrica de veículos. As componentes conservadoras incluem fragmentos de recorte e trechos externos, sem representar setores comerciais isolados. A [conferência geométrica independente](validation/park-registration-2026-11-02/geometry-review.json) encontrou os 32 footprints de edifícios válidos e nenhuma interseção positiva entre edifícios ou destes com os 59 envelopes comerciais, incluindo a junção Sede/Palco com responsável único.

As capturas Superior, Oblíqua, frontal, reversa e próxima e a comparação de desempenho ficam na evidência de integração da branch. A sobreposição da A2 é ferramenta privada local de conferência; o SVG público não embute a planta nem importa seu parcelamento. Tipos, testes, lint e build são verificações locais, não prova de implantação em produção ou de desempenho em celular físico. A existência da PR e do build não prova que o Lovable publicou a versão.
