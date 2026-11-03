# Navegação e retorno da consulta — revisão de 03/11/2026

Os presets 3D, Superior e Oblíqua orientam a mesma câmera, com pan, órbita, inclinação e zoom disponíveis. O arrasto esquerdo orbita e inclina; o direito ou Shift + esquerdo deslocam o mapa. Um dedo move, enquanto dois combinam pinça, inclinação e giro. Os botões de giro, zoom e enquadramento permanecem visíveis no cabeçalho, com foco pelo teclado. A ajuda apenas descreve os gestos e oferece alternativas de deslocamento. A vista Superior permite iniciar uma órbita diretamente e ativa a indicação de orientação livre.

A PR 12 tinha o mapeamento anterior: esquerdo para deslocar, direito/Shift para orbitar. Não havia dependência de abrir a ajuda, controlador duplicado ou amortecimento do OrbitControls: `enableDamping` já era falso. A revisão atende ao novo contrato solicitado, conservando um OrbitControls para os gestos e um consumidor de roda em captura no canvas que impede o processamento duplicado pelo controlador.

O zoom anterior cortava cada evento a ±120 pixels e usava `exp(delta × 0,0015)`: 100 pixels alteravam a distância em cerca de 16%. Cada evento reiniciava uma interpolação `smoothStep` de 120 ms, cuja velocidade inicial é zero. Um fluxo frequente de trackpad repetia essa fase inicial e produzia atraso e recuperação depois do gesto. A revisão converte os modos pixel/linha/página para pixels CSS, conserva deltas fracionários e usa distância logarítmica simétrica `exp(delta × 0,0032)`, com limite de 0,75 na variação logarítmica por evento excepcionalmente grande. Um evento de 100 pixels altera a distância em cerca de 38%, tanto na escala do parque quanto na dos lotes, antes dos limites de segurança.

32% do deslocamento desejado são aplicados no próprio evento. Uma única transição ease-out de até 72 ms completa o restante; entradas seguintes substituem seu destino e um gesto manual interrompe a transição na pose visível. A inversão de direção abandona o destino anterior e começa na pose visível, para uma pequena correção não continuar no sentido antigo. A âncora no solo sob o cursor é preservada quando a interseção fica a até três vezes a distância câmera/alvo. Raios para o céu ou interseções remotas junto ao horizonte usam o alvo atual, evitando deslocamentos laterais exagerados. O FOV permanece em 38°. A pinça continua no OrbitControls, com sensibilidade 1,15 e os mesmos limites de distância/altura de segurança.

A primeira seleção salva uma pose de retorno. Trocar A por B mantém essa origem; repetir a seleção e atualizar status não acumulam foco. Fechar a ficha, pressionar Escape, usar o retorno do cabeçalho ou clicar em solo sem seleção restaura a pose e a indicação de vista anteriores. Um gesto manual interrompe o foco na pose visível e invalida callbacks anteriores. A abertura da ficha enquadra o item na área livre; pavilhões recebem margem adicional de câmera para conservar circulação e paisagismo ao redor, sem alterar seu footprint ou altura. Navegação manual não dispara um reenquadramento posterior. A inspeção opcional da cobertura conserva seu proprietário e não cria outra origem de retorno.

O SVG independente aplica a mesma sessão de seleção, possui navegação e busca de equipamentos e mantém os vazios dos pisos A2 com `fill-rule="evenodd"`. Vias históricas mantêm seus IDs/proxies de consulta, com piso transparente; a rede física A2 é a responsável visual pela circulação. As peças separadas das quadras de contexto permanecem separadas.

## Evidência histórica da PR 12 — gestos anteriores

Os resultados desta seção registram a base anterior. O novo ensaio em `scripts/commercial-map-navigation-validation.mjs` verifica o contrato revisto, modos de delta equivalentes, resposta inicial, fluxo de trackpad, horizonte, retorno de seleção e ausência de seleções em arrasto/pinça. Seus resultados atuais acompanham a entrega desta revisão; não reinterpretam as medições históricas abaixo.

O laboratório utilizou o build de produção local servido em `127.0.0.1:4221`, dados interceptados de edição/usuário de teste, perfil Leve, DPR 1 e Chromium do ambiente Windows. Nenhuma requisição de escrita foi enviada ao backend. Repetido após a reconstrução fotográfica de 03/11/2026, o [registro de comportamento](validation/commercial-map-navigation/navigation-production.json) contém nove cenários aprovados:

| Cenário                      | Resultado observado                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| Arrasto esquerdo             | Câmera e alvo deslocados igualmente em 18,811579 unidades de desenho; vetor de órbita preservado |
| Arrasto direito              | Alvo preservado, delta zero; órbita e inclinação modificadas                                     |
| Shift + esquerdo             | Alvo preservado, delta zero; azimute modificado                                                  |
| Roda com delta 100           | Razão entre distâncias 1,1618342427282826, igual a `exp(0,15)`; âncora do solo preservada        |
| Lote A → Pavilhão B → Escape | Pose e vista originais recuperadas, deltas de posição/alvo zero                                  |
| Botão Fechar ficha           | Pose original recuperada                                                                         |
| Gesto durante foco           | Pose visível preservada; deriva posterior após 700 ms igual a zero                               |
| Viewport 390 × 844           | Um toque move; dois permitem pinça/giro/inclinação; A → B → fechar retorna com delta zero        |
| Viewport 844 × 390           | Mesmas verificações, com ficha no layout horizontal e movimento reduzido                         |

As capturas [desktop](validation/commercial-map-navigation/desktop-production-navigation.png), [390 × 844](validation/commercial-map-navigation/touch-production-390x844.png) e [844 × 390](validation/commercial-map-navigation/touch-production-844x390.png) acompanham o registro. Os tamanhos móveis e os eventos de toque foram simulados pelo Chromium/CDP; não demonstram funcionamento em aparelho físico, Safari ou GPU móvel. Este ensaio verifica comportamento, não FPS ou tempo de abertura.

O laboratório não registrou erros de execução da aplicação. Registrou quinze mensagens de recurso no console, limitadas a fontes bloqueadas pelo próprio laboratório e respostas 404. Esses registros permanecem no JSON e não são apresentados como console inteiramente limpo.

## Verificações locais

Os testes de navegação/fallback/Workspace exercitam o `OrbitControls` real em DOM, estabilidade do vetor câmera/alvo, giro com botão secundário/modificador, toque, retorno A → B → fechar, alteração de vista, refetch sem novo foco, limiar de clique e rejeição de um callback RAF cancelado. Os testes A2 verificam os seis pavilhões com footprints físicos: entradas, frente substancial, invariância por início/sentido dos vértices, cumeeiras na direção documentada e contenção de coberturas/proxies inclusive nos recortes côncavos.

```powershell
npm test -- src/features/commercial-map/navigation.test.ts src/features/commercial-map/mapInput.test.ts src/features/commercial-map/Map2D.test.tsx src/features/commercial-map/CommercialMapWorkspace.test.tsx src/features/commercial-map/architecture.test.ts src/features/commercial-map/architectureA2.test.ts --maxWorkers=2
node node_modules/typescript/bin/tsc --noEmit
```

O orçamento de tempo de CPU/GPU, a implantação inteira e os materiais possuem ensaios próprios. Os resultados acima não substituem a revisão visual do parque completo.
