# Parque permanente — implantação física integrada

Esta revisão substitui a adaptação anterior por setores afastados. A premissa expressa do proprietário é que Indumóveis e FENASOJA utilizam as mesmas quadras físicas, com outra subdivisão, ordenação e ocupação comercial. A equivalência é de contornos e relações viárias; números de lotes dos eventos não são chaves de correspondência.

A base de implementação é Indumóveis `f0d565096c07523dd209db288f764cfeda7b32b7`. A referência arquitetônica foi consultada somente para leitura na revisão remota FENASOJA `6d284e9ed491cfa6171a9fe377051b556ea6e73c`. Não foram alterados o repositório FENASOJA, os cadastros, o backend ou os fluxos comerciais. A documentação anterior que autorizava deslocamentos setoriais e a interrupção de Brasília não descreve mais a regra de implantação.

## Referenciais e registro

A referência física principal é o PDF Civil3D A2 anexado, uma página com rotação de 270°, normalizada em 1684 × 1191 pontos PDF. O eixo horizontal da folha é x; o vertical para baixo é z. Não se interpreta o topo de um print como norte. O mundo Indumóveis continua no referencial PDF/10 já utilizado; unidades de desenho não se tornam metros por atribuição de um nome.

`parkRegistration.ts` documenta uma única similaridade A2 → Indumóveis:

- escala 0.2576707743974469;
- rotação gráfica −0.25108498313103755°;
- translação (−125.20955046775917, −140.983233679288);
- 16 cantos de I/D/J/E usados no ajuste: RMS 0.2830 u.d., máximo 0.4997 u.d.;
- três cantos independentes nos subconjuntos L/F: RMS 0.6689 u.d., máximo 0.7640 u.d.;
- tolerância de revisão 1.2 u.d., aproximadamente metade do corredor Argentina no desenho comercial aprovado.

A tolerância avalia a correspondência gráfica e é proporcional à circulação relevante. Não certifica topografia, altimetria ou acessibilidade. O registro anterior feito pelos pavilhões foi rejeitado; isso não impede o novo ajuste pelas quadras equivalentes confirmadas pelo proprietário.

O desenho Illustrator usado por `officialReference2026.ts` possui outro referencial, 7152.61 × 5735.29. Uma conversão afim comum desse desenho para A2 está documentada separadamente. Os retângulos aproximados do código apresentaram discrepâncias periféricas, inclusive P9, Mirante, Centro de Eventos e etnias. Esses objetos usam footprints A2 diretos na apresentação; a conversão central do código não é usada para alegar precisão na periferia. Detalhes arquitetônicos são adaptados ao footprint correspondente, sem deslocar um setor inteiro.

## Dados físicos e preservação comercial

`parkA2Reference.ts` contém as peças das quadras e setores físicos, footprints de edifícios, 11 aberturas de portões e a superfície de circulação. O registro reúne 22 componentes físicos, incluindo a faixa de equipamentos APOIOS-P3. V/U/T mantêm o corredor entre peças. R/S mantêm recortes e separações viárias. Não se aplica casco convexo nem se importa parcelamento comercial FENASOJA. O identificador de trabalho APOIOS-P3 designa a faixa junto a P3/B11; sua interface oeste é construtiva, sem inventar uma rua.

A tabela gerada em [park-correspondence.md](validation/park-registration-2026-11-02/park-correspondence.md) relaciona componente físico, peças da fonte, conjunto de lotes Indumóveis, vias limítrofes, extensões e marcos. Todos os 70 números têm correspondência por conjunto ou subconjunto. I/D/J/E usam os próprios envelopes dos lotes aprovados. L/F, O/lote 57, A/lote 70 e APOIOS-P3/lote 69 são subconjuntos físicos, sem exigir igualdade com toda a quadra. As interseções dos últimos três são 93.724%, 99.785% e 97.408%; os resíduos de borda são registrados e as geometrias aprovadas permanecem intactas.

A transformação é de apresentação. IDs, números, agrupamentos, subdivisões, áreas oficiais, âncoras e polígonos comerciais permanecem em `territory.ts`; empresas, vendas, contratos, edição, estados e seleção continuam pelos caminhos existentes. O snapshot comercial é separado de árvores, portões, ruas e apoios autorizados a mudar. A assinatura comercial observada é `01b9fc09a1a915761dbb9334e90c83e58b4dd9bab2436552cf10fff307ad563b`; a assinatura territorial legada `c6d2ecb439fc39dd9ac449267472d99cf62b6e6fe50e9b7b7eed8668c70bb88b` também permanece preservada, sem transformar seus elementos estruturais em invariantes de implantação.

## Circulação e acessos

As faixas brancas que contornam, dividem ou penetram os setores são ruas, conforme o esclarecimento do proprietário. O PDF é híbrido: parte das áreas é vetorial e parte está em imagens embutidas. A rede foi extraída do branco normalizado, com máscara pelo contorno vetorial original 5308, preservando 39 furos nas três componentes principais. Não se toma o branco fora do parque como rua. Não se utiliza complemento de vetores sobre uma base raster verde.

A apresentação dos contornos rasterizados remove os degraus de pixel com RDP de no máximo 0.75 ponto A2, abaixo do pixel da extração: 3040 vértices brutos passam a 2287. O desvio máximo medido é 0.749522 ponto A2, equivalente a 0.193130 u.d., antes do recorte contra lotes e edifícios protegidos. Esse refinamento não altera a evidência bruta, os contornos vetoriais de quadras/edifícios ou o ajuste espacial. Os três polígonos e seus 39 furos foram conferidos como válidos e simples, sem reparação automática e sem interseção positiva entre componentes; ver [conferência dos contornos](validation/park-registration-2026-11-02/road-contour-review.json).

A6 mantém a curva de acesso; o estacionamento posterior e suas vias de vagas são excluídos. Vias de contorno, passagens e portões continuam representados. O suporte OSM fica reservado ao entorno público, com responsabilidade visual única em `urbanReference.ts`; ele não força a malha interna a um alinhamento incompleto. Larguras são medidas por seções dos corredores da planta calibrada, com condições gráficas registradas; não são inventadas cotas em metros.

Buenos Aires, Paraguai, Mercosul, Brasil, Brasília e as transversais relacionam o núcleo comercial ao rural, Mirante/Arena e etnias. Bruno Schwartz, Johan Muller, Gustavo Bessel, Emanuel Brachmann, 15 de Novembro, Pastor Albert Lehenbauer e Ubiretama têm seus traçados conferidos em relação às quadras. Os eixos e larguras da vista técnica são ferramentas de conferência, sem inserir tracejados ou setas nas ruas internas do produto.

Os portões usam passagem, orientação e largura gráfica A2, não o centro de um círculo como volume arquitetônico. Não foi inferida uma arquitetura de pórtico a partir dos códigos. Pequenos símbolos que ocultam o piso são tratados como oclusão gráfica quando a continuidade da abertura é comprovada. Verificar o resultado do grafo de superfícies em vez de concluir conexão por proximidade de bounds.

## Edifícios, identidade e apresentação

B1/B2/B3/B4/B5/B6 correspondem a P1/P14/P12/P8/P13/P3. P8–P13–P3 mantêm identidades e arestas construtivas compartilhadas, incluindo recortes frontais e o anexo posterior de P8. A frente explícita é independente da cumeeira e da ordem dos vértices; P12/P8/P13/P3 olham para Argentina e os lotes internos. P1/P14 se relacionam com a circulação lateral interna. Os proxies, rótulos e bounds acompanham os footprints de apresentação, preservando o vínculo da entidade.

Casa/Sede B12, Palco Lactalis B13 e Cozinha da Soja B7/P4 são equipamentos diferentes. O apoio B7 Indumóveis corresponde ao conjunto administrativo B11, sem trocar sua identidade comercial. P9 é PAVILHAO-09, distinto de B9/P6–P10–P11. O Centro de Eventos C1 utiliza seu responsável existente. C2/C3 é um envelope conjunto de restaurante/pizzaria na referência: a correspondência individual dos três apoios Café/Bar/Restaurante continua pendente e não se cria uma cópia adicional.

Arena permanece sem logo FENASOJA na cobertura. Casa/Sede, palco, rural, etnias, Alameda e Mirante usam as posições físicas conferidas. Coberturas, pilares, beirais, acessos, materiais, alturas e detalhes de faces são modelos de apresentação fundamentados nas fontes; não são um levantamento arquitetônico de todos os lados. Escadaria, praça e patamares da Arena são adaptados entre os footprints atuais dos marcos, com proporções da fonte explicitadas e cotas interpretativas.

## Vegetação e recursos

`parkPlanting.ts` distribui centros deterministicamente dentro de maciços documentados, com variação orgânica, sem alegar levantamento de troncos. Copas respeitam polígonos de lotes, edifícios, piso, passeios, pátios, clareiras e portões. Áreas de paisagem podem conter maciços; não se usa um veto indiscriminado a toda entidade landscape. A forma das copas e LOD continuam na biblioteca compartilhada do renderer.

O renderer, câmera, controles, presets Superior/Oblíqua/3D, seleção e busca continuam únicos. Geometrias estáticas são preparadas fora dos gestos; perfis de qualidade mantêm a organização do parque, com recursos compartilhados e descarte pelo seu responsável. A medição de abertura, frames, drawcalls e recursos é registrada na evidência de integração, em condições equivalentes.

O esquema de gestos e o retorno à vista anterior da sessão de inspeção estão documentados em [navegação integrada](commercial-map-navigation-2026-11.md). A revisão das frentes, cumeeiras, materiais e proxies dos pavilhões está em [arquitetura de apresentação](commercial-map-architecture.md). Esses documentos complementam a implantação; não substituem sua conferência por superfícies reais.

## Evidência e limites

A vista técnica pública SVG/JSON contém quadras, lotes, ruas com furos, eixos, footprints, frentes, entradas, portões e resíduos. A variante com raster A2 é ferramenta privada local, sem virar textura final ou introduzir números comerciais FENASOJA no produto. Execute `node scripts/commercial-map-park-audit.mjs docs/validation/park-registration-2026-11-02 --connectivity` para regenerar o relatório geométrico de rotas.

A auditoria distingue superfícies de veículos e pedestres. Uma grade conservadora da união física, erodida em uma célula de 0.125 u.d., propõe percursos. Cada segmento central e suas duas laterais a ±0.035 u.d. são particionados em todas as interseções com bordas de pisos e obstáculos; o interior de cada intervalo de classificação constante precisa estar apoiado no piso vetorial exato. Essa prova analítica substitui a antiga amostragem uniforme de 0.08 u.d., que podia pular um vão menor. A grade não gera asfalto ou conexões para fazer um teste passar. O relatório é separado do registro gráfico e não conclui conexão pela proximidade de bounds. Testes locais não comprovam implantação publicada, funcionamento de portões, níveis em campo ou desempenho de dispositivos móveis físicos.

A exportação final verificou 73/73 âncoras: 11 portões, 6 pavilhões, 19 equipamentos e cada uma das 37 peças das 22 quadras físicas, sem pendência de superfície. O Portão 2 é atendido pela cadeia pedonal representada; seu trajeto não é certificado como ligação veicular. Os outros dez portões também possuem ligação na rede geométrica de veículos examinada. Isso descreve continuidade do desenho, sem inferir regras operacionais. Os 32 footprints de edifícios são válidos, sem interseção positiva entre si ou com os 59 envelopes comerciais; ver [conferência geométrica](validation/park-registration-2026-11-02/geometry-review.json).
