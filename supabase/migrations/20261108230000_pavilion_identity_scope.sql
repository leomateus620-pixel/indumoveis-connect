-- Extend the revisioned interior domain to Pavilhão 13 without changing Pavilhão 1.
begin;
alter table public.pavilion_environments drop constraint if exists pavilion_environments_check1;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.pavilion_environments'::regclass and conname='pavilion_commercial_code_scope') then
    alter table public.pavilion_environments add constraint pavilion_commercial_code_scope check(
      kind<>'commercial' or
      (pavilion_number=1 and code ~ '^(0[1-9]|1[0-4])$') or
      (pavilion_number=13 and code ~ '^(0[1-9]|[1-7][0-9]|80)$')
    );
  end if;
end $$;

-- Composite edition FKs already prevent crossing editions. These guards also
-- reject a valid identity from another pavilion within the same edition.
create or replace function public.guard_pavilion_identity_scope()
returns trigger language plpgsql set search_path=public as $$
declare plan_pavilion integer; environment_pavilion integer;
begin
  if TG_TABLE_NAME='pavilion_plan_revisions' then
    select pavilion_number into plan_pavilion from public.floor_plans where id=NEW.floor_plan_id and edition_id=NEW.edition_id;
    if plan_pavilion is distinct from NEW.pavilion_number then raise exception 'A revisão e a planta devem pertencer ao mesmo pavilhão.'; end if;
  elsif TG_TABLE_NAME='pavilion_environment_revisions' then
    select pavilion_number into plan_pavilion from public.pavilion_plan_revisions where id=NEW.revision_id and edition_id=NEW.edition_id;
    select pavilion_number into environment_pavilion from public.pavilion_environments where id=NEW.environment_id and edition_id=NEW.edition_id;
    if plan_pavilion is not null and environment_pavilion is not null and plan_pavilion<>environment_pavilion then
      raise exception 'O ambiente e a revisão devem pertencer ao mesmo pavilhão.';
    end if;
  elsif NEW.space_id is not null then
    select f.pavilion_number into plan_pavilion from public.spaces s join public.floor_plans f on f.id=s.floor_plan_id and f.edition_id=s.edition_id where s.id=NEW.space_id and s.edition_id=NEW.edition_id;
    if plan_pavilion is not null and plan_pavilion<>NEW.pavilion_number then raise exception 'O ambiente e o estoque devem pertencer ao mesmo pavilhão.'; end if;
  end if;
  return NEW;
end $$;
do $$ declare t text; begin
  foreach t in array array['pavilion_plan_revisions','pavilion_environment_revisions','pavilion_environments'] loop
    execute format('drop trigger if exists pavilion_identity_scope on public.%I',t);
    execute format('create trigger pavilion_identity_scope before insert or update on public.%I for each row execute function public.guard_pavilion_identity_scope()',t);
  end loop;
end $$;

-- Retain the three-argument caller contract through a default pavilion=1.
-- There is one signature only, so PostgREST never resolves ambiguous overloads.
drop function if exists public.get_pavilion_interior_commercial(uuid,uuid,integer);
create or replace function public.get_pavilion_interior_commercial(p_edition_id uuid,p_floor_plan_id uuid,p_revision integer,p_pavilion_number integer default 1)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb;
begin
  if not public.can_read('mapa') or not public.can_read('comercial') then
    raise exception 'Sem permissão para consultar informações comerciais.' using errcode='42501'; end if;
  if not exists(select 1 from public.editions where id=p_edition_id and is_active) then return '{}'::jsonb; end if;
  select coalesce(jsonb_object_agg(e.code,jsonb_strip_nulls(jsonb_build_object('status',s.commercial_status,
      'exhibitor',case when public.can_read('empresas') then (select c.trade_name from public.deals d join public.companies c on c.id=d.company_id where d.id=s.active_deal_id) else null end))),'{}'::jsonb)
    into result from public.pavilion_plan_revisions r
    join public.pavilion_environment_revisions v on v.revision_id=r.id
    join public.pavilion_environments e on e.edition_id=v.edition_id and e.id=v.environment_id and e.pavilion_number=r.pavilion_number
    join public.space_status_v s on s.id=e.space_id and s.edition_id=e.edition_id
    where r.edition_id=p_edition_id and r.floor_plan_id=p_floor_plan_id and r.pavilion_number=p_pavilion_number and r.revision=p_revision and e.kind='commercial';
  return result;
end $$;
revoke all on function public.get_pavilion_interior_commercial(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.get_pavilion_interior_commercial(uuid,uuid,integer,integer) to authenticated;
commit;
