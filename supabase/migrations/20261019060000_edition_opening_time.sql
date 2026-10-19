-- Horário oficial de abertura da edição (hora civil no fuso `timezone`, no dia `starts_on`).
-- Nulo enquanto não confirmado: o portal exibe "Data de abertura a confirmar" sem inventar horário.
alter table public.editions add column if not exists opening_time time without time zone;

comment on column public.editions.opening_time is
  'Horário oficial de abertura no dia starts_on, no fuso da edição. Nulo = a confirmar.';
