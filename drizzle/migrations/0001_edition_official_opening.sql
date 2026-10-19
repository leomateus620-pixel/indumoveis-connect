-- Abertura oficial da Indumóveis 2027: 14/05/2027 às 10h, America/Sao_Paulo (2027-05-14T10:00:00-03:00).
-- A edição é a única fonte do contador do portal; apenas o horário é gravado, datas e demais dados ficam intactos.
alter table public.editions add column if not exists opening_time time without time zone;

update public.editions
set opening_time = '10:00:00'
where year = 2027
  and starts_on = '2027-05-14'
  and timezone = 'America/Sao_Paulo';

comment on column public.editions.opening_time is
  'Horário oficial de abertura no dia starts_on, no fuso da edição.';
