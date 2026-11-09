# Pavilhão 13 · Galeria do Salão de Imóveis · Design QA, 08/11/2026

final result: passed

A vista anterior deixava circulação, fundo e lotes com pesos parecidos. A galeria usa um fundo quente com luz suave, paginação de carvalho nos corredores, perímetro em relevo e plintos sob os blocos. Madeira clara à esquerda, verde mineral na ilha central e argila suave à direita distinguem os setores. O novo símbolo combina um aparador e um painel de exposição. [Comparação no desktop](docs/validation/pavilion-13-galeria/comparacao-desktop.jpg) · [Identidade](docs/salao-imoveis-identity.md).

Os 80 algarismos tabulares em Figtree têm contraste de 9,83:1 a 10,48:1 nas superfícies dos setores e de 8,69:1 na seleção. A vista a 1440 × 900 mede 12,5 px para a numeração. Foram conferidos os 29 lotes da esquerda, os 22 da ilha central e os 29 da direita. A 378 × 465, 834 × 1112 e 1440 × 900, todos os números permanecem dentro das respectivas células. Busca, índice por setor e zoom permitem localizar um número no enquadramento compacto. [Índice e lote 18](docs/validation/pavilion-13-galeria/depois-desktop-indice.jpg) · [Tablet](docs/validation/pavilion-13-galeria/depois-tablet.jpg).

As placas para P3 e P8 foram reduzidas a 76 × 86 unidades e alinhadas à metade esquerda de suas passagens. As duas entradas e duas saídas usam os mesmos ícones do sistema. A camada de acabamento ignora o ponteiro e os 80 polígonos continuam sendo as áreas selecionáveis. [Sinalização](docs/validation/pavilion-13-galeria/sinalizacao.jpg).

O navegador confirmou busca válida e inválida, índice por teclado, recarga, zoom, arraste, fechamento do painel, ida e volta pelos acessos P3 e P8 e entrada pelo parque. Na primeira revisão móvel, a seleção do último lote deixava o título acima da área visível e aproximava o lote dos controles. A 390 × 844, a seleção do lote 80 agora leva foco ao título visível no topo do painel e deixa 12 px entre o lote e os controles de zoom. [Antes e depois no celular](docs/validation/pavilion-13-galeria/comparacao-mobile-63.jpg) · [Lote 80 pelo índice](docs/validation/pavilion-13-galeria/depois-mobile-80.jpg).

A suíte passou com 594 testes em 88 arquivos. TypeScript, build, ESLint e Prettier dos arquivos alterados passaram. A prévia usa dados locais e a verificação móvel foi feita no navegador integrado.

---

# Pavilhão 8 · Maquete industrial clara · Design QA, 08/11/2026

final result: passed

A primeira revisão mostrou que piso e circulação se confundiam com o fundo, os números ficavam soltos e os seletores estavam longe da introdução. A nova planta separa laje mineral, juntas, estrutura e bordas dos lotes. As placas Figtree com algarismos tabulares ficam dentro dos polígonos, e a legenda usa as mesmas superfícies da maquete. A marca vetorial e a sinalização mantêm o texto e a leitura em escala reduzida. [Comparação do interior](docs/validation/pavilion-8-maquete/comparacao-interior.jpg) · [Identidade](docs/fornecedores-construcao-identity.md).

| Janela CSS | Evidência |
|---|---|
| 1440 × 900 | [Planta com lote 07 selecionado](docs/validation/pavilion-8-maquete/depois-interior-07.jpg) · [Fachada oblíqua](docs/validation/pavilion-8-maquete/comparacao-fachada-obliqua.jpg) · [Inspeção sem cobertura](docs/validation/pavilion-8-maquete/depois-sem-cobertura.jpg) |
| 1280 × 720 | [Fachada frontal](docs/validation/pavilion-8-maquete/comparacao-fachada-frontal.jpg) · [Mapa leve e ficha](docs/validation/pavilion-8-maquete/comparacao-mapa-leve.jpg) |
| 834 × 1112 | [Tablet com lote 07](docs/validation/pavilion-8-maquete/depois-tablet-07.jpg) |
| 390 × 844 | [Comparação do painel com lote 07](docs/validation/pavilion-8-maquete/comparacao-mobile-lote-07.jpg) |

Na vista frontal, a placa 08 ocupa o pano entre os portões. Soleiras, umbrais, marquise e esquadrias ganham contraste com o embasamento. As comparações 3D repetem câmera e perfil Equilibrado em prévias locais separadas. O recorte exclui as barras de navegação. O mapa leve preserva o contorno cadastral e usa a mesma frente registrada para os dois limiares. A cumeeira some com a cobertura e os limiares continuam visíveis.

No navegador integrado, os cliques dos dois lados das diagonais de 01, 07 e 08, a seleção por teclado e a recarga confirmaram o contorno de seleção. Roda e arraste preservaram o lote selecionado. Fechar o painel conservou a câmera. As ligações P8–P13 e P8–P12, o acesso pelo parque e a volta à ficha foram exercitados. No celular, o lote 07 ficou entre x=268 e x=375, à direita do painel que termina em x=260 e acima dos controles que começam em y=673. A pinça foi coberta pelos testes com dois ponteiros. O navegador integrado não oferece injeção de toque nesse fluxo e a verificação em aparelho físico ficou pendente.

A base usada na comparação é a árvore da PR #16, reaplicada sobre a `main` que já contém P13. A prévia usa a edição local e as mesmas geometrias. [Base do interior e verificação do banco](docs/pavilion-interior/pavilion8-implementation.md).

---

# Pavilhão 8 — Fornecedores e Construção Civil — Design QA, 08/11/2026

final result: passed

O recorte do PDF rev. 02 e a captura da planta foram alinhados aos mesmos limites locais de 461 × 736 pontos, entrada embaixo. A comparação confirma os polígonos de 01, 07 e 08, a ilha mais larga junto à entrada, as duas passagens em alturas diferentes e o corredor acima de 05. As placas 13 e 12 foram deslocadas para as aberturas, com folga em relação aos limites comerciais. [Comparação da aplicação com a fonte](docs/validation/pavilion-8/application-comparison.jpg) · [Acessos laterais](docs/validation/pavilion-8/lateral-connections.jpg).

| Janela CSS | Evidência |
|---|---|
| 1440 × 900 | [Planta inteira](docs/validation/pavilion-8/desktop-overview.jpg) · [Seleção 07](docs/validation/pavilion-8/desktop-lot-07.jpg) · [Detalhe da entrada](docs/validation/pavilion-8/desktop-entrance.jpg) |
| 834 × 1112 | [Tablet](docs/validation/pavilion-8/tablet-overview.jpg) |
| 390 × 844 | [Planta inteira](docs/validation/pavilion-8/mobile-overview.jpg) · [Painel com lote 07](docs/validation/pavilion-8/mobile-lot-07.jpg) |

A assinatura vetorial mantém a hierarquia da marca e reserva a área total para texto da interface. Os números grafite usam tamanho uniforme no desenho. O contraste do lote selecionado foi conferido com branco sobre ameixa `#643b54`; a mudança de cor é imediata. Fundo quente, contorno do prédio, limites dos lotes e circulação têm pesos distintos. A família Figtree de placas usa texto e pictograma com cor por função. Foram conferidas as duas entradas de P13 e a entrada, a saída e os dois acessos de serviço de P1. [P1](docs/validation/pavilion-8/p1-wayfinding.jpg) · [P13](docs/validation/pavilion-8/p13-wayfinding.jpg).

A revisão encontrou um salto ao fechar a seleção após arrastar e um recorte lateral no lote 07 com painel móvel. Após os ajustes, fechar manteve a transformação exatamente e, a 390 × 844, o lote 07 ficou entre x=268 e x=375, com painel até x=260 e controles a partir de y=673. O clique nas diagonais, a roda, a ida pelo parque, recarga, voltar/avançar e as ligações com P12 e P13 foram exercitados no navegador. A pinça passou no teste com dois ponteiros do componente compartilhado. A prévia usa sessão controlada e o banco real foi verificado separadamente. [Relatório](docs/pavilion-interior/pavilion8-implementation.md).

---

# Pavilhão 13 — Salão de Imóveis — Design QA, 08/11/2026

final result: passed

A revisão comparou a página vetorial do PDF com a planta 2D e examinou os dois
vãos laterais em detalhe. A sequência das três faixas, o centro contínuo, a
entrada inferior e os fundos no alto correspondem à organização documental.
Os 80 módulos usam dimensões visuais uniformes e números individuais. A
verificação geométrica confirmou 80 anéis válidos sem interseções de área.
[Fonte e coordenadas](docs/pavilion-interior/pavilion13-geometry.md),
[comparação de geometria](docs/validation/pavilion-13/geometry-comparison.jpg) e
[comparação dos acessos](docs/validation/pavilion-13/connections-comparison.jpg).

| Janela CSS | Estado inspecionado | Evidência |
|---|---|---|
| 1440 × 900 | Planta inteira, cabeçalho e foco no botão de retorno | [Desktop](docs/validation/pavilion-13/desktop-full.jpg), [cabeçalho](docs/validation/pavilion-13/header-final.jpg) e [foco](docs/validation/pavilion-13/header-return-focus.jpg) |
| 1366 × 768 | Planta inteira e controles no espaço livre | [Notebook](docs/validation/pavilion-13/notebook-full.jpg) |
| 834 × 1112 | Planta inteira e coluna esquerda reservada | [Tablet](docs/validation/pavilion-13/tablet-full.jpg) |
| 390 × 844 | Planta inteira e painel esquerdo com lote selecionado | [Celular](docs/validation/pavilion-13/mobile-full.jpg), [lote 63](docs/validation/pavilion-13/mobile-lot-63.jpg) e [lote 80](docs/validation/pavilion-13/mobile-lot-80.jpg) |
| 378 × 465 | Numeração ajustada à altura disponível | [Janela compacta](docs/validation/pavilion-13/mobile-compact.jpg) |

O cabeçalho reúne uma assinatura horizontal à esquerda e o botão compacto
**Voltar ao parque**. A dica **Visualização externa** aparece no hover e no
foco do botão. As placas verticais estreitas P3 e P8 ocupam os respectivos vãos
laterais. O formato deixa mais espaço livre ao redor da sinalização e mantém a
hierarquia dos números dos lotes. [Detalhe dos acessos](docs/validation/pavilion-13/connections-detail.jpg).

No navegador, a revisão percorreu arraste, zoom, seleção e fechamento do painel.
Fechar conservou a posição e a escala. Links diretos foram recarregados no P13
e no espaço 12 do P1. A entrada pela ficha externa e o retorno pelo botão e
pelo histórico chegaram ao P13. Os acessos laterais abriram as fichas externas
do Pavilhão 3 à esquerda e do Pavilhão 8 à direita. [Entrada](docs/validation/pavilion-13/park-entry.jpg),
[retorno](docs/validation/pavilion-13/park-return.jpg) e [regressão P1](docs/validation/pavilion-13/p1-regression.jpg).

A rodada de desenvolvimento passou com build de produção, TypeScript, ESLint
dos arquivos alterados e 579 testes em 86 arquivos. No Chrome com toque emulado
(390 × 844), uma pinça elevou a escala de 0,497 a 0,956 sem selecionar um lote;
um toque no lote 63 abriu o painel. A revisão visual usou sessão local controlada
e as permissões foram verificadas separadamente no banco real. A validação em
aparelho físico e a conferência de um expositor real em produção ficaram pendentes. [Comprovação no banco](docs/validation/pavilion-13/database-application.json).

---

# Pavilhão 1 — Mostra ARQ & Design — Design QA, 08/11/2026

final result: passed

## Evidência e escopo

A referência geométrica é o PDF fornecido, preservado em `docs/references/pavilion-1/mostra-arq-design.pdf` (SHA-256 registrado em `docs/pavilion-interior/geometry.md`). A imagem original mede 2276 × 1178 pixels; a página vetorial, 1092,0616 × 565,0964 pontos. A referência de interface é a captura externa fornecida e os tokens existentes da Indumóveis. A identidade dedicada está em `public/brand/arq-design/`.

A implementação foi aberta no navegador in-app em `/mapa/pavilhoes/1/interior`, usando o servidor de QA local `scripts/pavilion-interior/preview.mjs`. Ele utiliza a mesma geometria persistida e uma sessão sintética, sem negociação ou expositor inventados e sem escrever no banco real. A aplicação real do SQL e os testes de autorização são evidências independentes: `docs/validation/pavilion-interior/database-application.json`.

As capturas finais JPEG foram normalizadas pelo navegador a 1 pixel por CSS pixel. A tela do host reportava DPR 1,65; as dimensões abaixo foram confirmadas por `innerWidth/innerHeight` e pela leitura dos arquivos, sem inferir tamanho CSS do tamanho físico solicitado à janela.

| Captura | Viewport CSS e pixels do arquivo | Estado |
|---|---|---|
| `docs/validation/pavilion-interior/desktop-full.jpg` | 1440 × 900 | Planta inteira, nenhuma seleção |
| `docs/validation/pavilion-interior/desktop-space-12.jpg` | 1440 × 900 | 12, interior e extensão |
| `docs/validation/pavilion-interior/desktop-space-02.jpg` | 1440 × 900 | Espaço menor, área 47,50 m² |
| `docs/validation/pavilion-interior/desktop-bathrooms.jpg` | 1440 × 900 | 15, apoio sem operação comercial |
| `docs/validation/pavilion-interior/desktop-salon.jpg` | 1440 × 900 | Salão, sem linha de metragem |
| `docs/validation/pavilion-interior/notebook-full.jpg` | 1366 × 768 | Enquadramento amplo e controles livres |
| `docs/validation/pavilion-interior/tablet-full.jpg` | 834 × 1112 | Coluna esquerda reservada |
| `docs/validation/pavilion-interior/mobile-full.jpg` | 390 × 844 | Painel recolhido, planta livre |
| `docs/validation/pavilion-interior/mobile-space-12.jpg` | 390 × 844 | Painel esquerdo e espaço 12 visível à direita |

## Comparação conjunta

Foram abertos e examinados, no mesmo input visual, `docs/validation/pavilion-interior/geometry-comparison.jpg` e `geometry-detail-comparison.jpg`. O primeiro normaliza os mesmos limites locais (28,66)–(1080,532) para 1088 × 482 pixels e coloca PDF e SVG um acima do outro. O segundo compara espaço 12/extensão, banheiros/acessos e recepção/curva. A fotografia externa não define o desenho interno nem o pavilhão 14.

A organização espacial, os recortes, as passagens, as portas e a curva coincidem com a fonte. Cotas, hachuras e setas repetidas foram removidas intencionalmente da apresentação. O tratamento cromático distingue comércio, apoio, salão e extensões. A curva permanece uma guia, sem ganhar espessura de parede. Testes topológicos complementam a inspeção visual: 24 anéis válidos, sem interseção de área.

## Superfícies de fidelidade

| Superfície | Resultado |
|---|---|
| Tipografia | Figtree e Plus Jakarta Sans do produto; números tabulares e estáveis, com mínimo de 10,5 px em tela. Número, nome e metragem têm níveis distintos. Marca usa curvas reais de Cormorant Garamond/Figtree, com “Indumóveis” inspecionado. |
| Composição e espaçamento | Faixa fixa de marca acima da planta; coluna reservada no desktop/tablet; painel sobreposto e recolhível à esquerda no celular. Enquadramento reserva espaço para controles. Não há navegação geral do portal na rota. |
| Cores e contraste | Papel quente #F8F6F1, grafite #302C2F, ameixa #643B54, exteriores em tom oliva discreto. Informação comercial usa texto, sem depender apenas de cor. Foco visível e seleção coerente entre partes vinculadas. |
| Qualidade dos assets | Geometria SVG determinística, sem raster de fundo. Três assinaturas realmente vetoriais com transparência e PNGs auxiliares. Nenhuma conversão de raster ampliado foi alegada. |
| Conteúdo | 01–15 preservados, áreas declaradas exatas, 01 Recepção e 14 Café comerciais. 15 apoio; salão sem metragem e sem aviso documental. Sem IDs, fontes de arquivo ou ressalvas técnicas no painel. |

## Interações verificadas

No navegador: seleção no desenho e no índice; clique na extensão 09 abrindo um único painel; espaços 12, 02, banheiros e salão; fechar seleção; recolher/reabrir painel mobile; botões de zoom/ajuste; arraste distinguido de clique; roda com âncora no cursor; acesso direto com `?espaco=12`; atualização; entrada pela ficha do Pavilhão 1; retorno, voltar e avançar. Ao abrir o interior foram observados zero `canvas` e zero `.im-map-stage`, confirmando desmontagem da experiência externa. A leitura dos logs finais não mostrou erros ou avisos.

O arraste medido mudou apenas translação de (10,676;237,559) para (40,676;207,559), mantendo escala 0,333 e nenhuma seleção. A roda mudou a escala para 0,583, mantendo a âncora do cursor. Pan e zoom não escrevem no histórico. Os testes automatizados verificam pinça com dois ponteiros, cancelamento, teclado, retorno de foco, limites, restauração 2D/3D, contexto por edição e recuperação de erros.

## Histórico de revisão

- P1: código do salão divergente entre UI e catálogo. Unificado como `salon`; captura final mostra seleção e ausência de metragem.
- P2: números mobile pequenos. Corrigido mínimo em pixels de tela, mantendo os pontos de ancoragem; captura mobile final conferida.
- P2: painel móvel ocultava o espaço à esquerda. Corrigidos limites pela área livre e revelação mínima; captura 12 mostra ambas as partes à direita e controles verticais acessíveis.
- P2: foco permanecia em painel oculto e Escape disparava duas vezes. Foco retorna à planta; fechamento centralizado; testes de teclado e painel passaram.
- P2: retomada externa poderia trocar 2D por 3D ou selecionar um lote antigo. Representação e câmera salvas prevalecem na retomada; links externos novos continuam válidos; testes de regressão passaram.
- P2: falha da edição poderia manter carregamento indefinido. Estado de erro com tentativa novamente implementado e testado.

As capturas finais acima foram examinadas após as correções. Não restam achados P0/P1/P2 abertos.

## Limites de verificação

A pinça foi validada por eventos de ponteiro em testes; o navegador in-app não oferece `Input.dispatchTouchEvent`, portanto não houve ensaio de pinça real por esse canal nem telefone físico. Não foi feita auditoria completa com leitor de tela. Não existia negociação/expositor real para conferir um nome em produção; SQL verificou a origem e as barreiras de permissão. O servidor visual usa fixtures locais; não substitui teste com sessão real de usuário. Esses limites não foram ocultados sob a validação do banco.

## Checklist concluído

- Geometria e cinco extensões conferidas contra o PDF.
- Composição desktop/notebook/tablet/mobile e estados principais examinados.
- Conteúdo, identidade, cores, foco, navegação e erros revisados.
- Capturas e evidências persistidas no repositório.

---

# Histórico anterior de QA

# Agenda Indumóveis — Design QA, 27/10/2026

final result: passed

A comparação foi feita com screenshots reais dos componentes anteriores (`5904289`) e novos, usando os mesmos dados de validação em 1366 × 768, 1440 × 900 e 390 × 844. Os combinados foram abertos e examinados juntos: [notebook](docs/validation/agenda-indumoveis/comparison-1366.jpg), [desktop](docs/validation/agenda-indumoveis/comparison-1440.jpg) e [mobile](docs/validation/agenda-indumoveis/comparison-390.jpg). A referência FenaSoja orienta organização e hierarquia, não clonagem de cores ou funções extras.

| Superfície           | Resultado observado                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fontes e tipografia  | Figtree e Plus Jakarta Sans existentes; título do evento domina, metadados secundários legíveis e data tabular em suporte próprio. Sem título grande duplicado.                        |
| Espaçamento e layout | Cabeçalho desktop de 64 px, faixa de período de 56 px e eventos de largura de 1062/1136 px. Sem max-w-5xl. Mobile reorganiza cabeçalho e ações; rolagem natural.                       |
| Cores e tokens       | Ameixa, vermelho de destaque, taupe e neutros. Situações indicadas por texto e símbolo; cancelamento com traço e conclusão com suporte discreto, sem opacidade que prejudique leitura. |
| Imagens e ícones     | Logo oficial existente na sidebar. Sem fotos inventadas; responsáveis nos detalhes usam iniciais. Suportes de ícones leves e coerentes.                                                |
| Texto e conteúdo     | Agenda Indumóveis consistente, mês com capitalização natural, edição/período uma vez, Nova atividade uma vez. Descrição completa nos detalhes aparece uma vez.                         |
| Interação            | Slot React tipado com cleanup, busca e filtros na URL, popover desktop/Sheet mobile, retorno de foco e transição detalhe→edição sem painéis sobrepostos.                               |

A densidade final foi comparada com a versão ampliada revisada pelo usuário em [antes/depois](docs/validation/agenda-indumoveis/density/comparison-1366.jpg). A composição mantém nichos em arco, materiais leves por CSS e rótulos Hoje/Amanhã, com **94 px por linha normal**, espaços de 6 px e primeira linha em y=158. São **seis eventos completos em 1366 × 768** (sexto termina em y=752) e **sete em 1440 × 900**. [Medidas e limites](docs/validation/agenda-indumoveis/density/README.md) verificados. Conteúdo longo e celular crescem naturalmente, sem altura máxima ou cortes; Concluir tem alvo de 44 px no celular. SVGs de relógio continuam mostrando o horário real exibido, e dia inteiro/sem horário usam calendário. Não há overflow nos três viewports, inclusive com texto ampliado em 390 px.

Não restam achados impeditivos nos estados examinados. Durante QA foram corrigidos overflow no breadcrumb com texto ampliado, cálculo de atraso pelo fim do intervalo, indicadores sem filtro correspondente, ação de cadastro duplicada no vazio, datas civis inválidas, mês adjacente no calendário e risco de refetch apagar rascunho/versão esperada. Os overlays portaled também passaram a respeitar redução de movimento.

[Relatório, capturas, medidas e limites](docs/validation/agenda-indumoveis/README.md). Build, TypeScript e 309 testes passaram; lint dos arquivos alterados limpo. O lint global mantém 1.581 erros e 12 avisos já existentes. Os cenários usam fixture local e mocks de mutações; nenhum registro de produção foi criado nesta validação.

---

# Portal Indumóveis — Design QA, 27/10/2026

final result: passed

## Achados e resultado

Não restam achados P0/P1/P2 nos estados e viewports examinados. A direção final segue as correções explícitas feitas pelo usuário durante a revisão: marca oficial com leitura de baixo para cima, sem o arco claro; ano dourado; conta acima do contador; informações secundárias discretas; frase institucional com contraste tipográfico editorial. A rotação, inicialmente proibida no briefing, foi posteriormente solicitada e confirmada pelo usuário.

## Fonte e comparação visual

As capturas anexadas pelo usuário orientaram a preservação da arquitetura, dos emblemas e da identidade. O baseline executável é o commit `597b459`, capturado com os mesmos componentes/dados locais de validação, no mesmo viewport CSS 1366 × 768 e zoom 100%. O relógio é real e os segundos diferem naturalmente entre capturas. O resultado foi aberto e examinado no combinado [antes/depois](docs/validation/portal-integrado/comparison-1366x768.jpg), além do [detalhe ampliado da assinatura](docs/validation/portal-integrado/signature-detail.jpg), das capturas responsivas e dos dois seletores.

As mudanças de composição são intencionais, não desvios da referência: um único ambiente substitui os dois blocos verticais. O quadro comparativo contém duas capturas 1366 × 768, com faixas explicativas, total 1366 × 1600 px. As capturas finais usam DPR emulado 1; detalhes ampliados são identificados como tais. Todos os cinco viewports foram confirmados com `cssVisualViewport.zoom = 1` no navegador.

## Superfícies obrigatórias

| Superfície           | Avaliação final                                                                                                                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fontes e tipografia  | Figtree e Plus Jakarta Sans preservadas em controles, títulos e números tabulares. Datas recuam para 14 px e legenda 12 px. A frase mantém 15 px, com Cormorant Garamond itálica 600 somente nos termos de destaque, sem sublinhado ou brilho genérico. Fallback Georgia e carregamento sem bloqueio. |
| Espaçamento e layout | Topo 378 px no desktop. No notebook, primeira linha termina em y=649,5 px. Cards 200 px, rodapés alinhados, sem sobreposição negativa. Duas colunas no tablet e uma no celular; marca em lateral compacta conforme a direção revisada.                                                                |
| Cores e tokens       | Ameixa, vermelho e taupe mantidos. Ano e detalhes da assinatura usam dourado fosco compatível com o metal da cena; a marca e a contagem pertencem à mesma superfície. Sem painel claro independente na logo.                                                                                          |
| Imagens e qualidade  | Mesmo PNG oficial; proporções mantidas, leitura rotacionada. Filtro de alfa remove o arco translúcido por solicitação, sem desenhar outro letreiro. Ano da edição permanece HTML. Nichos, luz, piso e mobiliário vetorial existentes foram reaproveitados. Emblemas personalizados preservados.       |
| Texto e conteúdo     | Frase intacta, incluindo espaço após a vírgula. Subtítulo redundante removido. Período civil preservado e legenda final “Abertura às 15h · Brasília”, ambos derivados da configuração. Identificação do administrador acima da contagem.                                                              |

## Iterações e correções verificadas

- Chips e painéis internos removidos; links e botões têm a mesma estrutura e altura, com seletores portaled fora da grade.
- Foco de abertura/fechamento usa `preventScroll`; limpeza de seletor antigo não rouba foco ao trocar breakpoint.
- Conta pode quebrar linhas em telas estreitas e com texto a 200%, preservando identificação e saída.
- Movimento reduzido abrange também o overlay portaled; conteúdo decorativo não recebe foco.
- Marca foi integrada à superfície arquitetônica e o arco claro foi removido conforme revisão do usuário.
- Subtítulo e data repetida da abertura removidos; hierarquia secundária reduzida.
- Tratamento inicial de negrito/sublinhado foi substituído pela assinatura tipográfica em duas linhas, após feedback de que parecia genérico.

## Evidências funcionais e limites

[Relatório completo e capturas](docs/validation/portal-integrado/README.md), [medidas](docs/validation/portal-integrado/measurements.json), [grade antes/depois do seletor](docs/validation/portal-integrado/submenu-measurements.json), [texto a 200%](docs/validation/portal-integrado/text-zoom.json) e [movimento reduzido](docs/validation/portal-integrado/reduced-motion.json).

Build, TypeScript e 238 testes aprovados. Lint geral tem exatamente os mesmos 1.581 erros/12 avisos do baseline; arquivos alterados passam. A edição de produção foi lida pela sessão existente e confirma 15:00, America/Sao_Paulo. Nenhum dado remoto foi alterado. As capturas usam dados locais e não representam implantação da PR.

Checklist final: composição integrada, marca oficial, números protagonistas, conta acima, primeira linha visível, seis cards uniformes, foco/teclado, zoom de texto, redução de movimento e horário 15h verificados. Não há pendência visual P0/P1/P2 identificada.

---

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
