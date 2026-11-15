# Inspeção somente leitura — preços fixos P1 ARQ & DESIGN

Nada foi alterado. Todas as leituras foram feitas por SELECT nas ferramentas internas.

## 1. Edição ativa
- id `49af7d79-9bef-4981-9ecd-ddf64928036e`, ano 2027, `America/Sao_Paulo`, ativa.

## 2. Política e regra P1
- Uma única política: versão 1 (publicada em 13/11/2026, sha `a88df5c19baf…`).
- Regra `p1` (Mostra ARQ & Design): pavilhão 1, `regular_cents = NULL`, `corner_cents = NULL`, sem faixa. Por isso os 14 lotes aparecem como `no_tariff`.
- O modelo atual só aceita tarifa por m² (`gross = round(area × tarifa)`). As restrições da tabela de regras exigem exatamente um entre pavilhão ou faixa, e o canto só é permitido com faixa. Não existe campo para preço fechado por lote.

## 3. Ambientes P1 (revisão `4c932cf5-ea41-4624-9185-b223001ee724`, rev. 1, vigente e única)
- 01–14: `commercial`, todos com space `P1-NN`. A área do espaço é igual à área declarada (01 = 111,66; 02/03/06/07/10 = 47,50; 04/05/08/09 = 74,81; 11 = 69,17; 12 = 129,43; 13 = 69,48; 14 = 254,81). `list_price_cents` é NULL, nenhum está bloqueado, e há 0 negociações e 0 contratos.
- 15: `support`, `space_id` NULL, área declarada 32,33. Não existe space `P1-15`.
- Demais: `salon` (hall), `corredor-inferior`, `corredor-superior` e `vestibulo-saida` (circulação).
- O P1 não tem linhas em `commercial_area_assignments` nem em `commercial_area_groups`. A área vem direto de `declared_area_m2`.

## 4. Preço fixo por espaço já existente?
- Não. Fora de `deal_spaces.price_cents`, os únicos campos de preço são `spaces.list_price_cents` (NULL nos 14 lotes) e o mesmo campo exposto em `space_status_v`. Não há nenhuma coluna "fixed" e nenhuma função `*quote*`.

## 5. Base de regressão (`commercial_inventory_v`, valor bruto calculado como round(area×tarifa))
| segmento | situação | lotes | m² | bruto (centavos) |
|---|---|---|---|---|
| external | priced | 44 | 9444 | 17474600 |
| external | corner_pending | 8 | 1768 | — |
| automobile | no_tariff | 16 | 3632 | — |
| p1 | no_tariff | 14 | 1171,29 | — |
| p8 | priced | 6 | 394,70 | 11446300 |
| p8 | area_pending | 1 | — | — |
| p12 | priced | 254 | 848,00 | 22896000 |
| p13 | priced | 78 | 352,00 | 15840000 |
| p13 | area_pending | 2 | — | — |

As regras p3 e p14 existem, mas não há inventário para elas. A ferramenta de leitura não tem permissão para executar `commercial_gross_cents` (é esperado), então o bruto foi calculado com a mesma fórmula.

## 6. As definições no banco correspondem ao repositório?
- As 9 migrações de 20261113 (080000 a 141000) estão registradas no banco.
- `get_commercial_lots`: o texto no banco é idêntico ao de `20261113141000_guided_sales_privacy.sql:658`, que lê de `commercial_lot_facts_v`.
- `commercial_inventory_v`: a definição no banco tem a mesma estrutura de `20261113080000` (atualizada depois em 082500 com o ramo externo): inventário, depois tarifas, depois bruto. Não comparei byte a byte com o arquivo 082500.
- `quote_guided_sale` não existe no banco nem no repositório. O equivalente é `preview_guided_sale` (hash `f940826a…`).

## 7. O que bloqueia mudar só o ambiente 15 de support para commercial
1. A restrição `pavilion_commercial_code_scope` só permite, no P1, `kind='commercial'` com códigos `01`–`14`. O código `15` é rejeitado.
2. A restrição `pavilion_environments_check` exige `space_id` preenchido quando o kind é `commercial`, mas não existe space `P1-15`. Ele precisa ser criado antes: código único por edição, `floor_plan_id` do P1, área 32,33.
3. O gatilho `pavilion_identity_scope` exige que o space pertença à planta do pavilhão 1.
4. O gatilho `pavilion_revision_immutable` impede editar a revisão do ambiente. A mudança fica só em `pavilion_environments.kind/space_id`, então esse gatilho não é atingido.
5. `audit_spaces` registra a inserção do space. Isso não bloqueia.
6. No código do front-end, o ambiente 15 também está tratado como support (citado pelo usuário, não reinspecionado nesta consulta).

## Pontos para a etapa de implementação
- Escolher o modelo de preço fixo: nova regra por lote ou coluna própria. Usar `list_price_cents` misturaria preço de tabela com preço oficial.
- O total esperado de 13200000 centavos não altera nenhum outro segmento. A regressão deve manter os valores da tabela acima.
