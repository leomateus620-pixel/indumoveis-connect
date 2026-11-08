# Persistência e aplicação — Pavilhão 1

Implementação aplicada pelo conector Lovable, usando `get_database_status` e `query_database` diretamente. Nenhuma mensagem foi enviada ao chat do Lovable; nenhum banco foi habilitado. O ambiente FENASOJA não foi consultado nem alterado.

## Identificação e inspeção antes da alteração

- Repositório: `leomateus620-pixel/indumoveis-connect`.
- Projeto Lovable: `188cb605-7a42-42a0-9e75-28f5097e9433`, Indumóveis Connect; confirmado contra o endereço existente no README e o único projeto da conta Indumóveis.
- Workspace: `cabebf41df8c5aca2b08`, Indumóveis's Lovable.
- Banco Supabase já habilitado, conforme `get_database_status`.
- Edição ativa consultada no banco: `49af7d79-9bef-4981-9ecd-ddf64928036e`, Indumóveis 2027. A carga usa `editions.is_active`, sem fixar este ID no código ou nas migrações.
- `spaces`, `floor_plans`, `deals` e `contract_spaces` estavam vazias. Colunas, restrições e políticas reais foram inspecionadas por SQL antes do DDL.
- O schema de `floor_plans` tinha apenas arquivo/nome/edição, sem geometria interativa. A view `space_status_v` tem `security_invoker`, deriva o estado das negociações e exige leitura Comercial para confirmar esses estados.

## Modelo

`floor_plans` continua sendo a raiz da planta. Recebe `pavilion_number` e `source_uri`; `storage_path` admite nulo quando a fonte é documental no repositório, em vez de inventar um objeto no Storage.

`pavilion_plan_revisions` registra versão, fonte, SHA-256 do PDF e do payload, coordenadas, limites e revisão corrente. `pavilion_environments` mantém identidades e códigos estáveis por edição e pavilhão. `pavilion_environment_revisions` mantém nome, função, posição de rótulo e metragem declarada decimal por revisão. `pavilion_environment_parts` guarda os polígonos/caminhos internos e externos do mesmo ambiente; `pavilion_architecture_elements` mantém paredes, portas, acessos e guias separados da ocupação comercial.

As chaves estrangeiras compostas impedem cruzamento de edição entre planta, revisão, ambiente, geometria e estoque. Revisões publicadas e suas geometrias são imutáveis; alteração documental exige uma nova revisão. Os polígonos têm validação de coordenadas, fechamento, área não nula e ausência de autointerseção. As unidades nativas do desenho são pontos do PDF: não há fator físico estimado nem cálculo sobrescrevendo as áreas declaradas.

Os 14 espaços comerciais usam códigos de estoque `P1-01` até `P1-14`, mantendo `01` a `14` na planta. O reconciliador consulta edição, identidade do Pavilhão 1 e código antes de inserir. Correspondências ambíguas abortam a transação. Registros existentes, preços, bloqueios, contratos e negociações não são sobrescritos. Banheiros, salão, corredores e vestíbulo de saída não têm `space_id`; as cinco extensões pertencem aos ambientes 04, 05, 08, 09 e 12.

## Migrações aplicadas

Ambas foram preparadas no repositório antes da execução. Cada aplicação incluiu o SQL completo em `supabase_migrations.schema_migrations`, com `version`, `name` e `statements`, na mesma transação.

| Versão | Nome | SHA-256 do arquivo e da instrução registrada |
|---|---|---|
| 20261108180000 | pavilion_interior_domain | f8a6d735203b7ec8f37402012842e77ce5588db936698215bd5397c55ba4c38e |
| 20261108181000 | pavilion_1_mostra_seed | d697719ee738264d2e62b8f99c0940a3a99e5ae04dd389ee7024907d0ff9ccb8 |

O gerador `scripts/build-pavilion-interior-seed.py` reproduz o segundo arquivo a partir da geometria revisada. Não deve ser usado para alterar uma revisão já aplicada: a verificação de hash rejeita reuso de número com conteúdo diferente.

## Leitura e permissões

Os novos objetos expõem somente `SELECT` para `authenticated`, com RLS `can_read('mapa')`. Escritas diretas pelo aplicativo são revogadas. `get_pavilion_interior` usa `security invoker`, verifica mapa e edição ativa, e entrega o snapshot da revisão. Nenhuma informação comercial faz parte desse payload.

`get_pavilion_interior_commercial` exige mapa e Comercial, utiliza exclusivamente `space_status_v` e inclui expositor somente quando houver negociação real e leitura de Empresas. Não retorna preços, compradores, contratos ou notas. As duas consultas estão centralizadas em `src/lib/api.ts`; a chave do payload inclui edição, número da revisão e UUID da revisão. A chave comercial também inclui permissões de consulta, edição e revisão. As invalidações existentes de `useDbMutation` abrangem as consultas sob `db`.

## Evidências verificadas no banco

- 15 ambientes numerados; exatamente 14 vínculos comerciais; 19 ambientes incluindo apoio/circulação; 24 partes, sendo cinco extensões externas; oito elementos arquitetônicos agrupando os traçados originais.
- Metragens conferidas: 111,66; 47,50; 47,50; 74,81; 74,81; 47,50; 47,50; 74,81; 74,81; 47,50; 69,17; 129,43; 69,48; 254,81; 32,33 m², na ordem 01–15.
- Salão com área `null`; zero ambientes de apoio no estoque; zero registros inseridos na edição histórica.
- O RPC autenticado foi comparado profundamente com o JSON local: mesma geometria, metadados de fonte e ordem dos elementos, descontados apenas IDs do banco e opcionais nulos.
- Reexecução das duas migrações dentro de transação com `ROLLBACK`: permaneceu uma revisão, 14 espaços e 24 partes, sem duplicação.
- `scripts/verify-pavilion-interior.sql` passou dez verificações com fixtures desfeitas por `ROLLBACK`: leitura de mapa sem campos comerciais; bloqueio do RPC comercial para perfil com mapa apenas; escrita direta negada; usuário sem permissão negado; 14 estados derivados para Comercial; edição inativa não exposta; vínculo entre edições rejeitado; geometria imutável; autointerseção rejeitada; salão nulo.
- A inspeção posterior confirmou que as fixtures de teste não permaneceram e as permissões de Consulta foram restauradas pelo rollback.

Comprovação estruturada: `docs/validation/pavilion-interior/database-application.json`.

## Limitações e pendências documentais

A composição interna/externa das áreas declaradas não está documentalmente confirmada; o banco guarda apenas a metragem fornecida, sem somar a extensão. O Salão de Design permanece com área nula. O PDF fonte foi preservado em `docs/references/pavilion-1/mostra-arq-design.pdf` e referenciado explicitamente como fonte do repositório; não foi enviado ao Storage. Não havia expositor ou negociação real para verificar a apresentação de um nome comercial em produção; a origem e as barreiras de permissão foram verificadas por SQL.
