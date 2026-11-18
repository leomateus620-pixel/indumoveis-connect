# Horizonte de Santa Rosa em /mapa

Os dois lados de cada par usam o mesmo registro de câmera, FOV vertical de 38°, buffer de 1468 × 860, perfil Detalhado e iluminação Quente. O lado esquerdo foi capturado no build da PR 27 (`c403745`). O lado direito usa a paisagem local. Os percentuais dos pavilhões vêm da massa de teste do mapa. [Vista individual de 209° sobre a pista](pista.webp)

| Referência       | O que comparar                                                                         | Captura                         |
| ---------------- | -------------------------------------------------------------------------------------- | ------------------------------- |
| 21h10m16s · 114° | Centro de eventos no primeiro plano, fachadas e setor leste-sudeste atrás dos telhados | [Antes e depois](21-10-16.webp) |
| 21h10m21s · 209° | Avenida, pavilhões, quadras, pista e setor sul-sudoeste                                | [Antes e depois](21-10-21.webp) |
| 21h10m27s · 297° | Avenida em diagonal, Arena e setor oeste-noroeste, com campos                          | [Antes e depois](21-10-27.webp) |
| Superior         | Perímetro completo, lados arborizados, malha viária e áreas cultivadas                 | [Antes e depois](superior.webp) |
| Junto ao portão  | Alvo na saída da avenida, posição da câmera dentro do parque                           | [Antes e depois](borda.webp)    |
| Natural e Quente | Mesma posição sobre a avenida e a pista                                                | [Dois modos](iluminacao.webp)   |

A reconstrução dos anexos começou pela projeção das posições conhecidas dos marcadores sobre as coberturas. O ajuste usou correspondências locais de imagem em ruas, quarteirões e telhados do build de referência. As três poses são estimativas a partir dos pixels dos anexos. As capturas de comparação usam as posições efetivas registradas pelo renderizador. A escala horizontal local é de aproximadamente 0,455 unidade de desenho por metro.

A prancha mostra oito janelas do mesmo observador em Natural. Cada janela usa uma faixa da captura sem alterar a relação de aspecto. Ao lado, o leque marca o campo horizontal sobre a composição CBERS/Sentinel com o norte para cima. Os valores do estudo de visibilidade distinguem a cobertura ao redor do parque do relevo que chega à silhueta. [Oito setores](oito-setores.webp) · [Linhas de visada e cobertura](sightlines.json)

As fotos publicadas em janeiro de 2026 servem de conferência independente da perspectiva. Na página 16, a cobertura curva da Arena fica à frente de um corredor de copas e de talhões agrícolas. Na página 17, aparecem um grupo de telhados baixos, áreas abertas e sucessivos planos de relevo. A cor dos campos varia com a data do cultivo. [Fotografias do parque, Folha Cidade, pp. 16–17](https://edicoes.jornalfolhacidade.com.br/arquivos/16-01-26.pdf#page=16) · [Relato da Fenasoja](https://fenasoja.com.br/portal-oficial/geral/melhorias-no-parque-de-exposicoes-preparam-estrutura-para-a-fenasoja-2026/)

## Conferência da orientação nos pixels

A comparação usa a fotografia norte-acima de 2048 × 2048 e a captura superior do navegador. O detector SIFT encontra cruzamentos, contornos de telhado e manchas de vegetação. RANSAC ajusta uma transformação afim livre, inclusive para encontrar uma eventual reflexão. As correspondências aceitas cobrem os quatro quadrantes da captura. O eixo do leste na imagem fica aproximadamente a 119° no sentido horário a partir da direita da tela. O determinante positivo e a posição dos três controles do parque conferem a orientação. [Ajuste calculado nos pixels](registro-visual.json) · [Controles e câmeras no Earth](leitura-territorial.md)

Na oblíqua de 209°, o corredor escuro atrás da pista ocupa o centro-esquerda, com área aberta e ocupação entrecortada por vias à direita. No sentido de 297°, a cobertura clara da Arena está à direita da linha central, a ocupação baixa entra pela esquerda e os talhões ocupam o fundo central. A 114°, o solo aberto à esquerda dá lugar à ocupação baixa no centro e à direita. A sequência espacial pode ser conferida nas três câmeras Earth registradas na leitura territorial.

## Reprodução

Sirva dois builds de produção em portas diferentes, um da PR 27 e outro da revisão avaliada. O adaptador do repositório é `node scripts/serve-commercial-map-build.mjs PORTA`. Configure a URL Supabase pública de compilação como no projeto. Os testes aplicam os fixtures locais do repositório às requisições do navegador.

```sh
MAP_BASE_URL=http://127.0.0.1:4291 MAP_LANDSCAPE_PHASE=before MAP_LANDSCAPE_TASK=metrics node scripts/commercial-map-landscape-validation.mjs
MAP_BASE_URL=http://127.0.0.1:4292 MAP_LANDSCAPE_PHASE=after  MAP_LANDSCAPE_TASK=metrics node scripts/commercial-map-landscape-validation.mjs
```

O modo `startup` mede três entradas com novos contextos de navegador por perfil. O modo `visual` captura os pares e setores em PNG. Com os PNGs disponíveis, `python scripts/santa-rosa/check_registration.py artifacts.local/map-landscape/after/superior.png` repete o ajuste da ortofoto usando OpenCV e NumPy. O teste de paralaxe usa dois quadros do setor sul. OpenCV segue cantos visíveis nas duas direções do movimento e descarta rastros com erro de retorno acima de 0,9 pixel. O modo `video` grava a órbita e a subida em uma execução à parte. O modo `controls` testa o clique na imagem exterior, o alvo no limite físico, um giro completo pelo teclado e o enquadramento do parque. O diretório padrão é `artifacts.local/map-landscape/{before,after}`. O roteiro complementar `scripts/commercial-map-navigation-validation.mjs` exercita mouse, roda, gestos de dois dedos, presets e restauração de foco.

A órbita cronometrada percorre uma volta em 60 segundos ao redor do mesmo alvo. As posições são submetidas ao mesmo caminho de câmera limitado do renderizador. A amostragem acompanha o intervalo entre quadros com desenho WebGL efetivo. Capturas e gravação acontecem em outra execução para preservar a comparação. A reentrada abre o interior dedicado do Pavilhão 12, aguarda o descarte do contexto WebGL e volta à rota.

O primeiro quadro corresponde à marca `indumoveis-map:first-valid-draw`. Os marcos compacto e final são emitidos após o desenho do respectivo recurso e usam a mesma origem de tempo da navegação. O peso das respostas usa o corpo HTTP já comprimido. Os bytes de textura são estimados pelas dimensões e pelos níveis de mipmap. O WebGL não expõe a ocupação física total do driver. As pausas de carregamento incluem o maior intervalo entre callbacks de animação e a maior tarefa principal observada. Um perfil de CPU em uma execução de diagnóstico identificou a construção síncrona do gramado, das casas e da vegetação 3D como a maior tarefa. Essa preparação já existia na PR 27. A medição de abertura abrange essa etapa nas duas versões.

## Custo da paisagem e fluidez

Medições em 17 de novembro de 2026, no mesmo Apple M5 de 16 GiB, macOS 26.6 (Darwin 25.6), Chrome 157 e ANGLE Metal. O desktop detalhado usou viewport de 1366 × 768 e buffer 1294 × 655. O teste móvel leve usou viewport de 390 × 844 e buffer 390 × 689, com toque emulado nessa mesma GPU. DPR 1 nos dois. A rede era local, com cache HTTP desativado e respostas comerciais de fixture. A validação em aparelho móvel físico permanece pendente.

Tempos de abertura são medianas de três novas sessões. A coluna de pausa usa o máximo das três sessões, do início da navegação até o carregamento completo da vegetação, do bairro modelado e da paisagem. O p95 mede intervalos entre desenhos WebGL numa órbita separada de 60 segundos.

| Perfil e versão                 | Primeiro quadro útil | Entorno compacto | Entorno final | Maior pausa rAF / tarefa principal | p95 da órbita |
| ------------------------------- | -------------------: | ---------------: | ------------: | ---------------------------------: | ------------: |
| Desktop detalhado · PR 27       |               833 ms |                — |             — |                     400,0 / 405 ms |       16,7 ms |
| Desktop detalhado · Santa Rosa  |               867 ms |         1 371 ms |      2 556 ms |                     366,7 / 378 ms |       16,7 ms |
| Móvel leve emulado · PR 27      |               863 ms |                — |             — |                     383,3 / 395 ms |       16,7 ms |
| Móvel leve emulado · Santa Rosa |               868 ms |         1 372 ms |      1 372 ms |                     366,7 / 376 ms |       16,7 ms |

| Perfil e versão                 | Recursos locais recebidos | Paisagem recebida | Texturas residentes estimadas, cena | Pico estimado de texturas da paisagem |
| ------------------------------- | ------------------------: | ----------------: | ----------------------------------: | ------------------------------------: |
| Desktop detalhado · PR 27       |                  1,78 MiB |          0,00 MiB |                           19,38 MiB |                              0,00 MiB |
| Desktop detalhado · Santa Rosa  |                  6,91 MiB |          5,12 MiB |                          157,66 MiB |                            154,95 MiB |
| Móvel leve emulado · PR 27      |                  1,38 MiB |          0,00 MiB |                            9,88 MiB |                              0,00 MiB |
| Móvel leve emulado · Santa Rosa |                  2,40 MiB |          1,02 MiB |                           28,83 MiB |                             18,95 MiB |

A PR 27 publicou 852 ms para o primeiro desenho detalhado e 16,7 ms para o p95. As órbitas desta revisão amostraram 3.600 intervalos por perfil. O maior intervalo foi 16,8 ms em ambos. Abertura e órbita foram medidas em execuções separadas. A gravação acompanha a volta baixa e termina na vista superior. [Gravação contínua](orbita.mp4) · [Tempos por repetição, poses e recursos](medicoes.json)

Em ambos os perfis, a troca Natural/Quente preservou a pose e as texturas. A entrada no Pavilhão 12 descartou o contexto do mapa e fez zero requisições da paisagem. A volta deixou um contexto ativo e concluiu o carregamento em 1,72 s e 1,23 s. O teste de paralaxe deslocou a câmera 3,5 unidades (cerca de 7,7 m) para a direita, com o azimute sul fixo. O fluxo óptico mediano mediu 4,9 px em 395 cantos da faixa distante e 74,1 px em 445 cantos no parque. O roteiro confirmou os 17 cenários de navegação, o clique no exterior, a contenção do alvo na borda e a rotação completa por teclado. Ao retornar ao norte na vista oblíqua, o desvio médio de cor foi de zero em todos os canais e os pixels das duas capturas coincidiram.
