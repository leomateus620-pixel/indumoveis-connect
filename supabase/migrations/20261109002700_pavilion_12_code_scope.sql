-- Add canonical unpadded Pavilhão 12 codes to the revisioned interior domain.
begin;

alter table public.pavilion_environments
  drop constraint if exists pavilion_commercial_code_scope;
alter table public.pavilion_environments
  add constraint pavilion_commercial_code_scope check (
    kind <> 'commercial' or
    (pavilion_number = 1 and code ~ '^(0[1-9]|1[0-4])$') or
    (pavilion_number = 8 and code in ('01','03','04','05','06','07','08')) or
    (pavilion_number = 12 and code ~ '^([1-9][0-9]?|1[0-9]{2}|2[0-4][0-9]|25[0-4])$') or
    (pavilion_number = 13 and code ~ '^(0[1-9]|[1-7][0-9]|80)$')
  );

commit;
