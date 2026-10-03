# Sistema Indumóveis 2027 — Primeira estrutura integrada

## Objetivo
Aplicação web responsiva com os 10 módulos conectados por uma única base de dados (Lovable Cloud), autenticação real, perfis de acesso e fluxo: empresa → espaços → negociação → contrato → financeiro → vistoria de entrega → atividades → vistoria de devolução.

## Identidade visual
- Paleta em tokens: ameixa estrutural (~#593D4C, versão escura para sidebar ~#3F2633), vermelho destaque #C12528, taupe #898675, off-white #FBFDFC nas áreas de trabalho.
- Tipografia: títulos em "Plus Jakarta Sans" (peso 700/800, contemporânea e geométrica), texto em "Inter Tight"/Jakarta regular; `tabular-nums` em valores, áreas, datas e contagens. Escala definida (página, seção, entidade, valor, rótulo, auxiliar).
- Logo: recorte fiel do banner enviado (versão clara para fundo escuro); versão para fundo claro gerada sem distorção. Recomendado enviar o arquivo vetorial oficial (só dois anexos chegaram, não três).
- Arco e "X" geométricos usados apenas no login e no bloco de identificação da edição.
- Superfícies claras, divisórias finas, raio moderado, sem glass/gradientes.

## Estrutura
- Sidebar ameixa escura, logo no topo, 10 itens na ordem pedida com ícones Lucide (BarChart3, MapPin, Handshake, Users, FileText, ClipboardCheck, Coins, CalendarDays, Folder, Settings), item ativo com superfície e marcador vermelho; rodapé com usuário logado, perfil e sair. Desktop: modo compacto só ícones (com tooltip). Celular: gaveta.
- Cabeçalho compacto: edição ativa (nome + datas vindas da configuração), título, abas locais, ações.

## Módulos (cada um com listagem, filtros, painel de detalhes e ações reais)
1. **Dashboard** — indicadores derivados: espaços por situação, negociações em andamento, contratos por situação, vistorias pendentes, próximos compromissos; financeiro (negociado / previsto / recebido / vencido) só para perfis autorizados. Cada indicador abre a listagem filtrada. Lista de pendências acionáveis.
2. **Mapa Comercial** — cadastro de espaços (código, pavilhão/setor, área, situação derivada). Upload de planta (imagem) e posicionamento de retângulos dos espaços sobre ela em 2D. Sem planta: aviso claro + listagem/grade funcional. Seleção mostra vínculos; destaca todos os espaços de uma negociação. Selecionar não reserva.
3. **Comercialização** — negociações: empresa, N espaços, responsável, condições, valor, status (proposta → em negociação → reservada → contratada / perdida / cancelada) com transições explícitas e histórico. Conflito de espaço validado no servidor (função transacional). Expiração de reserva só se política configurada em Administração.
4. **Empresas / Expositores** — razão social, nome fantasia (exibição preferencial), CNPJ único quando informado, contatos (N), participações por edição; ficha com abas de negociações, espaços, contratos, documentos, atividades.
5. **Contratos** — rascunho gerado a partir da negociação (dados reaproveitados, revisão antes de emitir), modelo editável em Administração sem cláusulas inventadas, estados separados: em elaboração / emitido / arquivo anexado / assinatura registrada (manual, nunca automática pelo upload). Versões preservadas; vínculo explícito com vários espaços.
6. **Vistorias** — entrega e devolução por espaço, ligadas a edição, expositor e contrato; checklist configurável, fotos (câmera do celular), observações, aceite capturado no sistema (nome + desenho/confirmação, rotulado como "aceite", não assinatura certificada); comparação entrega × devolução; pendências viram atividades vinculadas. Layout mobile-first.
7. **Financeiro Operacional** — parcelas por contrato (valor em centavos, arredondamento único), vencimentos, pagamentos registrados com origem e comprovante, situação própria; totais sem duplicar contratos multiespaço; histórico de alterações. Sem integração bancária/fiscal.
8. **Agenda / Atividades** — atividades com título, responsável, data, status e vínculo polimórfico; visão calendário (mês/semana) + lista de pendências; vencimentos de parcelas e datas de vistorias aparecem a partir dos próprios registros (sem duplicar).
9. **Documentos** — central sobre um único armazenamento privado; cada arquivo com categoria, versão, responsável e vínculos; os mesmos arquivos aparecem em contratos, vistorias, empresas e financeiro. Link de acesso externo apenas por ação explícita (URL assinada temporária).
10. **Administração** — usuários e perfis (admin, comercial, financeiro, operação/vistorias, consulta) com matriz de permissões configurável; edições (datas 14–23/05/2027 cadastradas como dado); políticas (expiração de reserva), checklists, modelo contratual; log de auditoria.

## Acesso
Login por e-mail/senha e Google. O primeiro usuário cadastrado vira administrador (sem conta fixa); demais recebem perfil atribuído pelo admin. Permissões verificadas no servidor e nas políticas do banco.

## Dados de demonstração
Opcional, marcados com flag "demo" e selo visível, removíveis em Administração. Nada apresentado como dado oficial.

## Pendências reais a informar ao final
Planta oficial dos espaços, lista de espaços/áreas/preços, modelo contratual aprovado, política de expiração de reservas, checklist oficial de vistoria, logo vetorial.

## Detalhes técnicos
- TanStack Start + Lovable Cloud. Rotas: `/auth`, `/_authenticated/{dashboard, mapa, comercializacao, empresas, empresas/$id, contratos, contratos/$id, vistorias, vistorias/$id, financeiro, agenda, documentos, admin}`; `/` redireciona.
- Tabelas: editions, companies, contacts, company_participations, spaces, floor_plans, deals, deal_spaces, contracts, contract_versions, contract_spaces, installments, payments, inspections, inspection_items, checklist_templates, activities, documents, document_links, user_roles, role_permissions, settings, audit_log. Todas com `edition_id` quando pertinente.
- RLS com `has_role`/`has_permission` security definer; papéis em tabela separada.
- Funções SQL transacionais (RPC): `save_deal_with_spaces` (bloqueio `FOR UPDATE` + checagem de conflito), `transition_deal`, `create_contract_from_deal`, `register_payment`, `complete_inspection`; triggers de auditoria. Chaves de idempotência em criações sensíveis.
- Camada `src/features/<modulo>/` com `*.functions.ts` (createServerFn + zod + requireSupabaseAuth), hooks TanStack Query com chaves padronizadas e invalidação cruzada; componentes compartilhados em `src/components/app/` (PageHeader, FilterBar, DataTable responsiva→cards, DetailSheet, EntityPicker, StatusBadge, FileAttach, EmptyState, RestrictedState).
- Storage: bucket privado `documents`; URLs assinadas.
- Sem Edge Functions nesta entrega (nenhuma integração externa ainda); pontos de extensão documentados em AGENTS.md.
