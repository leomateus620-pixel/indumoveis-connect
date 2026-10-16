# Mapa Comercial — Design QA

Revisão visual de 16/10/2026, com o fluxo interno Product Design `design-qa`. O alvo é a evolução solicitada de uma maquete existente: preservar implantação e consulta, enriquecer materiais/vegetação e dar acabamento institucional à operação. As cores antigas e as placas de rua são problemas a corrigir, não um alvo de reprodução literal.

## Findings

Não restam achados P0/P1/P2 acionáveis nos artefatos examinados. A última iteração encontrou a placa larga de Portão 03; a correção foi recapturada e comparada antes de mudar este resultado para aprovado. O resultado abaixo é de QA visual, não substitui o relatório técnico de desempenho/recursos.

## Fonte visual, implementação e normalização

Fontes do pedido, abertas nesta revisão, sem copiá-las para o projeto:

- `C:/Users/Leonardo/Downloads/Imagem do ChatGPT 16 de out. de 2026, 00_39_10.jpg`: 1116×105 px, toolbar.
- `C:/Users/Leonardo/Downloads/Imagem do ChatGPT 16 de out. de 2026, 00_39_04.jpg`: 1105×479 px, ruas/lotes.
- `C:/Users/Leonardo/Downloads/Imagem do ChatGPT 16 de out. de 2026, 00_38_58.jpg`: 1121×503 px, parque.

São recortes sem metadados confiáveis de viewport CSS/densidade, usados como referência qualitativa junto ao briefing. A comparação equivalente usa o baseline aprovado reconstruído em `artifacts.local/art-direction/before/` e `before-ui/`, contra produção em `artifacts.local/art-direction/final/`. Os caminhos individuais estão em [image-manifest.json](docs/validation/commercial-map-art-direction/image-manifest.json).

| Comparação combinada, efetivamente aberta                                                                                                                                                          | Fonte e implementação, cada uma | Viewport/estado                                                 | Raster combinado |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------- | ---------------- |
| [Overview](docs/validation/commercial-map-art-direction/comparison-overview.png), [Superior](docs/validation/commercial-map-art-direction/comparison-top.png)                                      | 1200×600 px / 1200×600 CSS      | Browser 1280×760; Leve; parque sem ficha; mesma pose registrada | 1200×1272 px     |
| [P1/bosque](docs/validation/commercial-map-art-direction/comparison-P1.png)                                                                                                                        | 1200×600 px / CSS               | Oblíqua; close de P1, árvores, passeio e apoio                  | 1200×1272 px     |
| [P12](docs/validation/commercial-map-art-direction/comparison-P12.png), [P8/P13/P3](docs/validation/commercial-map-art-direction/comparison-P8-P13-P3.png)                                         | 1200×600 px / CSS               | Oblíqua; ficha fechada; mesma pose                              | 1200×1272 px     |
| [B7](docs/validation/commercial-map-art-direction/comparison-B7.png)                                                                                                                               | 1200×600 px / CSS               | Oblíqua; estrutura e apoios; mesma pose                         | 1200×1272 px     |
| [Cruzamento Argentina](docs/validation/commercial-map-art-direction/comparison-Argentina-crossing.png)                                                                                             | 1200×600 px / CSS               | Perspectiva; encontro real das vias; mesma pose                 | 1200×1272 px     |
| [Interface desktop](docs/validation/commercial-map-art-direction/comparison-interface-1366x768.png)                                                                                                | Workspace 1294×720 px / CSS     | Viewport 1366×768; sidebar compacta; estado pronto              | 1294×1512 px     |
| [Interface mobile](docs/validation/commercial-map-art-direction/comparison-interface-390x844.png), [seleção mobile](docs/validation/commercial-map-art-direction/comparison-selection-390x844.png) | Workspace 390×796 px / CSS      | Viewport 390×844; pronto / Lotes 09 / 10 com ficha recolhida    | 390×1664 px      |
| [Interface paisagem](docs/validation/commercial-map-art-direction/comparison-interface-844x390.png)                                                                                                | Workspace 772×342 px / CSS      | Viewport 844×390; sidebar compacta; estado pronto               | 772×756 px       |

Densidade de captura: `deviceScaleFactor=1`; comparação em pixels nativos, sem downsampling. Os combinados empilham dois rasters intactos e duas faixas editoriais de 36 px. Nas cenas, câmera/alvo/zoom/perfil e Canvas são iguais, conforme [poses antes](docs/validation/commercial-map-art-direction/before-reference-poses.json) e [depois](docs/validation/commercial-map-art-direction/reference-poses.json). Na UI, viewport/entidade/estado são equivalentes; altura do cabeçalho e reenquadramento no espaço livre mudam intencionalmente. Esses pares de UI não são usados como prova de projeção 3D idêntica.

## Comparação de conjunto e regiões focadas

A leitura de conjunto passou para parque e interface: terreno, lotes, vegetação, passeios, asfalto e coberturas agora se distinguem, sem cores comerciais decorativas. A sequência industrial e os acessos conservam a organização visível do baseline. A toolbar deixa de ser uma fila de ícones: vistas, zoom/enquadrar, modo e ações secundárias têm grupos e pesos próprios.

A leitura focada foi feita nos mesmos combinados, em tamanho nativo: P1/bosque para copa/contato/fachada; P12 e P8/P13/P3 para planos de chapa, recuos, pilares e aberturas; B7 para acabamento secundário; cruzamento para bordas e passagem. Para a toolbar desktop foram examinadas as faixas `(0,36,1294,64)` e `(0,792,1294,64)` do combinado. Busca/ficha/foco foram lidos também nas capturas `S37-*` de `artifacts.local/art-direction/final/`, 1294×720 desktop e 390×796 mobile. Não se inferiu refinamento só da vista geral.

## Superfícies obrigatórias

- **Fontes/tipografia:** título compacto, pesos ópticos dos controles e hierarquia identificação → localização → área estão legíveis; a identidade de P1 continua visível ao rolar, inclusive quebrando em duas linhas em paisagem. Figtree e Plus Jakarta Sans continuam no CSS. Google Fonts foi bloqueado no laboratório: os rasters demonstram os fallbacks, não carregamento/fidelidade das fontes remotas. Antialiasing, pesos e quebras foram avaliados nesse limite.
- **Espaçamento/layout:** grupos coesos, raios e sombras curtas; mobile preserva duas linhas no topo e paisagem uma linha. Busca ancorada e ficha compacta mantêm mapa consultável. Não há controle no rodapé, sobreposição de alvos ou salto de layout visível nos estados examinados.
- **Cores/tokens:** marfim, ameixa ativo, acento vermelho discreto e verdes variados são coerentes. Parede mineral, concreto, cobertura fria, abertura azul escura e asfalto seco têm leitura distinta; não há aparência cromada generalizada. Contrastes locais amostrados: corpo 14,07:1, secundário 5,77:1 e ativo 9,42:1, sem alegação de certificação global.
- **Imagem/assets:** geometria continua sendo geometria; não foi substituída por fotos ou imagens geradas. Copas agrupadas melhoram silhueta e contato sem esconder P1. Chapa é perceptível no close, sem criar ondulações geométricas por folha. Ícones permanecem Lucide, com espessura/tamanho consistentes. Não há logo de expositor, decoração comercial nova ou substituição de asset de marca no workspace comparado.
- **Copy/conteúdo:** nomes, números, localização e área pendente permanecem claros. A situação não confirmada continua explícita; sem inventar disponibilidade. A legenda técnica permanente foi retirada do estado pronto. Textos da ficha conservam a distinção entre fonte esquemática e acabamento estimado.

Estados adicionais lidos: normal, hover com tooltip, foco de teclado, vista/modo ativos, zoom pressionado, busca e ficha mobile (`S37`); inspeção de P1 com ficha expandida em 390×844 e 844×390. O foco é visível e os controles mantêm alvos de pelo menos 44 px conforme os seis percursos do laboratório. Os rasters não comprovam temporização de movimento, interação física ou reflexão em movimento; esses resultados pertencem à validação funcional/técnica.

## Histórico das iterações

| Achado anterior                                                            | Correção                                                                                               | Evidência após correção                                                                                                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2: pavimento preto no piloto por atributo de cor ausente                  | Cor neutra explícita na geometria, preservando material/topologia                                      | Combinados finais de overview, P1 e cruzamento: grafite azulado, bordas laterais e passagem aberta                                                                              |
| P2: título da ficha saía de vista quando a inspeção rolava o painel mobile | Bloco de identidade sticky com categoria, fechamento, título e localização                             | `artifacts.local/art-direction/final/inspection-390x844-workspace.png` e `inspection-844x390-workspace.png`, abertos: título/localização visíveis                               |
| P2: texto de rua persistia abaixo do limiar após redução perspectivada     | Conferência da projeção final e histerese efetiva                                                      | Capturas S31 finais em distâncias 10/38/150 e inclinações 0,08/0,8/1,4; ruas sem banner e ocultas quando pequenas/rasantes; testes projetados registrados na validação          |
| P2: placa Portão 03 e referências abertas largas em vista rasante          | Apoios sem definição arquitetônica usam texto fixo no chão, sem placa/compensação e com teto projetado | [Comparação da iteração](docs/validation/commercial-map-art-direction/comparison-support-reference-rasante.png), aberta após recaptura: placas ausentes e composição preservada |

A última comparação contém dois workspaces 1294×720 px, viewport 1366×768, densidade 1, perfil Leve, distância 150 e inclinação 1,4; combinado 1294×1512 px. Fonte da regressão: `artifacts.local/art-direction/after/S31-street-plain-d150-p1.4-workspace.png`. Implementação corrigida congelada: [proof-S31-ground-references-d150-p1.4-workspace.png](docs/validation/commercial-map-art-direction/proof-S31-ground-references-d150-p1.4-workspace.png), SHA-256 `a08712ccd2fa0bd5c2259257dc19248b0202e4825f21f691d4753a66c4b2625b`. O conteúdo foi lido no combinado, com atenção à frente de Portão 03 e referências ao fundo; desapareceu o banner e os identificadores dos edifícios continuam compactos. O laboratório [ground-reference-proof-validation.json](docs/validation/commercial-map-art-direction/ground-reference-proof-validation.json) registra as 18 poses de S31 passando, com zero erros de execução e o chunk `/assets/MapRenderer-BeVQLkfg.js`, SHA-256 `f81cbb49bf02cec76b6f8c99b081f089f5f20df86858a7298393f3b750f1a288`. A rodada técnica completa é registrada separadamente; esta prova não é apresentada como substituta dela.

## Gaps e polimento

A fidelidade com Google Fonts efetivamente carregado e dispositivos físicos Android/iPhone/Safari não foi comprovada. Foco/contraste local e viewport emulado não equivalem a auditoria global de acessibilidade; zoom de texto do sistema não foi ensaiado nesta leitura. As fontes territoriais continuam esquemáticas, não certificação de fachada real.

[P3] O identificador agregado `09 / 10` é menor que os números simples vizinhos na aproximação. Continua legível e repetido na ficha; uniformizar a óptica de números agregados pode ser refinamento posterior, sem alterar IDs ou envelopes.

## Checklist de implementação

- [x] Ler fontes e implementação no mesmo combinado, com dimensões/densidade registradas.
- [x] Conferir tipografia, layout, tokens, assets, copy e estados em regiões focadas.
- [x] Confirmar visualmente pavimento e identidade sticky após correções.
- [x] Corrigir referência Portão 03, recapturar a mesma pose e reler antes de aprovar QA.
- [x] Registrar os limites de evidência das fontes remotas/dispositivos e da validação técnica.

final result: passed
