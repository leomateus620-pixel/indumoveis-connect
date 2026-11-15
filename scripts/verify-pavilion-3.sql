-- Run through Lovable query_database. Temporary actors and every write roll back.
begin;
do $test$
declare
  ed uuid := (select id from public.editions where is_active);
  actor uuid := gen_random_uuid();
  reader uuid := gen_random_uuid();
  ids uuid[];
  plan jsonb;
  lots jsonb;
  quote jsonb;
  rejected boolean := false;
begin
  if (select count(*) from public.commercial_inventory_v where edition_id=ed and pavilion_number=3)<>142
    or exists(select 1 from public.commercial_inventory_v where edition_id=ed and pavilion_number=3
      and (area_m2<>5 or area_pending or tariff_cents<>26500 or gross_cents<>132500 or pricing_state<>'priced'))
    or (select sum(gross_cents) from public.commercial_inventory_v where edition_id=ed and pavilion_number=3)<>18815000 then
    raise exception 'P3 inventory, individual area or tariff mismatch';
  end if;
  if (select count(*) from public.commercial_area_groups where edition_id=ed and pavilion_number=3)<>21
    or (select sum(total_m2) from public.commercial_area_groups where edition_id=ed and pavilion_number=3)<>710
    or exists(select 1 from public.commercial_area_groups where edition_id=ed and pavilion_number=3 and individual_m2<>5) then
    raise exception 'P3 documentary groups do not reconcile';
  end if;
  if exists(select 1 from public.pavilion_environment_parts p join public.pavilion_plan_revisions r on r.id=p.revision_id
    where r.edition_id=ed and r.pavilion_number=3 and (not public.pavilion_valid_polygon(p.polygon) or p.kind<>'interior')) then
    raise exception 'Invalid P3 hit geometry';
  end if;
  insert into public.user_roles(user_id,role) values(actor,'admin'),(reader,'comercial');
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  plan:=public.get_pavilion_interior(ed,3,null);
  if jsonb_array_length(plan->'environments')<>142 or (plan->>'totalAreaM2')::numeric<>1155 then
    raise exception 'Interior RPC lost geometry or pavilion area';
  end if;
  lots:=public.get_commercial_lots(ed,'p3');
  if jsonb_array_length(lots)<>142 or exists(select 1 from jsonb_array_elements(lots) l
    where (l->>'areaM2')::numeric<>5 or (l->>'grossCents')::bigint<>132500) then
    raise exception 'Commercial RPC differs from individual inventory';
  end if;
  select array_agg(space_id order by lot_code::integer) into ids
    from public.commercial_inventory_v where edition_id=ed and pavilion_number=3;
  quote:=public.preview_guided_sale(ed,array[ids[39],ids[104]],'{}',null);
  if (quote->>'grossCents')::bigint<>265000 or (quote->>'areaM2')::numeric<>10
    or jsonb_array_length(quote->'lots')<>2 then
    raise exception 'Two formerly grouped modules must quote independently';
  end if;
  update public.spaces set blocked=true where id=ids[39];
  begin
    perform public.preview_guided_sale(ed,array[ids[39]],'{}',null);
  exception when unique_violation then rejected:=true;
  end;
  if not rejected then raise exception 'Blocked stock was accepted by guided sale'; end if;
  update public.spaces set blocked=false where id=ids[39];
  rejected:=false;
  begin
    update public.pavilion_environment_revisions set declared_area_m2=10
      where edition_id=ed and environment_id='indumoveis:pavilion:3:environment:1';
  exception when others then rejected:=true;
  end;
  if not rejected then raise exception 'Published geometry must be immutable'; end if;

  perform set_config('request.jwt.claim.sub',reader::text,true);
  lots:=public.get_commercial_lots(ed,'p3');
  if exists(select 1 from jsonb_array_elements(lots) l where l ? 'grossCents' or l ? 'tariffCents' or l ? 'priceSource') then
    raise exception 'Financial values leaked to non-admin commercial reader';
  end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  rejected:=false;
  begin
    perform public.get_pavilion_interior(ed,3,null);
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'Unauthorised user read the interior'; end if;
end $test$;
select 'P3 inventory, provenance, geometry, RPCs, quotation, blocked stock, immutability and permissions passed' as result;
rollback;
