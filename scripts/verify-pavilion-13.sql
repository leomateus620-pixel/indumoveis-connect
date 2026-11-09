-- Indumóveis only. All role fixtures and probe writes roll back.
begin;
create temp table pavilion13_verification(check_name text primary key,passed boolean not null) on commit drop;
grant select,insert on pavilion13_verification to authenticated;
insert into public.user_roles(user_id,role) values('00000000-0000-4000-8000-000000000131','consulta'),('00000000-0000-4000-8000-000000000132','comercial');
update public.role_permissions set can_read=false,can_write=false where role='consulta' and module in('comercial','empresas');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000131';
do $$ declare ed uuid; p jsonb; denied boolean:=false; begin
  select id into ed from public.editions where is_active;
  p:=public.get_pavilion_interior(ed,13,null);
  if p->>'pavilionNumber'<>'13' or p->>'editionId'<>ed::text or
    (select count(*) from jsonb_array_elements(p->'environments') e where e->>'kind'='commercial')<>80 then raise exception 'P13 map read mismatch'; end if;
  if exists(select 1 from jsonb_array_elements(p->'environments') e where e->>'kind'='commercial' and (e->>'declaredAreaM2' is not null or e->>'name'<>'Lote '||(e->>'code'))) then raise exception 'P13 canonical names/null areas mismatch'; end if;
  if p::text ~ 'active_deal_id|company_id|list_price_cents|exhibitor|commercial_status|RESERVADO|850[.,]5' then raise exception 'Unrequested data in geometry payload'; end if;
  insert into pavilion13_verification values('map_only_reads_80_named_lots_without_commercial_or_area_data',true);
  begin perform public.get_pavilion_interior_commercial(ed,(p->>'databasePlanId')::uuid,(p->>'revision')::integer,13); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Commercial RPC accepted map-only user'; end if;
  insert into pavilion13_verification values('commercial_rpc_denies_map_only',true);
  denied:=false;
  begin update public.pavilion_plan_revisions set is_current=false where pavilion_number=13; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Authenticated geometry write accepted'; end if;
  insert into pavilion13_verification values('authenticated_geometry_write_denied',true);
  if public.get_pavilion_interior((select id from public.editions where not is_active limit 1),13,null) is not null then raise exception 'Inactive edition exposed'; end if;
  insert into pavilion13_verification values('inactive_edition_not_exposed',true);
end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000132';
do $$ declare ed uuid; p jsonb; p1 jsonb; c jsonb; begin
  select id into ed from public.editions where is_active;
  p:=public.get_pavilion_interior(ed,13,null); p1:=public.get_pavilion_interior(ed,1,null);
  c:=public.get_pavilion_interior_commercial(ed,(p->>'databasePlanId')::uuid,(p->>'revision')::integer,13);
  if (select count(*) from jsonb_object_keys(c))<>80 then raise exception 'P13 commercial count mismatch'; end if;
  if exists(select 1 from jsonb_each(c) where value->>'status'<>'disponivel' or value ? 'exhibitor') then raise exception 'Imported commercial information'; end if;
  insert into pavilion13_verification values('commercial_reads_80_real_view_statuses_without_imported_exhibitors',true);
  if public.get_pavilion_interior_commercial(ed,(p1->>'databasePlanId')::uuid,1,13)<>'{}'::jsonb or
    public.get_pavilion_interior_commercial(ed,(p->>'databasePlanId')::uuid,(p->>'revision')::integer,1)<>'{}'::jsonb then raise exception 'Cross-pavilion commercial read accepted'; end if;
  insert into pavilion13_verification values('commercial_pavilion_identity_mismatch_returns_empty',true);
  if (select count(*) from jsonb_object_keys(public.get_pavilion_interior_commercial(ed,(p1->>'databasePlanId')::uuid,1)))<>14 then raise exception 'P1 legacy RPC signature regressed'; end if;
  insert into pavilion13_verification values('p1_three_argument_commercial_rpc_backward_compatible',true);
end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000133';
do $$ declare denied boolean:=false; begin
  if exists(select 1 from public.pavilion_plan_revisions where pavilion_number=13) then raise exception 'Map RLS leaked'; end if;
  begin perform public.get_pavilion_interior('00000000-0000-4000-8000-000000000000',13,null); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'RPC accepted user without map permission'; end if;
  insert into pavilion13_verification values('user_without_map_permission_denied',true);
end $$;
reset role;
do $$ declare ed uuid; other_ed uuid; r uuid; p1_env text; p13_env text; rejected boolean:=false; begin
  select id,edition_id into r,ed from public.pavilion_plan_revisions where pavilion_number=13 and is_current;
  select id into other_ed from public.editions where id<>ed limit 1;
  select id into p13_env from public.pavilion_environments where edition_id=ed and pavilion_number=13 limit 1;
  select id into p1_env from public.pavilion_environments where edition_id=ed and pavilion_number=1 limit 1;
  begin insert into public.pavilion_environment_parts(id,edition_id,revision_id,environment_id,kind,path) values('p13-cross-edition-invalid',other_ed,r,p13_env,'interior','M0 0 L1 0 L1 1 Z'); exception when foreign_key_violation then rejected:=true; end;
  if not rejected then raise exception 'Cross-edition geometry accepted'; end if;
  insert into pavilion13_verification values('cross_edition_link_rejected',true);
  rejected:=false;
  begin insert into public.pavilion_environment_revisions(edition_id,revision_id,environment_id,name,label,display_order) values(ed,r,p1_env,'Cross-pavilion invalid','[0,0]',999); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Cross-pavilion identity accepted'; end if;
  insert into pavilion13_verification values('cross_pavilion_environment_link_rejected',true);
  rejected:=false;
  begin update public.pavilion_environment_parts set path='M0 0 L1 0 L1 1 Z' where revision_id=r; exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Published revision mutated'; end if;
  insert into pavilion13_verification values('published_revision_immutable',true);
  if (select payload_sha256 from public.pavilion_plan_revisions where pavilion_number=1 and is_current)<>'90c8e9d2cd6b2b8dd4ae708d97cc49c62eb59dac5378061f7219e262671777c3' or
    (select count(*) from public.pavilion_environments where pavilion_number=1 and space_id is not null)<>14 then raise exception 'P1 changed'; end if;
  insert into pavilion13_verification values('p1_payload_hash_and_14_stock_links_unchanged',true);
end $$;
select jsonb_object_agg(check_name,passed order by check_name) as verification from pavilion13_verification;
rollback;
