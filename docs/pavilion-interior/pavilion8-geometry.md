# Pavilhão 8 · Referência geométrica

A planta foi extraída da página vetorial de **Pav 08 - 02 - 14.11.25.pdf**, preservada no repositório com SHA-256 `63e3762f7d20b34359f451da1cac63ad7e03327496695106dff4b9c11e239767`. A página tem 595,276 × 841,890 pontos PDF e rotação zero. O enquadramento usa o recorte entre (67, 78) e (528, 814), mantendo a origem da página, o eixo x para a direita e o eixo y para baixo. [Fonte documental](../references/pavilion-8/fornecedores-construcao-civil-rev02.pdf).

O gerador lê os traços com PyMuPDF. O hash e a contagem de traços protegem as referências internas à revisão, e o texto confirma os códigos 01, 03, 04, 05, 06, 07 e 08 e a área total. Os polígonos fechados seguem o centro das divisórias comerciais e a linha interna do perímetro. Nos lotes 01, 07 e 08, o gerador calcula as interseções das diagonais vetoriais com os limites vizinhos. Cada número está no centroide do próprio lote.

| Trecho   | Evidência na geometria                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Esquerda | 04 acima de 03. O vão começa em y=393,574 e termina em y=488,210. O lote 01 acompanha a circulação por uma face diagonal.                                                |
| Direita  | O corredor dos fundos precede 05. O vão entre 05 e 06 fica em y=296,335–382,017. O 06 é um único espaço longitudinal e divide com o 07 a linha em y=613,329.             |
| Entrada  | O 08 fica entre duas aberturas. Sua largura em pontos PDF passa de 47,097 no topo a 124,567 junto à entrada. As diagonais de 01 e 07 deixam as duas aproximações livres. |

As linhas externas e as setas distinguem estrutura e circulação. O desenho preserva a diferença de altura dos vãos laterais, o corredor de saída nos fundos e as duas aberturas ao redor do 08. As setas indicam acessos. A referência não identifica o destino das passagens laterais.

O valor **937,32 m²** pertence ao pavilhão e inclui circulação. As unidades geométricas são pontos de desenho, independentes desse total. A planta mantém nulas as áreas individuais de origem. O lote 02 não consta da referência e permanece fora do desenho. Os nomes impressos na fonte permanecem apenas no material de referência. [Comparação vetorial com recortes de mesma orientação e escala](../validation/pavilion-8/geometry-comparison.jpg).

Para regenerar o JSON com PyMuPDF instalado, execute `python scripts/pavilion-interior/build-pavilion-8.py`. Os testes de geometria conferem os códigos e os anéis, os pontos de seleção em lados opostos das diagonais, as dimensões do trapézio em unidades do desenho e a circulação livre.
