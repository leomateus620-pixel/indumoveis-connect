O Pavilhão 1 agora abre a Mostra ARQ & Design pelo botão **Acesso Interno** do mapa comercial. A rota autenticada `/mapa/pavilhoes/1/interior` oferece planta SVG dedicada, consulta em painel esquerdo, seleção na URL e navegação 2D com mouse, toque e teclado. O retorno restaura o contexto do parque; o renderer externo é desmontado durante a inspeção.

A planta foi extraída do PDF original e preserva os 15 espaços numerados, os 14 ambientes comerciais, os recortes, portas, acessos e as cinco extensões vinculadas. A seleção de uma extensão destaca o mesmo espaço e abre o mesmo painel. Banheiros, salão e circulação ficam fora do estoque; o salão usa área `null`. As metragens declaradas foram mantidas sem somar novamente as extensões.

A persistência reaproveita `floor_plans` e acrescenta revisões imutáveis, ambientes, partes e elementos arquitetônicos com integridade por edição. As consultas seguem `src/lib/api.ts`, RLS do mapa e permissões comerciais existentes; os estados continuam vindo de `space_status_v`. As duas migrações foram **aplicadas pelo conector Lovable no banco existente de Indumóveis Connect**, registradas no histórico e verificadas por SQL. A reexecução transacional não duplicou registros.

A identidade ARQ & / Design / Indumóveis inclui SVGs principal, compacto e monocromático, PNGs transparentes e fontes licenciadas para reprodução. A marca permanece na faixa fixa acima do desenho.

## Validação

Build, TypeScript e lint dos arquivos alterados passaram na rodada de desenvolvimento. Os testes cobrem geometria, áreas, vínculos externos, seleção, navegação, acessibilidade de teclado, painel mobile, URL e contexto de retorno. A rodada final passou com **494 testes em 79 arquivos**, além de TypeScript e lint dos arquivos alterados.

No banco, foram conferidos o payload autenticado, os 14 vínculos comerciais, os cinco exteriores, o salão nulo, os bloqueios por permissão/edição, a imutabilidade e a reexecução. Fixtures SQL foram revertidas. A interface foi revisada no navegador com dados controlados, com capturas da planta inteira, espaço 12, espaço 02, banheiros, salão e mobile.

- [Relatório de implementação e limitações](https://github.com/leomateus620-pixel/indumoveis-connect/blob/codex/pavilhao-1-interior/docs/pavilion-interior/implementation.md)
- [Aplicação no banco e verificações](https://github.com/leomateus620-pixel/indumoveis-connect/blob/codex/pavilhao-1-interior/docs/pavilion-interior/database.md)
- [Comprovação estruturada](https://github.com/leomateus620-pixel/indumoveis-connect/blob/codex/pavilhao-1-interior/docs/validation/pavilion-interior/database-application.json)
- [Geometria e fonte documental](https://github.com/leomateus620-pixel/indumoveis-connect/blob/codex/pavilhao-1-interior/docs/pavilion-interior/geometry.md)
- [Identidade visual](https://github.com/leomateus620-pixel/indumoveis-connect/blob/codex/pavilhao-1-interior/docs/arq-design-identity.md)

## Pendências e limites da validação

A composição interna/externa das áreas ainda depende de confirmação documental; a interface exibe somente o valor declarado e o vínculo externo. O PDF está preservado no repositório e não foi enviado ao Storage. O quadro interativo Creative Production estava indisponível; suas diretrizes foram aplicadas aos assets vetoriais finais. Não havia expositor real para conferir um nome de produção. A validação visual utilizou sessão controlada; a leitura e as permissões reais foram testadas separadamente por SQL. Não houve ensaio em telefone físico nem auditoria completa de tecnologias assistivas.
