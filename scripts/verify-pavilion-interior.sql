-- Run against the Indumóveis database only. Fixtures and permission changes roll back.
begin;
create temp table pavilion_verification(check_name text primary key,passed boolean not null) on commit drop;
grant select,insert on pavilion_verification to authenticated;
insert into public.user_roles(user_id,role) values('00000000-0000-4000-8000-000000000101','consulta'),('00000000-0000-4000-8000-000000000102','comercial');
update public.role_permissions set can_read=false,can_write=false where role='consulta' and module in ('comercial','empresas');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000101';
do $$ declare ed uuid; p jsonb; denied boolean:=false; begin
  select id into ed from public.editions where is_active;
  p:=public.get_pavilion_interior(ed,1,null);
  if jsonb_array_length(p->'environments')<>19 or p->>'editionId'<>ed::text or p->'source'->>'sha256'<>'088ab9d98e61ed98c98b45834c5813416d9fd09a10af195aeeae29bfc9a4c02a' then raise exception 'Map-only read failed'; end if;
  if p::text ~ 'active_deal_id|company_id|list_price_cents|exhibitor|commercial_status' then raise exception 'Commercial leak'; end if;
  insert into pavilion_verification values('map_only_geometry_read_without_commercial_data',true);
  begin perform public.get_pavilion_interior_commercial(ed,(p->>'databasePlanId')::uuid,1); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Commercial RPC must deny map-only user'; end if;
  insert into pavilion_verification values('commercial_rpc_denies_map_only_user',true);
  denied:=false;
  begin update public.pavilion_plan_revisions set is_current=false; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Authenticated writes must be denied'; end if;
  insert into pavilion_verification values('authenticated_revision_write_denied',true);
  if public.get_pavilion_interior((select id from public.editions where not is_active limit 1),1,null) is not null then raise exception 'Inactive edition accepted'; end if;
  insert into pavilion_verification values('inactive_edition_plan_not_exposed',true);
end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000102';
do $$ declare ed uuid; p jsonb; commercial jsonb; begin
  select id into ed from public.editions where is_active;
  p:=public.get_pavilion_interior(ed,1,null);
  commercial:=public.get_pavilion_interior_commercial(ed,(p->>'databasePlanId')::uuid,1);
  if (select count(*) from jsonb_object_keys(commercial))<>14 or commercial ? '15' or commercial ? 'salon' then raise exception 'Commercial stock mismatch'; end if;
  if exists(select 1 from jsonb_each(commercial) where value->>'status'<>'disponivel') then raise exception 'Unexpected derived status'; end if;
  insert into pavilion_verification values('commercial_user_reads_14_view_derived_statuses',true);
end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000103';
do $$ declare denied boolean:=false; begin
  if (select count(*) from public.pavilion_plan_revisions)<>0 or (select count(*) from public.pavilion_environments)<>0 then raise exception 'RLS must hide geometry'; end if;
  begin perform public.get_pavilion_interior('00000000-0000-4000-8000-000000000000',1,null); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Map RPC must deny user without roles'; end if;
  insert into pavilion_verification values('user_without_map_permission_denied',true);
end $$;
reset role;
do $$ declare rejected boolean:=false; ed uuid; other_ed uuid; r uuid; env text; begin
  select id,edition_id into r,ed from public.pavilion_plan_revisions where is_current;
  select id into other_ed from public.editions where id<>ed limit 1;
  select id into env from public.pavilion_environments where edition_id=ed limit 1;
  begin
    insert into public.pavilion_environment_parts(id,edition_id,revision_id,environment_id,kind,path) values('cross-edition-invalid',other_ed,r,env,'interior','M0 0 L1 0 L1 1 Z');
  exception when foreign_key_violation then rejected:=true; end;
  if not rejected then raise exception 'Cross-edition environment link accepted'; end if;
  insert into pavilion_verification values('cross_edition_links_rejected',true);
  rejected:=false;
  begin update public.pavilion_environment_parts set path='M0 0 L1 0 L1 1 Z' where revision_id=r;
  exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Published geometry must be immutable'; end if;
  insert into pavilion_verification values('published_geometry_immutable',true);
  if public.pavilion_valid_polygon('[[0,0],[10,10],[0,10],[10,0],[0,0]]') then raise exception 'Self intersection accepted'; end if;
  insert into pavilion_verification values('self_intersecting_polygon_rejected',true);
  if exists(select 1 from public.pavilion_environments e join public.pavilion_environment_revisions v on e.edition_id=v.edition_id and e.id=v.environment_id where e.kind='hall' and v.declared_area_m2 is not null) then raise exception 'Hall area must be null'; end if;
  insert into pavilion_verification values('hall_area_null',true);
end $$;
select jsonb_object_agg(check_name,passed order by check_name) as verification from pavilion_verification;
rollback;
