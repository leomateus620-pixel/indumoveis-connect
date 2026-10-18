# Céu e luz diurna compartilhados

## Origem visual única

`src/features/commercial-map/daylight.ts` define a mesma direção de mundo para o céu visível, a fonte dos reflexos filtrados e as luzes locais. A direção solar `[-0.5, √0.5, 0.5]` está normalizada e corresponde a uma elevação de 45°. É uma escolha de apresentação, sem representar hora, localização geográfica ou simulação meteorológica.

| Parâmetro              | Calibração inicial                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zênite                 | `#6FA9D6`                                                                                                                                                  |
| Azul intermediário     | `#9BC6E1`                                                                                                                                                  |
| Horizonte              | `#DCE9EC`                                                                                                                                                  |
| Faixa de encontro      | Cor exata do horizonte entre elevações `-0.02` e `+0.02` radianos, sem nuvens ou lóbulo solar. Permite unir atmosfera distante e solo sem fresta colorida. |
| Sol direcional         | `#FFF4E3`, intensidade `2.8`                                                                                                                               |
| Luz hemisférica        | Céu `#D5E4EF`, solo `#B6B9A0`, intensidade `1.55`                                                                                                          |
| Preenchimento opcional | `#DBE8F5`, intensidade `0.45`                                                                                                                              |
| Sol no panorama        | Lóbulo amplo e quente, com mistura máxima de 9%; sem disco HDR, flare ou luz adicional.                                                                    |
| Nuvens                 | Quatro bancos esparsos com lóbulos arredondados, suaves e fixos no mundo; alguns em elevações baixas de 0,105–0,15 radianos.                               |

O renderer mantém saída sRGB e aplica `NeutralToneMapping` com exposição `1.0`. O preenchimento foi calibrado nas capturas para preservar a leitura das fachadas claras, enquanto o sol mantém direção perceptível sobre os volumes. `sunShadows.ts` projeta estaticamente os edifícios existentes no sentido oposto ao mesmo sol, une as projeções sobrepostas e as desenha em uma chamada, com opacidade `0.12`. Não cria novos edifícios, sombra de lote vazio, shadow map ou passe de renderização; sua geometria permanece fixa durante a navegação. São projeções esquemáticas de contato no solo; não calculam autosombra dos telhados nem sombras de nuvens.

Todas as amostras usam a direção tridimensional normalizada. Nuvens não usam ruído sobre UV, portanto a longitude não cria costura e os polos não comprimem um padrão bidimensional. O panorama possui linhas polares uniformes e preserva a orientação na reabertura. Uma caixa unitária estática fornece as direções ao shader de fundo; ela não pertence ao grupo comercial, não entra no enquadramento e não pode interceptar o raycast.

## Preparação e integração

- `createDaylightSky({ detail: "simple" })`: gradiente imediato de 64 × 32, sem preparação rica no primeiro quadro útil.
- `createDaylightSky()`: panorama estático de 1024 × 512, preparado na tarefa adiada já existente do renderer. Retorna `texture`, `textureBytes`, `detail`, `fallback` e `dispose()`.
- `createDaylightBackground(texture)`: caixa de fundo com material de shader, `setTexture()` e descarte próprios. A textura continua pertencendo ao chamador; trocar o panorama atualiza apenas o uniforme, sem recompilar o material.
- `createDaylightSky({ fail: true })`: reproduz falha da preparação rica e mantém o mesmo gradiente azul simples. Falhas reais durante a preparação também liberam a textura parcial e tentam esse gradiente.
- `createDaylightPixels(512, 256)`: fornece à preparação de PMREM a mesma fonte direcional em menor resolução. Não cria outra direção solar nem uma segunda identidade de iluminação.
- `sampleDaylightDirection([x,y,z])`: amostra de referência em canais sRGB de oito bits, utilizada pelos testes de continuidade e orientação.

O cache de CPU compartilha bytes determinísticos entre aberturas e mantém no máximo quatro panoramas. As texturas de GPU são independentes por renderer, e seu descarte é idempotente. Os consumidores tratam os bytes retornados como somente leitura. Nenhum recurso depende de rede, DOM de céu, partículas, animação contínua ou atualização por gesto.

O panorama é `DataTexture` RGBA8, sRGB, `flipY=false`, filtragem linear, repetição horizontal e sem mipmaps na fonte. Sua primeira linha aponta para o polo inferior e a última para o zênite; a conversão corresponde a `v=asin(direction.y)/π+0.5` da versão instalada do Three.js.

Antes da apresentação 3D, o renderer prepara assincronamente os programas essenciais do grupo comercial e do chão com as luzes da cena. A interface SVG continua disponível durante esse trabalho; a troca para o 3D ainda exige três desenhos reais. Céu rico, textura completa do terreno e PMREM permanecem na tarefa ociosa posterior à prontidão. Falha na preparação antecipada dos programas permite seguir pelo desenho normal, sem deixar a apresentação indefinidamente bloqueada por uma rejeição dessa preparação.

## Reflexos, solo e perfis

A fonte de reflexos usa o mesmo amostrador em 512 × 256, com resolução de cubo 128 antes do empacotamento CubeUV pelo PMREM. A preparação acontece uma vez após o mapa estar pronto e permanece disponível nos três perfis. O atlas é associado explicitamente ao `envMap` dos materiais físicos compartilhados, conservando o ambiente global vazio para manter solo, lotes, paisagismo e árvores sob a iluminação difusa local. A falha opcional conserva as luzes locais, o céu e a seleção. Aumentar ou diminuir a qualidade não gera outro panorama nem repete o PMREM.

As intensidades semânticas de ambiente são `0.13` para parede pintada, `0.09` para concreto, `0.06` para asfalto, `0.10` para tinta branca, `0.35` para telha pintada, `0.48` para metal exposto, `0.72` para vidro e `0.14` para acento quente. O perfil Leve multiplica essas intensidades por `0.65`, conservando resposta visível ao céu com menor destaque. As diferenças de metalicidade e rugosidade da biblioteca de materiais continuam distinguindo os elementos.

O solo externo usa Lambert difuso sob o mesmo sol e luz hemisférica, com intensidade de ambiente zero. A medição no renderer em software orientou essa escolha para a grande área do chão. Sua textura de cor permanece nos três perfis; bump fica reservado ao Detalhado e desaparece com o afastamento. A atmosfera distante atua apenas sobre esse solo, por coordenadas mundiais, e chega ao mesmo `#DCE9EC` da faixa do horizonte antes do limite distante do frustum. Pisos e lotes protegidos cobrem a base contínua em um nível superior de `0.03` unidade.

A navegação conserva a aproximação de inspeção de `0.36π` e permite baixar a câmera até `0.44π` com raio mínimo dependente da folga dos telhados. Assim, a faixa de céu resulta de posições válidas da câmera. O fundo mantém sua orientação mundial: a rotação do observador muda a direção amostrada, enquanto o panorama, a direção solar e o grupo comercial permanecem fixos.

## Custos e limites da estimativa

O campo `textureBytes` conta a fonte RGBA8: **2.097.152 bytes** no panorama rico e **8.192 bytes** no gradiente inicial. O panorama de reflexos de 512 × 256 ocupa **524.288 bytes** enquanto prepara o PMREM. Esses tamanhos são estimativas do formato, não medições de memória do driver.

O fundo amostra o panorama diretamente em uma caixa de **12 triângulos e uma chamada de desenho**, sem alvo de conversão para cubemap ou buffer de profundidade adicional. O shader usa somente a rotação de `viewMatrix` e fixa a profundidade no limite do clip. A posição da caixa, o plano distante, a textura e o enquadramento comercial permanecem estáveis durante os gestos. A caixa desativa escrita de profundidade, sombras e raycast. Ele desenha após os objetos opacos com teste de profundidade ativo, evitando amostrar céu atrás do terreno. O renderer omite essa chamada somente quando até as interseções superiores do frustum com o chão ficam antes do plano distante; iluminação e reflexos continuam ativos. O orçamento e as medições do PMREM são registrados separadamente pela infraestrutura de reflexos.

Um ângulo que mostre apenas poucos graus acima do horizonte produzirá uma faixa clara estreita: o limite de inclinação e a calibração do gradiente precisam ser conferidos nas capturas legais do mapa, sem alterar a câmera apenas para evidências.

## Verificação

`daylight.test.ts`: **10 testes aprovados** em 17/10/2026. Cobrem horizonte nos dois hemisférios, zênite azul, direção invariável, costura e polos, nuvens esparsas, alinhamento solar, orientação do panorama, compartilhamento de CPU com propriedade independente de GPU, descarte e falha de preparação. Também verificam a troca de textura sem recompilação, a exclusão do raycast e a propriedade separada dos recursos do fundo. Uma prévia estática do panorama foi inspecionada visualmente; sua existência não substitui a validação da cena sob a iluminação final.

## Referências oficiais consultadas

O Three.js permite iluminar materiais por `scene.environment` e dar precedência ao `envMap` de cada material. A implementação usa mapas explícitos nos materiais físicos para conservar a resposta difusa das outras superfícies. [Documentação de Scene](https://threejs.org/docs/pages/Scene.html).

`DataTexture` recebe os bytes diretamente e tem `flipY=false` por padrão. Isso permite preparar o gradiente sem arquivos externos e manter sua orientação explícita. [Documentação de DataTexture](https://threejs.org/docs/pages/DataTexture.html).

A identificação de cor sRGB, o mapeamento equiretangular e a liberação dos recursos de GPU seguem as propriedades e o método públicos da textura. [Documentação de Texture](https://threejs.org/docs/pages/Texture.html).

`ShaderMaterial` recebe os atributos e uniformes internos do renderer. O fundo usa essa infraestrutura, mais os trechos de saída de cor e tone mapping do Three.js, para conservar a mesma resposta de cor da cena. [Documentação de ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html).
