# Agenda operacional integrada — Indumóveis Connect

## Resultado
Evoluir o menu existente para uma Agenda persistente e única, com **Linha do tempo** como visão principal, **Painel** e **Calendário**, sem duplicar vistorias ou parcelas. O cadastro permitirá criar, consultar, editar, concluir e cancelar atividades, com múltiplos responsáveis, categorias, comissões, vínculos e intervalos de data/hora.

A revisão atual está limpa e coincide exatamente com `7fb821c9d4d46c321514ae50177c3da83a50fa61`; a jornada comercial, contratos e financeiro já consolidada será preservada.

## Decisões confirmadas
- Aplicar a migração no banco compartilhado somente após a aprovação deste plano; a estrutura ficará disponível na prévia e no app publicado, sem publicar uma nova versão do app.
- Usar `America/Sao_Paulo` como fuso explícito da edição 2027.
- Permitir manutenção de categorias e comissões a quem possui escrita na Agenda; leitura acompanha a permissão da Agenda.
- Abrir Linha do tempo e Painel no mês atual, mantendo visão, período, busca, filtros e atividade selecionada na URL.
- Manter `activities` como entidade canônica; `inspections.scheduled_for` e `installments.due_date` continuam em suas tabelas e entram apenas como itens derivados.
- Preservar os tipos históricos `tarefa`, `reuniao`, `prazo`, `entrega` e `pendencia`; tipo, categoria, situação e origem continuam conceitos separados.
- Canceladas ficam fora do percentual de conclusão: numerador = atividades concluídas; denominador = abertas + concluídas no período.

## Implementação
1. **Modelo incremental e compatível**
   - Acrescentar à edição o fuso operacional e configurar a edição 2027 com `America/Sao_Paulo`.
   - Estender `activities` com início canônico, fim opcional, dia inteiro, local, categoria, versão, atualização e chave de idempotência. `start_at` será a fonte temporal canônica; `due_at` permanecerá compatível e sincronizado, com migração dos registros existentes sem criar datas ausentes.
   - Criar catálogos por edição para categorias e comissões, relações únicas para múltiplos responsáveis e comissões, e histórico versionado das mudanças relevantes.
   - Preservar `assignee_id` como responsável principal durante a transição; a relação principal será sincronizada com ele. Pessoas selecionáveis serão perfis reais que já possuem papel no sistema — sem criar contas, convites ou permissões.
   - Adicionar índices, chaves, `GRANT`s, RLS e validações para edição, referências, título após trim, intervalo temporal, unicidade, responsável principal e integridade das relações.

2. **Gravação atômica e concorrência**
   - Criar funções transacionais para salvar atividade e relações, alterar situação e manter os catálogos. Todas revalidarão `can_write('agenda')`, edição, referências e versão persistida.
   - Novos envios usarão chave idempotente; edições exigirão `expected_version`. Apenas uma confirmação persistida produzirá sucesso, histórico e invalidação das consultas.
   - Concluir ou cancelar uma atividade não alterará pagamentos nem vistorias. Cancelamento será uma situação própria, nunca equivalente a conclusão.
   - Remover os caminhos diretos de gravação usados hoje pela interface da Agenda e centralizar as chamadas em `src/lib/api.ts`.

3. **Catálogos iniciais verificáveis**
   - Cadastrar as dez categorias de referência fornecidas como opções editáveis, sem reclassificar automaticamente registros históricos.
   - Cadastrar por edição os 20 nomes oficiais fornecidos, mais **Comissão de Arquitetura e Ambientação do Parque** e **Comissão Central** como coordenadora, cada qual com identificador estável, situação, fonte e data de verificação.
   - Registrar explicitamente que a fonte oficial afirma existirem 23 comissões, mas somente 22 nomes foram comprovados nesta entrega; o nome restante ficará pendente e não será inventado.
   - Desativação preservará vínculos históricos; não haverá exclusão em cascata de atividades. Pessoas e cargos publicados não serão transformados em usuários ou vínculos.

4. **Fonte única e estados confiáveis**
   - Criar em `src/lib/api.ts` consultas da Agenda, detalhe, pessoas autorizadas, categorias e comissões, além das mutações transacionais.
   - Normalizar em uma camada pura os três tipos de item: atividades, vistorias e vencimentos. Datas civis de vistorias/parcelas permanecerão civis; timestamps serão agrupados e exibidos no fuso da edição.
   - Consultar vistorias e financeiro somente quando o perfil tiver acesso ao módulo de origem. O Financeiro não revelará empresa, valor ou contagem sem essa permissão.
   - Exibir carregamento e falha por fonte. Se uma fonte autorizada falhar, a tela indicará qual parte está incompleta e permitirá tentar novamente, em vez de apresentar uma agenda aparentemente completa.

5. **Linha do tempo e detalhe**
   - Criar cabeçalho compacto com período, busca e “Nova atividade”; abaixo, navegação entre Linha do tempo, Painel e Calendário.
   - Agrupar por data no fuso da edição, ordenar por horário e destacar hoje, próximas e atrasadas com linha temporal discreta. Itens sem data terão área própria; concluídas e canceladas terão tratamentos distintos.
   - Mostrar horário/intervalo, título, tipo, categoria, local, responsáveis, comissões, origem e situação quando existirem.
   - Abrir o detalhe em painel lateral acessível, controlado pela URL, com edição e mudanças de situação proporcionais à permissão. Fechar, voltar e avançar preservarão o contexto sem reabrir indevidamente.

6. **Painel operacional**
   - Calcular, sempre a partir do mesmo recorte filtrado: próximas, abertas, atrasadas, concluídas, evolução no período, categorias, comissões, responsáveis e registros sem data/incompletos.
   - Cada número ou distribuição aplicará o filtro correspondente e levará à Linha do tempo com o mesmo período e demais recortes.
   - Não criar dados demonstrativos nem gráficos sem função operacional.

7. **Calendário inteligente**
   - Refinar a grade mensal com navegação por mês/ano, botão Hoje, dia atual e itens acionáveis.
   - Representar intervalos de vários dias a partir de um único cadastro; “+N” abrirá a lista completa daquele dia.
   - No celular, combinar mês compacto e lista legível do dia selecionado, com navegação por teclado e sem depender de arrastar.

8. **Cadastro e manutenção**
   - Reestruturar `ActivityDialog` para criação e edição, em grupos: informações principais, programação, responsabilidade e vínculos.
   - Implementar multiseleção pesquisável com nomes completos e chips removíveis para pessoas e comissões, incluindo responsável principal.
   - Validar alterações não salvas ao fechar, impedir envio repetido e manter o formulário aberto com os valores digitados quando houver falha.
   - Incluir manutenção compacta de categorias e comissões dentro da Agenda para quem possui escrita, sem criar uma nova tela obrigatória.
   - Atualizar `RelatedActivities` para abrir detalhes e criar atividade já vinculada, preservando todos os módulos que o reutilizam.

## Fluxo
```text
Cadastro/edição
  → responsáveis + comissões + vínculo
  → validação e persistência atômica/versionada
  → invalidação da fonte única
  → Linha do tempo | Painel | Calendário
  → detalhe, edição e acompanhamento
```

## Arquivos e limites técnicos
- Migração nova em `supabase/migrations/`, aplicada pelo fluxo aprovado do banco; atualizar tipos gerados correspondentes.
- Concentrar acesso e mutações em `src/lib/api.ts`; extrair regras puras de período, fuso, agregação, filtros e indicadores para `src/lib/agenda.ts`.
- Evoluir principalmente `src/routes/_authenticated/agenda.tsx`, `src/components/app/shared.tsx` e componentes locais pequenos; usar variantes locais de apresentação antes de alterar tokens globais.
- Registrar no `AGENTS.md` a fonte temporal canônica, a gravação transacional e a separação entre registros próprios e derivados.
- Sem recuperação de senha, mudanças de AUTH, novas integrações, novas dependências, usuários, locais inventados, regras da Fenasoja ou publicação.

## Verificação
- Testes unitários para fuso, meia-noite, troca de mês/ano, intervalo de vários dias, fim inválido, filtros, “Minhas atividades”, canceladas fora do percentual e contagens sem vazamento financeiro.
- Testes do banco para criação/edição/recarga, idempotência, versão concorrente, trim de título, referências/edição, responsáveis e comissões duplicados, responsável principal, RLS e permissões.
- Fluxo autenticado real: cadastro, múltiplos responsáveis/comissões, edição, conclusão, cancelamento, filtros, detalhe pela URL, voltar/avançar e atualização nas três visões.
- Simular falha de cada fonte agregada e confirmar mensagem parcial com nova tentativa.
- Conferir TypeScript, testes, lint escopado e o build observado pelo ambiente; validar e capturar desktop, tablet e celular, informando separadamente o que foi implementado, verificado e ainda depende de fonte oficial.
