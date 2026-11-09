# Pavilhão 13 — persistência e aplicação

O Salão de Imóveis reutiliza o domínio de interiores revisionados entregue para o Pavilhão 1. A implantação adicionou 80 identidades comerciais próprias do Pavilhão 13, com códigos visuais `01` a `80` e códigos de estoque `P13-01` a `P13-80`.

## Identificação e inspeção

O conector Lovable confirmou o projeto Indumóveis Connect `188cb605-7a42-42a0-9e75-28f5097e9433`, workspace `cabebf41df8c5aca2b08`, com commit publicado `bc5402109b4bab3527f3ce84c170ae4065dc16fd`, correspondente ao destino atualizado. `get_database_status` confirmou o Supabase existente habilitado. Não foi criado outro banco e não houve mensagens ao chat do Lovable.

Antes do DDL, foram consultados o schema real, restrições, políticas, funções RPC, edições, plantas e estoque. Não havia planta nem espaço identificado como Pavilhão 13. A edição ativa era Indumóveis 2027, ID `49af7d79-9bef-4981-9ecd-ddf64928036e`; as cargas resolvem `editions.is_active`, sem fixar esse ID.

O Pavilhão 1 tinha uma revisão com hash de payload `90c8e9d2cd6b2b8dd4ae708d97cc49c62eb59dac5378061f7219e262671777c3`, 19 ambientes, 14 vínculos comerciais e 24 partes geométricas. Esses valores permaneceram idênticos após a aplicação.

## Modelo e dados

Não foram criadas tabelas paralelas de estoque ou situação comercial. O Pavilhão 13 usa `floor_plans`, `pavilion_plan_revisions`, `pavilion_environments`, `pavilion_environment_revisions`, `pavilion_environment_parts` e `pavilion_architecture_elements`.

A restrição de código comercial anteriormente específica de `01`–`14` passou a distinguir o pavilhão: o Pavilhão 1 conserva exatamente essa faixa e o Pavilhão 13 admite `01`–`80`. Foram acrescentadas guardas para impedir associação entre uma planta, revisão, ambiente ou estoque de pavilhões diferentes. As chaves estrangeiras compostas de edição permanecem em vigor.

Os 80 novos registros de `spaces.area_m2` e as áreas declaradas da revisão corrente são `null`. A área total documental de **850,5 m²** é registrada apenas nesta documentação técnica. Não foi distribuída entre os lotes, inserida no payload da planta ou utilizada para converter unidades esquemáticas em medidas físicas.

Cada módulo tem geometria uniforme em unidades locais de desenho, sem afirmar que a área do polígono represente metros quadrados. Nenhum nome de empresa, rótulo de reservado, preço ou dado comercial da referência foi importado. Os estados exibidos continuam derivados exclusivamente de `space_status_v`.

O reconciliador exige edição e identidade do Pavilhão 13, além do código; não usa um `01` isolado. O namespace `P13-`, o setor e a planta existente participam da identificação. Ambiguidades abortam a transação. Não há `UPDATE` em `spaces`: ID, área já cadastrada, preço, bloqueio, notas, vínculos de planta, negociações e contratos preexistentes são preservados. Um teste transacional com área preexistente de 23,45 m² e outros campos preenchidos confirmou essa preservação; os 79 registros criados nessa simulação mantiveram área nula. A simulação foi integralmente desfeita.

A fonte documental está preservada em `docs/references/pavilion-13/salao-imoveis-rev07.pdf`, SHA-256 `5d33bd55d353021ba18f6e3cc6114544723f8ed292b149e0aab628625187ef67`. `floor_plans.storage_path` permanece nulo e `source_uri` aponta explicitamente para esse arquivo no repositório, sem alegar upload ao Storage.

## Migrações executadas pelo Lovable

Cada arquivo foi preparado antes da execução por `query_database`, com seu conteúdo completo registrado na mesma transação em `supabase_migrations.schema_migrations`. Os hashes dos arquivos foram comparados aos hashes dos textos efetivamente registrados no banco.

| Versão | Finalidade | SHA-256 do arquivo e do registro no banco |
|---|---|---|
| 20261108230000 | Faixas de código por pavilhão, guardas de identidade e consulta comercial com pavilhão explícito | 82a6a524ec97aae5f527d39d435fe22c0493861a5f61c06a3d42be73448c73d8 |
| 20261108231000 | Primeira revisão imutável do Salão de Imóveis | 394ea31d1c2b959e305ac287b341466d0ac094d0f5ae81b964f4e61297a76733 |
| 20261108232000 | Revisão corrente com nomes canônicos `Lote 01` a `Lote 80` | b2e69356d33867dd1e3da9505381d20c4ad2a08755fa4a7ee9c824c927aade23 |

A revisão 1 já havia sido registrada quando o ajuste de nomenclatura foi definido. Para respeitar a imutabilidade do domínio, foi mantida como histórico e substituída pela revisão 2 corrente. A geometria, os 80 ambientes estáveis e os 80 vínculos de estoque foram reutilizados; não houve duplicação de lotes. O payload corrente corresponde exatamente ao JSON local revisado, incluindo os nomes `Lote NN`.

O gerador `scripts/build-pavilion-13-seed.py` gera o snapshot SQL da revisão corrente. Arquivos SQL já aplicados não devem ser reescritos. Uma mesma revisão com hash diferente é rejeitada; alterações documentais futuras devem receber outro número.

## API, cache e autorização

`usePavilionInteriorPlan(enabled = true, pavilionNumber = 1)` mantém a compatibilidade com o Pavilhão 1 e aceita `13` para o novo interior. As consultas de revisão corrente e de geometria incluem edição e pavilhão; a segunda inclui número e UUID da revisão. O retorno também é validado contra edição, pavilhão e revisão solicitados.

`usePavilionInteriorCommercial(planId, revision, enabled = true, pavilionNumber = 1)` inclui pavilhão, edição, revisão e permissões na chave de cache. O RPC comercial passou a ter um quarto argumento opcional, com padrão `1`, mantendo válidos os clientes anteriores de três argumentos. Uma planta solicitada com pavilhão incompatível retorna objeto vazio, sem cruzar informações comerciais.

As políticas existentes de leitura `can_read('mapa')` e a revogação de escrita direta autenticada permanecem. O RPC comercial exige Mapa e Comercial; nomes reais de expositores só podem ser incluídos quando há dados reais e permissão de Empresas. Nenhuma situação é persistida no frontend. As invalidações existentes de `useDbMutation` alcançam as novas consultas sob a chave `db`.

## Verificações realizadas

- 80 identidades comerciais, códigos `01`–`80`, todos os registros novos com área nula; 80 polígonos válidos na revisão corrente; zero extensões externas.
- Pavilhão 1 com o mesmo hash de payload, contagens e vínculos comerciais anteriores.
- Leitura do RPC sob papel autenticado comparada profundamente com `pavilion13.generated.json`: correspondência exata, descontados os metadados adicionais do banco e opcionais nulos.
- Doze verificações em `scripts/verify-pavilion-13.sql`: leitura de mapa sem dados comerciais; bloqueio do RPC comercial para mapa apenas; escrita direta negada; edição inativa não exposta; 80 estados reais derivados da view; incompatibilidade de pavilhão sem dados; cliente antigo de três argumentos do P1 preservado; usuário sem permissão negado; vínculo entre edições rejeitado; vínculo entre pavilhões rejeitado; revisão imutável; P1 intacto.
- Reexecução das três novas migrações em transação com `ROLLBACK`: continuaram 80 espaços, duas revisões históricas e apenas a revisão 2 corrente.
- Reconciliação em edição temporária confirmou preservação de um registro já existente, inclusive sua área, e ausência de áreas inferidas nos demais lotes. Todas as fixtures e alterações de permissão foram desfeitas; a edição ativa original permaneceu a mesma.
- Cinco testes de fronteira da API passaram em `src/lib/pavilion-interior-api.test.ts`, cobrindo isolamento de cache, parâmetros de pavilhão, validação de identidade e restrição de consulta comercial. TypeScript sem erros.

Comprovação estruturada: `docs/validation/pavilion-13/database-application.json`.

## Limitações documentais

As dimensões dos módulos são esquemáticas. As metragens individuais não foram documentalmente fornecidas e permanecem nulas, sem estimativa ou rateio. Não havia expositor ou negociação do Pavilhão 13 no banco para validar um nome real em produção. O PDF está no repositório técnico; não foi enviado ao Storage. Essas condições não geram ressalvas permanentes na interface.
