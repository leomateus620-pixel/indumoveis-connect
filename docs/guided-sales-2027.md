# Modo Comercialização

O Modo Comercialização é um fluxo de administração no mapa do parque e nas
plantas internas dos pavilhões 1, 8, 12 e 13. O botão na barra ativa a seleção
temporária. O administrador escolhe lotes disponíveis de um único pavilhão
ou segmento externo, confere o resumo e avança por Empresa, Pagamento e
Revisão. Sair das rotas do mapa, trocar de edição ou sessão ou perder o
papel de administrador limpa o rascunho. A seleção não altera o estoque.

A cotação soma áreas confirmadas e calcula valores em centavos. Valores
negociados divergentes ou áreas oficialmente sem tarifa exigem justificativa
por lote; lotes com área ou esquina pendente não podem ser escolhidos.
Desconto e taxas ficam registrados separadamente. O fluxo gera parcelas
previstas no registro de assinatura, nunca recebimentos.

A reserva cria negociação reservada e contrato em elaboração. Para
concluir a venda, um administrador atesta a assinatura e vincula um PDF
privado. O banco verifica o objeto, registra o ID exato da versão assinada
e usa as transições oficiais para refletir a venda no estoque, nos
marcadores e na Dashboard Comercial. É possível retomar a reserva a partir
de Comercialização ou Contratos. Autor original, data, eventos posteriores
e autor da assinatura ficam preservados. Cancelamento usa a reconciliação
existente de contrato e parcelas.

## Aplicação e segurança

- `20261113140000_guided_sales.sql`: prévia no servidor, reserva,
  assinatura, anexos privados, autoria, idempotência e coordenação dos
  bloqueios com a comercialização existente.
- `20261113141000_guided_sales_privacy.sql`: proteção de tabelas, funções,
  relações indiretas e arquivos. O mapa retorna somente Disponível ou
  Indisponível para não administradores. Marcadores de progresso e a
  Dashboard Comercial são exclusivos de administradores.

As migrações foram aplicadas na edição ativa Indumóveis 2027 pelo
`query_database` direto do Lovable. Os textos integrais foram registrados
no histórico do Supabase e os hashes foram conferidos. O inventário
continua com 423 lotes; a aplicação não criou vendas ou contratos reais.

## Validação

Os roteiros `scripts/verify-guided-sales.sql` e
`scripts/verify-guided-sales-privacy.sql` usam transações com rollback.
Cobrem reserva, assinatura, PDF ausente, revisão da cotação, retomada,
idempotência, autoria, parcelas, cancelamento e as permissões de
Comercial, Financeiro, Operação e Consulta.

`scripts/verify-guided-sales-concurrency.mjs` usa duas sessões em um banco
PostgreSQL local descartável. Uma venda guiada segura o lote até o commit;
a negociação concorrente pelo caminho legado aguarda e rejeita o lote
depois que ele está reservado. A verificação visual usa dados de
demonstração no mapa 3D, 2D e na planta interna em desktop e celular.
