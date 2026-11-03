# Navegação e retorno da consulta — 02/11/2026

Os presets 3D, Superior e Oblíqua orientam a mesma câmera, com pan, órbita, inclinação e zoom disponíveis. O arrasto esquerdo move; o direito orbita e inclina; Shift + esquerdo também orbita. Um dedo move, enquanto dois combinam pinça, inclinação e giro. A ajuda mantém comandos alternativos por botão. A roda possui um único consumidor ativo no canvas, com deltas normalizados pelo `deltaMode` e âncora no solo sob o cursor, sem inferência do modelo de mouse ou trackpad.

A primeira seleção salva uma pose de retorno. Trocar A por B mantém essa origem; repetir a seleção e atualizar status não acumulam foco. Fechar a ficha, pressionar Escape, usar o retorno do cabeçalho ou clicar em solo sem seleção restaura a pose e a indicação de vista anteriores. Um gesto manual interrompe o foco na pose visível e invalida callbacks anteriores. A abertura da ficha enquadra o item na área livre; navegação manual não dispara um reenquadramento posterior. A inspeção opcional da cobertura conserva seu proprietário e não cria outra origem de retorno.

O SVG independente aplica a mesma sessão de seleção, possui navegação e busca de equipamentos e mantém os vazios dos pisos A2 com `fill-rule="evenodd"`. Vias históricas mantêm seus IDs/proxies de consulta, com piso transparente; a rede física A2 é a responsável visual pela circulação. As peças separadas das quadras de contexto permanecem separadas.

## Evidência de comportamento

O laboratório utilizou o build de produção local servido em `127.0.0.1:4218`, dados interceptados de edição/usuário de teste, perfil Leve, DPR 1 e Chromium do ambiente Windows. Nenhuma requisição de escrita foi enviada ao backend. Os [registros antes/depois](validation/commercial-map-navigation/navigation-production.json) contêm nove cenários aprovados:

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
