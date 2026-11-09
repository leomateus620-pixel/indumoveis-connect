# Pavilhão 13 — implementação do Salão de Imóveis

O **Pavilhão 13 · Salão de Imóveis** oferece **Acesso Interno** na ficha do mapa
comercial. A ação abre `/mapa/pavilhoes/13/interior`, uma rota autenticada com
planta SVG 2D, 80 lotes individuais e consulta em painel à esquerda. A Mostra
ARQ & Design continua no Pavilhão 1, com sua própria identidade, geometria e URL.

## Fluxo entregue

1. Selecionar o Pavilhão 13 no parque e acionar **Acesso Interno**.
2. A aplicação salva câmera, orientação, filtros e seleção externa por edição e
   pavilhão. Atualiza a entrada atual do histórico do parque para esse pavilhão
   antes de abrir o interior; assim, voltar pelo navegador também restaura o
   contexto correto depois de alternar entre P1 e P13.
3. A rota dedicada desmonta o workspace do parque e seu renderer. O interior
   ocupa a janela sem a navegação geral lateral do portal e sem depender da API
   de tela cheia do navegador.
4. Selecionar um lote no desenho ou buscar seu número. A busca normaliza `1`
   para `01` e admite `01` a `80`, sem montar uma grade de 80 botões. O painel
   apresenta, por exemplo, **Lote 63**, **Pavilhão 13** e **Salão de Imóveis**.
5. A seleção usa `?lote=63`, com validação de formato e conferência contra a
   planta da edição ativa. Recarregar, abrir diretamente e usar voltar/avançar
   conserva o endereço identificável do lote. Pan e zoom não escrevem histórico.
6. **Voltar ao parque** retorna ao Pavilhão 13 com o estado externo salvo. Sem
   contexto anterior, oferece enquadramento válido desse pavilhão. Um retorno
   salvo em 2D mantém o renderer 3D desligado até solicitação do usuário.
7. A passagem lateral esquerda leva ao **Pavilhão 3** e a direita ao
   **Pavilhão 8**. Hoje, cada marcador abre o mapa externo com o destino
   selecionado e enquadrado. O registro tipado de rotas permite que o mesmo
   marcador abra o interior correspondente quando ele for cadastrado.

A planta recebe somente translação e escala uniforme. Arraste, roda centrada no
cursor, pinça e controles de aproximar, afastar e ajustar à tela operam o conjunto
inteiro. Há limites de navegação, diferenciação entre clique e arraste, foco
visível e alternativas por teclado. Setas deslocam; `+`/`-` controlam o zoom;
`0`/`Home` reenquadram; `Enter`/espaço selecionam; `Escape` limpa a seleção.

No desktop, a coluna esquerda é reservada desde o primeiro enquadramento. No
celular, o painel permanece à esquerda e pode ser recolhido. A abertura revela
minimamente uma seleção encoberta, preservando a escala; **Ver na planta** devolve
o foco ao desenho. Fechar a seleção conserva a posição atual. O cabeçalho fixo
alinha à esquerda uma única assinatura horizontal **Salão de / IMÓVEIS**, com
identificação discreta do Pavilhão 13. O título permanece disponível para
tecnologias assistivas. O botão compacto com seta mantém o nome acessível
**Voltar ao parque**. Ao passar o mouse ou focar pelo teclado, a dica também
informa **Visualização externa**.

## Planta e identidade comercial

O PDF vetorial original foi extraído e renderizado para conferência. A fonte
preservada, o hash, o sistema de coordenadas, as sequências e os agrupamentos
estão documentados em [pavilion13-geometry.md](pavilion13-geometry.md).

São exatamente **80 ambientes comerciais**, com códigos `01`–`80`, uma geometria
fechada por lote e nenhuma extensão externa. Todos têm a mesma dimensão visual,
**112 × 30 unidades locais esquemáticas**, sem conversão para metros:

| Faixa                      | Ordem de cima para baixo | Quantidade |
| -------------------------- | ------------------------ | ---------: |
| Direita superior/inferior  | 29–15 / 14–01            |         29 |
| Centro contínuo            | 51–30                    |         22 |
| Esquerda superior/inferior | 52–66 / 67–80            |         29 |

Os seis blocos agregados da fonte foram separados em lotes individuais:
01–04, 10–14, 15–18, 30–35, 63–66 e 67–70. As passagens entre 14/15 e 66/67
permanecem abertas; o bloco central continua sem interrupção. Entrada fica embaixo
e fundos em cima. Circulação e acessos são elementos arquitetônicos, sem novos
registros vendáveis.

As ligações com os pavilhões vizinhos seguem os dois vãos da planta. Os
marcadores verticais (92 × 104 unidades do desenho) se ancoram aos elementos `p13:left-transverse-circulation` e
`p13:right-transverse-circulation`. A resolução do destino pertence à navegação
da interface. A revisão 2 conserva seus 80 polígonos e os mesmos vínculos de
estoque.

Todos os campos de área individual são `null`. A interface do Pavilhão 13 omite
metragem e avisos documentais. O pedido informa 850,5 m² comercializáveis e o PDF
rotula o mesmo valor como área total; essa distinção permanece na documentação
[técnica de geometria](pavilion13-geometry.md), sem rateio por lote ou inclusão
no payload de apresentação. Empresas e indicações comerciais da fonte não
participam do cadastro nem dos estados exibidos.

A assinatura **Salão de / IMÓVEIS** tem versões principal, compacta e
monocromática em SVG vetorial, com PNGs transparentes, fonte licenciada,
manifesto e gerador. O acabamento usa fundo quente, grafite, ameixa e bronze
pontual. Os acentos, o conteúdo e a proveniência dos arquivos estão em
[salao-imoveis-identity.md](../salao-imoveis-identity.md).

## Reuso e isolamento

`PavilionInteriorPage` concentra a leitura, a edição ativa, as permissões e os
estados reais de carregamento. `PavilionInterior` compartilha navegação e painel;
a configuração de apresentação distingue P1 e P13, inclusive marca, nomes,
campos de área, quantidade e forma de localizar ambientes. A geometria do P13
importa apenas o tipo compartilhado e conserva seu próprio snapshot.

As rotas mantêm seus contratos: P1 usa `?espaco=09`; P13 usa `?lote=63`.
Contextos de retorno têm chaves separadas por pavilhão, validação de edição e
câmera. A troca de pavilhão ou revisão remonta o interior com sua identidade
correta. O parque mantém os lotes externos e os controles já existentes.

As consultas permanecem em `src/lib/api.ts`. As chaves incluem edição,
pavilhão, número e UUID da revisão e as permissões pertinentes. O retorno é
validado contra esses identificadores. A geometria exige leitura de Mapa;
situação comercial exige também Comercial, e expositor depende de registro real
e permissão de Empresas. A view `space_status_v` continua sendo a origem dos
estados comerciais. A interface não persiste situação paralela nem apresenta
compradores, contratos ou notas.

## Banco efetivamente aplicado

O conector Lovable confirmou o projeto **Indumóveis Connect**, correspondente
à versão atualizada do repositório, e verificou o banco existente com
`get_database_status`. Após inspeção SQL de tabelas, restrições, políticas e
estoque, aplicou diretamente por `query_database`:

| Migração                                             | Finalidade                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `20261108230000_pavilion_identity_scope.sql`         | Faixas de código e guardas por pavilhão; consulta comercial explicitamente escopada |
| `20261108231000_pavilion_13_salao_imoveis_seed.sql`  | Revisão inicial imutável e reconciliação das 80 identidades                         |
| `20261108232000_pavilion_13_lot_names_revision2.sql` | Revisão corrente com nomes canônicos `Lote 01`–`Lote 80`                            |

As execuções foram registradas na mesma transação no histórico de migrações.
A revisão 1 foi preservada e a revisão 2 é a única corrente; ambas reutilizam
as mesmas 80 identidades e vínculos de estoque. Não foi criado outro banco, não
houve solicitação pelo chat do Lovable e o ambiente FENASOJA não foi alterado.

A conferência real confirmou 80 lotes, 80 polígonos válidos correntes, 80 áreas
individuais nulas e nenhuma extensão externa. O RPC autenticado corresponde ao
JSON revisado. Doze verificações SQL de permissão, identidade e imutabilidade
passaram; a reexecução transacional não duplicou registros. Uma fixture com área
e campos comerciais já preenchidos confirmou sua preservação. As fixtures e
alterações temporárias de permissão foram desfeitas.

O hash do payload P1 e suas contagens de 14 vínculos comerciais, 19 ambientes e
24 partes permaneceram idênticos. A documentação completa, IDs, hashes e os
resultados verificáveis estão em [database.md](../pavilion-13/database.md) e
[database-application.json](../validation/pavilion-13/database-application.json).

## Verificações e revisão final

Os testes geométricos verificam contagem, códigos, dimensões visuais uniformes,
sequências, grupos separados, passagens, continuidade central, polígonos
fechados, ausência de sobreposição, áreas nulas e remoção de informações de
ocupantes da fonte. Uma verificação independente com Shapely validou os 80 anéis.

Os testes de interação cobrem seleção, pesquisa, teclado, painel e contexto de
retorno. A regressão de histórico entre P1/P13 verifica a substituição da entrada
atual do parque antes do avanço para o interior, preservando os filtros sem
criar uma entrada adicional. Os testes das ligações laterais verificam a posição
dos marcadores, seus destinos e a seleção inicial de P3 ou P8 mesmo com um
contexto anterior de P13 salvo. Os testes da API cobrem parâmetros e isolamento de
edição, pavilhão, revisão e permissão. Passaram o build de produção, a checagem
TypeScript e o ESLint dos arquivos alterados. A suíte completa passou com
**579 testes em 86 arquivos**.

No navegador, foram exercitados arraste, zoom, seleção e fechamento do painel.
O fechamento conservou a posição e a escala da planta. A revisão incluiu a
recarga de links diretos do P13 e do espaço 12 do P1, a entrada pelo botão do
parque e o retorno à ficha do P13 pelo controle dedicado e pelo histórico. As
passagens laterais abriram as fichas externas de P3 e P8, respectivamente.

As capturas registram a planta, o cabeçalho e o painel em cinco tamanhos de
janela. O acabamento dos acessos usa placas verticais estreitas para P3 e P8,+ancoradas aos vãos laterais. As duas comparações foram abertas durante a revisão.
[Comparação de geometria](../validation/pavilion-13/geometry-comparison.jpg) e
[comparação dos acessos](../validation/pavilion-13/connections-comparison.jpg).

| Estado                    | Janela CSS | Captura                                                                                                                                                                                                                                                                                                             |
| ------------------------- | ---------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planta inteira desktop    | 1440 × 900 | [Desktop](../validation/pavilion-13/desktop-full.jpg)                                                                                                                                                                                                                                                               |
| Planta inteira notebook   | 1366 × 768 | [Notebook](../validation/pavilion-13/notebook-full.jpg)                                                                                                                                                                                                                                                             |
| Planta inteira tablet     | 834 × 1112 | [Tablet](../validation/pavilion-13/tablet-full.jpg)                                                                                                                                                                                                                                                                 |
| Planta inteira celular    |  390 × 844 | [Celular](../validation/pavilion-13/mobile-full.jpg)                                                                                                                                                                                                                                                                |
| Janela compacta           |  378 × 465 | [Compacta](../validation/pavilion-13/mobile-compact.jpg)                                                                                                                                                                                                                                                            |
| Painel esquerdo mobile    |  390 × 844 | [Lote 63](../validation/pavilion-13/mobile-lot-63.jpg) e [Lote 80](../validation/pavilion-13/mobile-lot-80.jpg)                                                                                                                                                                                                     |
| Lotes em desktop          | 1440 × 900 | [01](../validation/pavilion-13/lot-01.jpg), [18](../validation/pavilion-13/lot-18.jpg), [35](../validation/pavilion-13/lot-35.jpg), [63](../validation/pavilion-13/lot-63.jpg), [66](../validation/pavilion-13/lot-66.jpg), [70](../validation/pavilion-13/lot-70.jpg) e [80](../validation/pavilion-13/lot-80.jpg) |
| Cabeçalho, foco e acessos | 1440 × 900 | [Cabeçalho](../validation/pavilion-13/header-final.jpg), [dica ao focar](../validation/pavilion-13/header-return-focus.jpg) e [detalhe dos acessos](../validation/pavilion-13/connections-detail.jpg)                                                                                                               |
| Parque e regressão P1     | 1440 × 900 | [Entrada](../validation/pavilion-13/park-entry.jpg), [retorno](../validation/pavilion-13/park-return.jpg) e [espaço 12](../validation/pavilion-13/p1-regression.jpg)                                                                                                                                                |

## Pendências e limites documentais

As metragens individuais não foram fornecidas; permanecem nulas. Dimensões
esquemáticas não equivalem a dimensões físicas. A diferença de descrição do
valor agregado entre pedido e PDF exige confirmação antes de qualquer cálculo
comercial. Essas informações ficam neste relatório, sem ressalvas na interface.

## Recursos indisponíveis e verificações não realizadas

O quadro `creative_production_board` não está exposto nesta sessão. As diretrizes
Creative Production foram aplicadas aos arquivos finais e ao manifesto; o quadro
interativo não foi criado. O PDF foi preservado no repositório e não foi enviado
ao Storage.

A revisão no navegador usou uma sessão de teste com respostas locais
controladas. O banco real foi verificado separadamente por SQL para leitura
autenticada, autorização e integridade. A ausência de negociação e expositor
real no P13 impediu a conferência de um nome comercial em produção. Além do
teste automatizado com dois ponteiros, no Chrome com toque emulado (390 × 844)
a pinça alterou a escala de 0,497 a 0,956 sem seleção acidental e um toque
selecionou o lote 63. Não houve ensaio em aparelho físico.
