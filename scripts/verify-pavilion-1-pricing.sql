-- Execute only through the Indumóveis Lovable SQL connector. Every fixture rolls back.
begin;
do $test$
declare
  ed uuid := (select id from public.editions where is_active);
  actor uuid := gen_random_uuid();
  reader uuid := gen_random_uuid();
  ids uuid[];
  bathroom uuid;
  quote jsonb;
  payment jsonb;
  sale jsonb;
  attachment jsonb;
  rollup jsonb;
  detail jsonb;
  snap jsonb;
  company uuid;
  contract uuid;
  installment uuid;
  doc uuid;
  rejected boolean;
  price public.commercial_fixed_prices;
  due date;
  expected bigint[] := array[450000,660000,660000,1020000,1020000,660000,660000,
    1020000,1020000,660000,960000,1500000,960000,1500000,450000];
  baseline jsonb;
begin
  select jsonb_agg(to_jsonb(f) order by space_id) into baseline
    from public.commercial_lot_facts_v f where edition_id=ed and segment_key<>'p1';
  select array_agg(space_id order by lot_code) into ids from public.commercial_inventory_v
    where edition_id=ed and segment_key='p1';
  bathroom:=ids[15];
  if cardinality(ids)<>15 or
    (select array_agg(gross_cents order by lot_code) from public.commercial_inventory_v
      where edition_id=ed and segment_key='p1') is distinct from expected
    or (select sum(area_m2) from public.commercial_inventory_v where edition_id=ed and segment_key='p1')<>1203.62 then
    raise exception 'Documentary totals or individual prices differ.';
  end if;
  if has_table_privilege('authenticated','public.commercial_fixed_prices','select')
    or has_table_privilege('anon','public.commercial_fixed_prices','select')
    or has_table_privilege('authenticated','public.commercial_fixed_prices','insert')
    or not (select relrowsecurity from pg_class where oid='public.commercial_fixed_prices'::regclass) then
    raise exception 'Fixed prices bypass financial authorization.';
  end if;
  if exists (
    (select p.id,p.environment_id,p.kind,p.path,p.polygon from public.pavilion_environment_parts p
      join public.pavilion_plan_revisions r on r.id=p.revision_id where r.edition_id=ed and r.pavilion_number=1 and r.revision=1)
    except
    (select p.id,p.environment_id,p.kind,p.path,p.polygon from public.pavilion_environment_parts p
      join public.pavilion_plan_revisions r on r.id=p.revision_id where r.edition_id=ed and r.pavilion_number=1 and r.revision=2)
  ) then raise exception 'P1 geometry changed.'; end if;

  insert into public.user_roles(user_id,role) values(actor,'admin'),(reader,'comercial');
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  select (now() at time zone timezone)::date into due from public.editions where id=ed;
  payment:=jsonb_build_object('method','pix','mode','a_vista','installmentCount',1,'firstDueOn',due,'intervalMonths',1);
  quote:=public.preview_guided_sale(ed,ids,'{}',payment);
  if (quote->>'grossCents')::bigint<>13200000 or (quote->>'totalCents')::bigint<>13200000
    or (quote->>'areaM2')::numeric<>1203.62 then raise exception 'All-lot quote mismatch.'; end if;
  if exists(select from jsonb_array_elements(quote->'lots') l where l->>'pricingBasis'<>'fixed'
    or l->'tariffCents'<>'null'::jsonb or l->'priceSource'->>'name'<>'Mostra Arq&Design.pdf'
    or l->'priceSource'->>'sha256'<>'8868c5a7b077a6b88223986dea8faf8b42bcde5df36a1a1ed71408ee42dfbef7') then
    raise exception 'Quote lost fixed price provenance.';
  end if;
  if (public.preview_guided_sale(ed,array[ids[2],ids[12]],'{}',payment)->>'totalCents')::bigint<>2160000 then
    raise exception 'Multi-lot quote mismatch.';
  end if;
  quote:=public.preview_guided_sale(ed,array[bathroom],jsonb_build_object(bathroom::text,
    jsonb_build_object('amountCents',400000,'reason','Condição negociada de teste')),payment);
  if (quote->>'totalCents')::bigint<>400000 or (quote->>'grossCents')::bigint<>450000 then
    raise exception 'Agreed value overwrote table value.';
  end if;
  rejected:=false;
  begin
    perform public.preview_guided_sale(ed,array[bathroom],jsonb_build_object(bathroom::text,
      jsonb_build_object('amountCents',400000,'reason','')),payment);
  exception when invalid_parameter_value then rejected:=true; end;
  if not rejected then raise exception 'Override accepted without reason.'; end if;

  delete from public.commercial_fixed_prices where edition_id=ed and space_id=bathroom returning * into price;
  rejected:=false;
  begin
    perform public.preview_guided_sale(ed,array[bathroom],jsonb_build_object(bathroom::text,
      jsonb_build_object('amountCents',450000,'reason','Tabela ausente')),payment);
  exception when invalid_parameter_value then rejected:=true; end;
  if not rejected then raise exception 'Unpriced P1 accepted via manual override.'; end if;
  insert into public.commercial_fixed_prices select price.*;

  quote:=public.preview_guided_sale(ed,array[bathroom],'{}',payment);
  update public.commercial_fixed_prices set amount_cents=450001 where edition_id=ed and space_id=bathroom;
  rejected:=false;
  begin
    perform public.save_guided_sale(ed,array[bathroom],'{}',payment,quote->>'quoteFingerprint',null,
      '{"legal_name":"Fixture P1","trade_name":"Fixture P1","tax_id":"11222333000181"}',gen_random_uuid());
  exception when serialization_failure then rejected:=true; end;
  if not rejected then raise exception 'Outdated quote accepted.'; end if;
  update public.commercial_fixed_prices set amount_cents=450000 where edition_id=ed and space_id=bathroom;

  sale:=public.save_guided_sale(ed,array[bathroom],'{}',payment,quote->>'quoteFingerprint',null,
    '{"legal_name":"Fixture P1","trade_name":"Fixture P1","tax_id":"11222333000181"}',gen_random_uuid());
  contract:=(sale->>'contractId')::uuid;
  company:=(sale->>'companyId')::uuid;
  if sale->>'status'<>'reservada' or exists(select from public.installments where contract_id=contract)
    or (select total_cents from public.deals where id=(sale->>'dealId')::uuid)<>450000
    or (select total_cents from public.contracts where id=contract)<>450000
    or not exists(select from public.contract_spaces where contract_id=contract and space_id=bathroom) then
    raise exception 'Reservation did not persist canonical links and negotiated totals.';
  end if;
  rejected:=false;
  begin perform public.preview_guided_sale(ed,array[bathroom],'{}',payment);
  exception when unique_violation then rejected:=true; end;
  if not rejected then raise exception 'Reserved lot accepted for another sale.'; end if;

  attachment:=public.begin_guided_sale_attachment(ed,'fixture-p1.pdf','application/pdf',42,gen_random_uuid());
  doc:=(attachment->>'id')::uuid;
  insert into storage.objects(bucket_id,name,metadata)
    values('documents',attachment->>'storage_path','{"mimetype":"application/pdf","size":42}');
  perform public.complete_guided_sale((sale->>'dealId')::uuid,'Assinatura de teste do P1.',doc);
  select id into strict installment from public.installments where contract_id=contract;
  if (select amount_cents from public.installments where id=installment)<>450000
    or (select status from public.contracts where id=contract)<>'assinado' then
    raise exception 'Signed contract or installment did not use the fixed price.';
  end if;
  perform public.register_payment(installment,10000,due,'pix','Fixture P1',gen_random_uuid()::text);
  detail:=public.get_commercial_details(ed,'p1');
  select value into rollup from jsonb_array_elements(public.get_commercial_overview(ed)->'segments') where value->>'key'='p1';
  if (rollup->>'sold')::integer<>1 or (rollup->>'grossCents')::bigint<>13200000
    or (rollup->>'availableGrossCents')::bigint<>12750000
    or (detail->'totals'->>'contractedCents')::bigint<>450000
    or (detail->'totals'->>'receivedCents')::bigint<>10000 then
    raise exception 'Dashboard potential, sale or receipt totals diverged: %, %',rollup,detail->'totals';
  end if;
  snap:=public.get_company_participation(company,ed);
  if snap is null then raise exception 'Company participation link missing.'; end if;

  perform set_config('request.jwt.claim.sub',reader::text,true);
  if exists(select from jsonb_array_elements(public.get_commercial_lots(ed,'p1')) l
    where l ?| array['tariffCents','grossCents','pricingBasis','priceSource','policySource','policyVersion']) then
    raise exception 'Non-admin reader received financial data.';
  end if;
  rejected:=false;
  begin perform public.preview_guided_sale(ed,array[ids[1]],'{}',payment);
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Non-admin quoted a private sale.'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform public.set_contract_status(contract,'cancelado','Cancelamento da fixture.');
  if (select commercial_status from public.commercial_lot_facts_v where space_id=bathroom)<>'disponivel'
    or (select status from public.installments where id=installment)<>'aberta' then
    raise exception 'Cancellation did not release stock and preserve the partially paid installment.';
  end if;
  if baseline is distinct from (select jsonb_agg(to_jsonb(f) order by space_id)
    from public.commercial_lot_facts_v f where edition_id=ed and segment_key<>'p1') then
    raise exception 'Another segment changed.';
  end if;
end $test$;
select 'P1 prices, revision, quotes, reservation, contract, payment, cancellation and privacy verified' as result;
rollback;
