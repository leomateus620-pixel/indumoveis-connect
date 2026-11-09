# Geometria do Pavilhão 12 · Móveis e Seriados

A revisão 1 usa a planta vetorial local `Pav 12 - 07 - 14.09.26 (1).pdf`. A
página tem 821,091 × 561,624 pontos PDF e 116 operações de desenho. O SHA-256 é
`f933d506774daf59c7cdd2749bea6eafd3784de10f2a99a814abf76e2db96c37`.

A extração leu os contornos dos blocos e as divisões individuais já desenhadas.
Cada bloco agregado foi repartido conforme a sequência confirmada no pedido.
Os polígonos fechados usam pontos nativos do PDF, com origem no canto superior
esquerdo e Y crescente para baixo. Bordas adjacentes com diferenças de até um
centésimo de ponto compartilham a média dos dois valores. Esse ajuste elimina
interseções de clique e mantém os corredores e a abertura inferior.

A área declarada no título da folha é **1.650 m²**. Cada lote mantém área
individual `null`. O gerador inclui apenas os códigos, os nomes `Lote N` e os
rótulos das faixas e ilhas. Paredes, portas, piso e acessos permanecem em
`architecture`, separados dos 254 lotes comerciais.

| Faixa de cima para baixo             | Ordem da esquerda para a direita | Lotes |
| ------------------------------------ | -------------------------------- | ----: |
| Faixa superior                       | 254 → 205                        |    50 |
| Ilha central superior, fila superior | 163 → 204                        |    42 |
| Ilha central superior, fila inferior | 162 → 121                        |    42 |
| Ilha central inferior, fila superior | 79 → 120                         |    42 |
| Ilha central inferior, fila inferior | 78 → 37                          |    42 |
| Faixa inferior                       | 1 → 36                           |    36 |

A abertura da faixa inferior fica entre 22 e 23. A ilha inferior preserva
85–92 acima de 65–72 e o grupo de origem 73–84 nos dois extremos esquerdos.
Na ilha superior, 172–175 ficam acima de 153–150 e o grupo 154–171 ocupa os dois
extremos esquerdos. A faixa superior preserva os cinco blocos da esquerda para
a direita, com 13, 9, 10, 6 e 12 módulos.

O trecho cotado como **5 m** junto a 172–175 e 153–150 contém quatro divisões
vetoriais por fila, com largura conjunta de 56,715 pontos PDF. A subdivisão
preserva essas quatro divisões e seus códigos em cada fila. As diferenças de
frações de ponto nos contornos do PDF permanecem documentadas em unidades de
desenho.

O caminho `p12:floor-outline` delimita a superfície de piso. Os caminhos
`p12:perimeter` e `p12:door-swings` reaproveitam traços e curvas do PDF.
`p12:left-access`, `p12:right-access` e `p12:main-entrance` identificam os três
pares de setas da folha. A fonte marca a direção dessas passagens. Os destinos
dos pavilhões vizinhos são tratados na configuração de navegação.

A referência técnica FENASOJA `pavilion12CommercialReference.ts` foi consultada
em leitura para comparar organização por faixas, separação entre circulação e
estoque e identificação de acessos. A referência contém 257 módulos. Este
snapshot segue a planta da Indumóveis, com 254 códigos e suas sequências próprias.

## Reprodução e conferência

Execute a partir da raiz com PyMuPDF 1.26.5 e o PDF original disponível localmente.

```sh
python scripts/pavilion-interior/build-pavilion-12.py \
  '/caminho/local/Pav 12 - 07 - 14.09.26 (1).pdf' \
  --render-plan docs/validation/pavilion-12/geometry-preview.png
```

O gerador confere o hash da fonte e a estrutura vetorial antes de produzir o
snapshot. A reprodução foi comparada à revisão 1 carregada no repositório. Os
254 anéis foram validados também com Shapely e têm área de interseção zero entre
pares. A prévia pública foi gerada só com os dados geométricos da revisão.
[Prévia vetorial renderizada](../validation/pavilion-12/geometry-preview.png).
