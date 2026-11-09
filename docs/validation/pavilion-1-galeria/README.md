# Validação da Galeria ARQ & Design

As capturas usam o ambiente local autenticado com dados de teste e a revisão vetorial original do Pavilhão 1. O antes vem de `d0b2d59`, a integração da PR #18 em `main`. As comparações usam desktop a 1440 × 900 e celular a 390 × 844.

| Cena | Antes | Depois |
| --- | --- | --- |
| Planta inteira | [Ver](antes-planta.jpg) | [Ver](depois-planta.jpg) |
| Espaço 12 e extensão vinculada | [Ver](antes-espaco-12.jpg) | [Ver](depois-espaco-12.jpg) |
| Salão de Design e curva da Recepção | [Ver](antes-salao.jpg) | [Ver](depois-salao.jpg) |
| Café | [Ver](antes-cafe.jpg) | [Ver](depois-cafe.jpg) |
| Banheiros | [Ver](antes-banheiros.jpg) | [Ver](depois-banheiros.jpg) |
| Espaço 12 com painel aberto no celular | [Ver](antes-celular.jpg) | [Ver](depois-celular.jpg) |

Também foram conferidos o [tablet a 1024 × 768](depois-tablet.jpg), o [celular a 320 × 700](depois-celular-320.jpg) e a [prancha da assinatura vetorial](../../../public/brand/arq-design/identity-preview.png).

O [retângulo azul nativo](antes-contorno-salao.jpg) aparecia ao clicar no Salão e atravessava a área dos espaços 01 a 04. O [novo traço](depois-salao.jpg) segue a curva e os recortes do Salão. O navegador confirmou que o traço usa o mesmo caminho SVG do alvo e deixa os cliques passarem para a planta. O clique de cada lado da curva selecionou o ambiente correspondente.

No navegador, também foram verificados o zoom, o arraste, o foco por teclado, a seleção pela extensão, o acesso direto, o recolhimento do painel com a seleção mantida, o retorno ao parque e a reentrada pelo botão **Acesso Interno**. Em 390 px, o painel passou de 272 para 226 px. Em 320 px, os seletores preservaram alvos de 44 px. Toque e pinça foram exercitados com eventos simulados na suíte.

A suíte passou com 596 testes em 88 arquivos. TypeScript, build de produção, formatação e lint dos arquivos alterados passaram. O lint geral, excluindo apenas o diretório local ignorado `artifacts.local`, apresentou os mesmos 1.752 erros de formatação e 12 avisos da versão-base, sem diagnósticos novos.
