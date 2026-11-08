# Pavilhão 1 — implementação do acesso interno

O Pavilhão 1 passa a oferecer **Acesso Interno** na ficha do mapa comercial. A ação abre `/mapa/pavilhoes/1/interior`, uma tela autenticada exclusiva para a Mostra ARQ & Design, com planta vetorial 2D, painel contextual à esquerda e assinatura visual fixa. O Pavilhão 14 e os lotes externos conservam suas identidades e fluxos.

## Fluxo e comportamento

1. No parque, selecionar **Pavilhão 1 · Mostra Arq & Design** e acionar **Acesso Interno**.
2. A rota dedicada desmonta o workspace externo e seu renderer. A planta inteira aparece enquadrada na área disponível, sem a navegação lateral geral do portal.
3. Selecionar um ambiente pelo desenho ou pela lista numerada. A mesma seleção identifica o ambiente em `?espaco=09`; o código do Salão de Design é `salon`. Parâmetros inválidos são descartados e a seleção é conferida contra os ambientes da revisão da edição ativa.
4. O painel mostra identificação, área declarada quando existe, função pertinente e vínculo externo. Dados comerciais dependem de registros reais e das permissões do usuário. Banheiros e salão não oferecem operações comerciais; o salão não apresenta linha de metragem.
5. **Voltar ao parque** restaura câmera, vista, seleção do Pavilhão 1 e contexto comercial da sessão, vinculados à edição. Um acesso direto sem contexto salvo retorna ao mapa com enquadramento válido de P1. Voltar/avançar do navegador navega pelas seleções; pan e zoom não geram entradas no histórico.

A navegação da planta usa apenas translação e escala uniforme. Há arraste, roda centrada no cursor, pinça por eventos de ponteiro, controles de zoom e ajuste à tela. Setas deslocam; `+`/`-` aproximam/afastam; `0` e `Home` reenquadram; `Enter`/espaço selecionam; `Escape` remove a seleção. O limiar de movimento diferencia clique de arraste. Os limites da câmera mantêm parte da planta alcançável.

No desktop, a coluna esquerda é reservada desde o início. No celular, ela se recolhe sem remover a seleção, e **Ver na planta** devolve o foco ao desenho. A abertura desloca minimamente uma seleção encoberta para a faixa livre, preservando a escala. Números conservam tamanho mínimo legível; detalhes adicionais aparecem na aproximação. A opção de tela cheia do navegador é complementar: a experiência já ocupa toda a janela.

## Planta, identidade e dados

A revisão 1 deriva do PDF vetorial original preservado no repositório. As coordenadas são pontos PDF com origem superior esquerda, independentes dos metros quadrados declarados. O desenho conserva contornos, recortes, portas, acessos e a curva entre recepção e salão; essa curva é uma guia visual. A extração e as verificações geométricas estão em [geometry.md](geometry.md).

Foram persistidos 15 ambientes numerados, com exatamente 14 vínculos a `spaces`, cinco extensões externas e 19 ambientes incluindo circulação e apoio. Interior e extensão selecionam uma única identidade. As áreas são as fornecidas na planta; os polígonos não recalculam a área comercial. Salão e circulações possuem área `null`, e apoio não pertence ao estoque vendável.

A arquitetura reaproveita `floor_plans`, acrescenta revisões publicadas imutáveis, ambientes estáveis, partes geométricas e elementos arquitetônicos. Vínculos compostos impedem cruzamento entre edições. O reconciliador usa edição, pavilhão e identidade comercial; ambiguidades abortam a carga. A situação comercial continua derivada de `space_status_v`.

As consultas tipadas permanecem em `src/lib/api.ts`. A revisão atual é resolvida antes do snapshot; as chaves de cache incluem edição e revisão. RLS exige leitura do mapa; o RPC comercial exige também Comercial, e a identificação do expositor exige Empresas. Escritas diretas nas novas tabelas são revogadas. Erros reais de carregamento oferecem mensagem curta e nova tentativa.

A identidade usa grafite, ameixa e fundo quente, com hierarquia entre número, nome e área. As versões principal, compacta e monocromática são SVGs com contornos tipográficos reais e fundo transparente; acompanham PNGs, fontes licenciadas, manifesto e script de reprodução. A escrita e o acento de “Indumóveis” foram inspecionados. Detalhes em [arq-design-identity.md](../arq-design-identity.md).

## Aplicação efetiva no banco

As migrações `20261108180000_pavilion_interior_domain.sql` e `20261108181000_pavilion_1_mostra_seed.sql` foram aplicadas diretamente por `query_database` do conector Lovable no projeto **Indumóveis Connect**, após `get_database_status` e inspeção SQL do schema e das políticas existentes. Cada execução foi registrada em `supabase_migrations.schema_migrations` na mesma transação. O banco existente foi utilizado; não houve solicitação de implementação pelo chat do Lovable.

A verificação posterior confirmou os vínculos e valores, a igualdade entre o RPC autenticado e o JSON geométrico local, a ausência de alterações na edição histórica e a reexecução sem duplicação. Os ensaios SQL com usuários/permissões temporários foram revertidos. A comprovação, os hashes e os dez resultados de integridade/permissão constam em [database.md](database.md) e [database-application.json](../validation/pavilion-interior/database-application.json).

## Validação e evidências

- Build de produção, TypeScript e lint dos arquivos alterados passaram na rodada de desenvolvimento. A rodada final passou com **494 testes em 79 arquivos**, incluindo as regressões de retorno ao parque e recuperação de erros.
- Testes automatizados cobrem códigos e áreas, 14 ambientes comerciais, cinco extensões, ausência de sobreposição, salão nulo, seleção única de interior/exterior, teclado, clique/arraste, pinça, zoom no cursor, limites, painel mobile, parâmetros da URL e retorno por edição.
- Os 24 anéis foram conferidos quanto a fechamento, validade e interseções; a planta renderizada foi comparada ao PDF. As geometrias persistidas foram comparadas ao payload local.
- A revisão visual usou o navegador com dados de sessão controlados, separados da validação SQL no banco real. Capturas documentam [planta inteira](../validation/pavilion-interior/desktop-full.jpg), [espaço 12 e extensão](../validation/pavilion-interior/desktop-space-12.jpg), [espaço 02](../validation/pavilion-interior/desktop-space-02.jpg), [banheiros](../validation/pavilion-interior/desktop-bathrooms.jpg), [salão](../validation/pavilion-interior/desktop-salon.jpg) e [painel mobile](../validation/pavilion-interior/mobile-space-12.jpg). Os viewports e a revisão visual final são registrados junto das evidências de fechamento.

## Medidas documentais pendentes

A composição interna/externa das metragens de 04, 05, 08, 09 e 12 ainda exige confirmação documental. Os valores declarados foram preservados integralmente, sem somar novamente a extensão nem publicar subtotais derivados. O Salão de Design permanece com área `null` por decisão do cadastro, sem estimativa ou aviso permanente na interface.

## Recursos indisponíveis e verificações não realizadas

- A sessão não disponibilizou `creative_production_board`. Foram aplicadas as instruções Creative Production para identidade, conteúdo exato e exportação determinística; o quadro interativo não foi utilizado.
- O PDF foi preservado como fonte do repositório, com hash e referência explícita. Não foi enviado ao Storage; `floor_plans.storage_path` permanece nulo para essa fonte.
- Não havia expositor ou negociação real no banco para validar visualmente um nome comercial de produção. A origem dos estados e as barreiras de permissão foram verificadas por SQL; a apresentação foi exercitada com dados controlados.
- A pinça foi exercitada com eventos de dois ponteiros nos testes. O navegador in-app não oferece `Input.dispatchTouchEvent`; não houve ensaio de pinça real por esse canal nem em telefone físico, nem auditoria completa de tecnologias assistivas ou de todos os navegadores móveis.
- As capturas da interface com sessão controlada não constituem prova de autenticação real em navegador. A leitura autenticada, as permissões e a integridade foram comprovadas separadamente no banco.
