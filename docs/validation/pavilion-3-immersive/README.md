# Pavilhão 3 — experiência imersiva

## Escopo

O P3 passa a abrir em uma cena WebGL dedicada, com volumes de exposição, luz, sombras, giro, zoom, foco por lote e percurso manual por cinco pontos. A ilha central permanece aberta, sem divisória elevada. O ícone na passagem lateral abre diretamente o Pavilhão 13 e permanece alcançável ao aproximar a cena.

O painel é recolhível e apresenta busca, cinco setores e uma ficha compacta por lote. No celular, a ficha ocupa a parte inferior e reserva espaço para a cena e seus controles. A visualização em planta mantém teclado, pan, zoom e os 142 alvos independentes; é ativada automaticamente quando WebGL não está disponível ou perde o contexto.

Os polígonos e IDs vêm da mesma revisão persistida. Os volumes e alturas são recursos visuais de apresentação, não medidas de construção. Esta etapa não modifica a planta, as metragens, os preços, a edição, as permissões ou as funções de escrita comercial. O acesso aos dados continua em `src/lib/api.ts`, via `PavilionInteriorPage`.

## Evidência visual

As capturas usam a prévia local com dados de demonstração: 142 lotes disponíveis, 5 m² e R$ 1.325 por lote. Não representam a ocupação comercial atual do banco.

| Estado                            | Antes                                               | Depois                              |
| --------------------------------- | --------------------------------------------------- | ----------------------------------- |
| Desktop, visão geral, 1440 × 1000 | [Captura anterior](../pavilion-3/overview-1440.png) | [Perspectiva](after-desktop.jpg)    |
| Desktop, lote 104, 1440 × 1000    | [Captura anterior](../pavilion-3/lot104-1440.png)   | [Ficha e foco](lot104-desktop.jpg)  |
| Celular, visão geral, 390 × 844   | [Captura anterior](../pavilion-3/overview-390.png)  | [Interior](after-mobile.jpg)        |
| Celular, lote 104, 390 × 844      | [Captura anterior](../pavilion-3/lot104-390.png)    | [Ficha inferior](lot104-mobile.jpg) |

Comparações combinadas: [desktop](comparison-desktop.jpg), [celular](comparison-mobile.jpg), [detalhe do painel](comparison-detail.jpg). Outras capturas: [percurso](tour-desktop.jpg), [seleção comercial individual](individual-sale-desktop.jpg), [recuperação sem WebGL](fallback-mobile.jpg).

## Validação

- 649 testes passaram em 97 arquivos; TypeScript, ESLint dos arquivos alterados e build de produção passaram.
- Navegador integrado: perspectiva inicial, giro sem seleção acidental, clique direto no lote 103, busca e foco no 104, percurso, disponibilidade e recolhimento do painel.
- Planta alternativa: 142 alvos, seleção por clique, teclado 104 → 103, pan sem trocar a seleção.
- Comercialização: 39 e 104 selecionados separadamente, 10 m² e R$ 2.650 no carrinho. Controles permanecem fora do carrinho.
- Ícone P3 → P13 e retorno P13 → P3, no desktop e no celular.
- Perda real de contexto WebGL simulada no navegador: recuperação em planta com os 142 lotes. Recarregar restabeleceu a cena 3D.
- 1440 × 1000 e 390 × 844, DPR 1; sem overflow horizontal. Ações da ficha móvel inteiras, com 44 px; ícone P13 separado do zoom.
- Nenhum erro de console na sessão final após recarregar. Nenhuma operação comercial foi gravada no banco durante a revisão.

`scripts/pavilion-3-validation.mjs` foi adaptado aos novos seletores para regressão da planta sem WebGL. A validação de navegador desta etapa foi feita no navegador integrado, incluindo WebGL real.

## Prévia local

Iniciar Vite na porta 3001 com `VITE_SUPABASE_URL=http://127.0.0.1:4000` e `VITE_SUPABASE_PUBLISHABLE_KEY=local-preview-key`, executar `node scripts/pavilion-interior/preview.mjs` e abrir `/__qa/start?pavilhao=3` na porta 4000. O servidor de prévia é local, bloqueia operações não previstas e não consulta o banco real.
