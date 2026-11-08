# Geometria da Mostra ARQ & Design — Pavilhão 1

A revisão 1 foi extraída do PDF vetorial original de uma página, preservado em
`docs/references/pavilion-1/mostra-arq-design.pdf`.
SHA-256: `088ab9d98e61ed98c98b45834c5813416d9fd09a10af195aeeae29bfc9a4c02a`.

## Coordenadas e revisão

A página mede 1092,0616 × 565,0964 pontos PDF. A origem local é o canto superior
esquerdo da página; X cresce à direita e Y cresce para baixo. Os números do SVG
usam esses pontos, arredondados a três casas decimais. Não são metros. A planta
permanece no mesmo sistema, recebendo apenas translação e escala uniforme na UI.
O enquadramento inclui acessos e saída, mas exclui o carimbo e as cotas técnicas.

O documento contém 2104 operações de desenho. A apresentação reaproveita 567
traços vetoriais sem duplicação: 325 traços estruturais, 136 traços leves
(caixilhos, pilares e limites) e 106 traços na região das portas. Esses traços
continuam vetoriais; não se trata de uma imagem de fundo com zonas aproximadas.
Cotas, hachuras de serviço, marcadores minúsculos e setas de fluxo repetidas são
omitidos da apresentação padrão. As portas mantêm os arcos e folhas do PDF.

`plan.generated.json` reúne os ambientes e esses traços. `extract-plan.py`
reproduz a extração determinística, recebendo o PDF como argumento. Uma revisão
publicada deve ser preservada; alterações posteriores precisam de nova revisão.

## Identidade e superfícies selecionáveis

São 15 códigos numéricos preservados com dois dígitos. Os ambientes 01 a 14 são
comerciais; 15 é apoio. Salão, os dois corredores de serviço e o vestíbulo de
saída são ambientes sem estoque comercial. Os IDs são próprios do Pavilhão 1,
não são UUIDs de `spaces`, nem se confundem com o Pavilhão 14 ou lotes externos.
O banco vincula os ambientes comerciais a `spaces` pela edição e pelo pavilhão.

Há 24 anéis fechados para 19 ambientes. As cinco extensões exteriores pertencem
a 04, 05, 08, 09 e 12 como uma segunda parte do mesmo ambiente. Interior e
exterior recebem a mesma seleção e o mesmo painel, sem novos lotes.

A recepção 01 e o Salão de Design compartilham a polilinha ondulada extraída da
operação 1504 do PDF. É um elemento `guide`, não uma parede estrutural. Os anéis
usam a mesma sequência em sentidos opostos, sem sobreposição de cliques. Café
14 acompanha o recorte dos banheiros; o recinto inferior de saída, separado por
parede e aberturas na fonte, é circulação. Os banheiros 15 abrangem os dois
recintos e seu acesso intermediário, preservando o desenho interno das portas.

## Metragens declaradas e pendências documentais

As áreas oficiais da interface são exclusivamente as 15 áreas declaradas no
pedido e no PDF: os produtos dos polígonos não alimentam os metros quadrados.
O Salão de Design e as circulações usam `null`, sem estimativa ou linha de área.

A fonte não explicita a composição interna/externa das áreas 04, 05, 08, 09 e 12. Os valores 74,81 m² e 129,43 m² são mantidos exatamente como declarados;
nenhuma extensão é somada novamente. Qualquer futura divisão entre área
interna, externa e total exige confirmação documental. O traçado tampouco é
levantamento topográfico ou documento de cálculo de área para contratos.

## Conferência

Os testes de dados verificam os 15 códigos, as áreas declaradas, as 14
identidades comerciais, as cinco extensões, o salão sem área, os limites de
seleção e o encontro exato entre recepção e salão. A extração foi adicionalmente
conferida com Shapely: 24 anéis válidos, sem área de interseção entre quaisquer
partes. O SVG gerado foi renderizado e comparado visualmente à página original.

O repositório FENASOJA foi lido apenas como referência de identidade estável,
separação comercial, seleção contextual e enquadramento. Nenhum parcelamento,
metragens, expositores, contratos ou regras comerciais foi importado dele.
