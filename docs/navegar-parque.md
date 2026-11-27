# Navegar pelo parque

Preview técnico da Indumóveis 2027 no mapa do Parque de Exposições Alfredo Leandro Carlson. A maquete existente, a planta SVG e a ficha comercial continuam na mesma interface.

## Abrir o preview da branch

Com as dependências do repositório instaladas e Node 22.12+ ou 24, na raiz:

```sh
npx vite --config scripts/park-walking-preview/vite.config.ts --host 127.0.0.1 --port 4206
```

Abra [o preview local](http://127.0.0.1:4206/). Em **Navegar pelo parque**, use **Minha localização** com **GPS → Simulado**, ou escolha uma partida. O seletor **Cenário** conduz uma caminhada, pausa em um ponto ou simula perda de sinal. Em **Rede → Ampliada**, use a busca do mapa, por exemplo **Pavilhão 14** ou **Lote 66**, e toque em **Traçar rota a pé**. Compare as opções disponíveis pela distância e duração. **Quero sair** procura a saída cadastrada alcançável mais próxima pela rede. A rede ampliada também pode ser explorada com o GPS simulado ou com partida manual de um ponto cadastrado.

O preview é uma entrada Vite isolada. O build do app autenticado usa a rota `/mapa` e o catálogo da edição ativa de `useEdition()`. A versão das rotas fica em revisão no preview. A promoção para uso pelo público exige confirmação local de cada passagem e acesso e revisão da versão por edição. O conector Lovable confirmou o projeto **Indumóveis Connect** e o SHA de `main`. O endereço de preview que ele retorna aponta para essa integração. O preview da branch roda localmente. A alteração é de frontend e geometria de ensaio, com zero migrações ou chamadas comerciais novas.

## Auditoria anterior à implementação

| Peça         | Origem e decisão                                                                                                                                                                                                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rota real    | `src/routes/_authenticated/_app/mapa.tsx` → `CommercialMapWorkspace`. Autorização existente via `useCan("mapa")`. Dados comerciais pela API React Query. A seleção de caminhada usa o catálogo geométrico e estado próprio. Um toque durante o modo de caminhada seleciona o destino no painel da rota.                             |
| Renderização | `Map2D` é interativo antes do carregamento da cena e volta a assumir se o WebGL falhar. `MapRenderer` mantém um contexto WebGL, OrbitControls e o terreno original. A camada 3D atualiza somente ícones, boneco e geometrias da rota. A planta usa os mesmos pontos X/Z como X/Y e linhas SVG de espessura estável.                 |
| Implantação  | `parkRegistration.ts` registra a planta A2 e a geometria comercial. `urbanReference.ts` projeta os dados OSM. `parkConnectivity.ts` comprova continuidade vetorial do piso, removendo volumes, lotes e pilares. As 73 âncoras da auditoria original descrevem ligação física na cena, sem certificação de circulação de visitantes. |
| Fontes       | A organização registrou o Portão 3 como acesso de visitantes em 2025. O site oficial ainda aguarda a publicação da planta de 2027. O material interno indica a fachada principal do P1 pela Mercosul, com posição da soleira por representação.                                                                                     |

- [Implantação e acessos de 17/11](commercial-map-acessos-2026-11-17.md) · [Fontes dos pavilhões](commercial-map-sources.md).
- [Indumóveis 2025 e Portão 3](https://indumoveis.com.br/canal/para-todos-indumoveis-2025-comeca-nesta-sexta-feira-em-santa-rosa) · [Planta geral oficial](https://www.indumoveis.com.br/mapas-do-parque) · [Pavilhão 1](https://www.indumoveis.com.br/pavilhao-01).
- Em 26/11/2026, a vista do Google Earth fornecida pelo usuário exibia o mosaico de **19/03/2026**. A inspeção ajudou a conferir o arranjo das quadras, Arena, sistema viário, RSC‑472 e a relação com o bairro. O ponto central da câmera e a imagem serviram como referência visual. A projeção da planta continua usando os controles vetoriais já registrados no repositório. [Vista consultada no Google Earth](https://earth.google.com/web/@-27.84403156,-54.47930683,322.34276037a,995.26308251d,35y,245.99571214h,0t,0r/data=CgRCAggBOgMKATBCAggA).

## Projeção, alinhamento e limite da localização

Entrada geográfica **[longitude, latitude]** em WGS84. Na projeção local equiretangular existente, multiplica-se Δlongitude em radianos por **6.378.137 × cos(latitude da origem)** e Δlatitude em radianos por **6.378.137**. O resultado é **[leste, norte] em metros**, que alimenta o roteamento e o filtro. A rotação e a origem de `urbanReference.ts` levam os metros a **[X, Z]** no mapa. A cena usa Y para altura e a escala de **0,454816 unidade de desenho por metro**. Essa escala mantém a correspondência esquemática já existente e a distância do eixo A3 ↔ Campeira/Benvenuto. O cálculo é local e horizontal. Comprimento real em declives e soleiras deve ser conferido a campo.

| Controles ou verificações                                        | Fonte e data                                                                                   | Resultado na referência métrica                                                                                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A3, nó OSM 2470629442, e Campeira/Benvenuto, nó 2132115382       | Extrato OSM de 18/10/2026 e registro atualizado em 09/11/2026                                  | Determinam origem, rotação e escala. Resíduos desses próprios pontos são inelegíveis como medida de erro externo.                                           |
| P14 e P12, centro administrativo e Centro de Eventos, pórtico A3 | Centros de telhado/pórtico da ortofoto de referência usados na revisão de 09/11/2026           | Resíduos individuais após a translação, respectivamente **0,31 m**, **1,13 m**, **0,48 m**, **1,09 m** e **3,52 m**. São controles usados no ajuste visual. |
| A5 leste                                                         | Nó OSM 5479124532, extrato de 17/11/2026, comparado à abertura A2, excluído do ajuste anterior | **6,88 m** entre eixo e centro da abertura (3,13 unidades relatadas). São feições de fontes distintas e podem representar pontos físicos diferentes.        |
| Entradas de P1, P3, P14 e lotes                                  | Planta A2, documentação comercial e evidência de fachada                                       | Os acessos foram projetados para ensaio. Faltam posições geográficas independentes das portas e pontos de chegada.                                          |

**Calibração provisória.** A reserva de campo inclui A5, um cruzamento Brasília/Argentina identificável no piso, a soleira pública de P1 e um ponto de acesso na Mercosul ao sul do P14. Registrar feição exata, foto sem pessoas, fonte, método, data e incerteza do equipamento. Caso se ajuste a transformação, preservar pelo menos dois controles em setores distintos para aferição. As geometrias imobiliárias ficam fixas.

O limite de localização combina o contorno A2 com as áreas detalhadas de exploração já registradas, incluindo as rótulas, as quadras residenciais representadas e a aproximação leste modelada ao longo da RSC‑472. Ele é independente do zoom, da resolução e do horizonte decorativo. A pessoa pode se ver nessas ruas. Só se oferece acompanhamento de rota a partir de um trecho sustentado pela rede da edição ou de uma partida manual cadastrada. Para uma leitura fora da área, **Posição do dispositivo** exibe latitude, longitude e margem de erro em texto na aba, com arredondamento conforme a incerteza. A cena permanece no parque.

## Rede e comportamento

- **Piloto `2027-piloto-exterior.1`.** Portão 3, via dos Imigrantes, Brasília/Argentina, travessia de referência na Argentina, Mercosul e ponto externo de chegada ao Pavilhão 1. Pavilhão 12 é a alternativa de destino. Seis segmentos verificam o piso do modelo independentemente da busca de rota. A primeira ligação usa a passagem A3‑1, entre pilares. O P1 termina no limiar externo da fachada pela Mercosul.
- **Ampliada `2027-cobertura-em-revisao.2`.** 104 destinos e 625 trechos, incluindo 68 lotes, seis pavilhões, 19 estruturas e 11 portões. Seis eixos formam uma malha com cruzamentos compartilhados. O compilador verifica cada segmento contra o piso e os obstáculos da A2, liga as frentes alcançáveis dos lotes à rua e recupera conexões restantes quando reduzem desvios relevantes. Uma leitura de GPS ao longo de uma rua pode começar no interior de um trecho. Trechos paralelos da malha anterior só são tratados como a mesma rua nas faixas com ligação comprovada no modelo. Os portões 2 e 3 continuam candidatos no botão de saída.
- IDs estáveis conectam geometrias públicas às entradas. Os dados incluem nós, polilinhas, comprimento métrico, estado de circulação e evidência de degraus. Dijkstra escolhe o menor custo válido, rejeita trechos fechados/restritos e suporta múltiplas entradas. A segunda opção precisa usar outra entrada ou corredor com diferença geométrica relevante. Um trajeto único aparece sozinho. A cobertura de circulação sem degraus continua desconhecida.
- A estimativa soma o trecho fracionado de partida e as ligações seguintes. A referência fixa é **1,25 m/s**, com distância na interface arredondada a 5 m e duração em minutos inteiros. Piloto Portão 3 → P1: **281,64 m modelados**, apresentados como **280 m e cerca de 4 min**. Portão 3 → P12: **239,48 m**, cerca de **3 min**. A duração ainda depende de ritmo, lotação, travessias e operação.
- O navegador solicita alta precisão após **Minha localização**. Se o provedor falhar, uma segunda tentativa de baixa energia busca a estimativa do dispositivo. **Tentar novamente** reinicia o observador e uma leitura acima de 12 s expira. O filtro considera deslocamento, tempo e erros informados, descarta saltos e aumenta a área de incerteza pelo deslocamento introduzido pela suavização. O encaixe exige leituras consecutivas compatíveis, precisão do aparelho de até 9 m e corredor único ou nó compartilhado próximo. A rota só recalcula depois de três confirmações e pelo menos 5 s de desvio sustentado. A chegada exige leituras no trecho/entrada corretos, sem outra entrada plausível e com incerteza contida.
- Em 3D, o ícone e o personagem compartilham a âncora no piso. O boneco entra com 25 px estimados e 34° de inclinação em relação à vertical, e sai abaixo de 19 px ou 26°. Movimentos curtos e inconsistentes preservam o personagem em repouso. A câmera deixa de seguir ao navegar manualmente e **Recentralizar** retoma o acompanhamento. A preferência de movimento reduzido elimina animação do personagem e de reenquadramento.
- A faixa principal é azul com contorno, a alternativa é azul-clara, as setas indicam mudanças relevantes e a bandeira assinala a entrada modelada. O ponto de partida manual, os nomes do trajeto e os indicadores textuais ficam disponíveis na planta sem WebGL. A ficha existente fornece acesso interno quando há planta correspondente. O piloto não determina estande, piso ou navegação interior.
- O painel usa Figtree variável em arquivo local sob OFL e cartões com estados de seleção textuais e gráficos. O layout mantém controles, chegada e estimativa legíveis no desktop e na planta móvel. [Figtree](https://fonts.google.com/specimen/Figtree).

## Revisão de rotas da Rua Brasília

A primeira rede reunia traçados de auditoria calculados a partir de uma única origem. A Rua Brasília aparecia contínua na maquete, mas os ramos da rede não se encontravam ao longo dela. A revisão inclui o eixo inteiro, os cruzamentos com Argentina, Uruguai e Brasil, a passagem entre quadras e a Alameda Mercosul. Quem parte de outra rua pode chegar por outra frente verificada do mesmo lote. O tempo usa o comprimento restante antes de arredondar os metros da interface. A velocidade de ensaio é de 1,25 m/s e durações abaixo de 60 segundos aparecem como “menos de 1 min”.

Em 26/11/2026, usei a régua do Google Earth no mosaico exibido de 19/03/2026. Os marcos escolhidos por imagem foram o Portão 3 e os cruzamentos visíveis da Rua Brasília. A comparação com os valores da A2 foi usada para conferir o arranjo e a escala. A posição das frentes vem da planta comercial e a aprovação das passagens segue pendente de inspeção. [Vista consultada no Google Earth](https://earth.google.com/web/@-27.84403156,-54.47930683,322.34276037a,995.26308251d,35y,245.99571214h,0t,0r/data=CgRCAggBOgMKATBCAggA).

| Corredor a partir do Portão 3 | Régua no Google Earth | Rede A2 revisada |
| ----------------------------- | --------------------: | ---------------: |
| Rua Brasília até a Argentina  |                 ~71 m |            ~66 m |
| Rua Brasília até a Uruguai    |                ~114 m |           ~109 m |
| Rua Brasília até a Rua Brasil |                ~156 m |           ~157 m |

| Destino desde o Portão 3 | Rede anterior | Rede revisada | Interface              |
| ------------------------ | ------------: | ------------: | ---------------------- |
| Lote 28                  |        97,5 m |       100,0 m | 100 m · cerca de 1 min |
| Lote 42                  |       301,5 m |       121,6 m | 120 m · cerca de 2 min |
| Lote 56                  |       322,3 m |       147,4 m | 145 m · cerca de 2 min |
| Lote 66                  |       269,6 m |       228,3 m | 230 m · cerca de 3 min |

Uma origem simulada na Rua Brasil, na altura do Lote 53, selecionou a frente do Lote 56 por essa rua. A rota modelada foi de 27,2 m. Os ensaios de cobertura abaixo conferem todo o catálogo. O teste físico verifica as 625 ligações do modelo contra as superfícies e os obstáculos da planta. [Capturas da revisão](validation/navegar-parque/revisao-rotas) · [Relatório de navegador](validation/navegar-parque/revisao-rotas/browser.json).

## Cobertura automatizada do catálogo

Foram exercitados os **127 itens do catálogo** (68 lotes, 6 pavilhões, 9 áreas de apoio, 19 estruturas contextuais, 11 vias e 14 áreas de paisagem). O navegador cruzou cada item com oito situações de partida. As 1.016 combinações verificam a seleção na busca, a entrada de chegada, a distância e o ETA quando há rota, e a instrução apropriada quando a partida está incerta ou o item não tem acesso no grafo. Os 112 elementos desenhados foram selecionados por cliques reais tanto na planta 2D quanto no mapa WebGL. No 3D, o teste conferiu também se o botão de rota aparecia para cada destino com caminho cadastrado. [Seleções verificadas no WebGL](validation/navegar-parque/revisao-rotas/cliques-3d.json). As oito tentativas do botão **Quero sair** foram verificadas à parte. O relatório lista cada destino sem ligação cadastrada. [Resultado por cenário e catálogo sem rota](validation/navegar-parque/revisao-rotas/catalogo.json).

| Teste no Chrome                                                                              | Combinações |
| -------------------------------------------------------------------------------------------- | ----------: |
| Trajeto, entrada de chegada, distância e ETA com origem reconhecida ou escolhida manualmente |         380 |
| Espera por origem confiável, incluindo sinal aproximado, entorno e fora da área              |         380 |
| Aviso de destino sem passagem validada (14 áreas de paisagem, 11 vias e 7 apoios)            |         256 |

Os testes de integração da rede também cruzam 106 destinos (incluindo os portões e a saída mais próxima) com nove posições de GPS nas margens de ±2, ±5 e ±8 m e quatro partidas manuais. As 3.286 rotas são comparadas com um cálculo independente de menor caminho e conferidas quanto à entrada, à continuidade, à metragem e ao arredondamento do ETA. Leituras de ±12 e ±35 m mantêm a incerteza. Leituras antigas, ambiguidade na entrada e perda de encaixe devem impedir uma confirmação de chegada.

A Sede e o Espaço Mão na Massa usam o mesmo acesso físico candidato, identificado pelo vínculo existente na planta. Ao sair da área do mapa, uma linha iniciada pelo GPS é retirada da cena. Os ensaios usam posições sintéticas. A confirmação dos acessos em operação, a precisão real dos aparelhos e o erro do ETA seguem como **não validados em campo**.

## Privacidade e ensaios

Em teste manual no macOS fora do parque, Chrome e Safari exibiram a solicitação de geolocalização. Depois da autorização temporária, o preview ficou sem posição utilizável, com os estados de sinal indisponível ou leitura desatualizada. Nenhum dado pessoal entrou nos artefatos. O cenário automatizado com uma leitura sintética fora da área confirmou que o produto mostra o aviso e mantém a orientação restrita aos pontos cadastrados.

A transformação, a posição, a rota e o ETA correm em memória por montagem. O código de navegação não usa API remota, geocodificação, armazenamento, URL ou telemetria. O fluxo comercial não grava a câmera quando ela foi posicionada pela navegação. O diagnóstico legado omite suas coordenadas derivadas. Fechar o modo, desmontar e sair da página descartam o estado. Em segundo plano o observador é interrompido e a retomada exige leitura mais nova que o retorno.

```sh
npx vitest run
npx tsc --noEmit
npx vite build
npx vite build --config scripts/park-walking-preview/vite.config.ts
python3 -m http.server 4207 --bind 127.0.0.1 --directory artifacts.local/park-walking-preview
node scripts/park-walking-preview/check.mjs
PARK_WALKING_CHECK=catalog PARK_WALKING_ARTIFACTS=artifacts.local/navegar-parque-catalogo node scripts/park-walking-preview/check.mjs
PARK_WALKING_CHECK=map-hits PARK_WALKING_ARTIFACTS=artifacts.local/navegar-parque-cliques-3d node scripts/park-walking-preview/check.mjs
```

O roteiro de navegador usa Playwright disponível no ambiente ou indicado por `PLAYWRIGHT_MODULE`. O relatório guarda totais e métricas, sem coordenadas dos cenários. As imagens mostram posições sintéticas. Para recompilar a rede ampliada com a prova física do checkout:

```sh
npx esbuild scripts/park-walking-preview/compile-network.ts --bundle --platform=node --format=cjs --loader:.png=empty --outfile=/tmp/indumoveis-compile-network.cjs
node /tmp/indumoveis-compile-network.cjs scripts/park-walking-preview/extended-network.json
```

| Dimensão                               | Evidência atual                                                                                                                                                                                                                                                                                                                                                                                         | Validação pendente                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Alinhamento 3D**                     | Conversão e retorno verificados. Resíduos dos controles acima. Passagem A3‑1 e rede candidata verificadas contra as superfícies da cena.                                                                                                                                                                                                                                                                | Medição independente em solo dos portões, eixos, travessias e frentes. Revisar distâncias reais, degraus, rampas, interdições e permissão de acesso da edição.    |
| **Precisão real do celular**           | Ensaios simulados de aproximação, rótula, posição antiga, parada, salto, corredores concorrentes, negação, falta de sinal, desvio, chegada e dois contextos isolados.                                                                                                                                                                                                                                   | **Não validada em campo.** Medir erro horizontal, tempo de primeira posição utilizável e incidência de encaixe no corredor errado no iPhone e no Android.         |
| **Erro do ETA**                        | Distância métrica e arredondamento conferidos em trajetos modelados.                                                                                                                                                                                                                                                                                                                                    | **Não validado em campo.** Comparar a duração prevista no início e em marcos intermediários com a caminhada cronometrada. Separar ambiente, ritmo e interrupções. |
| **Usabilidade, privacidade e fluidez** | Evidências no [relatório do navegador](validation/navegar-parque/browser.json) e nas capturas [aérea](validation/navegar-parque/01-aerea.jpg), [intermediária](validation/navegar-parque/02-intermediaria.jpg), [próxima](validation/navegar-parque/03-proxima.jpg), [planta móvel](validation/navegar-parque/08-celular-planta.jpg) e [opções de rota](validation/navegar-parque/09-alternativas.jpg). | Repetir em aparelhos físicos com toque e verificar leitura em ambiente externo e sob movimento reduzido.                                                          |

## Roteiro de campo

1. Com a organização, identificar as passagens públicas, verificar funcionamento nos dois sentidos e cadastrar bloqueios temporários. Levantar as portas e travessias com fotos e uma referência independente (GNSS de levantamento ou marcos conferidos pela organização). Medir a rota de fato realizada, com roda de medição ou trilha de referência autorizada. Separar a faixa descoberta, a cobertura do pórtico e os trechos de sinal fraco.
2. Abrir o preview por HTTPS autorizado em iPhone/Safari e Android/Chrome. Fazer no mínimo três passagens iniciais por sentido e por aparelho, Portão 3 ↔ P1, incluindo uma para o P12. Começar com o app sem estado anterior. Anotar tempo entre autorização e primeiro indicador utilizável, aparelho/navegador, contexto aberto/coberto/sinal fraco e formato de chegada. Repetir um teste simultâneo em pontos diferentes. Incluir uma tentativa fora do limite e uma passagem pela rótula.
3. Em cada ponto independente, medir o erro horizontal do marcador e registrar à parte o raio que o aparelho informou. Por caminhada, registrar a distância de referência e a acumulada no app, ETA em minutos e tempo real nos mesmos marcos, quantidade de leituras aceitas, encaixes incorretos e chegadas indevidas. Calcular erro de distância em metros, erro de ETA em minutos e percentual em relação ao tempo real. Reportar mediana e p95 por estrato com amostra suficiente (meta de pelo menos 30 observações independentes), e contagens e intervalos observados para amostras menores.
4. Publicar só os resultados agregados, sem horários individuais associados a posições, dados pessoais ou séries de coordenadas. Registrar a aprovação dos acessos e a revisão da malha separadamente. Caminhadas simuladas ficam fora das métricas de campo.

Dados externos © OpenStreetMap contributors, ODbL 1.0. [Atribuição e licença](https://www.openstreetmap.org/copyright).
