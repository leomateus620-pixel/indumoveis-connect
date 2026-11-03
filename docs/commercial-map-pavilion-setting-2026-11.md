# Entorno fotográfico do P1

A fotografia 9 (`Imagem do ChatGPT 3 de nov. de 2026, 01_02_03.jpg`) comprova uma árvore em canteiro circular elevado diante da fachada principal do P1. A implantação usa essa relação, a frente explícita `+X` e a geometria A2 já registrada. Centro, raio, níveis e escala da árvore são aproximações de apresentação em unidades do desenho; não são cotas topográficas.

| Elemento                         | Apresentação                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| Centro da ilha                   | `[61.25, 59.5]` em `(x,z)`                                                                       |
| Raio externo                     | `0.55 u.d.`                                                                                      |
| Anel superior / abertura do solo | `0.465 / 0.39 u.d.`                                                                              |
| Coroamento                       | `y=0.235`; fundação até `y=-0.16`, em contato com a base do terreno                              |
| Árvore                           | Uma instância adicional determinística no sistema existente; escala `1.05`, espécie não afirmada |
| Proprietário do piso             | Um furo de 64 vértices no componente A2 que contém o centro                                      |

O código de referência FENASOJA `pavilionCourtyard.ts / pavilion-1-sidewalk-tree` confirma que o elemento já era representado. Sua antiga posição proporcional não foi copiada: ela não coincide com a posição relativa observada na fotografia nova. Os arquivos FENASOJA permanecem inalterados.

Uma conferência independente com Shapely, usando a exportação técnica do commit `a10053b`, verificou o círculo de raio `0.55` com 192 segmentos: sua área `0.950162 u.d.²` estava inteiramente na ampla superfície de circulação A2. Não havia interseção positiva com os lotes ou edifícios. O afastamento do disco ao P1 era `0.66125 u.d.` e ao envelope comercial mais próximo `9.21831 u.d.`. A rota pedonal do P1 naquela revisão passava a `1.44414 u.d.` do disco. Esses valores descrevem a compatibilidade gráfica; a validação da rede final deve ser executada sobre a revisão final.

A ilha foi retirada da triangulação do asfalto por um único furo de apresentação. O mesmo furo entra na verificação de circulação. Os anéis vetoriais originais da planta e os polígonos comerciais não foram modificados. O canteiro possui duas paredes anulares e solo real, sem uma imagem plana aplicada sobre asfalto.

`photoPavilionSetting.ts` contém apenas dados e tipos, preservando a separação do SVG inicial e do motor 3D. `photoPavilionSettingGeometry.ts` prepara as geometrias estáticas, compartilha três materiais existentes e não cria texturas. O proprietário libera somente suas geometrias, com descarte idempotente. O canteiro não captura seleção.

A árvore entra pelo parâmetro `photoPavilionTree` de `createVegetation`, com origem de auditoria `photograph`. Reutiliza modelos, atlas, instancing, LOD, exclusão de picking e ciclo de vida existentes. Nenhum centro anterior de `TREES` ou das copas revistas foi transladado ou substituído.

Os testes verificam o proprietário único do furo, a ausência de colisão com polígonos protegidos, a retirada efetiva de triângulos de asfalto, a preservação dos materiais compartilhados e a ausência de interferência no picking. A fotografia confirma a presença do elemento e sua posição relativa; não comprova espécie, medidas exatas, altura ou o desenho completo do paisagismo.
