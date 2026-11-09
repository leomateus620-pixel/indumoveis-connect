# Pavilhão 8 — persistência e aplicação

O conector Lovable confirmou o projeto Indumóveis Connect `188cb605-7a42-42a0-9e75-28f5097e9433`, associado ao repositório `leomateus620-pixel/indumoveis-connect`. O editor indicava o commit `bc5402109b4bab3527f3ce84c170ae4065dc16fd` e `get_database_status` confirmou o Supabase habilitado. As alterações foram executadas por `query_database`.

## Inspeção e modelo

A edição ativa era Indumóveis 2027, ID `49af7d79-9bef-4981-9ecd-ddf64928036e`. A inspeção por edição, planta, setor e código não encontrou planta nem registros comerciais do Pavilhão 8. Também não encontrou um registro 02 candidato em nenhuma das duas edições. O PDF identifica sete lotes, com os códigos `01`, `03`, `04`, `05`, `06`, `07` e `08`. O vínculo geométrico admite apenas esses códigos para o Pavilhão 8.

O total documental de **937,32 m²** pertence à revisão da planta e é armazenado em `pavilion_plan_revisions.total_area_m2`. O RPC de leitura do mapa devolve `totalAreaM2` somente quando a revisão informa um valor. O total abrange a planta com a circulação. O SQL e a geometria conservam áreas individuais nulas, inclusive nos sete novos registros de estoque. As unidades vetoriais seguem o PDF e não são usadas para calcular metragens.

O estoque usa as tabelas existentes e recebe os códigos `P8-01`, `P8-03`, `P8-04`, `P8-05`, `P8-06`, `P8-07` e `P8-08`. A carga reconcilia por edição e identidade explícita de pavilhão antes de criar um registro. Uma ambiguidade ou um vínculo a outro pavilhão aborta a transação. Registros reaproveitados conservam sua identidade, área, preço, bloqueio, planta, notas e vínculos comerciais. O seed não percorre o código 02.

## Migrações aplicadas

As duas migrações foram aplicadas juntas, após um ensaio com `ROLLBACK`. A transação gravou os arquivos SQL completos em `supabase_migrations.schema_migrations`. Os hashes do histórico correspondem aos arquivos do repositório.

| Versão | Alteração | SHA-256 |
| --- | --- | --- |
| `20261109002500` | Total opcional na revisão e escopo dos sete códigos | `128a97d9dab908176d1825df7ccc907bb78bacb1b021ee81a999e4c55ba981bc` |
| `20261109002600` | Planta revisada, sete lotes, vetores e vínculos de estoque | `729e62ee2915dfdecf1a7ec098ba65ba3c09050287b2ea9202f0539ca55ab242` |

A revisão 1 está corrente (`83cede9f-0436-47fe-bd4f-994f928b41eb`), vinculada à planta `36773ab4-3423-4f91-a8c5-5aed8f61f8a9`. O total é 937,32 m². O banco retornou sete identidades comerciais, sete polígonos válidos e seis elementos arquitetônicos. O payload autenticado corresponde ao JSON da planta após descontar metadados gerados pelo banco e propriedades opcionais nulas.

O gerador `python3 scripts/build-pavilion-8-seed.py --check` compara o arquivo de migração com o snapshot vetorial e confere o hash do [PDF arquivado](../references/pavilion-8/fornecedores-construcao-civil-rev02.pdf). Uma atualização do desenho requer uma nova revisão. O arquivo PDF está preservado no repositório e referenciado em `floor_plans.source_uri`.

## Verificações

- As 11 verificações em `scripts/verify-pavilion-8.sql` passaram no banco real. A geometria exige Mapa, o RPC comercial exige Comercial, a edição inativa fica fora da consulta e a escrita direta autenticada é negada. As guardas rejeitaram um ambiente de outro pavilhão, o código 02 e a alteração do total publicado.
- A consulta comercial devolveu sete situações provenientes de `space_status_v`. No momento da verificação, os sete lotes estavam disponíveis e não tinham negociação ativa. Nenhum nome de empresa do PDF foi importado. A permissão de Empresas continua condicionando a exibição de um eventual expositor vinculado.
- A reexecução dos arquivos SQL em uma transação revertida manteve sete registros de estoque, sete vínculos, uma revisão corrente com o mesmo ID e duas migrações registradas.
- Um ensaio com dados temporários comprovou que o seed reaproveita um lote 03 com área e campos existentes, conserva um 02 legado fora do desenho e distingue um 01 de outro setor. Os três registros do ensaio permaneceram idênticos dentro da transação e foram desfeitos com `ROLLBACK`.
- Os hashes dos payloads autenticados correntes dos Pavilhões 1 e 13 foram idênticos antes e depois. O histórico e as contagens de ambientes e vínculos desses pavilhões também coincidiram.

A comprovação inclui os hashes, as contagens e os resultados das consultas. [Evidência estruturada](../validation/pavilion-8/database-application.json)
