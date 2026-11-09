# Identidade do Salão de Imóveis — Pavilhão 13

A assinatura do Salão de Imóveis combina uma composição abstrata de planos de fachada com tipografia sem serifa, espaçamento preciso e leitura horizontal. O desenho representa volumes urbanos por sobreposição de linhas abertas, sem telhado ou ícone doméstico. A expressão visual acompanha a identidade Indumóveis com grafite, ameixa e um acento discreto de bronze.

A composição conserva a escrita solicitada em duas linhas, ao lado dos planos gráficos:

```text
Salão de
IMÓVEIS
```

O til em **Salão** e o acento em **IMÓVEIS** foram inspecionados visualmente. Os contornos são curvas reais da fonte, sem dependência de fonte instalada ou CDN e sem raster incorporado.

## Arquivos finais

Todos os arquivos estão em `public/brand/salao-imoveis/`.

| Arquivo | Dimensões vetoriais | Uso |
| --- | --- | --- |
| `salao-imoveis-primary.svg` | 430 × 148 | Assinatura horizontal principal |
| `salao-imoveis-compact.svg` | 324 × 112 | Faixa fixa acima da planta e telas menores |
| `salao-imoveis-monochrome.svg` | 430 × 148 | Aplicações em uma única tinta |
| PNGs com os mesmos nomes | 3× o tamanho vetorial, canal alfa | Compatibilidade com ferramentas sem SVG |
| `identity-preview.png` | 1040 × 430 | Comparação visual das três versões sobre fundo quente |
| `manifest.json` | — | Textos, dimensões, paleta, origem e hashes SHA-256 dos SVGs |
| `acesso-pavilhao-3.svg` | 92 × 104 | Placa vertical da passagem lateral esquerda |
| `acesso-pavilhao-8.svg` | 92 × 104 | Placa vertical da passagem lateral direita |

Os três SVGs e os PNGs correspondentes possuem fundo transparente. A prévia conjunta é um arquivo de revisão com fundo; não deve ser usada como marca na interface. A compacta tem proporções e espessuras próprias para preservar leitura em redução. Nenhum asset utiliza nomes de empresas ou marcas de expositores encontrados no PDF.

## Aplicação na tela

- Posicionar a versão compacta à esquerda da faixa fixa acima da planta, fora do grupo que recebe pan e zoom. A marca assume o destaque visual e o título da página permanece disponível para leitores de tela.
- A assinatura mede **228 × 79 px** no desktop, **210 × 73 px** em notebook e tablet e **208 × 72 px** no celular. Nas janelas baixas de desktop, ocupa **196 × 68 px**.
- O retorno ao parque usa um botão de contorno com seta, de **40 × 40 px** no desktop e **36 × 36 px** no celular. O tooltip informa “Voltar ao parque” e “Visualização externa”.
- Manter ao redor uma margem livre equivalente à altura da palavra “Salão”. O grafismo não deve entrar sobre a geometria da planta, os números ou os controles.
- Ao incluir com `<img>`, usar `alt="Salão de IMÓVEIS"`. O SVG também contém título e descrição acessíveis.
- Em fundos claros, manter o grafite `#302C2F` e o ameixa `#643B54`; o fundo sugerido é `#F8F6F1`. O bronze `#8B7B65` pertence às linhas decorativas. Estados, foco e texto pequeno essencial devem utilizar cores de contraste adequado, sem depender do bronze.
- O uso da tipografia sem serifa em “IMÓVEIS” e a composição horizontal mantêm a identidade deste pavilhão reconhecível no conjunto do portal. A assinatura do Pavilhão 1 permanece preservada em seus arquivos e aplicação próprios.

## Placas das passagens laterais

As placas acompanham a planta e identificam a ligação com o **Pavilhão 3**, na abertura à esquerda, e com o **Pavilhão 8**, na abertura à direita. O contorno em retrato organiza a seta no topo, “Pavilhão” abaixo do traço em bronze e o número em destaque na base. Cada seta aponta para a saída correspondente. O fundo marfim e o texto ameixa seguem a identidade do salão.

As duas peças usam `viewBox="0 0 92 104"`. Centralizar cada placa no vão correspondente, preservando a proporção e as bordas dos lotes. A tipografia Figtree 600 foi convertida em contornos vetoriais para conservar o til e a leitura em redução. Foram conferidos os rótulos e as direções a **92 × 104 px**, **54 × 61 px** e **44 × 50 px**. Cada SVG inclui título e descrição acessíveis.

## Produção, proveniência e revisão

Foram aplicadas as instruções Creative Production `produce`, `logos`, `exact-content` e `deterministic-exports`: composição dedicada, escrita determinística, arquivos finais transparentes e manifesto com proveniência. A ferramenta `creative_production_board` não está exposta na sessão; sua disponibilidade foi novamente conferida nos metadados de ferramentas. O quadro interativo não foi criado.

A assinatura usa **Figtree 500** e as placas usam **Figtree 600**. Os subconjuntos da fonte, a licença SIL OFL 1.1 e `source/build.py` acompanham os arquivos finais. O script recompõe os SVGs e o manifesto com Python 3 e `fonttools` a partir dos contornos vetoriais originais. [Google Fonts — Figtree](https://github.com/google/fonts/tree/main/ofl/figtree)

A prévia conjunta foi aberta e lida em tamanho de revisão. Foram conferidos alinhamento, espaçamento, acentos, legibilidade, recortes, pesos e diferença entre as três aplicações. Uma verificação estrutural confirmou ausência de `<image>` nos SVGs, presença da escrita exata nos metadados acessíveis, transparência dos PNGs e hashes vetoriais idênticos após reconstrução. A avaliação no cabeçalho implementado e nos viewports finais pertence à revisão da tela.
