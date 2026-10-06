# Central de Documentos — Indumóveis Connect

Revisão base confirmada: `2c1a83e`, sem alterações locais. Agenda, Comercialização, Contratos e Financeiro ficam como estão.

## Decisões confirmadas
- Acesso sensível: para ver um documento, a pessoa precisa de leitura em Documentos **e** em todos os módulos aos quais ele está vinculado.
- Envio: até 25 MB. Formatos aceitos: PDF, JPG/PNG/WEBP, DOCX/XLSX/PPTX, DWG, ZIP, TXT/CSV. HTML, SVG e executáveis são bloqueados.
- Sem favoritos, sem exclusão permanente, sem integrações externas, sem publicação.

## Matriz de acesso
```text
Ação               | Documento geral          | Documento com vínculos
Ler/prévia/baixar  | ler Documentos           | ler Documentos + ler TODAS as origens
Enviar             | escrever Documentos      | escrever Documentos ou no módulo de origem + ler todas as origens
Editar metadados   | escrever Documentos      | escrever Documentos + ler todas as origens
Nova versão        | igual a Editar           | igual a Editar
Vincular/desvincular | escrever Documentos ou no módulo alvo + ler o documento
Link externo       | escrever Documentos + ler o documento; validade de 7 dias, sem possibilidade de revogação
```
A mesma regra vale para a lista, os detalhes, as URLs assinadas e o armazenamento de arquivos. O caminho do arquivo é ligado à linha do documento.

## Experiência
- Cabeçalho compacto com a edição ativa, busca em destaque e o botão "Enviar documento".
- Navegação local em uma faixa horizontal compacta, sem segunda sidebar: Todos, Recentes e Sem vínculo, mais as categorias.
- Filtros: edição (ativa / gerais / todas), categoria, tipo de vínculo, responsável e período. Os filtros ativos aparecem como chips com a opção "Limpar".
- Tabela com ícone do formato, título e nome original, categoria, vínculos com nomes reais, versão vigente, data de atualização e responsável. Uma grade opcional atende fotos e plantas. No celular, cada linha vira um bloco compacto, sem rolagem lateral.
- Painel lateral com as abas Prévia, Detalhes e Versões. PDF abre em iframe isolado (sandbox) e imagens em `<img>`; outros formatos mostram identificação e o botão Baixar. A URL assinada é gerada na hora e renovada automaticamente quando expira, com o estado "link expirado".
- Em Detalhes: editar título, descrição e categoria, gerenciar vínculos e abrir a origem.
- Formulário de envio com arquivo, categoria explícita (sugerida pelo filtro ativo), título opcional, vínculos pesquisáveis e barra de progresso.
- "Associar documento existente" disponível nos anexos dos módulos.
- Agenda integrada: anexos aparecem no detalhe da atividade e a origem leva à atividade.
- Estados distintos: biblioteca vazia (com orientação), nenhum resultado, carregando, erro com nova tentativa, acesso restrito e link expirado.
- Busca, filtros, ordenação, modo de exibição, página e documento selecionado ficam na URL.

## Detalhes técnicos
- Migração aditiva em `documents`: `title`, `description`, `updated_at`, `status` (`pendente`/`ativo`), `is_current`, `root_id` e um índice único (root_id, version). Os registros atuais são preenchidos: `root_id` pela cadeia e `is_current` pela ausência de sucessor.
- `document_links.entity_type` passa a aceitar `activity`. Uma função valida a existência e a edição de cada entidade.
- Funções SQL (security definer, com checagem de permissão):
  - `can_read_document(id)`: aplica a regra "todas as origens".
  - `begin_document_upload` → `finalize_document_upload`: reserva o registro pendente com chave idempotente e o caminho definido no servidor; a finalização confere o objeto no Storage e então ativa o documento e grava os vínculos.
  - `begin_document_version(root, expected_version)`: calcula a próxima versão no servidor, com bloqueio de linha; recebe um conflito se outra pessoa enviou antes.
  - `update_document_meta`, `link_document`, `unlink_document`.
  - `search_documents(filtros, página)`: busca no servidor por título, nome e nomes dos registros vinculados, com contagem total já autorizada.
- As políticas de `documents`, `document_links` e `storage.objects` (bucket `documents`) passam a usar `can_read_document`. A inserção no Storage só é aceita para caminhos reservados como pendentes.
- Falha parcial: um pendente sem objeto pode ser retomado ou cancelado individualmente, só pela pessoa que enviou. Não haverá varredura ampla.
- Os anexos dos módulos (`AttachedDocuments`/`useEntityDocuments`) mostram só a versão vigente e oferecem acesso ao histórico.
- `src/lib/api.ts` reúne os hooks e mutações, com invalidação via `useDbMutation`. Componentes novos: `src/components/app/documents/*` (tabela, painel, formulário de envio, seletor de vínculos). Os tokens locais ficam no escopo `.docs-*` em `styles.css`.
- Registros em `AGENTS.md`: regra de acesso por todas as origens, upload em duas fases e versão calculada no servidor.
- Testes: regras puras de versão vigente, filtros e validação de tipo/tamanho (vitest). Verificação no navegador com o administrador: envio, edição de metadados, vínculo com Agenda/Contrato, versão concorrente (duas chamadas), URL expirada, upload interrompido, preservação da URL e telas desktop/celular. Os dados temporários são removidos de forma pontual.
- A migração será aplicada ao banco compartilhado somente após a aprovação deste plano. Nada será publicado.
