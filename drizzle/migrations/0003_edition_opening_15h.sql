-- Retificação oficial: 14/05/2027 às 15h no horário de Brasília.
-- Referência do instante: 2027-05-14T15:00:00-03:00.
-- Corrige a configuração persistida usada tanto no cálculo quanto no texto do portal.
-- A seleção da edição no cliente continua sendo determinada por editions.is_active.
update public.editions
set opening_time = '15:00:00'
where year = 2027
  and starts_on = '2027-05-14'
  and timezone = 'America/Sao_Paulo';
