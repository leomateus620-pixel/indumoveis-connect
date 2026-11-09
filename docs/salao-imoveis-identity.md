# Identidade do Salão de Imóveis — Pavilhão 13

A assinatura combina um painel de exposição e um aparador em perspectiva. Planos minerais claros, tons de madeira e um contorno em bronze lembram acabamentos e marcenaria de uma galeria. A tipografia conserva o grafite e o ameixa da Indumóveis. O nome tem duas linhas:

```text
Salão de
IMÓVEIS
```

Os contornos de Figtree preservam o til e o acento na marca. Cada SVG tem transparência e usa curvas vetoriais. O título e a descrição oferecem a leitura acessível da peça.

| Arquivo em `public/brand/salao-imoveis/`          | Tamanho               | Aplicação                                                     |
| ------------------------------------------------- | --------------------- | ------------------------------------------------------------- |
| `salao-imoveis-primary.svg`                       | 430 × 148             | Assinatura horizontal principal                               |
| `salao-imoveis-compact.svg`                       | 324 × 112             | Faixa fixa acima da planta                                    |
| `salao-imoveis-monochrome.svg`                    | 430 × 148             | Aplicações em uma tinta                                       |
| PNGs das três assinaturas                         | 3× o tamanho vetorial | Exportações transparentes                                     |
| `acesso-pavilhao-3.svg` e `acesso-pavilhao-8.svg` | 92 × 104              | Ligações laterais                                             |
| `identity-preview.png`                            | 1040 × 430            | Prancha de revisão                                            |
| `manifest.json`                                   | —                     | Escrita, dimensões, paleta, licença e hashes SHA-256 dos SVGs |

A compacta permanece no cabeçalho, acima do grupo que recebe pan e zoom. A composição ocupa **228 × 79 px** no desktop, **210 × 73 px** em notebook e tablet e **208 × 72 px** no celular. Janelas baixas de desktop usam **196 × 68 px**. Na interface, o `alt` é **Salão de IMÓVEIS**.

As duas placas verticais seguem os vãos da planta. A seta do **Pavilhão 3** aponta à esquerda e a do **Pavilhão 8**, à direita. A face marfim, a borda em madeira e o friso em bronze ligam os acessos à linguagem do salão. Os números usam algarismos tabulares em ameixa e o nome usa grafite. Entradas e saídas usam as placas compartilhadas do mapa, com pictogramas de porta, seta e o nome da função. [Entrada](../public/brand/pavilion-wayfinding/entrada.svg) · [Saída](../public/brand/pavilion-wayfinding/saida.svg).

## Exportação e proveniência

O gerador parte de um subconjunto da fonte variável **Figtree** licenciado sob SIL OFL 1.1. A assinatura usa pesos 540 e 620, o texto das placas usa 660 e seus números usam 730. [Fonte Figtree](https://github.com/google/fonts/tree/main/ofl/figtree) · [Licença](../public/brand/salao-imoveis/source/OFL-Figtree.txt).

Para reconstruir as curvas vetoriais e o manifesto, use Python 3 com `fonttools`. Para reconstruir os PNGs, use Node.js com `sharp` disponível no ambiente:

```sh
python3 public/brand/salao-imoveis/source/build.py
node public/brand/salao-imoveis/source/render-png.mjs
```

A revisão aplicou as orientações de conteúdo exato e exportação determinística de Creative Production. O quadro interativo estava indisponível. A prancha foi renderizada a partir dos SVGs finais e permite comparar assinaturas e placas. [Prancha de identidade](../public/brand/salao-imoveis/identity-preview.png).
