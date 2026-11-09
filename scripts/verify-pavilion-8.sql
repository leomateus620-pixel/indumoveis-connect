-- Run against Indumóveis after installation. Probe users, permissions and writes roll back.
begin;
create temp table pavilion8_verification(check_name text primary key,passed boolean not null) on commit drop;
grant select,insert on pavilion8_verification to authenticated;

insert into public.user_roles(user_id,role) values
  ('00000000-0000-4000-8000-000000000801','consulta'),
  ('00000000-0000-4000-8000-000000000802','comercial');
update public.role_permissions set can_read=false,can_write=false
  where role='consulta' and module in ('comercial','empresas');

set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000801';
do $$
declare edition uuid; plan jsonb; denied boolean:=false; codes text[];
begin
  select id into strict edition from public.editions where is_active;
  plan := public.get_pavilion_interior(edition,8,null);
  select array_agg(e->>'code' order by e->>'code') into codes from jsonb_array_elements(plan->'environments') e;
  if plan->>'pavilionNumber' is distinct from '8' or plan->>'editionId' is distinct from edition::text
    or plan->'totalAreaM2' is distinct from '937.32'::jsonb
    or codes is distinct from array['01','03','04','05','06','07','08'] then
    raise exception 'P8 plan codes or pavilion total mismatch';
  end if;
  if exists(select 1 from jsonb_array_elements(plan->'environments') e where e->>'kind'<>'commercial'
      or e->>'declaredAreaM2' is not null or e->>'name'<>'Lote '||(e->>'code')
      or jsonb_array_length(e->'parts')<>1 or not public.pavilion_valid_polygon(e->'parts'->0->'polygon'))
    or plan::text ~ 'active_deal_id|company_id|list_price_cents|exhibitor|commercial_status' then
    raise exception 'P8 map includes unexpected lot or commercial data';
  end if;
  insert into pavilion8_verification values('map_only_reads_seven_lots_and_total_without_commercial_data',true);

  begin
    perform public.get_pavilion_interior_commercial(edition,(plan->>'databasePlanId')::uuid,(plan->>'revision')::integer,8);
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Map-only user read commercial data'; end if;
  insert into pavilion8_verification values('commercial_rpc_denies_map_only',true);

  denied:=false;
  begin update public.pavilion_plan_revisions set total_area_m2=900 where pavilion_number=8;
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Authenticated user wrote revision metadata'; end if;
  insert into pavilion8_verification values('authenticated_revision_write_denied',true);

  if public.get_pavilion_interior((select id from public.editions where not is_active limit 1),8,null) is not null then
    raise exception 'Inactive edition returned P8';
  end if;
  insert into pavilion8_verification values('inactive_edition_not_exposed',true);
end $$;

set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000802';
do $$
declare edition uuid; plan jsonb; p1 jsonb; p13 jsonb; commercial jsonb; codes text[];
begin
  select id into strict edition from public.editions where is_active;
  plan := public.get_pavilion_interior(edition,8,null);
  p1 := public.get_pavilion_interior(edition,1,null);
  p13 := public.get_pavilion_interior(edition,13,null);
  commercial := public.get_pavilion_interior_commercial(edition,(plan->>'databasePlanId')::uuid,(plan->>'revision')::integer,8);
  select array_agg(code order by code) into codes from jsonb_object_keys(commercial) code;
  if codes is distinct from array['01','03','04','05','06','07','08'] or exists(
    select 1 from jsonb_each(commercial) c
    join public.pavilion_environments e on e.code=c.key and e.edition_id=edition and e.pavilion_number=8
    join public.space_status_v s on s.id=e.space_id and s.edition_id=e.edition_id
    where c.value->>'status' is distinct from s.commercial_status::text
  ) then raise exception 'P8 commercial results diverged from stock view'; end if;
  insert into pavilion8_verification values('commercial_reads_seven_live_view_statuses',true);

  if public.get_pavilion_interior_commercial(edition,(p13->>'databasePlanId')::uuid,(p13->>'revision')::integer,8)<>'{}'::jsonb
    or public.get_pavilion_interior_commercial(edition,(plan->>'databasePlanId')::uuid,(plan->>'revision')::integer,13)<>'{}'::jsonb then
    raise exception 'Commercial RPC exposed another pavilion';
  end if;
  insert into pavilion8_verification values('commercial_pavilion_identity_mismatch_returns_empty',true);

  if (select count(*) from jsonb_object_keys(public.get_pavilion_interior_commercial(edition,(p1->>'databasePlanId')::uuid,(p1->>'revision')::integer)))<>14
    or jsonb_array_length(p1->'environments') is distinct from 19 or p1 ? 'totalAreaM2'
    or jsonb_array_length(p13->'environments') is distinct from 80 or p13 ? 'totalAreaM2' then
    raise exception 'P1/P13 contract changed';
  end if;
  insert into pavilion8_verification values('p1_p13_contracts_unchanged',true);
end $$;

set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000803';
do $$
declare denied boolean:=false;
begin
  if exists(select 1 from public.pavilion_plan_revisions where pavilion_number=8) then raise exception 'Map RLS leaked P8'; end if;
  begin perform public.get_pavilion_interior('00000000-0000-4000-8000-000000000000',8,null);
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'RPC accepted user without map permission'; end if;
  insert into pavilion8_verification values('user_without_map_permission_denied',true);
end $$;

reset role;
do $$
declare edition uuid; plan_id uuid; revision_uuid uuid; stock uuid; rejected boolean:=false;
begin
  select id,edition_id,floor_plan_id into strict revision_uuid,edition,plan_id
  from public.pavilion_plan_revisions where pavilion_number=8 and is_current;
  begin
    insert into public.spaces(edition_id,code,sector,floor_plan_id,is_demo)
      values(edition,'P8-QA-CODE-SCOPE','Pavilhão 8',plan_id,false) returning id into stock;
    insert into public.pavilion_environments(edition_id,id,pavilion_number,code,kind,space_id)
      values(edition,'p8-invalid-code-probe',8,'02','commercial',stock);
  exception when check_violation then rejected:=true;
  end;
  if not rejected then raise exception 'P8 revision admitted an undocumented lot'; end if;
  insert into pavilion8_verification values('lot_02_rejected_by_pavilion_constraint',true);

  rejected:=false;
  begin
    insert into public.pavilion_environment_revisions(edition_id,revision_id,environment_id,name,label,display_order)
      select edition,revision_uuid,e.id,'Cross-pavilion probe','[0,0]',999 from public.pavilion_environments e
      where e.edition_id=edition and e.pavilion_number=1 limit 1;
  exception when raise_exception then rejected:=true;
  end;
  if not rejected then raise exception 'P8 revision admitted another pavilion identity'; end if;
  insert into pavilion8_verification values('cross_pavilion_environment_link_rejected',true);

  rejected:=false;
  begin update public.pavilion_plan_revisions set total_area_m2=900 where id=revision_uuid;
  exception when raise_exception then rejected:=true;
  end;
  if not rejected then raise exception 'Published total is mutable'; end if;
  insert into pavilion8_verification values('published_total_immutable',true);
end $$;

select jsonb_object_agg(check_name,passed order by check_name) as verification from pavilion8_verification;
rollback;
