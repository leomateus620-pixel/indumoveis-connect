# Identidade da Mostra ARQ & Design

A assinatura dedicada usa o contraste entre a precisão de Figtree e o ritmo editorial de Cormorant Garamond. As linhas abertas e as quinas em ameixa retomam as projeções de um desenho arquitetônico. A palavra Indumóveis tem corpo maior para facilitar a leitura no cabeçalho.

## Entregas

| Arquivo em `public/brand/arq-design/` | Composição | Uso |
| --- | --- | --- |
| `arq-design-primary.svg` | Vertical, 360 × 282 unidades SVG | Assinatura principal e materiais maiores |
| `arq-design-compact.svg` | Vertical, 244 × 186 unidades SVG, proporções próprias | Faixa fixa acima da planta |
| `arq-design-monochrome.svg` | Vertical, 360 × 282 unidades SVG | Impressão e aplicações em uma única tinta |
| Arquivos `.png` correspondentes | Exportação a 3×, com canal alfa | Compatibilidade com ferramentas sem SVG |
| `identity-preview.png` | Comparação das três versões em duas escalas sobre fundo quente | Revisão visual |
| `manifest.json` | Textos, paleta, proveniência, dimensões e SHA-256 | Auditoria e reprodutibilidade |

O conteúdo visível de todas as versões preserva as três linhas solicitadas:

```text
ARQ &
Design
Indumóveis
```

As letras são contornos originais das fontes, incluindo o acento em **ó**. Os SVGs não dependem de fontes instaladas, CDN, texto substituível ou imagem raster embutida. São arquivos vetoriais reais; não são ampliações nem vetorização automática de uma imagem gerada.

## Aplicação na interface

- Colocar a assinatura na faixa fixa à esquerda, acima da planta, junto ao botão de retorno e à identificação do pavilhão. Conservar sua proporção ao adaptar a largura.
- Usar a versão compacta em telas menores e manter o título completo acessível no cabeçalho.
- Usar `alt="ARQ & Design Indumóveis"` ao incluir por `<img>`. O próprio SVG também tem título e descrição acessíveis.
- Preservar margem livre de ao menos a altura da letra de “Indumóveis”. Não colocar números, controles ou áreas selecionáveis dentro da assinatura.
- Usar grafite `#302C2F` no texto principal, ameixa `#643B54` na palavra Design e fundo quente `#F8F6F1`. As linhas de projeção em `#8B7466` são decorativas.
- Manter as áreas externas em tom discreto, com reforço de contorno quando selecionadas. A identidade deve permanecer subordinada à leitura da planta.

## Produção e verificação

Foi aplicado o fluxo Creative Production (`produce`, `logos`, `exact-content` e `deterministic-exports`) para definir a composição, preservar a escrita exata e exportar os arquivos finais. A sessão não expõe a ferramenta `creative_production_board`; a busca por capacidades do plugin também não disponibilizou esse quadro. Por isso não houve quadro interativo nem geração de conceitos por esse recurso. Não há dependência dele na aplicação.

A composição usa as curvas das fontes de licença SIL OFL 1.1. Os subconjuntos e as licenças acompanham `source/build.py`, que requer Python 3 e `fonttools` para recompor os SVGs e o manifesto. A opção `--png` também exporta as versões em PNG e a prancha com CairoSVG e Pillow. [Cormorant Garamond](https://github.com/google/fonts/tree/main/ofl/cormorantgaramond) · [Figtree](https://github.com/google/fonts/tree/main/ofl/figtree)

A prancha compara as três assinaturas a 270 px e a 100 px de largura. A revisão visual conferiu a escrita, o acento, os contornos e o espaçamento nas duas escalas. Os PNGs individuais preservam transparência.
