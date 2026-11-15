# Preços do Pavilhão 1 — ARQ & DESIGN

Implementação validada em 15/11/2026 para a edição ativa de 2027.

- 15 espaços comerciais (01–15), incluindo Banheiros.
- Área comercial: **1.203,62 m²**; preço bruto total de tabela: **R$ 132.000,00**.
- Preços individuais fechados, sem derivar uma tarifa por m².
- Fonte: `docs/references/pavilion-1/mostra-arq-design-precos.pdf`, página 1.
- SHA256 da fonte: `8868c5a7b077a6b88223986dea8faf8b42bcde5df36a1a1ed71408ee42dfbef7`.
- Migração: `20261115140000_pavilion_1_fixed_prices.sql`.
- Aplicação e testes de escrita exclusivamente pelo conector SQL direto do Lovable, projeto Indumóveis Connect. A aplicação registrou a migração no histórico do banco na mesma transação.

## Dados e segurança

`commercial_fixed_prices` relaciona edição, versão da política e identidade do espaço. A tabela e as visões internas não têm acesso direto pelo cliente. Os preços, a base de cálculo e a origem seguem as restrições financeiras existentes nas RPCs.

A revisão 2 da planta copia a geometria e as metragens da revisão 1 integralmente; muda a classificação comercial do ambiente 15 e sua descrição para Banheiros. As cinco extensões externas continuam partes dos respectivos espaços, sem duplicação de área.

Dashboard, mapa, modo vendas e “Usar tabela” consomem a mesma visão comercial por meio dos hooks de `src/lib/api.ts`. Contratos, empresas, parcelas e recebimentos continuam usando os valores negociados e os vínculos transacionais existentes. Registros históricos sem os novos campos continuam compatíveis.

Uma leitura em outra chamada SQL após o commit confirmou todos os 15 preços, a revisão vigente, as permissões e os totais. Os demais segmentos mantiveram valores, quantidades e pendências. A evidência está em `database-application.json`.

## Verificações

- Suíte completa: **95 arquivos, 638 testes aprovados**.
- Build de produção e ESLint dos arquivos TypeScript alterados aprovados.
- Migração aplicada duas vezes em transação revertida: resultado idempotente.
- `scripts/verify-pavilion-1-pricing.sql`: preços individuais e totais; geometria; cotação de 15 e de vários espaços; negociação com justificativa; bloqueio sem preço; cotação desatualizada; reserva; conflito de disponibilidade; contrato; parcela; recebimento parcial; empresa; indicadores; cancelamento; privacidade por perfil. Toda a massa foi revertida.
- Scripts existentes de preços, indicadores, vendas guiadas, privacidade e planta interna aprovados com a nova migração, também com rollback.
- `scripts/pavilion-1-pricing-validation.mjs`: conferência visual e de navegação em 1440 × 1000 e 390 × 844. Dashboard, detalhe do Espaço 15, recarga, seleção 15 + 01 (R$ 9.000,00) e etapa de pagamento aprovados, sem transbordamento horizontal.

A conferência visual usou o build local e respostas controladas das RPCs, sem login ou escrita em produção; os fluxos reais de banco foram verificados separadamente pelo conector. Não houve teste em aparelho físico. O servidor local não fornece os assets de marca do Lovable (`/__l5e/assets-v1/`), resultando em avisos de recursos ausentes conhecidos no relatório visual; não houve erro de execução ou requisição inesperada nos fluxos testados.

## Reexecução

Executar as verificações SQL somente pelo conector Lovable. O script de validação de banco começa com `begin` e termina com `rollback`.

Para a interface, gerar o build e servir com `scripts/serve-commercial-map-build.mjs`; executar `scripts/pavilion-1-pricing-validation.mjs` usando `MAP_BASE_URL` para apontar ao servidor e `MAP_ARTIFACT_DIR=artifacts.local/pavilion-1-pricing` para salvar as capturas e o relatório.
