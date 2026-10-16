# Mapa Comercial — linguagem visual

Esta evolução conserva a revisão territorial `2026-10-15`, os seis perfis de cobertura, B7, apoios, acessos, alturas, associações, edição ativa e permissões. É uma maquete de apresentação: pintura, vidro, chapa, acabamentos e iluminação não certificam materiais históricos ou fachadas reais. Nenhum expositor, móvel, veículo, instalação ou novo volume comercial foi acrescentado.

## Direção e materiais

A vista geral separa parque, circulação e áreas consultáveis. Na aproximação, pintura mineral clara, concreto, chapa prateada, vidro azul acinzentado e arremates de metal têm respostas próprias. Taupe aparece somente nas soleiras já existentes. O terreno de apresentação é um neutro esverdeado claro, sem relevo inventado. Asfalto grafite azulado, passeios claros e contornos limpos substituem a contaminação bege, preservando a topologia de cruzamentos e aberturas laterais.

`visualTheme.ts` contém cores sRGB compatíveis com Three/SVG e não importa engine, backend ou componentes. Situação comercial usa uma tabela própria e só aparece para associação persistida confirmada. Seleção é um contorno ameixa e preenchimento translúcido separado; nunca substitui o albedo comercial.

| Família                    | Albedo de apresentação | Rugosidade | Metalness |
| -------------------------- | ---------------------- | ---------: | --------: |
| Parede pintada             | `#f1f0e7`              |       0,88 |         0 |
| Concreto                   | `#c4cbc8`              |       0,95 |         0 |
| Asfalto seco               | `#414c58`              |       0,98 |         0 |
| Pintura lateral            | `#f3f1e6`              |       0,87 |         0 |
| Chapa pintada              | `#aebdc6`              |       0,76 |      0,14 |
| Metal exposto              | `#778991`              |       0,42 |      0,72 |
| Vidro simplificado opaco   | `#526b72`              |       0,25 |      0,08 |
| Acabamento quente estimado | `#9a7c64`              |       0,84 |         0 |

Os valores são bases; roughness maps modulam a resposta. A biblioteca compartilhada `surfaceMaterials.ts` usa quatro mapas procedurais determinísticos de 128² RGBA8, com mipmaps e filtragem trilinear: albedos mineral/chapa em sRGB, dados de relevo/rugosidade em espaço linear. UVs são calculadas por face no referencial local dos edifícios, mantendo escala e orientação da chapa ao longo das águas. Cores de vértice modulam luminosidade, sem multiplicar o bege antigo. O relevo perde influência entre 35 e 150 unidades locais de distância. Não existem recursos remotos no acabamento da cena.

## Luz, reflexão e vegetação

Luz principal quente com direção fixa e preenchimento celeste frio revelam os perfis em qualquer orientação. Não há pós-processamento, transmissão, SSR, reflexo planar ou cubemap por prédio. O ambiente é uma única PMREM local derivada de céu/solo procedurais suaves em 256×128, compatível com Three 0.186, preparada depois da primeira navegação e apenas quando Equilibrado/Detalhado precisa dela. Não aparece como fundo. Falha mantém os materiais válidos sob luz local. Leve remove a contribuição do ambiente e mantém as mesmas famílias, geometrias e árvores.

O contato arquitetônico continua contido nos footprints; árvores recebem contato estático suave em um mapa RGBA8 compartilhado de 64². Não foi ativado shadow map direcional: o contato estático evita passes adicionais e sombras sobre identificação/acessos. A comparação e os custos do frame completo constam no relatório de validação.

As quinze posições aprovadas de árvores permanecem iguais nos três perfis. Três copas de volumes agrupados compartilham geometria, material e cores por instância. Escala, rotação e verdes `#3f6546`, `#657c4e`, `#8da56c` derivam de índices estáveis. Não há distribuição aleatória por carga nem novo paisagismo fora da fonte.

Detalhado permite uma brisa mínima nas pontas das copas, por um tempo/uniform compartilhado, sem render React por frame ou atualização de matrizes por árvore. Troncos e raízes permanecem fixos. O scheduler de decoração ociosa é limitado a 20–24 Hz; gestos retomam RAF normal imediatamente. Só frames de navegação entram na qualidade adaptativa. Movimento reduzido e aba oculta suspendem a decoração; Equilibrado/Leve permanecem estáticos. A cadência reduzida de decoração não provoca fallback por baixa navegação. O efeito também é dispensado se a navegação medida indicar custo excessivo.

## Legendas

`labelPolicy.ts` define um contrato exclusivo de ruas. A base mundial do texto com halo é 0,78 unidade; a escala final nunca supera 1, inclusive sob seleção. O retângulo efetivo é projetado pela câmera, limitado a 13 px CSS e ao corredor útil ao redor da âncora aprovada, descontando margens e cruzamentos. A projeção final é conferida novamente depois da redução. Não há divisão por cosseno ou compensação de zoom-out/inclinação.

Nomes aparecem a partir de 10 px e persistem até 8 px, com histerese. Quando pequenos ou rasantes, saem da cena e continuam disponíveis na busca/ficha. Asfalto recebe texto claro com halo escuro fino; passeios recebem texto escuro com halo claro. Não há placa branca nas ruas. Atlas 1024² compartilhado com gutters e filtro linear sem mipmaps evita vazamento entre células. Colisão considera o texto/halo, não a célula transparente; labels não participam do picking. Prédios e números conservam suas políticas próprias e prioridades de consulta. O SVG independente aplica a mesma política de ruas sem importar Three.

Referências de chão sem edifício, como Portão 03 e áreas abertas de apoio, também têm texto de escala mundial fixa, teto de glifo e histerese final, com corredor derivado do próprio footprint e sem placa. Essa regra impede banners rasantes de apoio, sem atribuir função nova, ocultar números comerciais ou mudar a política dos edifícios.

## Interface

Tokens locais em `map.css`: superfícies marfim `#fffdf9`/`#f7f3ed`, trilho `#eee9e3`, texto `#30282e`, ameixa `#583b51`, acento `#ad3c3c`, raio 11 px, borda `#ddd5cf`, sombras curtas e difusas. Figtree e Plus Jakarta Sans continuam as famílias do sistema. Nada altera tokens globais ou outros módulos.

Presets têm trilho segmentado e estado ativo forte; Mover/Girar indicam ferramenta atual. Zoom/enquadrar e ações auxiliares têm grupos próprios. Em contêiner estreito, seletores e Mais ações permanecem no topo, com alvos de 44 px. Popovers ancoram no acionador, busca apresenta identificação/localização, e ficha mantém identidade visível ao rolar. O mapa não exibe legenda técnica permanente no estado pronto; preparação, recuperação e 2D continuam explícitos e acessíveis.

Estados normal, hover, foco, pressão, seleção e desabilitado usam os mesmos tokens. Movimento conserva `motion.ts`: hover 120 ms, menu 160/120 ms, ficha 220/180 ms e vista 380 ms. A pressão desloca no máximo 1 px sem alterar o fluxo. Câmera continua interrompível e considera a região efetivamente livre da ficha.

## Propriedade e orçamento

Um renderer/contexto é criado por montagem. A biblioteca de materiais pertence a ele; arquitetura e pavimento só descartam suas geometrias quando usam a biblioteca compartilhada. Atlas, contatos, PMREM, instâncias, listeners, timers e RAF têm descarte explícito. Trocar perfil reutiliza câmera, contexto e recursos. Não há atlas reconstruído, PMREM gerada ou geometria arquitetônica refeita por clique/resize/frame.

Memória residente estimada: atlas RGBA8 sem mipmaps = 4.194.304 B; quatro mapas RGBA8 com mipmaps = 349.528 B; contato 64² RGBA8 com mipmaps = 21.846 B. PMREM usa atlas CubeUV 336×256 RGBA half-float (8 B/pixel), sem depth, MSAA ou mipmaps adicionais: 688.128 B. A fonte RGBA8 temporária (131.072 B) e o ping-pong são descartados após a preparação; pico do ambiente = 1.507.328 B, residente = 688.128 B. Mesmo desligado em Leve, se já preparado em outro perfil é contabilizado enquanto residente.

Em Three 0.186, um gerador PMREM novo com o argumento opcional de alvo não inicializa os meshes internos. O dono usa a chamada pública sem alvo e acompanha, apenas durante essa operação síncrona, os alvos ligados por `renderer.setRenderTarget`. Restaura a identidade exata desse método, alvo anterior, face/mip, XR, autoClear e toneMapping no bloco final. Gerador, fonte, scratch e alvos parciais são descartados mesmo quando a preparação falha depois de ligar um render target. Nenhum método privado da engine é substituído. Testes de propriedade cobrem sucesso e falha intermediária.

O orçamento de texturas/alvos é distinto do framebuffer de apresentação e buffers geométricos. `textureBytes` inclui os mapas e o alvo do ambiente; buffers de cor/profundidade/MSAA da janela dependem do driver e não são apresentados como texturas de material. Draw calls e triângulos são os do frame completo, não apenas da arquitetura. Leve conserva teto DPR 1/1 milhão de pixels e Equilibrado 1,5/2 milhões. Resultados novos e limitações estão em [validação desta direção de arte](commercial-map-art-direction-validation.md).

## Reprodução e falhas

Build de produção: `npm run build`; adaptador local: `node scripts/serve-commercial-map-build.mjs 4176`. O laboratório existente usa autenticação/REST interceptados e bloqueia mutações. `MAP_REFERENCE_POSES` reaplica as poses do baseline com Canvas 1200×600, independentemente da altura real do cabeçalho. `S31`–`S37` acrescentam ruas projetadas, brisa, movimento reduzido, 2D, falhas locais, reflexão e estados da interface às jornadas anteriores.

Somente em diagnóstico (`mapDiagnostics=1`), `mapEnvironment=fail` simula falha na preparação do ambiente e `mapSurfaceMaps=off` remove os mapas opcionais. São inspeções locais, sem efeito em permissões/dados. Não são telas/fluxos adicionais do produto. A aparência degradada usa os mesmos materiais locais e consulta. O módulo mantém import lazy e fallback SVG independente.
