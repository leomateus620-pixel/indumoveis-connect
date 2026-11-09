-- Run against Indumóveis after installation. Probe roles and writes roll back.
begin;
create temp table pavilion12_verification(check_name text primary key, passed boolean not null) on commit drop;
grant select, insert on pavilion12_verification to authenticated;
insert into public.user_roles(user_id,role) values
  ('00000000-0000-4000-8000-000000001201','consulta'),
  ('00000000-0000-4000-8000-000000001202','comercial');
update public.role_permissions set can_read=false,can_write=false
  where role='consulta' and module in ('comercial','empresas');
update public.role_permissions set can_read=false,can_write=false
  where role='comercial' and module='empresas';

set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000001201';
do $$
declare edition uuid; plan jsonb; denied boolean:=false; codes text[];
begin
  select id into strict edition from public.editions where is_active;
  plan:=public.get_pavilion_interior(edition,12,null);
  select array_agg(e->>'code' order by (e->>'code')::integer) into codes
    from jsonb_array_elements(plan->'environments') e;
  if plan->>'pavilionNumber' is distinct from '12' or plan->>'editionId' is distinct from edition::text
    or plan->'totalAreaM2' is distinct from '1650'::jsonb
    or codes is distinct from array(select n::text from generate_series(1,254) n) then
    raise exception 'P12 plan codes or pavilion total mismatch';
  end if;
  if exists(select 1 from jsonb_array_elements(plan->'environments') e
    where e->>'kind' is distinct from 'commercial'
      or e->'declaredAreaM2' is distinct from 'null'::jsonb
      or e->>'id' is distinct from 'indumoveis:pavilion:12:environment:'||(e->>'code')
      or e->>'name' is distinct from 'Lote '||(e->>'code')
      or jsonb_array_length(e->'parts') is distinct from 1
      or e->'parts'->0->>'kind' is distinct from 'interior'
      or e->'parts'->0->'polygon' is null
      or not public.pavilion_valid_polygon(e->'parts'->0->'polygon'))
    or plan::text ~* 'active_deal_id|company_id|list_price_cents|exhibitor|commercial_status|reservado' then
    raise exception 'P12 map includes unexpected lot or commercial data';
  end if;
  insert into pavilion12_verification values('map_only_reads_254_canonical_lots_total_and_null_individual_areas',true);

  begin perform public.get_pavilion_interior_commercial(edition,(plan->>'databasePlanId')::uuid,(plan->>'revision')::integer,12);
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Map-only user read commercial data'; end if;
  insert into pavilion12_verification values('commercial_rpc_denies_map_only',true);

  denied:=false;
  begin update public.pavilion_plan_revisions set total_area_m2=1600 where pavilion_number=12;
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Authenticated user wrote revision metadata'; end if;
  insert into pavilion12_verification values('authenticated_revision_write_denied',true);

  if public.get_pavilion_interior((select id from public.editions where not is_active limit 1),12,null) is not null then
    raise exception 'Inactive edition returned P12';
  end if;
  insert into pavilion12_verification values('inactive_edition_not_exposed',true);
end $$;

set local request.jwt.claim.sub='00000000-0000-4000-8000-000000001202';
do $$
declare edition uuid; plan jsonb; p8 jsonb; commercial jsonb; codes text[];
begin
  select id into strict edition from public.editions where is_active;
  plan:=public.get_pavilion_interior(edition,12,null);
  p8:=public.get_pavilion_interior(edition,8,null);
  commercial:=public.get_pavilion_interior_commercial(edition,(plan->>'databasePlanId')::uuid,(plan->>'revision')::integer,12);
  select array_agg(code order by code::integer) into codes from jsonb_object_keys(commercial) code;
  if codes is distinct from array(select n::text from generate_series(1,254) n) or exists(
    select 1 from jsonb_each(commercial) c
    join public.pavilion_environments e on e.code=c.key and e.edition_id=edition and e.pavilion_number=12
    join public.space_status_v s on s.id=e.space_id and s.edition_id=e.edition_id
    where c.value->>'status' is distinct from s.commercial_status::text
  ) then raise exception 'P12 commercial results diverged from stock view'; end if;
  if exists(select 1 from jsonb_each(commercial) c where c.value ? 'exhibitor') then
    raise exception 'Commercial user without company access read exhibitor details';
  end if;
  insert into pavilion12_verification values('commercial_reads_254_live_view_statuses_with_company_permission_guard',true);

  if public.get_pavilion_interior_commercial(edition,(p8->>'databasePlanId')::uuid,(p8->>'revision')::integer,12)<>'{}'::jsonb
    or public.get_pavilion_interior_commercial(edition,(plan->>'databasePlanId')::uuid,(plan->>'revision')::integer,8)<>'{}'::jsonb then
    raise exception 'Commercial RPC exposed another pavilion';
  end if;
  insert into pavilion12_verification values('commercial_pavilion_identity_mismatch_returns_empty',true);
end $$;

set local request.jwt.claim.sub='00000000-0000-4000-8000-000000001203';
do $$
declare denied boolean:=false;
begin
  if exists(select 1 from public.pavilion_plan_revisions where pavilion_number=12) then raise exception 'Map RLS leaked P12'; end if;
  begin perform public.get_pavilion_interior('00000000-0000-4000-8000-000000000000',12,null);
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'RPC accepted user without map permission'; end if;
  insert into pavilion12_verification values('user_without_map_permission_denied',true);
end $$;

reset role;
do $$
declare
  edition uuid; other_edition uuid; plan_id uuid; revision_uuid uuid;
  stock uuid; environment_id text; bad_code text; rejected boolean;
begin
  select id,edition_id,floor_plan_id into strict revision_uuid,edition,plan_id
    from public.pavilion_plan_revisions where pavilion_number=12 and is_current;
  select id into other_edition from public.editions where id<>edition limit 1;
  select id into strict environment_id from public.pavilion_environments
    where edition_id=edition and pavilion_number=12 and code='1';
  foreach bad_code in array array['0','01','255'] loop
    rejected:=false;
    begin
      insert into public.spaces(edition_id,code,sector,floor_plan_id,is_demo)
        values(edition,'P12-QA-CODE-SCOPE','Pavilhão 12',plan_id,false) returning id into stock;
      insert into public.pavilion_environments(edition_id,id,pavilion_number,code,kind,space_id)
        values(edition,'p12-invalid-code-probe',12,bad_code,'commercial',stock);
    exception when check_violation then rejected:=true;
    end;
    if not rejected then raise exception 'P12 admitted out-of-scope code %',bad_code; end if;
  end loop;
  insert into pavilion12_verification values('out_of_scope_codes_0_01_255_rejected',true);

  rejected:=false;
  begin
    insert into public.pavilion_environment_revisions(edition_id,revision_id,environment_id,name,label,display_order)
      select edition,revision_uuid,e.id,'Cross-pavilion probe','[0,0]',999 from public.pavilion_environments e
      where e.edition_id=edition and e.pavilion_number=1 limit 1;
  exception when raise_exception then rejected:=true;
  end;
  if not rejected then raise exception 'P12 revision admitted another pavilion identity'; end if;
  insert into pavilion12_verification values('cross_pavilion_environment_link_rejected',true);

  rejected:=false;
  begin
    insert into public.pavilion_environment_parts(id,edition_id,revision_id,environment_id,kind,path)
      values('p12-cross-edition-probe',other_edition,revision_uuid,environment_id,'interior','M0 0 L1 0 L1 1 Z');
  exception when foreign_key_violation then rejected:=true;
  end;
  if not rejected then raise exception 'P12 revision admitted another edition part'; end if;
  insert into pavilion12_verification values('cross_edition_part_rejected',true);

  rejected:=false;
  begin update public.pavilion_plan_revisions set total_area_m2=1600 where id=revision_uuid;
  exception when raise_exception then rejected:=true;
  end;
  if not rejected then raise exception 'Published total is mutable'; end if;
  insert into pavilion12_verification values('published_total_immutable',true);
end $$;

select jsonb_object_agg(check_name,passed order by check_name) as verification from pavilion12_verification;
rollback;
