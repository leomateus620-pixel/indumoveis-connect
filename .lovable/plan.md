# Refinamento integrado dos menus internos — Indumóveis Connect

## Resultado
Uma área de trabalho mais compacta, legível e coerente com a identidade Indumóveis, aplicada ao conteúdo dos dez menus — não apenas à navegação. Os fluxos, permissões, filtros, seleções e dados existentes permanecerão intactos; autenticação e regras comerciais ficam fora desta entrega.

## Implementação
1. **Base visual compartilhada.** Refinar em `src/styles.css` os tokens semânticos de superfícies, texto, estados, foco, bordas, raios e elevação; consolidar escala de títulos, seções e números tabulares. Preservar Figtree, Plus Jakarta Sans e as cores da marca, sem afetar a tela de acesso.
2. **Navegação e componentes.** Ajustar `AppShell` e os componentes existentes em `src/components/app/ui.tsx`: sidebar expandida/recolhida, tooltips e foco acessíveis, gaveta móvel, cabeçalho compacto, toolbar, listas responsivas, indicadores, seções, estados e campos. Manter os dez destinos e a lógica atual de autorização. Fazer a tabela/card móvel compartilhar os mesmos dados sem interferir em links e ações internos.
3. **Menus comerciais.** Dashboard: destacar métricas reais e pendências. Mapa: dar prioridade à planta e manter legenda, filtros e seleção fora do caminho da visualização, sem alterar coordenadas ou gestos. Comercialização e Empresas: melhorar varredura de nomes, espaços, valores, contatos, vínculos, formulários e painel contextual.
4. **Menus operacionais.** Contratos: ordenar revisão, valor, situação, versões, anexos e ações sem mudar transições. Vistorias: tornar checklist, comparação e fotos confortáveis no celular. Financeiro: facilitar comparação de valores, vencimentos e pagamentos. Agenda: aprimorar lista e calendário existentes sem trocar a lógica. Documentos: destacar arquivo, categoria, vínculo, versão e ações. Administração: organizar abas, formulários e matrizes com cuidado para ações sensíveis.
5. **Estados e acessibilidade.** Mostrar erro de consulta separadamente de vazio nos pontos afetados quando o hook já expõe esse estado; não inferir resultados que os dados não fornecem. Rever labels, foco, nomes de ícones, alvos de toque, rolagem de tabelas e diálogos, sem perder valores digitados ao adaptar o layout.

## Limites técnicos e verificação
- Trabalhar na apresentação, nas rotas dos dez módulos e nos componentes compartilhados; sem migrações, novas dependências, alterações de API, autenticação, cálculos, permissões ou registros reais.
- Reaproveitar `PageHeader`, `FilterBar`, `DataList`, `Section`, `Stat`, `StatusBadge`, `FormRow`, `Dialog`, `Sheet` e `Tabs` antes de extrair novos padrões; substituir `any` apenas onde o contrato visual tocado puder ser tipado com segurança sem reestruturar a camada de dados.
- Conferir as verificações de build/tipos/lint apropriadas e percursos representativos de navegação, filtros, formulários e painéis em larguras próximas de 375, 768, 1280, 1440 e telas amplas. Se não houver uma sessão autorizada para abrir os menus, registrar explicitamente o limite e não alegar inspeção visual autenticada.
- Entregar resumo dos arquivos/componentes modificados, melhorias por área e capturas disponíveis, separando eventuais problemas de negócio encontrados sem corrigi-los nesta etapa. Não publicar.
