# Pavilhão 13 — Salão de Imóveis: geometria da revisão 2

A fonte conferida é o PDF vetorial `Pav 13 - 07 - 17.08.26 (1).pdf`, preservado
em `docs/references/pavilion-13/salao-imoveis-rev07.pdf`. Tem uma página de
557,693 × 815,338 pontos PDF, com 390 operações vetoriais de desenho. SHA-256:
`5d33bd55d353021ba18f6e3cc6114544723f8ed292b149e0aab628625187ef67`.

## Leitura documental e normalização solicitada

O PDF foi aberto, seu texto e caminhos foram extraídos com PyMuPDF e a página
foi renderizada para comparação visual. Foram identificadas as três faixas,
os acessos na entrada e nos fundos, as passagens laterais, os números individuais
e os blocos agregados. O desenho original tem uma faixa central mais larga e
pequenas variações de altura. A apresentação solicitada normaliza os **80
módulos para a mesma largura e altura**, preservando a organização e a numeração.
Por isso, esta planta é um esquema vetorial interativo; não é uma reprodução
métrica nem uma base para cálculo de áreas.

O grupo identificado no PDF como Imobiliária Santa Rosa, na extremidade inferior
do bloco lateral superior esquerdo, corresponde aos códigos **63–66 por indicação
explícita do pedido**. Essa identificação foi usada apenas na conferência técnica.
Nenhum nome de empresa do PDF nem a indicação de reserva participa do JSON da
planta, da seleção ou da situação comercial. O grafismo promocional sem número,
na região central inferior da fonte, não é interpretado como novo lote ou recinto.

## Sistema local de coordenadas

A origem esquemática é superior esquerda; X cresce à direita e Y para baixo.
Todos os módulos medem **112 × 30 unidades de desenho**, sem conversão para
metros. Os polígonos são fechados com repetição do primeiro vértice. Os números
possuem dois dígitos e âncoras no centro do respectivo módulo.

| Faixa             | X inicial | Y inicial | Ordem de cima para baixo | Quantidade |
| ----------------- | --------: | --------: | ------------------------ | ---------: |
| Direita superior  |       528 |       120 | 29–15                    |         15 |
| Direita inferior  |       528 |       714 | 14–01                    |         14 |
| Centro contínuo   |       304 |       210 | 51–30                    |         22 |
| Esquerda superior |        80 |       120 | 52–66                    |         15 |
| Esquerda inferior |        80 |       714 | 67–80                    |         14 |

As faixas laterais somam 29 módulos cada uma. As passagens entre 14/15 e 66/67
possuem a mesma abertura esquemática de 144 unidades. A faixa central permanece
contínua e atravessa essa região, sem uma separação transversal artificial.
Os corredores longitudinais ficam entre as três faixas; as passagens laterais
são elementos arquitetônicos, sem identidade comercial própria. Entrada fica
na parte inferior, fundos na superior. O enquadramento `(32, 52)–(688, 1230)`
inclui os acessos, as portas e seus rótulos.

Os blocos agregados **01–04, 10–14, 15–18, 30–35, 63–66 e 67–70** foram
subdivididos em módulos individuais de dimensão visual idêntica aos demais,
sem ampliar, reduzir ou fundir os respectivos registros comerciais.

## Identidade e metragens

Cada ambiente é denominado `Lote NN`, usa `indumoveis:pavilion:13:environment:NN`, tem um único polígono
interno e é comercial. Não existem extensões externas ou lotes adicionais nesta
revisão. O banco mantém sua vinculação com `spaces` por edição e pavilhão,
independentemente da igualdade visual dos módulos.

Todos os campos `declaredAreaM2` são **`null`**. O pedido informa **850,5 m²
comercializáveis**, enquanto o PDF rotula **850,5 m² como área total**. Essa
observação fica nesta documentação técnica: o valor não é dividido por 80,
não é convertido em área individual e não integra o JSON da planta. Não foram
adotadas metragens comerciais derivadas de largura, altura ou área do polígono.
Uma eventual atribuição futura de áreas por lote exige fonte confirmada.

## Reprodução e verificação

Execute, a partir da raiz, com PyMuPDF instalado:

```sh
python scripts/pavilion-interior/build-pavilion-13.py \
  docs/references/pavilion-13/salao-imoveis-rev07.pdf \
  --render-source /tmp/pavilion13-source.png \
  --render-plan /tmp/pavilion13-geometry.png
```

O gerador confere o hash do PDF, a página, a identificação, os acessos e as
âncoras das três colunas extraídas. Depois produz deterministicamente
`src/features/pavilion-interior/pavilion13.generated.json`. A fonte divergente
é recusada; mudanças publicadas precisam de uma nova revisão.

Os testes verificam os 80 códigos únicos, a igualdade de largura e altura,
as sequências, as passagens laterais, a continuidade central, os seis grupos
subdivididos, as áreas nulas, os acessos e a ausência de dados comerciais copiados
da fonte. Uma conferência independente com Shapely validou os **80 anéis**, sem
área de interseção entre quaisquer módulos. O esquema foi renderizado e
comparado à página original para verificar orientação, faixas e numeração.

A implementação do Pavilhão 13 importa apenas o tipo compartilhado de planta;
não altera nem reutiliza a geometria da Mostra ARQ & Design do Pavilhão 1.

A revisão 1 permanece no histórico do banco. A revisão 2 ajusta a denominação
genérica dos ambientes para `Lote NN`, preservando integralmente geometria,
códigos, identidade estável e os 80 vínculos comerciais existentes.
