# Troca de menus imediata e fluida

## Causa encontrada
A área interna confere a conta no servidor **a cada clique de menu** (consulta de rede antes de trocar de página). Enquanto essa resposta não chega, o sistema mantém a página anterior na tela sem nenhum aviso — por isso o menu "Mapa Comercial" fica marcado e o Dashboard continua visível. No Mapa a espera aumenta porque a planta 3D é um arquivo grande, baixado só no primeiro acesso.

## O que muda
1. **Conferência de acesso sem espera na navegação.** A verificação no servidor passa a acontecer uma vez ao entrar e é reaproveitada (com renovação periódica e ao trocar de conta). Cliques entre menus usam a sessão já confirmada, sem ida à rede. A segurança real continua no banco (permissões por módulo), e sair/expirar a sessão continua levando à tela de acesso.
2. **Resposta visual imediata.** Uma barra fina de progresso no topo da área de trabalho aparece se a troca levar mais de ~150 ms, e o conteúdo antigo fica levemente esmaecido — nunca mais "parece travado".
3. **Pré-carregamento.** Ao passar o mouse ou focar um item do menu, a página e seus dados começam a carregar antes do clique. A planta do Mapa é pré-baixada em segundo plano depois que o sistema abre.
4. **Transição suave.** Troca de página com fade curto (respeitando "reduzir movimento"), rolagem volta ao topo, e o Mapa mostra seu próprio estado de carregamento da planta em vez de deixar o Dashboard na tela.

## Detalhes técnicos
- `src/routes/_authenticated/route.tsx`: `beforeLoad` passa a usar `queryClient.ensureQueryData` com chave `["auth","session"]` (já invalidada em `__root` nos eventos SIGNED_IN/USER_UPDATED/SIGNED_OUT), `staleTime` de alguns minutos; `getUser()` só na primeira carga/expiração.
- `src/router.tsx`: `defaultPreload: "intent"`, `defaultPendingMs: 150`, `defaultViewTransition` com fallback.
- `AppShell`: indicador via `useRouterState({ select: s => s.status === "pending" })`; `<main>` com `aria-busy`.
- `CommercialMapWorkspace`: `import("./MapRenderer")` disparado em idle após montar o shell.
- `src/styles.css`: animação curta de entrada com `prefers-reduced-motion`.
- Sem mudanças de banco, permissões, rotas ou dependências. Verificação: Playwright logado medindo tempo do clique Dashboard → Mapa → demais menus, antes e depois, em desktop e celular.
