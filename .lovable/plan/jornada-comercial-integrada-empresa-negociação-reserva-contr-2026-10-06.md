# Jornada comercial integrada — empresa → negociação → reserva → contrato → parcelas

## Base revalidada
O código atual é igual ao commit aecd192 (só muda a versão em package.json). Regras atuais: as transições de negociação e contrato ficam no banco (`transition_deal`, `set_contract_status`); "contratada" exige contrato assinado; parcelas podem ser geradas para qualquer contrato não cancelado; cancelamentos não refletem nas outras entidades.

## Regras confirmadas
1. **Assinatura conclui a contratação:** registrar a assinatura passa a negociação para "contratada" na mesma operação.
2. **Parcelas só depois da emissão:** contrato emitido ou assinado. Uma geração por contrato, protegida contra envio repetido e cliques simultâneos.
3. **Cancelamento:** o espaço é liberado; parcelas sem pagamento são canceladas; parcelas com pagamento parcial ou total ficam como estão e são sinalizadas para revisão. Nenhum pagamento é apagado, nenhuma devolução é criada, sem multas nem juros. Cancelar a negociação cancela o contrato ativo (e o inverso), sempre com motivo registrado.
4. **Divergência:** com contrato em elaboração, mudanças na negociação aparecem como aviso no contrato, com a opção "Atualizar a partir da negociação". Com contrato emitido ou assinado, a negociação não pode ser editada; para mudar, é preciso voltar o contrato para elaboração, o que gera nova versão. Documentos emitidos ou assinados nunca são sobrescritos.

## O que muda na tela
- **Empresa:** bloco da edição ativa com negociações, espaços e contratos, cada um com situação e link.
- **Negociação:** resumo da situação atual, pendências (ex.: sem contrato, contrato não assinado) e só as próximas ações permitidas.
- **Contrato:** cabeçalho compacto e sempre visível com origem (negociação), empresa, espaços, valor e versão; aviso de divergência; botão "Ver no Financeiro" que abre a lista já filtrada pelo contrato.
- **Financeiro:** filtro por contrato no endereço (funciona ao recarregar, voltar/avançar e link direto). Indicadores separados: contratado, previsto, recebido e saldo em aberto. Selo "Revisar" em parcelas de contratos cancelados.
- **Gerar parcelas:** prévia com número, data e valor de cada parcela e a soma antes de confirmar. A diferença de centavos fica na última parcela.
- **Estados:** carregando, erro com "Tentar novamente", registro inexistente, acesso restrito e "nenhum resultado para o filtro" ficam diferentes. Formulários mantêm o que foi digitado quando algo falha.

## Validação
Testes nas regras de cálculo (soma das parcelas, resíduo, separação dos indicadores) e Playwright com a conta de administrador para: reservar espaço já ocupado (bloqueado), assinar → contratada, cancelar com e sem pagamento parcial, divergência contratual, gerar parcelas duas vezes e pagamentos parciais. Para não alterar dados reais, uso dados de teste marcados como demonstração e removidos ao final.

## Autorização necessária
O mesmo banco atende o preview e o app publicado. Por isso **a alteração das regras no banco vale também para o app publicado**, mesmo sem publicar. Aprovar este plano autoriza essa alteração. Nada será publicado e nenhum usuário será alterado.

## Detalhes técnicos
- Migração (também salva em `supabase/migrations/`):
  - `contracts.deal_snapshot jsonb` (empresa, espaços/preços, condições, total) gravado em `create_contract_from_deal` e em uma nova função `refresh_contract_from_deal`, que só roda em contratos em elaboração e verifica `p_expected_version`.
  - `save_contract_body(p_contract_id, p_body, p_expected_version)`: falha se a versão salva mudou.
  - `set_contract_status`: a assinatura chama a transição da negociação para contratada; o cancelamento chama a reconciliação.
  - `transition_deal`: o cancelamento cancela o contrato ativo e reconcilia.
  - `generate_installments`: exige contrato emitido ou assinado, usa lock na linha e chave de idempotência.
  - `save_deal`: recusa edição se houver contrato emitido ou assinado.
  - Nova função interna `reconcile_cancellation` (parcelas sem pagamento → canceladas; mantém o resto). O espaço é liberado automaticamente porque o status dele é calculado a partir das negociações ativas.
  - Todas as funções conferem `can_write` de novo.
- Front-end: `src/lib/api.ts` (hooks com `isError`/`refetch`, novas chamadas), `ui.tsx` (`ErrorState`, `NotFound`, `NoResults`), `financeiro.tsx` (`validateSearch` com `contract`), `contratos.$id.tsx`, `comercializacao.tsx`, `empresas.$id.tsx`, cálculo puro de parcelas em `src/lib/installments.ts` com teste Vitest.
- Atualizar o AGENTS.md com a regra de reconciliação no servidor.
