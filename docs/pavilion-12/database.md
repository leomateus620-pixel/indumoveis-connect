# Pavilhão 12 — persistência e aplicação

A revisão 1 do Pavilhão 12 está na edição ativa Indumóveis 2027. Ela vincula 254 ambientes comerciais aos registros de estoque `P12-1` a `P12-254`. Os códigos da planta são `1` a `254`, sem zeros à esquerda.

## Inspeção do projeto

O projeto Indumóveis Connect estava sincronizado com o commit `83eca95a7a4490cf439f794025185a787007ef0d` do repositório. O Lovable confirmou o Supabase existente como habilitado. As consultas iniciais conferiram o schema, as políticas de acesso, as funções e o histórico de migrações.

A edição ativa era Indumóveis 2027. A inspeção encontrou zero candidatos comerciais, plantas ou revisões vinculados ao Pavilhão 12. As identidades, os hashes de revisão e as contagens dos pavilhões 1, 8 e 13 foram conferidos antes e depois da aplicação.

## Modelo e reconciliação

A migração amplia a restrição de códigos de `pavilion_environments` com a faixa canônica de P12. A planta usa as tabelas existentes de revisões, ambientes, partes geométricas, arquitetura e estoque. `total_area_m2` contém **1.650 m²** na revisão. Cada `declared_area_m2` do desenho e cada `area_m2` do novo estoque permanecem nulos. As coordenadas vetoriais são pontos do PDF sem conversão para medidas físicas.

O reconciliador seleciona `editions.is_active` e compara código e identidade do pavilhão pelo prefixo, setor ou planta. Candidatos ambíguos e referências a outro pavilhão abortam a carga. Um lote existente mantém seu ID e seus campos de estoque, inclusive área, bloqueio, preço, notas e associações comerciais. A verificação com rollback reutilizou um registro legado `P12-001` com área cadastrada, negociação e contrato. O código isolado `1` de outro pavilhão permaneceu desvinculado. Os 253 lotes criados nessa simulação ficaram com área nula.

O PDF original permanece local por conter nomes de empresas. O banco guarda o nome e o SHA-256 do documento em `source_document` e `source_sha256`. `floor_plans.storage_path` e `source_uri` ficam nulos. A geometria publicada contém os lotes, as fileiras, os contornos e os acessos, com os dados comerciais consultados separadamente.

## Migrações aplicadas

As duas migrações foram executadas pelo `query_database` do Lovable em uma transação com a inserção dos textos integrais em `supabase_migrations.schema_migrations`. Os hashes registrados correspondem aos arquivos do repositório.

| Versão | Migração | SHA-256 |
|---|---|---|
| `20261109002700` | `pavilion_12_code_scope` | `ef339a381aeb6d9da8cba6069758ff953f73034a6d0267254b241b315152c0b4` |
| `20261109002800` | `pavilion_12_moveis_seriados_seed` | `3e9c8fbb13f64cc55ffc523ded56af029b1f977bfdbd7c636505d18fb93cadce` |

`python3 scripts/build-pavilion-12-seed.py --check` compara a migração gravada com a geometria versionada. A opção `--source-pdf` verifica o hash de uma cópia local do documento original. Alterações futuras de geometria exigem outra revisão.

## Verificação

- A consulta autenticada de geometria retornou os mesmos 254 ambientes e elementos arquitetônicos do JSON revisado. A comparação desconsiderou apenas os campos adicionais da API e as chaves opcionais nulas.
- O banco retornou 254 polígonos interiores válidos, seis elementos arquitetônicos, 254 vínculos de estoque e 254 áreas individuais nulas.
- Os hashes, revisões e vínculos dos pavilhões 1, 8 e 13 correspondem ao estado anterior à aplicação.
- As 11 verificações em `scripts/verify-pavilion-12.sql` passaram antes e depois da aplicação. Elas cobrem RLS, edição ativa, leitura comercial por `space_status_v`, isolamento de pavilhão e edição, rejeição de códigos fora da faixa e imutabilidade da revisão.
- A reexecução das duas migrações em transação com rollback manteve uma revisão corrente e os mesmos 254 IDs de estoque. Os registros e papéis temporários usados nas provas foram removidos pelo rollback.

A planta recebeu o ID `a5e28498-9cd2-4a19-ae7c-e2b283d0895d` e a revisão recebeu o ID `a434649d-a64b-4940-9d73-b7153e95179b`. O comprovante estruturado está em `docs/validation/pavilion-12/database-application.json`.
