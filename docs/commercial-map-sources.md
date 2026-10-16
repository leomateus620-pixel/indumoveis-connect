# Mapa Indumóveis: fontes e geometria externa

Revisão territorial `2026-10-15`. A geometria canônica está em `src/features/commercial-map/data/territory.ts`; 2D e 3D recebem os mesmos IDs, polígonos e âncoras. Não há raster de planta, marca de expositor, dado FenaSoja remoto ou informação comercial embutida.

Na etapa 2, a revisão territorial permanece a mesma. A [arquitetura de apresentação](commercial-map-architecture.md) registra os seis perfis estimados consultados no código FenaSoja, sua adaptação aos footprints Indumóveis e as pendências de elevação real; não é uma nova fonte cadastral. As imagens WhatsApp mostram a maquete anterior, sem certificar fachadas/coberturas reais. A [validação atual](commercial-map-stage2-validation.md) compara a assinatura dos atributos protegidos antes/depois, separando modelos derivados dos dados territoriais.

## Conferência dos documentos

Todos os seis PDFs locais foram renderizados integralmente em PNG com Poppler e conferidos visualmente, incluindo títulos, portas e numeração. A ordem dos anexos não foi utilizada. O Markdown adicional foi lido integralmente antes da implementação. A captura do sistema serve apenas para localizar a rota, sem inferência de metragem.

| Arquivo local                     | Título conferido / uso                                                                  | SHA-256                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| V1 - Mapa parque Externo (10).pdf | ÁREA EXTERNA - PARQUE DE EXPOSIÇÕES; implantação principal                              | `5f00945cc6ed5af18cbfc83be5334cd4a17850f6d9e356203268f197a50d35d0` |
| Pav 3 - 06 - 23.09.2026.pdf       | PAVILHÃO 3 - COMÉRCIO, FORNECEDORES, CONSTRUÇÃO CIVIL E MOBILIÁRIO; área total 1.155 m² | `b7afd7a651d95b666ed16d004a15a5bf225dd1d1809fb2d436e62e05ac8bcb12` |
| Pav 08 - 02 - 14.11.25.pdf        | PAVILHÃO 08 - FORNECEDORES E CONSTRUÇÃO CIVIL; área total 937,32 m²                     | `63e3762f7d20b34359f451da1cac63ad7e03327496695106dff4b9c11e239767` |
| Pav 12 - 07 - 14.09.26.pdf        | PAVILHÃO 12 - MÓVEIS E SERIADOS; área total 1.650 m²                                    | `f933d506774daf59c7cdd2749bea6eafd3784de10f2a99a814abf76e2db96c37` |
| Pav 13 - 07 - 17.08.26.pdf        | PAVILHÃO 13 - SALÃO DE IMÓVEIS; área total 850,5 m²                                     | `5d33bd55d353021ba18f6e3cc6114544723f8ed292b149e0aab628625187ef67` |
| Mostra Arq&Design 1.pdf           | PAVILHÃO 1 - MOSTRA ARQ&DESIGN; nunca pavilhão 14                                       | `088ab9d98e61ed98c98b45834c5813416d9fd09a10af195aeeae29bfc9a4c02a` |

## Eixos, escala e pontos de controle

A folha principal mede 1955,3776 × 1062,4523 pontos PDF. O título cinza, margens e seta de legenda do portão não viram território. Recorte de navegação: x=4–187, y=7–103 unidades de desenho. A única transformação utilizada é **(x,y) do PDF / 10**, sem rotação ou translação; x cresce à direita, y para baixo. O mundo 3D recebe `(x, altura, z=y)`. Não há norte geográfico confirmado. Use “orientação da planta”. Alturas de 2,2–4,1 unidades são estimativas visuais; não são metros oficiais.

O desenho geral é esquemático. Suas proporções divergem das cotas dos interiores e da referência FenaSoja; nenhuma escala única comprovada o converte em levantamento métrico. Não deformamos edifícios isoladamente para produzir falsa precisão. As áreas oficiais são metadados separados. Área geométrica de polígono é em **unidades de desenho²** e não aparece como m², preço ou área vendável.

| Controle distribuído                | Ponto PDF (x,y)     | Canônico (x,y)      | Resíduo da transformação      |
| ----------------------------------- | ------------------- | ------------------- | ----------------------------- |
| Canto superior esquerdo pavilhão 1  | 307,6543; 550,3308  | 30,76543; 55,03308  | 0 pt, até arredondamento IEEE |
| Canto superior esquerdo pavilhão 14 | 329,4879; 697,8562  | 32,94879; 69,78562  | 0 pt                          |
| Canto superior esquerdo pavilhão 12 | 647,1247; 703,7982  | 64,71247; 70,37982  | 0 pt                          |
| Canto superior esquerdo pavilhão 3  | 1158,7329; 678,8834 | 115,87329; 67,88834 | 0 pt                          |
| Canto superior esquerdo lote 70     | 1528,9597; 669,8046 | 152,89597; 66,98046 | 0 pt                          |

Esses resíduos validam a transformação da digitalização, **não precisão topográfica**. Os limites principais foram extraídos das primitivas vetoriais com pdfplumber e cruzados com o PNG completo. Divisórias com espessura ~1,3756 pt usam a linha de centro compartilhada; não são novos corredores. O limite superior de 69 foi conferido visualmente acima da B7; a separação da área 70 acompanha o passeio desenhado.

Para reproduzir a vista superior limpa e os controles: `node scripts/commercial-map-source-audit.mjs <diretorio-temporario>`. O comando produz SVG sem empresas e JSON de desenvolvimento; não importa Three.js. Para sobrepor à planta original, multiplicar os pontos canônicos por 10 e pela razão pixel/ponto do PNG de Poppler. O PNG original contém empresas: manter o material em diretório temporário e não publicar como textura ou evidência pública.

## Confronto com FenaSoja, somente leitura

Checkout consultado: `C:\Users\Leonardo\Desktop\expo-logistics-hub`, branch `codex/ecosystem-hierarchy-controls`, HEAD observado `536bf2adc9c7a64e2b5e333865f1db33b21c89ec`. Havia alterações preexistentes; nenhuma foi editada. Foram lidos AGENTS da raiz e da feature, `officialReference2026.ts`, `constants.ts`, `commercialPavilionReference.ts`, `commercialTrees.ts` e os dois relatórios históricos de desempenho. Renderer/câmera/recuperação são inspecionados pelos responsáveis da implementação, sem copiar o Canvas monolítico.

Os seis cantos superiores esquerdos em pontos do PDF FenaSoja são: 1=(2298,3600), 14=(2418,3833), 12=(2792,3827), 8=(3172,3788), 13=(3307,3788), 3=(3460,3786). Uma similaridade de diagnóstico por mínimos quadrados contra os cantos Indumóveis resulta em escala **0,76579993**, rotação **+0,72467873°** no sistema y para baixo e translação **(-1447,097276; -2248,770503)**. Resíduo RMS **23,409706 pt**, pior **39,663665 pt**. Portanto a transformação foi **rejeitada para implantação**. Nenhuma posição FenaSoja foi transferida ao runtime.

O reaproveitamento é de relação permanente verificável e solução de engenharia: 1 separado de 14, sequência 14→12→8→13→3, avenidas inferiores, Alameda Mercosul e maciço junto à Mostra; projeção de plantas com eixos explícitos, materiais compartilhados e separação entre carga essencial e decoração. Atenção: **B7 da planta Indumóveis não é B7 da FenaSoja**. Não inferir função ou identidade a partir dessa coincidência.

## Inventário externo

**59 envelopes selecionáveis** cobrem exatamente os **70 números 01–70**, uma vez cada. Não são 70 polígonos individuais comprovados. Setores são descrições relativas a vias impressas; não novas quadras cadastrais.

| Faixa / localização                                  | Números e envelopes                                             |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| Rua Argentina, oeste                                 | 01,02,03,04,05,06,07,08                                         |
| Rua Argentina, leste                                 | **09 / 10**,11,12,13,14                                         |
| Rua Uruguai, quadras inferiores                      | 15,16,17,18,19,20,21,22,23,24,25,26,27,28                       |
| Salão do Automóvel, borda Uruguai                    | 29,30,**31 / 32 / 33 / 34**,**37 / 38**,**39 / 40**,**41 / 42** |
| Salão do Automóvel, borda Brasil                     | **43 / 44**,45,46,47,48,51,52,53,54,55,56                       |
| Salão do Automóvel, área atravessando as duas faixas | **35 / 36 / 49 / 50**; não “35–50”                              |
| Faixa superior, abaixo das áreas verdes sem número   | 57,58,59,60,61,62,63,64,65,66,67,68                             |
| Leste dos edifícios                                  | 69 acima da B7; 70 a oeste do passeio interno                   |

Os sete grupos em negrito têm subdivisão individual pendente; busca por qualquer membro resolve o mesmo envelope. Não há geometrias duplicadas sobrepostas. Nenhum grupo recebe soma de área oficial inventada.

Área declarada nos módulos inferiores: 203 m², com 11,3×18=203,4 m² (diferença +0,4). Nos módulos superiores: 227 m², com 11,3×20,1=227,13 m² (diferença +0,13). Lotes **14 e 28** têm a marcação específica **243 m²**, preservada. 57,69,70 e envelopes agregados não recebem área total sem anotação inequívoca. Os números mantêm IDs geométricos com escopo `indumoveis:external:lot:...`; UUID de espaço e edição comercial são resolvidos separadamente, por associação explícita autorizada.

## Edifícios, acessos, apoio e verde

São seis shells, sem estandes internos fictícios: 1,3,8,12,13,14. Áreas totais 3/8/12/13 são oficiais, não vendáveis. A planta específica de 1 distingue recepção 01, café 14, sanitários 15, corredores e Salão de Design; áreas externas associadas não viram lotes. A fachada principal indicada fica à direita da planta de 1. Pavilhões 3,8 e13 têm entrada na borda inferior das plantas específicas; 12 possui portas laterais e inferior. Posições de acesso são projeções **relativas** das fontes internas para o shell esquemático, não medidas de implantação. Pavilhão 14 não tem planta interna neste conjunto; posição exata de portas fica pendente.

O edifício 8 não ganha número 02. As lacunas do 13 e “RESERVADO” impresso não geram cadastros ou estados. Modelar subdivisões futuras exige arquivo próprio com revisão, sem modificar a base externa.

Há Rua Argentina, Uruguai, Brasil, Brasília, La Paz, Alameda Mercosul, Calçada do Arvoredo, Av. Benvenuto de Conti e Avenida dos Imigrantes; Portão 03, B7 e anexos, Espaço de eventos, Espaço Mão na Massa, café/bar/restaurante. Vias não definem orientação geográfica. Áreas verdes sem número, passeios e apoio permanecem não comerciais, incluindo a área a leste do lote 70. Quinze posições de árvores foram interpretadas dos símbolos da fonte Indumóveis, com copas pequenas; não foi importado o conjunto geral FenaSoja.

## Verificação e limites

`geometry.test.ts`: transformação sem espelho, finitude/degeneração/IDs/âncoras, inventário exato e grupo especial, ausência de sobreposição entre envelopes externos, ordem/separação dos seis pavilhões, diferença de áreas e distinção lote 70/passeio/verde. Resultado local observado: **7/7 passando** em Vitest. Isso valida o modelo vetorial e suas regras; não certifica precisão métrica, GPU, autenticação ou desempenho do renderer.

Pendências de fonte: subdivisões dos sete grupos; áreas totais de57/69/70; função das áreas sem identificação; acesso exato de14; alturas reais; cotejo cadastral do desenho esquemático e validação de campo. Nenhuma pendência é preenchida com dados comerciais FenaSoja, nomes de empresas ou suposição de disponibilidade.
