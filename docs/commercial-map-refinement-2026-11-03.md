# Lotes, navegação e paisagem — 03/11/2026

A revisão parte de `980d1dc69c392c9a7737a00f53d0765a8e3080a4`, merge da [PR 12](https://github.com/leomateus620-pixel/indumoveis-connect/pull/12). O fetch inicial não mostrou commits posteriores na `main`. A implantação A2, as fachadas reconstruídas pelas fotografias e a rede física permanecem como base. As três imagens fornecidas nesta etapa orientaram a leitura visual dos lotes, do bosque e da avenida; não foram usadas para inferir novos lotes ou medidas topográficas.

## Leitura e consulta dos lotes

O perímetro da quadra recebe tinta ameixa e as divisões uma tinta verde escura, com separação tonal estreita. Segmentos compartilhados são divididos nos vértices já existentes e desenhados uma vez. A linha mantém as coordenadas cadastrais, inclusive em contornos irregulares; sua largura fica em pixels CSS, com cobertura alfa analítica. Núcleo e separação tonal são calculados no mesmo fragmento, evitando a alternância de amostras que apareceu na inspeção do perfil Leve. São dois lotes de desenho estáticos, e dois buffers reutilizados para hover/seleção. Não são muros ou meios-fios individuais.

Números usam o atlas único, agora com mipmaps trilineares e filtragem anisotrópica. São glifos sem retângulo branco, integrados ao plano da grama, com tinta escura e halo estreito. A orientação acompanha continuamente o azimute sobre o solo, sem placas verticais ou inversões por limiar. Um ponto de apresentação com folga interna é calculado uma vez; polígonos côncavos recebem um ponto interno válido. O tamanho é limitado pela distância à borda, e colisões são resolvidas na projeção. Grupos continuam grupos: os números são quebrados em duas linhas quando necessário, sem inventar subdivisões.

Os nomes dos pavilhões e estruturas ficam ocultos na vista normal. Ao selecionar, a ficha apresenta o nome completo e as informações existentes; a identificação contextual no mapa usa apenas texto e halo. Nenhuma identificação usa placa branca. Essa revisão incorpora a orientação adicional do usuário sobre a poluição visual dos rótulos.

O gramado conserva a textura sob os indicadores. O estado desconhecido deixa de parecer uma situação comercial confirmada; as cores dos cinco estados existentes permanecem intactas. Hover claro e seleção dourada são indicadores distintos. A superfície inteira do lote continua selecionável. A seleção não reconstrói os lotes nem seus materiais. O fallback SVG usa as mesmas bordas compartilhadas e pontos de numeração.

## Causas e correções de navegação

O código da PR 12 e o asset servido pelo site em 03/11 às 03:21 (São Paulo) tinham esquerdo=deslocar e direito=orbitar. O asset `MapRenderer-EKhTcM4f.js` coincidiu com o build inicial local. O mapa já tinha um OrbitControls e um único consumidor de roda em captura; abrir a ajuda não habilitava os controles. A nova definição foi aplicada diretamente: esquerdo gira/inclina, direito ou Shift+esquerdo deslocam, roda aproxima/afasta. Um dedo desloca; dois combinam pinça, giro e inclinação. O preset Superior permite órbita imediata. Zoom, enquadramento, vistas e botões de giro ficam no cabeçalho, com alternativas de teclado e foco.

A roda anterior limitava os deltas a ±120 pixels e reiniciava `smoothStep` de 120 ms a cada evento. A velocidade inicial zero dessa curva atrasava fluxos contínuos. Agora pixel/linha/página são convertidos para pixels CSS; deltas pequenos são preservados. A distância varia proporcionalmente por uma curva logarítmica simétrica, com 32% de resposta síncrona e até 72 ms de ease-out. Existe um destino por vez, sem fila. A âncora sob o cursor é mantida em interseções válidas; céu e interseções remotas junto ao horizonte usam o alvo atual. FOV, limites de segurança e responsável pelo ciclo de renderização foram preservados.

O primeiro lote da sessão salva a pose de retorno. A → B → fechar retorna à vista anterior a A. Repetir A não dispara novo foco; sair com o cursor mantém a ficha e a câmera. Gestos manuais interrompem os movimentos automáticos. O foco automático dos pavilhões inclui margem de contexto de 30% no enquadramento horizontal do footprint, mantendo altura, geometria e foco dos lotes; assim a cobertura não preenche toda a área livre ao abrir a ficha.

## Superfícies e materiais

Havia uma fundação de concreto que preenchia os intervalos verticais da implantação esquemática antiga. Ela continuava sob os pavilhões registrados na PR 12, enquanto parte dos gramados antigos já não era desenhada. O recorte é aplicado antes de triangular essa fundação e também retira os aprons indevidos. O gramado ocupa a mesma cota anterior; não cobre concreto duplicado.

P1 e P14 têm frente física para leste e fundos para oeste. O bosque irregular e a árvore existente junto ao sudoeste de P14 recebem solo gramado. Permanecem as frentes de concreto e o caminho entre os edifícios. P3/P13/P8/P12 têm frente para −Z e fundos para a avenida: seus recortes acompanham cada segmento posterior, inclusive o anexo côncavo de P8. A composição passa a ser edifício → verde → passeio longitudinal de concreto → meio-fio → avenida. Oito entradas posteriores conservam caminhos estreitos de serviço. Não foi adicionada travessia zebrada.

As larguras do passeio (1,6), do meio-fio (0,1) e dos caminhos de serviço (0,64) são **aproximações em unidades de desenho**, adaptadas ao espaço disponível. Não representam metros, levantamento ou comprovação de acessibilidade normativa.

A grama recebe verde mais saudável por material, o concreto cinza mineral fica mais equilibrado e o asfalto mantém superfície escura própria. As três variantes de copa recebem diversidade tonal. O terreno distante tem menos mistura marrom e menor contraste, por uma máscara elíptica suave derivada da implantação, sem retângulo de outra cor. Iluminação, exposição 1, saída sRGB, NeutralToneMapping e fachadas não receberam filtro global. As texturas PBR, relevo por distância e sombras existentes continuam ativos.

O contexto WebGL2 conserva antialiasing. A resolução depende do perfil e de pressão sustentada no automático, sem redução disparada a cada gesto. O perfil Leve da comparação foi mantido idêntico. O mipmap do atlas de rótulos acrescenta 1.398.100 bytes estimados; a textura continua única.

## Evidências e reprodução

As [capturas comparáveis, métricas e assinaturas](validation/map-refinement-2026-11-03/README.md) registram o resultado. Os ensaios usam build de produção local, edição e usuário interceptados e nenhum espaço persistido no laboratório. Não enviam gravações ao backend. O relatório registra erros de aplicação separadamente de mensagens de fontes bloqueadas e recursos 404 do laboratório.

```powershell
npm test -- --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
npx eslint src/features/commercial-map scripts/commercial-map-navigation-validation.mjs scripts/commercial-map-refinement-validation.mjs scripts/commercial-map-refinement-artifacts.mjs
npm run build
node scripts/commercial-map-source-audit.mjs artifacts.local/map-refinement/source docs/validation/pavilion-photos-2026-11/commercial-protection.json
node scripts/serve-commercial-map-build.mjs 4232
$env:MAP_BASE_URL='http://127.0.0.1:4232'
$env:MAP_REALISM_PHASE='after'
$env:MAP_ARTIFACT_DIR='artifacts.local/map-refinement/after'
$env:MAP_REFINEMENT_REFERENCE='artifacts.local/map-refinement/before/refinement.json'
node scripts/commercial-map-refinement-validation.mjs
```

Para comparar, preserve o output inicial em outro diretório, sirva-o em outra porta e execute o mesmo estudo com `MAP_REALISM_PHASE=before`, sem `MAP_REFINEMENT_REFERENCE`. O script de navegação usa `MAP_ARTIFACT_DIR` próprio; o empacotador `commercial-map-refinement-artifacts.mjs` verifica poses e buffers antes de converter PNG para WebP, sem recorte ou redimensionamento.

Os resultados de roda, mouse e toque são eventos automatizados de Chromium no host. Não certificam trackpad físico, iPhone/Safari ou Android físico. A PR contém implementação e evidências locais; publicação em produção depende da integração e do fluxo do projeto.
