# Empresas e participações por edição

A empresa é um cadastro global. A participação mantém o retrato cadastral de uma
edição, e cada ocupação conserva separadamente a área, os códigos dos módulos e a
metragem total informada. A participação histórica não gera negócios, espaços,
contratos, parcelas ou pagamentos.

## Execução no ambiente real

A migração e a importação foram executadas em 28/10/2026 pela conexão Lovable da
conta Indumoveis. O vínculo com `leomateus620-pixel/indumoveis-connect` foi
confirmado pela configuração do projeto e pelo commit `661bcde` do repositório.

| Identificação técnica | Valor verificado |
| --- | --- |
| Projeto Lovable | `188cb605-7a42-42a0-9e75-28f5097e9433` |
| Banco vinculado | `vxindnnsptxerukhyhek` |
| Migração do histórico aplicada | `20261028120000_company_edition_history` |
| Migração de concorrência de contatos aplicada | `20261028121000_company_contact_version` |
| Migração de compatibilidade do cadastro publicado aplicada | `20261028122000_company_legacy_write_compatibility` |
| Lote aplicado | `20c77381-a2fd-4101-8a21-ef5131360f09` |
| Edição histórica 2025 | `d2659211-20d6-487b-ba36-77e28d5df3f3` |
| Edição ativa 2027 preservada | `49af7d79-9bef-4981-9ecd-ddf64928036e` |

A edição 2025 está inativa, com datas de início e término nulas. A edição 2027
continuou ativa, sem participantes, negociações ou contratos fictícios. O cadastro
e o reaproveitamento estão disponíveis na nova interface. Não foram criadas datas
oficiais para completar o histórico. O catálogo comercial de espaços permanece
vazio, como encontrado no ambiente: os 632 identificadores históricos não foram
convertidos em espaços físicos de 2027. Reaproveitar códigos de ocupação depende
de correspondência com esse catálogo e é validado no servidor.

| Controle persistido | Resultado verificado |
| --- | ---: |
| Empresas | 107 |
| Participações de 2025 | 107 |
| Ocupações | 111 |
| Identificadores de módulos | 632 |
| Soma da área informada | 9.591,97 |
| Participações com uma ocupação | 103 |
| Participações com duas ocupações | 4 |
| Linhas bloqueadas | 0 |
| Linhas com conflitos de conciliação | 0 |
| Contatos de representante criados | 0 |
| Representantes ausentes preservados | 111 |
| Celulares ausentes preservados | 15 |
| E-mails ausentes preservados | 91 |

Os contatos gerais disponíveis foram preservados nos dados da empresa e no
retrato histórico. Nenhum registro de representante foi criado porque a origem
não informa nomes nessa coluna. As 23 recuperações de zeros iniciais continuaram
rastreáveis nos registros técnicos da preparação.

A preparação no banco e a aplicação foram executadas novamente com o mesmo
arquivo. As contagens e os hashes de empresas, contatos, participações, ocupações
e retratos históricos foram idênticos antes e depois da reexecução. A comparação
individual das 111 ocupações confirmou zero listas de módulos, rótulos de área ou
metragens alteradas, zero ocupações perdidas e zero representantes ou endereços
completos inventados.

O teste SQL `company_2025_reuse_persisted_pass`, executado no banco real dentro de
uma transação revertida ao final, comprovou o reaproveitamento da empresa em 2027,
a atualização de localização e contato e a preservação do retrato de 2025. A
operação não criou reservas ou vendas. A reversão removeu apenas os efeitos do
teste; os registros históricos importados permaneceram persistidos.

A migração complementar de contatos também foi aplicada pela conexão Lovable,
com registro confirmado no histórico de migrações do banco. O trigger atualiza o
`updated_at` usado para concorrência da empresa quando um contato é alterado
isoladamente, impedindo que um formulário aberto com dados anteriores sobrescreva
a alteração. O teste `company_contact_version_pass` passou antes e depois da
aplicação e confirmou que o histórico de 2025 permaneceu inalterado.

A terceira migração mantém o cadastro global do frontend atualmente publicado
operacional durante a revisão da PR. Concede somente INSERT/UPDATE das colunas
cadastrais legadas, sob a RLS existente; normaliza e verifica documentos no
servidor, rejeita duplicatas e força a autoria do próprio usuário. Participações
e ocupações continuam sendo gravadas exclusivamente pelas operações atômicas.
Não há criação implícita de participação nem reservas. O teste transacional
`company_legacy_write_compatibility_pass` passou antes e depois da aplicação,
incluindo usuário de consulta sem permissão de escrita. A regressão SQL completa
`company_edition_history_regressions_pass` também passou após essa migração.
O seletor de reaproveitamento inclui Cadastro geral para localizar também
empresas criadas pelo frontend anterior sem participação em uma edição.

Os resultados das consultas e da comparação de reexecução estão preservados
localmente em `artifacts/import-2025.local/persisted-evidence.json`, fora do Git.
Este relatório contém apenas metadados técnicos e contagens agregadas.

## Validação da implementação e da interface

| Verificação | Resultado |
| --- | --- |
| Testes Vitest | 342 aprovados em 54 arquivos |
| Testes Python do importador | 12 aprovados |
| TypeScript (`tsc --noEmit`) | Aprovado |
| Build de produção | Aprovado |
| ESLint dos arquivos TS/TSX de implementação alterados | Aprovado |

A interface foi verificada com os 107 cadastros reais em desktop de
`1440 × 1000` e mobile de `390 × 844`. Os cards recolhidos mantiveram altura uniforme
de 186 px, sem transbordamento horizontal nas duas resoluções. O cabeçalho com
controles integrados ocupou 164 px no desktop e 230 px no mobile. Foram conferidos
expansão por teclado, `aria-expanded`, busca sem acentos, filtro por área, seleção
2025/2027, abertura da ficha e retorno preservando edição e expansão, criação manual
e conferência dos dados e ocupações no reaproveitamento. Os anexos usam a edição
da ficha tanto na pesquisa como no envio. As capturas e
evidências visuais estão em `artifacts/company-qa.local/`, fora do repositório
público por conterem dados reais.

O lint global foi comparado com uma extração independente de `HEAD` (`661bcde`)
feita por `git archive` em diretório temporário, usando as mesmas dependências e
ignorando `**/*.local/**`, `.nitro/**` e `.tanstack/**` nas duas execuções:

| Execução do ESLint global | Erros | Avisos |
| --- | ---: | ---: |
| Base `661bcde` | 1.583 | 12 |
| Implementação atual | 1.577 | 12 |

Todos os erros das duas execuções são da regra `prettier/prettier`. A única
diferença por arquivo está em `src/integrations/supabase/types.ts`: 1.390 na base e
1.384 no schema ampliado. A formatação foi corrigida somente nas linhas e nos
blocos introduzidos pela alteração, sem reformatar o restante do arquivo gerado e
sem desativar regras no código. Nenhum novo apontamento foi acrescentado; seis
apontamentos anteriores nas linhas de datas modificadas também foram resolvidos.
Os demais apontamentos e os 12 avisos são idênticos aos da base. O lint global
continua reprovado por formatação preexistente; não é apresentado como uma
verificação aprovada. O TypeScript foi executado novamente após esse ajuste e
passou.

## Preparação de 2025

O conteúdo real do arquivo foi identificado como Excel OOXML, embora o nome
termine em `.xls`. O importador lê as células do pacote OOXML sem converter o
arquivo e conserva o tipo, o valor original, a linha e os campos ausentes. A
planilha permanece inalterada.

```sh
python3 scripts/import_companies_2025.py \
  '/caminho/Expositores Indumóveis 2025 - Sistema Novo.xls'
python3 -m unittest discover -s scripts -p 'import*_test.py' -v
```

O comando usa somente a biblioteca padrão do Python. A saída padrão é
`artifacts/import-2025.local/`, já excluída do Git. Os arquivos com dados de clientes
recebem permissões locais `0600`. Não copie o conteúdo desses arquivos para a PR,
fixtures públicas ou logs de CI.

Arquivos locais produzidos:

- `stage-company-import.json`: argumentos completos de `stage_company_import`.
- `stage-company-import.sql`: chamada SQL equivalente com todas as linhas.
- `reconciliation.json`: controles e divergências da preparação, sem afirmar
  persistência no banco.

O processo retorna código diferente de zero se os controles divergirem, mantendo
todas as linhas preparadas para inspeção. A única linha desconsiderada no arquivo
analisado foi a linha 113, completamente vazia e com formatação residual. Cabeçalho
na linha 1; registros nas linhas 2 a 112.

## Controles reconciliados na origem

SHA-256: `65c45671d2aa424d075f800681faf8981e059a392c59a5388005c34abc95ef4a`.

| Controle | Resultado |
| --- | ---: |
| Linhas de ocupação | 111 |
| Documentos originais distintos | 107 |
| Grupos após normalização validada | 107 |
| Grupos com duas ocupações | 4 |
| Identificadores de módulos listados | 632 |
| Soma decimal da área informada | 9.591,97 |
| Linhas sem representante | 111 |
| Linhas sem celular | 15 |
| Linhas sem e-mail | 91 |
| Linhas com documento válido sem reposição de zeros | 88 |
| Linhas com zeros iniciais recuperados por validação única | 23 |
| Linhas com documento ambíguo ou inválido | 0 |

Os 632 itens são identificadores registrados, não uma contagem comprovada de
espaços físicos distintos. A área de cada linha é o total informado daquela
ocupação: não é multiplicada pela quantidade nem distribuída entre os módulos.

Dos registros, 107 linhas foram identificadas como CNPJ e quatro como CPF. Zeros
são recuperados somente quando a célula era numérica e existe exatamente um
candidato CPF/CNPJ com ambos os dígitos verificadores válidos. O valor original
continua registrado. Documentos inválidos ou ambíguos em outros arquivos permanecem
marcados para revisão; o programa não completa indiscriminadamente 14 dígitos.

As quatro empresas repetidas conservam duas ocupações cada, nas linhas `[2,3]`,
`[93,94]`, `[101,102]` e `[110,111]`. Seus retratos cadastrais são consistentes entre
as linhas. Nenhum agrupamento utiliza nome fantasia como chave.

| Rótulo de área preservado | Ocupações |
| --- | ---: |
| AREA EXTERNA | 23 |
| MOSTRA  ARQ&DESIGN | 15 |
| PAVILHÃO 03 | 9 |
| PAVILHÃO 08 | 6 |
| PAVILHÃO 12 | 18 |
| PAVILHÃO 13 | 16 |
| PAVILHÃO 14 | 22 |
| SUPRIMENTOS | 1 |
| ÁREA EXTERNA ESPECIAL | 1 |

Logradouro, número, bairro e CEP não constam na origem e permanecem ausentes.
Município e UF não são convertidos em endereço completo. Nenhum representante é
inventado para criar contatos.

## Procedimento de nova execução e comprovação

A preparação offline não aplica migrações nem escreve no banco. Antes de aplicar,
confirme no conector Lovable o projeto, o banco e a branch vinculados ao
`leomateus620-pixel/indumoveis-connect`. A execução exige as operações de banco
efetivamente oferecidas por essa conexão e a permissão administrativa exigida
pelas funções SQL; um token público de cliente não substitui essas permissões.

Depois da migração, execute a chamada preparada `stage_company_import` e retenha
o identificador do lote retornado. Aplique `apply_company_import` com esse lote e
a edição 2025. Execute uma segunda vez o mesmo arquivo e a mesma aplicação e
compare as contagens persistidas. O lote e a linha de origem identificam as
ocupações; a repetição não deve criar novas empresas, participações, contatos ou
ocupações.

Após executar `stage-company-import.sql` na conexão autorizada, a aplicação do
lote preparado pode ser feita com a seguinte chamada:

```sql
select public.apply_company_import(id, 2025)
from public.company_import_batches
where file_sha256 = '65c45671d2aa424d075f800681faf8981e059a392c59a5388005c34abc95ef4a';
```

O arquivo `scripts/import_companies_2025_verify.sql` contém as consultas de
prévia, reconciliação, fidelidade de cada linha e comparação de contagens e hashes
antes e depois da reexecução. A consulta 1 deve ser executada entre a preparação
no banco e a primeira aplicação. As demais verificam a persistência. A consulta 5
deve ser repetida após a segunda aplicação, preservando o primeiro resultado para
comparação. O hash dos retratos históricos também serve para conferir preservação
de 2025 após a atualização de dados gerais usados em 2027.

A aprovação final deve comparar no banco os controles de 111 ocupações, 107 grupos
de documento, 632 identificadores e 9.591,97 de área, além dos quatro grupos com
múltiplas ocupações e dos campos ausentes. A quantidade de empresas **criadas** pode
ser menor que 107 quando documentos já existentes forem conciliados. Consulte
também os conflitos identificados antes de qualquer atualização de dados atuais.

Registre separadamente o identificador da edição, o lote, o resultado da aplicação,
as contagens verificadas e a reexecução. Verifique que `editions.is_active` não foi
alterado e que os retratos de 2025 continuam iguais após uma alteração controlada
do cadastro usado em 2027. Dados pessoais e evidências de produção devem permanecer
em registros técnicos privados.

O registro da execução real acima resulta das respostas e consultas verificadas
na conexão do projeto. A preparação offline continua sendo uma etapa separada:
gerar novamente os arquivos locais não executa uma nova gravação no banco.
