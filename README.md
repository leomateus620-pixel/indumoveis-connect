# Indumóveis Connect

Atue como arquiteto de produto, diretor de design e engenheiro full-stack sênior especializado em plataformas de gestão de feiras, comercialização de espaços e operações integradas. Desenvolva a primeira estrutura funcional do Sistema Indumóveis, utilizando os três anexos como referências de identidade visual, navegação e escopo.
Construa uma aplicação web profissional, organizada e responsiva. A experiência deve transmitir a identidade da Indumóveis e permitir que as equipes trabalhem de forma conectada, com informações consistentes do cadastro do expositor à comercialização, documentação e operação da feira.
Esta entrega deve estabelecer a base real do sistema: arquitetura visual, navegação, componentes reutilizáveis, entidades compartilhadas e os fluxos essenciais dos dez módulos. Não entregue apenas uma landing page, um dashboard decorativo ou páginas isoladas com botões sem função.
1. Identidade visual Indumóveis
Preserve a grafia “Indumóveis” e a identificação da edição 2027. Utilize a marca fornecida, mantendo proporção, legibilidade e versões apropriadas para fundos claros e escuros. Não substitua o logotipo por uma digitação aproximada nem distorça a imagem.
O material informa a edição de 14 a 23 de maio de 2027. Cadastre essas datas como configuração da edição, sem espalhá-las como texto fixo pelos componentes.
Adote a paleta observada nos anexos: vinho/ameixa como cor estrutural, vermelho como destaque, taupe/cinza quente como apoio e branco/off-white nas áreas de trabalho.
Referências aproximadas extraídas das imagens: ameixa #593D4C, vermelho #C12528, taupe #898675 e branco próximo de #FBFDFC. Trate esses valores como ponto de partida visual, não como especificação oficial. Ajuste tons de interface para garantir contraste e leitura.
Use os elementos geométricos da marca de forma discreta, especialmente em login, identificação da edição e estados institucionais. Evite transformá-los em decoração repetida atrás de formulários e tabelas.
2. Tipografia e linguagem visual
Traduza a tipografia dos anexos em títulos sans-serif fortes, contemporâneos e bem proporcionados, combinados com texto funcional legível. Escolha uma família de interface coerente com essa linguagem; não declare reproduzir uma fonte oficial que não foi identificada.
Defina uma escala consistente para títulos de página, títulos de seção, nomes de empresas, valores, rótulos e informações auxiliares. Use números tabulares para valores, áreas, datas e contagens.
A hierarquia deve ser perceptível por tamanho, peso, alinhamento e espaçamento. Não dependa apenas de tons de cinza nem use textos minúsculos para acomodar informação.
Busque acabamento premium por organização e precisão: superfícies claras, divisórias discretas, cantos moderadamente arredondados e ícones consistentes. Evite glassmorphism, sombras pesadas, gradientes chamativos, excesso de badges e cards coloridos sem função.
Use princípios de frontend-design e web-design-guidelines, quando disponíveis, subordinados à identidade dos anexos.
3. Estrutura principal e sidebar
Implemente os dez menus nesta ordem e com estes nomes:
1. Dashboard
2. Mapa Comercial
3. Comercialização
4. Empresas / Expositores
5. Contratos
6. Vistorias
7. Financeiro Operacional
8. Agenda / Atividades
9. Documentos
10. Administração
Não acrescente menus principais sem necessidade. Ações e subdivisões devem ficar dentro do módulo correspondente.
A sidebar deve ter fundo vinho/ameixa escuro, logo claro no topo, ícones alinhados e textos legíveis. O item ativo deve apresentar superfície diferenciada e marcador vermelho lateral, inspirado no anexo.
Use ícones semanticamente coerentes: indicadores, localização, negociação, empresas, contrato, vistoria, valores, calendário, arquivos e configurações.
No rodapé, mostre o usuário autenticado, seu perfil e a ação de saída. O nome exibido no mockup é ilustrativo: não crie uma conta ou administrador fixo a partir dele.
No desktop, permita navegação lateral compacta sem comprometer a identificação dos menus. No celular, utilize uma gaveta acessível, com indicação clara do módulo atual.
O cabeçalho da área de trabalho deve ser compacto: contexto da edição, título, navegação local e ações pertinentes. Não repita grandes títulos ou a marca em várias áreas da mesma tela.
4. Arquitetura integrada de dados e navegação
Estruture uma base compartilhada para edição da feira, empresas/expositores, contatos, espaços, negociações, reservas, contratos, registros financeiros, vistorias, atividades e documentos.
Cada registro deve ter identidade estável. Empresas, espaços e contratos não podem ser recriados em cada módulo para representar a mesma informação.
Uma empresa pode participar de diferentes negociações e ocupar vários espaços. Uma negociação pode envolver vários espaços. Documentos, atividades e vistorias devem manter seus vínculos com os registros correspondentes.
Separe cadastros permanentes, como empresa e contatos, dos dados específicos de participação na edição.
Implemente navegação contextual nos dois sentidos: do expositor para seus espaços e contratos; do espaço para sua negociação; do contrato para condições financeiras e documentos; da vistoria para o espaço e o expositor.
Utilize uma camada consistente de serviços, validação e persistência. Evite consultas e regras duplicadas em cada página. Após uma alteração confirmada, atualize as visualizações dependentes sem exigir redigitação dos dados.
5. Dashboard
Crie uma visão operacional que responda rapidamente: como está a comercialização, o que está pendente e quais ações exigem atenção.
Apresente indicadores derivados dos registros existentes, como disponibilidade dos espaços, negociações em andamento, contratos por situação, compromissos próximos e vistorias pendentes. Exiba informações financeiras conforme a permissão do usuário.
Diferencie valores negociados, valores previstos e valores efetivamente recebidos. Cada indicador deve ter significado claro e permitir acessar a listagem correspondente.
Priorize poucos indicadores úteis e uma área de pendências acionáveis. Não preencha a tela com números fictícios ou gráficos sem relação com os módulos.
Use um cabeçalho discreto. O slogan da marca pode aparecer em contextos institucionais, mas não deve ocupar o espaço principal da operação diária.
6. Mapa Comercial
Implemente a estrutura para visualizar espaços, localização, metragem e situação comercial, com legenda, busca, filtros, seleção e detalhes contextuais.
Os anexos não fornecem uma planta oficial. Não invente estandes, posições, áreas ou preços como se fossem reais. Prepare a associação entre uma planta e os registros dos espaços; enquanto a planta não estiver cadastrada, apresente esse estado claramente e mantenha uma listagem utilizável.
Como solução inicial, priorize um mapa 2D interativo e responsivo, adequado à operação. Não introduza modelagem 3D sem referência ou necessidade definida.
A seleção de um espaço deve permitir consultar sua identificação, área, situação e vínculos comerciais. Para uma negociação com vários espaços, permita destacá-los em conjunto, sem representar áreas intermediárias como pertencentes à venda.
Disponibilidade deve refletir os registros comerciais. A seleção visual do mapa, por si só, não pode reservar ou vender um espaço.
7. Comercialização
Organize reservas, negociações e acompanhamento de vendas numa visão compacta, com filtros, busca e detalhes expansíveis ou painel contextual.
O fluxo básico deve permitir selecionar uma empresa, vincular um ou mais espaços, registrar responsável, condições, valores e situação da negociação.
Apresente as transições comerciais de maneira explícita e registre alterações relevantes. Não trate proposta, reserva, contrato assinado e pagamento como sinônimos.
Valide conflitos ao reservar ou vincular espaços, inclusive no servidor, para evitar duas operações incompatíveis sobre o mesmo espaço.
O vencimento de uma reserva e seus efeitos devem depender de uma política configurada. Não cancele negociações por uma regra presumida.
A partir do registro comercial, ofereça acesso aos espaços, ao expositor, ao contrato, às atividades e aos documentos relacionados.
8. Empresas / Expositores
Crie o cadastro central de empresas com nome/razão social, nome fantasia, documento quando aplicável, contatos e informações pertinentes à participação na feira.
Use nome fantasia como identificação preferencial nas visualizações operacionais, mantendo a razão social separada para documentos e identificação formal.
Organize a ficha com dados cadastrais, contatos, participações, negociações, espaços, contratos e documentos. O histórico deve resultar dos vínculos reais, sem duplicar registros.
Permita localizar empresas por nome, nome fantasia e identificadores autorizados. Evite duplicidades com validações apropriadas, sem considerar nomes semelhantes como prova de que duas empresas são a mesma.
9. Contratos
Estruture criação de rascunhos, organização, anexação, versões e acompanhamento dos contratos vinculados às negociações e aos espaços abrangidos.
Reutilize os dados cadastrais e comerciais para evitar redigitação. Antes de emitir um documento, apresente os dados e a abrangência para revisão.
Como os anexos não contêm um modelo contratual, disponibilize uma estrutura editável de rascunho ou configuração de modelo, sem inventar cláusulas e apresentá-las como juridicamente aprovadas.
Diferencie contrato em elaboração, documento emitido, arquivo anexado e assinatura registrada. Um upload não pode marcar automaticamente um contrato como assinado.
Preserve versões e histórico. Um contrato que abrange vários espaços deve manter essa relação explicitamente, sem cópias independentes e contraditórias do mesmo arquivo.
10. Vistorias
Implemente o fluxo de entrega e devolução dos espaços, conforme o escopo dos anexos.
Cada vistoria deve estar vinculada ao espaço, à edição e, quando aplicável, ao expositor e ao contrato. Registre tipo, data, responsável, condições observadas, fotos, observações e assinaturas ou aceites disponíveis no fluxo.
Utilize checklist configurável e permita comparar entrega e devolução. Pendências identificadas devem continuar vinculadas à vistoria e poder ser acompanhadas em atividades.
Projete essa experiência prioritariamente para uso em celular: campos claros, controles confortáveis e inclusão de fotos sem perder o preenchimento.
Diferencie aceite capturado no sistema de assinatura digital certificada. Não anuncie certificação ou integração com provedor que não foi implementada.
11. Financeiro Operacional
Estruture valores, parcelas, vencimentos, pagamentos registrados e pendências vinculadas à feira e aos contratos.
Separe total negociado, valor a receber, valor recebido e registros vencidos. Pagamento deve possuir situação própria e origem rastreável; não pode ser deduzido apenas da assinatura do contrato.
Permita registrar informações e comprovantes conforme o perfil autorizado. Alterações financeiras relevantes devem manter histórico.
Trabalhe com representação monetária precisa e arredondamento consistente. Evite somar o total do mesmo contrato várias vezes por ele abranger vários espaços.
O módulo é financeiro operacional. Não inclua, por suposição, contabilidade completa, emissão fiscal, integração bancária ou cobrança automática. A primeira estrutura deve funcionar com seus próprios registros, sem simular essas integrações como ativas.
12. Agenda / Atividades
Centralize prazos, reuniões, entregas e ações operacionais com título, responsável, data, situação e vínculo com o registro de origem.
Ofereça uma visualização temporal clara e uma lista objetiva de pendências. Atividades relacionadas a contratos, vistorias ou empresas devem permitir abrir diretamente o contexto correspondente.
Datas cadastradas nos módulos podem alimentar a agenda pelas mesmas informações, evitando que o usuário registre o prazo duas vezes.
Automatize apenas rotinas com regras explícitas. Não crie compromissos duplicados nem envie comunicações externas automaticamente.
13. Documentos
Crie uma central de documentos vinculada aos mesmos arquivos utilizados em contratos, vistorias, empresas e registros financeiros.
Permita pesquisar e filtrar por categoria, vínculo, data e responsável. Apresente nome, tipo, versão e contexto do arquivo.
Armazene cada documento de forma consistente e mantenha suas associações. A central não deve exigir que o usuário envie novamente um arquivo já anexado em outro módulo.
Utilize armazenamento privado e controle de acesso. Compartilhamento ou acesso externo deve ser uma ação explícita, não uma consequência de anexar um arquivo.
14. Administração
Organize usuários, perfis de acesso, configurações da edição e parâmetros operacionais.
Proponha perfis iniciais por responsabilidade, como administração, comercial, financeiro, operação/vistorias e consulta, mantendo as permissões configuráveis e claramente documentadas.
Controle ações de leitura, edição, confirmação e acesso a documentos também no servidor. Ocultar um botão não substitui autorização.
Registre histórico de ações relevantes. Não crie credenciais compartilhadas, senhas fixas ou um usuário administrador fictício como mecanismo de acesso ao sistema.
15. Fluxo operacional que deve conectar os módulos
Estabeleça o seguinte percurso inicial:
Cadastrar empresa e contatos → consultar espaços → registrar reserva ou negociação → preparar contrato → acompanhar valores e prazos → realizar vistoria de entrega → acompanhar atividades → realizar vistoria de devolução.
Esse percurso é uma proposta de organização para conectar o escopo dos anexos, não uma obrigação de executar todos os passos em uma sequência rígida. Permita trabalhar em atividades e documentos relacionados ao longo do processo, respeitando as condições de cada operação.
As alterações devem aparecer nos módulos correspondentes a partir da mesma fonte de dados. Não exija que o usuário atualize manualmente a dashboard, o mapa e o cadastro após registrar a mesma negociação.
16. Padrões de interação e responsividade
Crie componentes reutilizáveis para cabeçalhos, filtros, tabelas, cards compactos, painéis de detalhes, formulários, seleção de registros, anexos, estados e ações.
Use listas comparáveis no desktop e reorganização apropriada no celular. Não reduza uma tabela até torná-la ilegível e não dependa de passar o mouse para acessar funções essenciais.
Preserve filtros e posição de leitura ao abrir e fechar detalhes. Evite formulários longos permanentemente abertos acima das listagens.
Mantenha foco visível, navegação por teclado, contraste adequado, rótulos completos e estados claros de carregamento, vazio, erro, restrição de acesso e salvamento.
Em caso de falha, preserve o preenchimento e explique o que não foi salvo. Nunca informe sucesso somente porque a interface mudou localmente.
17. Base técnica e resultado da primeira entrega
Utilize a stack suportada pelo ambiente de desenvolvimento, com componentes tipados, separação entre apresentação e regras, validação consistente e persistência real para os fluxos implementados.
Organize rotas e componentes pelos dez módulos, reutilizando entidades e serviços compartilhados. Mantenha identificação da edição nos registros pertinentes e prepare a estrutura para continuidade sem duplicar o sistema a cada feira.
Se forem necessários dados de demonstração, mantenha-os claramente identificados e separados dos dados reais. Nenhum preço, área, contrato ou pagamento fictício deve ser apresentado como informação oficial da Indumóveis.
Não entregue dez páginas desconectadas ou apenas mensagens “Em breve”. Cada módulo deve possuir sua estrutura operacional básica, navegação contextual e ações coerentes com a base implementada. Recursos dependentes de informações ainda não fornecidas devem mostrar a pendência específica.
Conclua essa primeira estruturação em uma entrega integrada, sem fragmentar o trabalho em fases artificiais. Ao finalizar, apresente um resumo objetivo dos módulos, das conexões implementadas e das informações reais ainda necessárias, especialmente planta dos espaços, modelo contratual e políticas operacionais.
O resultado deve parecer um sistema criado para a Indumóveis: identidade reconhecível, sidebar fiel aos anexos, tipografia forte e uma operação conectada, na qual cada informação é cadastrada uma vez e utilizada corretamente em todo o fluxo. 18. Arquitetura técnica e conexão entre os módulos
Estruture o sistema para suportar hooks reutilizáveis, serviços de domínio, APIs/RPCs, Edge Functions e eventos de integração, escolhendo cada mecanismo conforme sua responsabilidade. A arquitetura deve conectar os dez módulos por contratos de dados consistentes, sem duplicar regras ou criar caminhos paralelos para a mesma operação.
Separe claramente:
- Componentes de interface: apresentação e interação
- Hooks: consultas, mutações, estados de carregamento e sincronização da interface
- Serviços de domínio: operações e regras compartilhadas
- Backend: autorização, validação, transações e persistência
- Edge Functions: processamento no servidor, integrações externas e operações que exigem proteção de credenciais
Hooks não devem se tornar uma segunda fonte de dados nem concentrar regras críticas apenas no navegador. Centralize o acesso aos dados e padronize filtros, paginação, tratamento de erros e atualização das consultas dependentes.
Utilize operações transacionais para mudanças que precisam ocorrer juntas, como vincular espaços a uma negociação ou registrar relações entre contrato e condições comerciais. Uma sequência de chamadas independentes não deve deixar a operação parcialmente concluída sem recuperação.
Prepare Edge Functions com autenticação, validação de entrada, autorização por perfil e escopo da edição, tratamento de falhas e respostas estruturadas. Mantenha segredos exclusivamente no servidor. Não crie uma Edge Function para cada ação simples: reutilize os mecanismos nativos de consulta e persistência quando forem suficientes.
Após uma gravação confirmada, atualize os módulos relacionados por invalidação de consultas, eventos ou assinaturas em tempo real quando necessárias. A dashboard, o mapa e os detalhes devem refletir a mesma informação persistida, sem exigir cadastros repetidos ou atualização manual de cada tela.
Para tarefas demoradas, utilize processamento assíncrono com estado consultável, limites de execução, tentativas controladas e recuperação. Operações sujeitas a reenvio devem ser idempotentes, evitando duplicação de reservas, documentos ou registros financeiros. Se forem necessários webhooks, valide sua autenticidade e trate eventos repetidos ou fora de ordem.
Não trate eventos ou mensagens assíncronas como substitutos de transações que exigem consistência imediata. Defina o que precisa ser concluído atomicamente e o que pode ser atualizado posteriormente, com indicação clara de pendência.
Padronize identificadores, tipos, esquemas de validação, contratos de resposta e rastreamento de operações. Registre erros técnicos e histórico de alterações sem expor credenciais ou dados sensíveis nos logs.
Implemente as conexões necessárias ao escopo inicial e deixe pontos de extensão claros para funcionalidades futuras. Não construa infraestrutura especulativa nem apresente integrações externas como disponíveis antes de configuradas.
O resultado deve ser uma arquitetura modular e evolutiva: interface simples para o usuário, regras consistentes no backend e comunicação confiável entre comercialização, contratos, vistorias, financeiro, agenda e documentos.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://indumoveis-connect.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/188cb605-7a42-42a0-9e75-28f5097e9433).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
