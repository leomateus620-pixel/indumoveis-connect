# Mapa Comercial — validação da direção de arte

Registro de 16/10/2026. Implementação sobre a arquitetura aprovada (`f7738fa`), incorporada ao `main` por `6c3648f`, sem reset ou reescrita de histórico. Os acabamentos são estimativas de apresentação, conforme [linguagem visual](commercial-map-art-direction.md) e [fontes territoriais](commercial-map-sources.md).

## Escopo e conservação

São mantidos 59 envelopes externos, 70 números, seis pavilhões, B7/apoios, acessos e quinze posições de árvores. `territory.ts`, `geometry.ts`, `commercial.ts`, `src/lib/api.ts`, autenticação, SQL e `src/styles.css` não foram modificados. A fonte territorial normalizada em UTF-8/LF é idêntica ao baseline, SHA-256 `db70a5cb1362b3cfdeadfea02bfc2b8f54c497ad9c36216907174226886eaa11`.

O renderer continua lazy e isolado do shell/2D; não foi criada outra câmera, controle ou contexto para os efeitos. A PR não publica produção, migra dados nem modifica FenaSoja. Os testes usam autenticação e REST interceptados, edição local de laboratório e zero espaços comerciais persistidos; mutações são bloqueadas. Isso não comprova RLS/autenticação de produção ou dados comerciais reais.

## Evidência comparável

O baseline foi construído de um arquivo Git do commit aprovado, em diretório temporário independente. As cenas antes/depois usam produção, perfil Leve, Canvas 1200×600, a mesma câmera/alvo/distância e as poses registradas em JSON. O harness usa a altura natural do cabeçalho e reserva exatamente 600 px para a cena; não permite que a toolbar transborde sobre o Canvas nas comparações.

Interface compara o mesmo viewport/estado e conteúdo local. A altura do novo cabeçalho é uma diferença intencional de produto; as comparações de UI não alegam igualdade da projeção 3D que depende dessa altura. Capturas aguardam as transições de menus/ficha. Pares de cena mantêm igualdade de projeção separadamente.

| Matriz                       | Evidência                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V01 · perspectiva e Superior | [perspectiva](validation/commercial-map-art-direction/comparison-overview.png), [Superior](validation/commercial-map-art-direction/comparison-top.png)                                                                                                                                                                                                                                        |
| V02 · P1/bosque              | [antes/depois](validation/commercial-map-art-direction/comparison-P1.png)                                                                                                                                                                                                                                                                                                                     |
| V03 · sequência industrial   | [P12](validation/commercial-map-art-direction/comparison-P12.png), [P8/P13/P3](validation/commercial-map-art-direction/comparison-P8-P13-P3.png)                                                                                                                                                                                                                                              |
| V04 · B7 e apoios            | [antes/depois](validation/commercial-map-art-direction/comparison-B7.png)                                                                                                                                                                                                                                                                                                                     |
| V05 · reflexão sob órbita    | [ângulo A](validation/commercial-map-art-direction/S36-reflection-P8-before-orbit-workspace.png), [ângulo B](validation/commercial-map-art-direction/S36-reflection-P8-after-orbit-workspace.png)                                                                                                                                                                                             |
| V06 · cruzamento             | [antes/depois](validation/commercial-map-art-direction/comparison-Argentina-crossing.png)                                                                                                                                                                                                                                                                                                     |
| V07 · ruas projetadas        | S31: 18 poses, três distâncias/inclinações, com/sem seleção; PNGs e medições anexos                                                                                                                                                                                                                                                                                                           |
| V08 · estados da toolbar     | [normal](validation/commercial-map-art-direction/S37-desktop-normal-workspace.png), [foco](validation/commercial-map-art-direction/S37-desktop-keyboard-focus-workspace.png), [pressionado](validation/commercial-map-art-direction/S37-desktop-pressed-workspace.png)                                                                                                                        |
| V09 · busca/ficha mobile     | [busca](validation/commercial-map-art-direction/S37-mobile-search-workspace.png), [ficha](validation/commercial-map-art-direction/S37-mobile-detail-workspace.png)                                                                                                                                                                                                                            |
| V10 · perfis e consulta 2D   | [Leve](validation/commercial-map-art-direction/S36-profile-light-same-camera-workspace.png), [Equilibrado](validation/commercial-map-art-direction/S36-profile-balanced-same-camera-workspace.png), [Detalhado](validation/commercial-map-art-direction/S36-profile-detailed-same-camera-workspace.png), [2D](validation/commercial-map-art-direction/fallback-mobile-overview-workspace.png) |

Os pares foram abertos e lidos. A primeira comparação encontrou pavimento preto por atributo de cor ausente; a geometria agora fornece cor neutra explícita, com teste. Outra iteração corrigiu identidade da ficha que saía da área visível ao rolar em mobile. A revisão das ruas encontrou texto ainda visível após encolhimento perspectivo abaixo de 8 px; a checagem final usa a projeção efetiva e há regressão com câmera real de Three.

## Condições de execução

Windows 11 (`10.0.26200`), Intel Core i5-1035G1, 4 processadores lógicos expostos, 8 GiB RAM, Chromium 153.0.8010.12. GPU efetiva extraída do próprio contexto: Intel UHD `0x00008A56`, ANGLE/Direct3D11. Viewports: 360×800, 390×844, 844×390, 768×1024, 1366×768 e 1920×1080, densidade CSS 1. Fontes externas são bloqueadas no laboratório; capturas usam os fallbacks, enquanto Figtree/Plus Jakarta Sans e sua folha existente são preservados no produto. Toque por CDP é sintético; ocultação de aba é explicitamente simulada quando headless não altera `document.hidden`.

O laboratório testa mouse, teclado, foco/Escape, pinça sintética, sidebar, fullscreen, interrupção da câmera, inspeção/retorno e seleção. Inclui 30 seleções/20 fechamentos, 20 ciclos de vista e inspeção, 20 trocas de perfil, dez saídas/reentradas e recursos estáveis após aquecimento. Os testes de falha cobrem WebGL, chunk, API comercial, contexto perdido, mapas opcionais, ambiente, movimento reduzido e aba oculta/retorno.

Abertura: cinco amostras frias e cinco reentradas SPA por cenário; rede CDP 10 Mbps/RTT 80 ms, CPU normal e CPU×4. A medição distingue SVG útil transitório de 3D pronto. CPU×4 não equivale a outro equipamento físico. Navegação: trechos de 30 s com input contínuo, perfis Leve/Equilibrado, overview, cobertura, bosque, B7 e cruzamento. Intervalos são frames submetidos, não input-to-photon; seleção mede atualização DOM e submissão de draw.

## Verificações técnicas

- Baseline: 61/61 testes. Implementação: 82/82 testes em 16 arquivos.
- TypeScript sem emissão, ESLint do escopo, build de produção e auditoria do bundle passaram. ESLint global foi executado com `--ignore-pattern artifacts.local/**` para não analisar a cópia temporária do build/baseline; falha em 16.693 erros e 12 avisos, principalmente Prettier/CRLF fora do escopo. O baseline isolado reproduz a falha (25.186 erros, 12 avisos), incluindo o mesmo `prefer-const` histórico. Não foi aplicada formatação global para mascarar esse resultado.
- Biblioteca semântica, UVs, dados de cor, mipmaps, compartilhamento, relevo por distância e fallback de mapas têm testes.
- Legendas: não ampliação em zoom-out/ângulo rasante, teto na seleção, limites territoriais, histerese, rotação e reprojeção final.
- Recursos opcionais: criação parcial da vegetação, falha de textura e falha intermediária da PMREM testam descarte e restauração do renderer.
- O atlas não é reconstruído por interação; arquitetura/pavimento são estáticos e a consulta 2D não importa engine.

## Recursos e limites

Arquitetura: 32 meshes semânticos; vegetação: cinco draws instanciados para as mesmas quinze posições; pavimento: três batches. O diagnóstico mede o frame completo. Sem shadow map direcional, SSR, transmissão, pós-processamento ou ambiente remoto.

Comparação de recursos do mesmo recorte/pose, perfil Leve e Canvas 1200×600:

| Recorte    | Draws antes → depois | Triângulos antes → depois |
| ---------- | -------------------: | ------------------------: |
| Overview   |              28 → 49 |            7.636 → 12.498 |
| P1/bosque  |              20 → 34 |            7.374 → 12.238 |
| P12        |              24 → 42 |            7.562 → 12.424 |
| Cruzamento |              15 → 24 |             6.868 → 7.296 |

O aumento compra separação de famílias e copas orgânicas, conservando margem nos limites Leve de 80 draws/80 mil triângulos. A memória de mapas passa de 4.216.150 B para 4.565.678 B no Leve inicial. Não se declara ganho de FPS sobre o baseline: a fluidez desta cena é medida novamente nos trechos abaixo.

Texturas de superfície/atlas/contato = 4.565.678 B (4,35 MiB). PMREM residente = 688.128 B (0,656 MiB), total após preparação = 5.253.806 B (5,01 MiB). Pico de preparação = 6.073.006 B (5,79 MiB), incluindo fonte e scratch simultâneos. O ambiente já preparado continua contabilizado quando Leve o desativa. Geometrias e framebuffer de janela/MSAA são rubricas diferentes das texturas/alvos; não se afirma que a estimativa seja a memória total do processo/GPU.

Limites de fonte: implantação esquemática, alturas/perfis/materiais estimados e função de B7 não confirmada. Não houve ensaio físico Android/iPhone/Safari, validação térmica, participantes externos ou operação autenticada no banco publicado. Contrastes locais amostrados: corpo 14,07:1, secundário 5,77:1, ativo 9,42:1 e ameixa/trilho 8,06:1; isso não certifica acessibilidade global.

Os resultados medidos finais, condições, amostras e falhas constam no JSON anexo e nas tabelas abaixo. Números das etapas anteriores não são reaproveitados para aprovar esta cena.

## Resultados medidos do build final

60 verificações de navegador passaram; 0 falharam. 11 trechos de navegação de 30 s foram medidos. Asset do renderer: `/assets/MapRenderer-BeVQLkfg.js`.

| Abertura (n=5 por linha) | Útil mediana / pior | 3D pronto mediana / pior | Amostras 3D |
| ------------------------ | ------------------: | -----------------------: | ----------: |
| medium · cold            |      1142 / 1349 ms |           1406 / 1485 ms |         5/5 |
| medium · warm            |          89 / 93 ms |             317 / 333 ms |         5/5 |
| weak-cpu4 · cold         |      1752 / 2575 ms |           2539 / 2586 ms |         5/5 |
| weak-cpu4 · warm         |      1471 / 1770 ms |           1888 / 1921 ms |         5/5 |

| Navegação ativa           | Amostras | FPS mediano | Intervalo p95 | >200 ms | Draws / triângulos de pico | Meta e orçamento |
| ------------------------- | -------: | ----------: | ------------: | ------: | -------------------------: | ---------------- |
| light                     |     1807 |       59.88 |       16.7 ms |       0 |                49 / 12,502 | passou           |
| balanced                  |     1799 |       59.88 |       16.7 ms |       0 |                49 / 12,500 | passou           |
| light near lot70          |     1821 |       59.88 |       16.7 ms |       0 |                 25 / 7,000 | passou           |
| light bosque-P1           |     1808 |       59.88 |       16.7 ms |       0 |                35 / 12,274 | passou           |
| balanced bosque-P1        |     1800 |       59.88 |       16.8 ms |       0 |                35 / 12,272 | passou           |
| light pavilions8-13-3     |     1818 |       59.88 |       16.7 ms |       0 |                 29 / 7,118 | passou           |
| balanced pavilions8-13-3  |     1818 |       59.88 |       16.8 ms |       0 |                 29 / 7,118 | passou           |
| light B7                  |     1815 |       59.88 |       16.7 ms |       0 |                 27 / 7,012 | passou           |
| balanced B7               |     1799 |       59.88 |       16.8 ms |       0 |                 27 / 7,012 | passou           |
| light asphalt-crossing    |     1807 |       59.88 |       16.8 ms |       0 |                24 / 10,488 | passou           |
| balanced asphalt-crossing |     1813 |       59.88 |       16.7 ms |       0 |                24 / 10,488 | passou           |

Seleção (n=30): mediana DOM 0.8 ms; p95 DOM 1.9 ms; p95 até draw submetido 14.3 ms. Não é tempo físico de apresentação no monitor.

Área livre mínima abaixo do cabeçalho global: 84.44%. Todos os seis layouts mantiveram os controles no topo e alvos mínimos de 44 px.

Ruas: 18 poses reais, glifo/halo máximo 13.000 px CSS. Brisa ociosa: 19.92 Hz por 3.21 s, sem avanço das amostras/janelas adaptativas de navegação. Movimento reduzido e ocultação suspendem a decoração.

Os dados completos estão em [validation.json.gz](validation/commercial-map-art-direction/validation.json.gz), com [resumo extraído](validation/commercial-map-art-direction/summary.json), [manifesto das imagens](validation/commercial-map-art-direction/image-manifest.json) e [Design QA](../design-qa.md). Os erros de rede de fontes bloqueadas e das falhas injetadas são esperados; a lista de erros JS/hidratação não tratados é a do JSON.

Capturas complementares: [materiais sem mapas opcionais](validation/commercial-map-art-direction/S35-surface-maps-off-workspace.png), [referência local dos materiais](validation/commercial-map-art-direction/S35-material-baseline-workspace.png) e [ruas legíveis no SVG próximo](validation/commercial-map-art-direction/S34-fallback-readable-streets-workspace.png).
