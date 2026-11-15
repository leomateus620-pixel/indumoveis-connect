# Pavilhão 3 — interior e estoque individual

O Pavilhão 3 tem uma rota própria (`/mapa/pavilhoes/3/interior?lote=104`), acessível
pelo botão **Acesso Interno** do parque e pela passagem esquerda do Pavilhão 13.
A passagem direita do P3 abre o interior do P13. O retorno preserva o contexto
do parque por edição e pavilhão, incluindo câmera e filtros existentes.

São 142 lotes individuais, numerados de 1 a 142. A navegação oferece pesquisa,
diretório por setor, pan, zoom, pinça, ajuste à tela, seleção por toque e teclado,
e localização aproximada do lote. As setas percorrem os lotes pela posição física,
com um único ponto de entrada por Tab. A experiência usa revestimento mineral,
parede em relevo, corredores e sinalização, com apresentação própria e adaptação
para celular. Não há renderer 3D do parque montado na rota interna.

## Fontes e conciliação

| Fonte fornecida                                                                            | SHA-256                                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `Pav 3 - 06 - 23.09.2026 (1).pdf`, página 1                                                | `b7afd7a651d95b666ed16d004a15a5bf225dd1d1809fb2d436e62e05ac8bcb12` |
| `WhatsApp Image 2026-11-11 at 16.57.56 (1).jpeg`, coluna M²                                | `c89a93a192ebdfad305a9539242425187570b08fe32c2bec14b0d913d15bfb64` |
| `Política de Locação de Espaço - 2027 (10ª edição) - nova identidade (1).pdf`, páginas 2–3 | `a88df5c19bafc242704e58eb1b46bb7c721254573a52a63b2e5e777028734b5c` |

Os 21 grupos da tabela cobrem exatamente os 142 códigos, sem repetição ou lacuna.
Cada área de grupo dividida pela quantidade de módulos resulta em **5 m² por lote**.
Os trechos cortados na imagem (39–41 / 102–104 e 62–66 / 77–81) foram completados
pela numeração explícita da planta. A coluna “M² fechado” e os nomes de empresas
não são usados como disponibilidade, contratos ou vínculos comerciais.

| Medida                                  |         Valor |
| --------------------------------------- | ------------: |
| Área total do pavilhão, conforme planta |      1.155 m² |
| Área comercial, soma dos 142 lotes      |        710 m² |
| Área individual                         |          5 m² |
| Tarifa da política vigente              |  R$ 265,00/m² |
| Valor bruto por lote                    |   R$ 1.325,00 |
| Valor bruto total de tabela             | R$ 188.150,00 |

Os descontos de 10% não cumulativos, suas condições e a taxa interna de R$ 300
por contrato/expositor continuam nas regras comerciais existentes. Não há taxa
de limpeza multiplicada por lote nem desconto incorporado ao preço bruto.
As metragens são documentais; a área dos polígonos nunca é convertida em metros.
[Evidência dos grupos](area-evidence.json) e [relação individual](lots.csv).

## Geometria e limites

O gerador `scripts/pavilion-interior/build-pavilion-3.py` verifica o hash e os
533 desenhos do PDF. Extrai os retângulos laterais, reconcilia pequenas diferenças
de borda (até 0,6 ponto) e desmembra os grupos pela sequência documental.
A ilha central usa bordas compartilhadas a partir de quatro intervalos ancorados
na fonte. O perímetro e os acessos foram traçados sobre as coordenadas verificadas.
As unidades locais são pontos do desenho; a planta não constitui levantamento
as-built ou modelo métrico para montagem de estandes.

| Face, de cima para baixo | Sequência |
| ------------------------ | --------- |
| Lateral oeste            | 38 → 1    |
| Ilha central, oeste      | 39 → 71   |
| Ilha central, leste      | 104 → 72  |
| Lateral leste, fundos    | 105 → 124 |
| Lateral leste, entrada   | 125 → 142 |

Os blocos 39–41/102–104, 62–66/77–81 e 67–76 são divididos em duas faces.
A passagem entre 124 e 125 fica aberta. A área de apoio superior esquerda,
circulação, entradas e fundos não criam estoque vendável.

## Banco aplicado e arquitetura

A migração `20261115150000_pavilion_3_interior.sql` foi aplicada diretamente com
`Lovable.query_database` no projeto Indumóveis Connect
`188cb605-7a42-42a0-9e75-28f5097e9433`, após confirmar o banco habilitado.
Não houve envio ao chat do Lovable. O histórico de migrações foi registrado na
mesma transação. A PR entrega o código da interface; a aplicação no banco já ocorreu.

A carga resolve a edição ativa, verifica o hash da política existente e a tarifa,
amplia o domínio de códigos apenas para P3 e cria uma revisão imutável. Cada lote
tem identidade, UUID de estoque, polígono e vínculo documental próprios. A rotina
recusa identidades ambíguas, áreas anteriores divergentes e estoque de demonstração.
A reexecução não duplica registros. Não foram importadas empresas ou negociações.

Todos os dados da interface continuam passando pelos hooks de `src/lib/api.ts`.
Os RPCs existentes alimentam mapa, dashboard e comercialização com o mesmo estoque.
Preços obedecem às permissões financeiras existentes; situação comercial continua
derivada das negociações. Não foram criadas funções paralelas de venda nem alteradas
as regras de RLS. Os hashes de revisão e estoque de P1, P8, P12 e P13 foram iguais
antes e depois da aplicação, conforme [registro do banco](../validation/pavilion-3/database.json).

## Verificação

- 645 testes passaram na suíte completa; os novos testes cobrem numeração, áreas,
  ausência de sobreposição, passagens, navegação espacial, seleção, busca e preços.
- Shapely confirmou 142 polígonos válidos sem sobreposição de área.
- TypeScript, build de produção e lint dos arquivos alterados verificados.
- Ensaio transacional antes da aplicação; reexecução após aplicação com rollback.
  `scripts/verify-pavilion-3.sql` verifica os RPCs, a cotação independente de 39 e
  104, bloqueio de estoque, imutabilidade e ausência de preços para não administradores.
- Navegador com fixtures locais em 1440×1000 e 390×844: links diretos, recarga,
  busca do lote 142, zoom, passagem P3 ↔ P13 e parque ↔ P3. A seleção comercial
  individual de 39 e 104 soma 10 m² e R$ 2.650,00.

As verificações do navegador usam dados interceptados, sem login ou gravação em
produção. O banco real foi verificado separadamente pelo conector. Não foi usado
aparelho móvel físico. Capturas e relatório estão em
[`docs/validation/pavilion-3`](../validation/pavilion-3/).
