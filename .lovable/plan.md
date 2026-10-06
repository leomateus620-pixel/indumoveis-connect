# Documentos: fechar a transição, as versões e a validação por perfil

## Situação atual (verificada)
- A entrega anterior já aplicou o banco novo e o código novo juntos no preview.
- `uploadDocument` já usa reserva → envio → finalização. A central, a nova versão, os anexos dos módulos, as fotos de vistoria e a planta do mapa passam por ele.
- A biblioteca está vazia: 0 documentos, 0 plantas, 0 arquivos. Nenhum registro antigo foi alterado ou perdido.
- O site publicado ainda roda o código antigo. Lá, o envio falha até a próxima publicação.
- Matriz confirmada: para ver um documento é preciso ler Documentos e todos os módulos vinculados. Operação e Consulta não leem Financeiro, então não veem documentos ligados a parcelas.

## 1. Reconstrução das versões (migração de reparo, sem excluir nada)
- Primeiro, uma consulta só de leitura para diagnóstico. Ela lista:
  - ciclos na cadeia `previous_id`;
  - mais de um sucessor para o mesmo documento;
  - `root_id` ausente ou divergente da raiz real;
  - números de versão repetidos ou fora de ordem;
  - mais de uma versão vigente por cadeia;
  - envios pendentes antigos.
- O resultado é relatado antes de qualquer alteração.
- Correção com consulta recursiva: `root_id` passa a ser a raiz real da cadeia. A vigente é a última versão ativa sem sucessor ativo, e as demais ficam como não vigentes.
- Os vínculos que estiverem nas versões são copiados para a raiz, ignorando duplicados. Os vínculos originais não são apagados.
- Se houver cadeias inconsistentes (ciclo ou bifurcação), elas não são alteradas automaticamente: ficam listadas para decisão.
- Proteção para o futuro: uma regra no banco impede gravar versão com `root_id` diferente da raiz do antecessor. Também passa a existir no máximo uma versão vigente por cadeia.

## 2. Compatibilidade entre código e banco
- Revisar todos os consumidores de `uploadDocument`, `signedUrl` e `useEntityDocuments`:
  - Mapa (planta), Vistorias (fotos), anexos de Empresas, Comercialização, Contratos, Financeiro e Agenda, e a própria central.
- Garantir que todos usem o retorno novo (`id` e `storage_path`) e a versão vigente.
- A planta do mapa continua visível para quem lê o Mapa. O envio dela é permitido a quem escreve no Mapa.

## 3. Validação com perfis reais
- Já existem contas com os papéis comercial, financeiro, operação e consulta. Antes de entrar com cada uma, a conta será confirmada com você.
- Com dados temporários (removidos de forma pontual ao final), testar:
  - envio pela central;
  - nova versão, inclusive duas ao mesmo tempo;
  - anexo e "Associar existente" em um módulo;
  - foto de vistoria;
  - envio da planta e exibição no mapa;
  - documento ligado a parcela: Financeiro e Comercial veem; Operação e Consulta não veem nem na lista, nem na prévia, nem pelo endereço direto do arquivo;
  - Consulta sem botões de envio e com o envio recusado no servidor.
- Telas no computador e no celular, mais testes automáticos, tipos e build.

## Detalhes técnicos
- Diagnóstico com `WITH RECURSIVE` sobre `documents(previous_id)`. A correção roda em uma migração com `UPDATE` delimitado por `root_id` calculado, nunca `DELETE`.
- Trigger `BEFORE INSERT/UPDATE` em `documents` que valida `root_id = coalesce(prev.root_id, prev.id)`. Índice único parcial `(root_id) WHERE is_current`.
- Nenhuma alteração em papéis, permissões ou usuários. Nada será publicado.
