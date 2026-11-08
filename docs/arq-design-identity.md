# Identidade da Mostra ARQ & Design

A assinatura dedicada usa contraste entre a precisão de Figtree e o ritmo editorial de Cormorant Garamond. As linhas abertas lembram projeções e enquadramentos de desenho arquitetônico. A abertura do contorno evita encerrar a marca em um símbolo de edificação. Não há ícone de casa ou mobiliário, textura de fundo nem imagem sobre a planta.

## Entregas

| Arquivo em `public/brand/arq-design/` | Composição | Uso |
| --- | --- | --- |
| `arq-design-primary.svg` | Vertical, 360 × 282 unidades SVG | Assinatura principal e materiais maiores |
| `arq-design-compact.svg` | Vertical, 244 × 186 unidades SVG, proporções próprias | Faixa fixa acima da planta |
| `arq-design-monochrome.svg` | Vertical, 360 × 282 unidades SVG | Impressão e aplicações em uma única tinta |
| Arquivos `.png` correspondentes | Exportação a 3×, com canal alfa | Compatibilidade com ferramentas sem SVG |
| `identity-preview.png` | Comparação das três versões sobre fundo quente | Revisão visual, não substitui os assets transparentes |
| `manifest.json` | Textos, paleta, proveniência, dimensões e SHA-256 | Auditoria e reprodutibilidade |

O conteúdo visível de todas as versões preserva as três linhas solicitadas:

```text
ARQ &
Design
Indumóveis
```

As letras são contornos originais das fontes, incluindo o acento em **ó**. Os SVGs não dependem de fontes instaladas, CDN, texto substituível ou imagem raster embutida. São arquivos vetoriais reais; não são ampliações nem vetorização automática de uma imagem gerada.

## Aplicação na interface

- Colocar a assinatura em uma faixa fixa acima da planta, fora da região que recebe pan e zoom. Manter sua proporção; não aplicar transformações da câmera ao asset.
- Reservar cerca de 120–132 px de largura para a versão compacta em desktop. Ela ocupa aproximadamente 92–101 px de altura. Em uma faixa mais curta, usar menor largura conservando a proporção e manter o título acessível da tela como texto da interface.
- Usar `alt="ARQ & Design Indumóveis"` ao incluir por `<img>`. O próprio SVG também tem título e descrição acessíveis.
- Preservar margem livre de ao menos a altura da letra de “Indumóveis”. Não colocar números, controles ou áreas selecionáveis dentro da assinatura.
- Usar grafite `#302C2F` nos números, contornos e texto principal; ameixa `#643B54` na seleção e na palavra Design; fundo quente sugerido `#F8F6F1`. A linha de projeção `#A69C8E` é decorativa, não deve transmitir estado nem ser usada em texto pequeno essencial.
- Manter as áreas externas em tom discreto, com reforço de contorno quando selecionadas. A identidade deve permanecer subordinada à leitura da planta.

## Produção e verificação

Foi aplicado o fluxo Creative Production (`produce`, `logos`, `exact-content` e `deterministic-exports`) para definir a composição, preservar a escrita exata e exportar os arquivos finais. A sessão não expõe a ferramenta `creative_production_board`; a busca por capacidades do plugin também não disponibilizou esse quadro. Por isso não houve quadro interativo nem geração de conceitos por esse recurso. Não há dependência dele na aplicação.

A composição foi produzida deterministicamente com as curvas das fontes de licença SIL OFL 1.1, distribuídas pelo repositório oficial [Google Fonts — Cormorant Garamond](https://github.com/google/fonts/tree/main/ofl/cormorantgaramond) e [Google Fonts — Figtree](https://github.com/google/fonts/tree/main/ofl/figtree). Os subconjuntos de fonte necessários à reprodução, as licenças e `source/build.py` acompanham os assets. O script requer Python 3 e `fonttools` e recompõe os SVGs e o manifesto; não chama geração de imagem nem rastreamento raster.

A prévia conjunta foi aberta e inspecionada visualmente. Escrita, acento, espaçamento, contornos, alinhamento e distinção entre as três versões foram conferidos. Os PNGs preservam transparência. A conferência no layout real, nos diferentes dispositivos e em estados de interação pertence à revisão da tela implementada.
