# Mapa Comercial: contrato de operação e validação

A rota autenticada `/mapa` mantém os parâmetros `space`, `deal` e `status`. A base territorial local abre com zero espaços comerciais. A geometria é compartilhada entre SVG e Three.js; sua procedência, escala esquemática e inventário estão em [fontes](commercial-map-sources.md).

As coberturas e fachadas derivadas, as classificações dos apoios e os limites de fidelidade estão em [arquitetura de apresentação estimada](commercial-map-architecture.md). Os acabamentos das vias e sua topologia visual estão em [pavimentação](commercial-map-pavement.md). Essas geometrias não alteram footprints nem áreas comerciais.

## Responsabilidades e estados

- `data/territory.ts` e `geometry.ts`: implantação versionada, sem status comercial, empresas, preços ou dependência do outro projeto.
- `CommercialMapWorkspace.tsx`: seleção estável, ficha (fechada/abrindo/aberta/fechando), menu exclusivo, representação (preparando/pronta/recuperando/2D), inspeção e interface responsiva.
- `MapRenderer.tsx`: um único contexto WebGL2 e proprietário de câmera. Gestos e transições usam objetos locais, sem estado React por frame. Seleção e refetch atualizam buffers existentes.
- `Map2D.tsx`: consulta SVG independente da engine, disponível desde a montagem. Pan, zoom, pinça, busca e inspeção usam as mesmas entidades.
- `api.ts` e `commercial.ts`: projeções mínimas, cancelamento, edição e permissões atuais. A situação só é confirmada quando o usuário também pode ler Comercialização, pois a view depende de suas relações protegidas por RLS. Erro de consulta invalida a apresentação comercial; o parque continua utilizável.

Não há associações cadastrais publicadas sem evidência. `mapSpaceAssociations` aceita somente edição + setor + UUID persistido + ID geométrico revisados. O código ou UUID de um espaço nunca é convertido em número. Links ainda sem correspondência recebem mensagem local; negociações não exibem empresas.

## Gestos e câmera

Mouse com ponteiro preciso inicia em Girar: arrastar orbita, botão secundário desloca e roda aproxima. Ponteiro de toque inicia em Mover: um dedo desloca; em Girar, um dedo orbita. Dois dedos combinam pinça e deslocamento nos três presets. O controle explícito Mover/Girar permanece disponível. O fallback 2D oferece pan e zoom, sem órbita.

3D, Superior e Oblíqua são orientações da mesma câmera perspectiva e conservam alvo, seleção e escala percebida; selecionar um preset não reenquadra o parque inteiro. Superior começa próximo da vertical e permite sair dela com Girar. Uma órbita manual apresenta “Orientação livre” e retira a indicação de preset exato. O mesmo preset pode ser reaplicado depois do gesto. A inspeção mantém a navegação tridimensional; voltar restaura a pose e a indicação de orientação externas.

Vistas, zoom, reenquadramento, Mover/Girar, busca, opções, legenda, ajuda e tela cheia ficam no cabeçalho, fora da área de renderização. O retorno da inspeção também está nessa região. Em contêiner estreito, vistas e gesto usam seletores e as ações auxiliares ficam em Mais ações do mapa. Não existe dock inferior. A ordem de Tab acompanha as linhas visíveis; Esc/fechar menu devolvem foco ao acionador superior, inclusive ao abrir uma opção pelo menu compacto. Popovers abrem abaixo do cabeçalho e preservam a área restante de arrasto.

Os botões +/− usam fator 1,2. Ajuda recolhível oferece deslocamento e rotação por botões. A busca aceita número com ou sem zero, acentos e localização; resultados são percorridos com Tab e setas. `9` e `09` resolvem o mesmo envelope 09 / 10; 35, 36, 49 e 50 não são uma faixa contínua.

O limiar de arrasto é 6 px CSS para mouse e 10 px para toque. Pinça, cancelamento, perda de captura, blur e ocultação anulam a intenção de clique. Um novo gesto interrompe a transição na pose visível. Não há rotação automática, física ou inércia contínua. Limites de alvo, distância e inclinação mantêm o recorte recuperável.

Foco considera a região livre após ficha e safe areas; o cabeçalho participa do fluxo e reduz a altura real do Canvas, sem reserva inferior para controles. Resize observa o contêiner real, inclusive a sidebar. A câmera se ajusta ao item selecionado apenas se ele ficar escondido. Fechar ficha conserva a vista e a inspeção. “Voltar ao parque” restaura a pose e vista externas salvas; reenquadrar durante inspeção mantém o pavilhão.

## Movimento e camadas

Os tokens centrais estão em `motion.ts`: feedback imediato, destaque 100 ms, hover 120 ms, menu 160/120 ms, ficha 220/180 ms, expansão 220 ms, foco próximo 340 ms, recorte 480 ms, vista 380 ms e tooltip 500 ms. A navegação define também zoom curto, qualidade sustentada e intervalo de estabilização. Não há espera artificial por API nem progresso percentual.

A ficha atualiza o conteúdo sem reiniciar sua abertura ao trocar de entidade. Transições CSS invertem a partir do progresso corrente. Durante fechamento, os filhos ficam inertes e o corpo ainda intercepta o ponteiro; depois a camada é removida. Esc fecha primeiro o menu e depois a ficha. O foco retorna ao controle de origem ou à busca se o resultado já tiver saído do DOM. A ficha não prende o foco do restante do mapa.

`prefers-reduced-motion` aplica o destino sem voo; não muda geometria nem escolhe qualidade gráfica. As famílias existentes mantêm fallbacks do sistema. O único ajuste de shell é `AppFontStylesheet`: a mesma folha Google Fonts inicia com mídia não bloqueante e só passa a `all` quando carregada; o estado entre SSR e hidratação também é verificado. A cena não espera `document.fonts.ready`. Isso evita que uma CDN lenta impeça a primeira consulta, sem trocar tipografia, tokens ou navegação.

## Carga e saúde gráfica

O SVG e os controles entram primeiro. O import dinâmico de Three.js ocorre em efeito do cliente; a rota autenticada já possui `ssr: false`. Nenhum contexto, textura ou acesso ao navegador é criado na avaliação do módulo durante SSR. O primeiro estado 3D pronto exige cena essencial, controles instalados e draws válidos; vegetação entra depois em tarefa cancelável. Nos draws de preparação, o renderer lê o alvo atual do SVG. Um gesto SVG ativo adia a apresentação 3D até terminar; um foco antigo não sobrescreve a navegação manual feita durante a preparação.

São três perfis, com indicação automática conservadora quando faltam sinais de capacidade. Teto de pixels prevalece sobre DPR: Leve 1/1 milhão, Equilibrado 1,5/2 milhões, Detalhado 2/3 milhões. Janelas sustentadas e histerese controlam alterações; buffers só mudam após estabilização. Em AUTO, três janelas ruins consecutivas de 60 frames já em Leve ativam diretamente o 2D, sem repetir a inicialização. A qualidade manual preserva a escolha do usuário. Não se atribui potência por largura de tela. Lotes e consulta permanecem em todos os perfis.

O renderer desenha sob demanda para navegação. A [direção de arte](commercial-map-art-direction.md) permite adicionalmente brisa mínima e opcional no perfil Detalhado, com cadência de decoração limitada e excluída das amostras adaptativas de navegação. Gestos retomam RAF normal imediatamente. Movimento reduzido e aba oculta suspendem a decoração; RAF, timers, recursos e listeners são descartados ao sair. Árvores usam instancing; números e referências usam um atlas compartilhado com políticas próprias por categoria. Sem sombras dinâmicas, pós-processamento, modelos externos ou raster de PDF no caminho inicial. O ambiente local de reflexão é opcional, preparado uma vez após a apresentação útil e descartado com seu dono.

Chunk indisponível, inicialização, timeout ou contexto perdido têm destino finito: uma recuperação automática, depois 2D. A preparação tem limite de 4,5 s de tempo visível e sem gesto ativo do SVG, que já permite consulta. O relógio pausa durante o gesto ou com a aba oculta e retoma quando a preparação pode prosseguir; consultar a planta por mais tempo não provoca fallback indevido. Um comando do cabeçalho cancela o gesto anterior e assume a câmera; o próximo gesto começa sem deltas acumulados. Nova tentativa manual está em Opções. Tela cheia usa a API disponível e mantém expansão interna com saída clara se ela falhar.

## Reprodução

Use o lockfile existente: `bun install --frozen-lockfile`. Validação técnica: `npm test`, `node node_modules/typescript/bin/tsc --noEmit`, `npm run lint`, `npm run build` e `node scripts/commercial-map-bundle-audit.mjs`. Não existe script `typecheck` no projeto.

O preset de produção existente é Cloudflare Module. Para laboratório local, após build execute `node scripts/serve-commercial-map-build.mjs 4174`. É somente um adaptador HTTP para a saída construída, sem publicação ou mudança do preset. Em outro terminal PowerShell:

```powershell
$env:MAP_BASE_URL = 'http://127.0.0.1:4174'
node scripts/commercial-map-validation.mjs
```

O harness usa Playwright instalado ou o runtime bundled, autenticação e REST inteiramente interceptados, edição de teste e zero espaços. Mutações reais são bloqueadas. `MAP_VALIDATION_MODE=smoke` executa somente entradas básicas; `layouts` cobre os seis tamanhos e estados; o padrão executa as jornadas completas. `MAP_CHECK_FILTER` repete cenários específicos. `MAP_ARTIFACT_DIR` escolhe a saída; o padrão `artifacts.local/` é ignorado pelo Git.

O laboratório inclui seis viewports, ciclos de seleção/vistas/inspeção, saída/reentrada, gestos, teclado, sidebar, falhas de chunk/API/WebGL, contexto perdido e isolamento de Financeiro/Documentos. Mede cinco entradas frias e cinco aquecidas por cenário sob 10 Mbps/80 ms com CPU normal e reduzida, além de navegação ativa por perfil. Marcas Performance distinguem geometria, chunk, criação, preparação, draw, controles e atualização da ficha. Reconhecimento DOM e frame submetido não são input-to-photon.

Para solicitar a GPU do host, configure `MAP_BROWSER_GPU=hardware` e, se necessário, `MAP_CHROMIUM_EXECUTABLE` para o Chromium completo. Confirme a GPU no campo `unmaskedRenderer` do mesmo contexto da cena; a opção de lançamento sozinha não prova aceleração por hardware.

Resultados e limitações efetivamente observados ficam em [validação](commercial-map-validation.md). SwiftShader e CPU throttling não comprovam desempenho de GPU física; o ensaio separado com Intel UHD não comprova Android, iPhone/Safari, temperatura ou operação em produção. Não houve participantes externos no teste formativo.
