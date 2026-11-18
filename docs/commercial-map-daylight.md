# Iluminação do parque

Em **Opções de visualização → Iluminação**, Natural e Quente atuam no mapa 3D em qualquer perfil gráfico. O navegador guarda a escolha em `indumoveis:map-lighting`, independentemente de `indumoveis:map-quality`. Um primeiro acesso, um valor desconhecido ou a indisponibilidade de armazenamento iniciam o mapa em Natural.

| Componente | Natural | Quente |
| --- | --- | --- |
| Sol direcional em sRGB e intensidade | `#fff7ec` · 3,12 | `#ffd09b` · 3,36 |
| Hemisférica, céu / solo e intensidade | `#d2e5ff` / `#a3a68c` · 0,94 | `#c9dfff` / `#a7a193` · 0,99 |
| Preenchimento | `#dceaff` · 0,19 | `#d9e7ff` · 0,26 |
| Radiância RGB do panorama e de seus reflexos, em espaço linear | `1,00 / 1,00 / 1,00` | `1,23 / 0,94 / 0,80` |
| Exposição de `NeutralToneMapping` | 1,04 | 1,03 |
| Revisão do perfil | `natural@2` | `warm@1` |

A direção solar comum é `[-0.5, √0.5, 0.5]`, com elevação visual de 45°. A temperatura varia por luz. O sol quente dá cor às faces iluminadas e a hemisférica mantém preenchimento azulado nas faces em sombra. Os dois modos usam o mesmo cálculo geométrico de sombras do perfil ativo. A direção é uma escolha de apresentação e não representa um horário observado no parque.

## Componentes e ciclo de vida

- **Céu e horizonte.** O gradiente inicial tem 64 × 32 texels e surge na primeira cena. O panorama autoral de 1.024 × 512 chega em uma tarefa adiada. Os bancos baixos e as faixas tênues de nuvens altas foram gerados offline em coordenadas da esfera, com uma faixa limpa junto ao horizonte. O PNG pesa 63.659 bytes. Céu e terreno recebem a mesma cor de horizonte antes da conversão de saída para sRGB.
- **Reflexos.** Uma redução do mesmo panorama para 512 × 256 alimenta um PMREM por contexto WebGL. A convolução é linear em cada canal RGB. Multiplicar o resultado filtrado pela radiância do modo equivale a multiplicar a entrada pelo mesmo fator antes da filtragem. A rugosidade e a intensidade de reflexão de cada material continuam atuando sobre essa entrada. A iluminação local sustenta o modo Automático em software, cujo caminho Lambert dispensa o PMREM nos materiais.
- **Troca durante o carregamento.** O céu visível, os materiais físicos e o terreno usam os valores vivos da cena. O resultado da decodificação e da filtragem contém somente a base Natural. Sua chegada tardia usa a radiância atual, mesmo se o usuário trocou de modo várias vezes. O cache dos pixels do gradiente inclui a revisão do perfil base e as dimensões. O PNG compilado pelo Vite possui hash do conteúdo. Os perfis dependentes da preferência têm identificador e revisão próprios.
- **Transição.** As duas luzes direcionais, a hemisférica, a exposição, o horizonte e a radiância interpolam em 180 ms. Uma nova escolha parte do último valor desenhado. Com redução de movimento a cena assume o valor final no próximo quadro. O caminho de troca altera uniformes de luz e cor, preservando a câmera, a seleção, os programas WebGL e os recursos de sombra.
- **Memória.** Cada renderer possui o próprio panorama e alvo de reflexão e os libera ao sair. O gradiente inicial requer 8.192 bytes de armazenamento RGBA8 estimado. O panorama rico requer 2.097.152 bytes e a fonte temporária do PMREM, 524.288 bytes. A troca de iluminação usa as mesmas texturas. O fundo tem 12 triângulos e só é desenhado quando o céu pode entrar no enquadramento.

A calibração da luz está em `mapLighting.ts`, `visualTheme.ts` e `daylightPalette.json`. O arquivo `scripts/build-commercial-daylight.py` reproduz o panorama com NumPy e Pillow. A arte é gerada no projeto a partir de funções de cor e ruído e dispensa fotografias, HDRIs ou serviços externos.

## Validação

O roteiro `scripts/commercial-map-lighting-interactions.mjs` usa o build de produção local e as fixtures do mapa. Ele retém a resposta do panorama enquanto o operador troca a iluminação, seleciona o lote 01, alterna modos e qualidade, redimensiona a janela, abre o interior do Pavilhão 12 e retorna ao parque. O arquivo `lighting-interactions.json` inclui os contadores WebGL e o estado da câmera antes e depois de cada etapa. Os testes unitários também cobrem leitura inválida, armazenamento indisponível, reversão de transição, descarte e vínculo dos uniformes após a preparação assíncrona.

Em 17/11/2026, a versão integrada passou no Chrome 157 com Apple M5, 16 GB de memória e WebGL 2/ANGLE Metal. A janela de 1.366 × 768 usou teclado. A de 390 × 844 usou toque emulado e movimento reduzido. Nos dois tamanhos, as alternâncias com o lote 01 selecionado preservaram a posição da câmera, o alvo e a seleção. Os contadores permaneceram em 36 programas no desktop e 42 na emulação móvel, com 16 texturas e uma preparação PMREM nos dois tamanhos, sem atualização adicional da sombra. A conclusão do carregamento do céu respeitou o modo escolhido. O retorno do interior do Pavilhão 12 restaurou Quente e Equilibrado, com um contexto WebGL ativo. A validação em telefone físico continua pendente. [Registro do percurso integrado](validation/commercial-map-daylight/lighting-interactions-2026-11-17.json).

No teste complementar com SwiftShader, o perfil Automática escolheu Leve. A troca preservou o lote 01 e as dez texturas registradas na cena. A planta permitiu selecionar o lote 02 e retornar ao 3D em Quente. Com WebGL indisponível, a seleção do lote 03 funcionou na planta sem criar contexto gráfico. [Registro de software e planta](validation/parque-2026-11-17/modo-software-e-planta.json).
