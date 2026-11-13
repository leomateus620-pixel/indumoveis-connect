# Evolução comercial — Indumóveis 2027

A rota `/dashboard-comercial` tem visão geral, recortes por pavilhão/segmento e
detalhamento de lotes. Carrega como rota própria; não inicializa o WebGL nem
solicita modelos, texturas ou controles do mapa. Os marcadores do parque e a
dashboard leem a mesma consulta `get_commercial_overview`, pelo cache de
`src/lib/api.ts`. Detalhes do mapa, das plantas e da dashboard leem a mesma
projeção de lotes, vinculada por edição e ID persistente. As mutações oficiais
invalidam essas consultas pelo `useDbMutation`.

## Edição, documentos e inventário

O projeto Indumóveis Connect foi conferido pelo conector Lovable e comparado
com a ponta do repositório. A edição de destino é a ativa Indumóveis 2027,
de 14 a 23 de maio, com fuso America/Sao_Paulo. A política guarda o nome e
SHA-256 do PDF de 26/05/2025. As tabelas de módulos e o PDF do parque também
têm origem rastreável. Os nomes impressos servem apenas à conciliação
documental; nenhuma ocupação, empresa ou negociação é criada a partir deles.

- **P12:** 254 módulos distintos, 848 m² e R$ 228.960,00 de potencial bruto.
  Área total da planta: 1.650 m².
- **P8:** sete lotes preservados. Para os seis com área, os módulos 1–6 do
  documento correspondem aos códigos 01, 03, 04, 05, 06 e 07. São 394,70 m² e
  R$ 114.463,00 conhecidos. O lote 08 permanece sem área e preço.
  Área total da planta: 937,32 m².
- **P13:** 80 módulos; 78 confirmados somam 352 m² e R$ 158.400,00. A linha
  impressa 34–37 repete 34–35; a hipótese 36–37, 6 m² cada, está registrada
  como pendente. Os 364 m² e R$ 163.800,00 são condicionais à confirmação.
  Área total da planta: 850,50 m².
- **P1:** os 14 espaços comerciais e suas áreas foram preservados.
  Sem preço de tabela. P3 e P14 têm regra de referência e nenhum lote criado.
- **Exterior:** 68 lotes individuais, dos quais 52 de indústria, comércio e
  serviços (11.212 m²) e 16 do Salão do Automóvel (3.632 m²). Os códigos comerciais `EXT-01` a
  `EXT-68` têm UUID por edição e vínculo com a geometria individual. As
  referências do contorno original ficam na evidência. Os antigos 69 e 70
  permanecem fora do estoque. O Salão do Automóvel não recebe tarifa.

O subtotal de tabela dos 44 lotes externos com tarifa confirmada é
R$ 174.746,00. Oito lotes comerciais continuam sem preço até a validação da
esquina: 09–10, 35–38 e 41–42. Nos antigos contornos que tocavam duas vias,
a subdivisão visual não é, por si só, evidência cadastral de que um membro
específico seja de esquina.

Nos lotes externos a metragem é a medida nominal declarada para o módulo da
quadra (203 ou 227 m²), com a anotação individual de 243 m² nos lotes 14 e
28. A medida de 227 m² do lote 57 foi confirmada expressamente pelo usuário
em 13/11/2026, em complemento à planta, que não a imprime nesse lote.
Divisas reconstruídas dentro dos antigos contornos compartilhados são
descritas no registro geométrico; áreas comerciais não são extraídas de
pixels, coordenadas ou do contorno reconstruído.

As revisões publicadas de P8, P12 e P13 ganharam sucessoras com as áreas
comerciais. As partes vetoriais, identidades e revisões anteriores foram
preservadas. A auditoria registra grupo, módulos documentais, área conjunta,
divisão e validação; geometria e área total do edifício são independentes.

## Preços, valores e permissões

O bruto de tabela é `round(area_m2 * tarifa_em_centavos)` no PostgreSQL
(`numeric`, centavo mais próximo; empate arredondado para cima para valores
positivos). A tarifa de esquina substitui a regular; área ou esquina não
validada impede o preço definitivo. A revisão de esquina exige escrita em
Mapa e Comercial, evidência e revisão anterior esperada.

O preço negociado por lote continua no fluxo existente. O vendedor pode
copiar explicitamente o valor de tabela para um campo de negociação e
editar o valor acordado. No contrato, as condições da política são
registradas separadamente e com histórico. Pode-se escolher uma modalidade
de desconto com evidência; pontualidade é condição, não recebimento.
Administração/limpeza interna, administração/limpeza externa, PPCI externo e
alvará provisório são quatro itens distintos. Cada taxa é registrada uma
vez por contrato e expositor. Contratos mistos exigem justificativa de
incidência. Nenhuma taxa ou desconto é lançado automaticamente no valor
negociado. Novos contratos vinculados à política respeitam o limite de 18
parcelas e o último vencimento em 30/03/2027, dentro do calendário corrente
da edição. Contratos e pagamentos anteriores não são recalculados.

O total vendido é o número de lotes com situação `vendido` em
`space_status_v`, decorrente da assinatura registrada pelo fluxo oficial.
O denominador são os lotes comerciais do recorte, inclusive os bloqueados;
sem estoque, o percentual é ausente. Área vendida e valor contratado são
outras métricas. Lotes sem preço não contam como R$ 0,00. A área e o preço
conhecidos apresentam cobertura explícita. Um contrato ou negociação de
vários segmentos entra uma vez na visão geral; o total integral é omitido
nos recortes mistos, sem ratear taxas e pagamentos por aproximação.

A leitura de estoque comercial exige Mapa e Comercial. O banco omite
valores financeiros sem Financeiro, valores de contrato sem Contratos e
nomes sem Empresas. As tabelas auxiliares e views internas não são
consultáveis diretamente pelo cliente. Os eventos são transições reais de
assinatura e cancelamento, agregados por lote, direção e data civil da
edição. Recebimentos de contratos cancelados são preservados.

## Verificação reproduzível

Execute `scripts/verify-commercial-pricing.sql` e
`scripts/verify-commercial-analytics.sql` como administrador do banco.
Os cenários de teste usam uma transação com rollback e verificam inventário
por edição, tarifas, preservação do histórico, bloqueio de acesso, assinatura,
cancelamento, recebimentos e reabertura. As migrações estão em
`supabase/migrations/20261113*_commercial_*.sql`.

A comparação de polígonos valida conservação de contornos e individualização,
e a checagem de recursos da rota valida a ausência de arquivos da cena 3D.
Os testes de navegação e de viewport usam dados de demonstração separados do
banco da edição.

## Aplicação e resultado no Lovable

A aplicação usou a operação direta `query_database` no Supabase conectado.
Os seis primeiros arquivos foram aplicados em uma transação e o leitor de
revisões de esquina em outra. Os textos integrais foram registrados no
histórico do Supabase, com hash conferido contra cada arquivo local.

| Versão | Migração |
| --- | --- |
| 20261113080000 | Domínio comercial |
| 20261113081000 | Política e áreas internas 2027 |
| 20261113082000 | Evidência externa |
| 20261113082500 | Identidade e inventário externo |
| 20261113083000 | Termos de contrato e parcelamento |
| 20261113123000 | Consultas de análise comercial |
| 20261113124000 | Evidência e histórico de revisão de esquina |

A conferência após aplicação contou **423 espaços comerciais distintos**,
com acréscimo de exatamente 68 espaços externos. As assinaturas de verificação
do P1, dos campos anteriores dos espaços, das revisões publicadas anteriores,
dos contratos e dos pagamentos permaneceram iguais. As verificações
transacionais não deixaram registros de teste.

Uma amostra de `EXPLAIN ANALYZE` com 423 espaços retornou aproximadamente
43 ms para o resumo, 83 ms para o detalhamento geral e 47 ms para os lotes do
P12. São tempos no banco, sem latência de rede, e não representam um teste de
carga. A resposta JSON do resumo, compartilhada com o mapa, tem cerca de
3,9 kB antes de compressão.
