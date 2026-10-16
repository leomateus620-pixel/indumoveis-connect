# Pavimentação de apresentação — etapa 2

`src/features/commercial-map/pavement.ts` deriva a apresentação das vias de
`data/territory.ts`, sem alterar IDs, polígonos, âncoras, áreas comerciais ou
associações. Os meshes de apresentação não recebem identidade selecionável:
consulta e picking continuam associados às entidades territoriais originais.

O código anterior coloria igualmente ruas e passeios e desenhava o contorno de
cada polígono isolado. A revisão separa o asfalto da Calçada do Arvoredo e dos
dois passeios do setor leste. A direção de arte usa asfalto PBR grafite levemente
azulado, alta rugosidade e agregado discreto; passeios usam concreto mineral
claro, e a borda mantém pintura branco-quente fosca. Albedo e relevo/rugosidade
minerais determinísticos de 128 × 128 RGBA são compartilhados com a biblioteca
arquitetônica, com mipmaps, repetição em coordenadas do desenho e filtragem
trilinear. Albedo é sRGB; dados são lineares. Não há aparência molhada, shader
personalizado, iluminação por via, geometria de agregado ou linha central.

## Rede e acabamento lateral

A união visual é decomposta em trapézios nos vértices e cruzamentos de todas as
arestas. As superfícies resultantes não se sobrepõem no mesmo plano. Esse
processo executa uma vez na criação da cena, sem trabalho durante pan/zoom.
Lacunas mínimas de traçado entre arestas paralelas opostas são conectadas só na
geometria de apresentação, até 0,025 unidade do desenho (cerca de 1% da largura
da menor rua). Isso resolve, por exemplo, as diferenças de 0,004–0,01 unidade
nas ligações de Mercosul com as ruas transversais sem modificar a fonte.
O encontro de Brasil com Brasília ocorre em um canto da planta, sem largura
comprovada de portal de conexão. O módulo não inventa uma ampliação da esquina
para transformar esse contato em um cruzamento completo; as extremidades ficam
sem pintura transversal e a consulta continua refletindo o desenho original.

As tiras brancas são triângulos leves, com largura de 2,4% da largura local
estimada da via, limitada entre 0,05 e 0,09 unidade do desenho. Não dependem de
`LineBasicMaterial.linewidth`. Só as laterais expostas recebem acabamento:
arestas internas da união e extremidades transversais ficam sem pintura. As
divisões nos cruzamentos removem as barras que um contorno fechado criaria.
Não há miters estendidos nem pontas longas.

Os acessos já presentes nos pavilhões e o Portão 03 também abrem a pintura
lateral próxima, por projeção sobre a respectiva borda. A abertura é acabamento
visual, não um novo acesso cadastral. Nenhuma porta ou função de B7 é inferida.
Não há branco no centro das ruas, carros, faixas de pedestre ou sinalização.

## Escala, níveis e custo

Todas as medidas são proporções de apresentação na escala esquemática; nenhuma
é declarada como metro ou área oficial. O asfalto permanece na elevação
−0,025; passeios usam −0,018 e tinta −0,012. O pequeno deslocamento coerente
evita z-fighting e não cria obstáculo/colisão. Lotes e prédios mantêm seus níveis.

O conjunto continua usando três draw calls: asfalto, passeios e pintura. Todas
as superfícies recebem UVs. A biblioteca compartilhada com arquitetura tem
quatro mapas de 128 × 128 RGBA8, **349.528 bytes incluindo mipmaps**, contados uma
única vez pelo dono do renderer. Não se somam novamente na pavimentação. O Leve
mantém agregado e acabamento, reduzindo o relevo e removendo reflexo opcional.
Na distância, o relevo se reduz até zero para evitar sujeira/cintilação. Os
recursos geométricos são retornados ao dono do renderer para descarte no mesmo
ciclo de vida; materiais e mapas compartilhados têm um único dono explícito.

## Verificação

`pavement.test.ts` cobre a área exata da união e ausência de sobreposição em
cruzamento, aberturas de T/cross e de acessos, lacunas de traçado, separação dos
passeios, imutabilidade da fonte, normals para cima, UVs, três batches e orçamento
dos mapas. Os testes da biblioteca cobrem espaço de cor, determinismo, qualidade,
redução de relevo e descarte compartilhado. A inspeção visual no navegador e as métricas do frame completo estão
registradas na validação geral da etapa 2; testes geométricos isolados não
certificam fluidez ou apresentação física na tela.
