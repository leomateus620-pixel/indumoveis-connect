-- Run as a database administrator after applying commercial policy migrations.
-- Temporary contracts, users' roles, and external space links roll back.
begin;
do $checks$
declare
  edition uuid := (select id from public.editions where is_active and year = 2027);
  actor uuid := gen_random_uuid();
  reader uuid := gen_random_uuid();
  corner_space uuid;
  regular_space uuid;
  pending_space uuid;
  vehicle_space uuid;
  company uuid;
  deal uuid;
  contract uuid;
  historical_contract uuid;
  historical_installment uuid;
  historical_total bigint;
  fee_amount bigint;
  terms jsonb;
  today date;
  last_due date;
  denied boolean;
  p12_ids uuid[];
begin
  if edition is null then raise exception 'Edição ativa 2027 não encontrada.'; end if;

  if (select array_agg(lot_code::integer order by lot_code::integer) from public.commercial_inventory_v
      where edition_id = edition and pavilion_number = 12)
      is distinct from array(select generate_series(1,254))
    or exists (
      select 1 from public.commercial_inventory_v where edition_id = edition and pavilion_number = 12
        and area_m2 is distinct from (case when lot_code::integer between 37 and 204 then 3 else 4 end)::numeric
    ) then raise exception 'P12 sem cobertura individual exata.'; end if;

  if exists (
    select 1 from (values ('01',93.15,2701350), ('03',61.40,1780600), ('04',49.00,1421000),
      ('05',58.15,1686350), ('06',87.00,2523000), ('07',46.00,1334000)) v(code,area,gross)
    left join public.commercial_inventory_v i on i.edition_id = edition and i.pavilion_number = 8 and i.lot_code = v.code
    where i.area_m2 is distinct from v.area or i.gross_cents is distinct from v.gross
  ) or not exists (
    select 1 from public.commercial_inventory_v where edition_id = edition and pavilion_number = 8
      and lot_code = '08' and area_pending and tariff_cents is null
  ) then raise exception 'P8 com vínculo ou preço divergente.'; end if;

  if not exists (
    select 1 from public.commercial_area_groups where edition_id = edition and pavilion_number = 13
      and validation_state = 'pending' and document_codes = array[34,35,36,37]
      and matched_codes = array['36','37'] and evidence->'overlap' = '[34,35]'::jsonb
  ) or (select count(*) from public.commercial_inventory_v where edition_id = edition and pavilion_number = 13
    and lot_code in ('36','37') and area_pending and gross_cents is null) <> 2
  or (select count(*) from public.commercial_inventory_v where edition_id = edition and pavilion_number = 13
    and lot_code in ('63','64','65','66') and area_m2 = 4) <> 4
  then raise exception 'P13 com sobreposição ou individualização incorreta.'; end if;

  if (select array_agg(area_m2 order by lot_code) from public.commercial_inventory_v
      where edition_id = edition and pavilion_number = 1) is distinct from
    array[111.66,47.50,47.50,74.81,74.81,47.50,47.50,74.81,74.81,47.50,69.17,129.43,69.48,254.81]::numeric[]
  or exists (
    select 1 from public.commercial_inventory_v where edition_id = edition
      and (pavilion_number in (3,14) or pavilion_number = 1 and tariff_cents is not null)
  ) then raise exception 'Áreas do P1 ou estoque do P3/P14 divergentes.'; end if;

  if (select array_agg(total_area_m2 order by pavilion_number) from public.pavilion_plan_revisions
      where edition_id = edition and is_current and pavilion_number in (8,12,13))
      is distinct from array[937.32,1650,850.50]::numeric[]
  then raise exception 'Áreas totais das plantas divergentes.'; end if;
  if exists (
    select 1 from public.commercial_area_groups g
    join public.pavilion_plan_revisions prior on prior.id = g.source_revision_id and prior.edition_id = g.edition_id
    join public.pavilion_plan_revisions current on current.edition_id = prior.edition_id
      and current.pavilion_number = prior.pavilion_number and current.revision = prior.revision + 1
    where g.edition_id = edition and (
      exists (
        select id, environment_id, kind, path, polygon from public.pavilion_environment_parts where revision_id = prior.id
        except
        select id, environment_id, kind, path, polygon from public.pavilion_environment_parts where revision_id = current.id
      ) or exists (
        select id, kind, path, label, label_at, stroke_width, display_order
        from public.pavilion_architecture_elements where revision_id = prior.id
        except
        select id, kind, path, label, label_at, stroke_width, display_order
        from public.pavilion_architecture_elements where revision_id = current.id
      )
    )
  ) then raise exception 'Uma revisão de área alterou a geometria fonte.'; end if;

  if has_table_privilege('authenticated','public.commercial_inventory_v','select') or
    has_table_privilege('authenticated','public.commercial_contract_terms','select') or
    has_table_privilege('authenticated','public.installments','insert') then
    raise exception 'Uma tabela privada de política ou gravação de parcelas está exposta.';
  end if;

  insert into public.user_roles(user_id,role) values (actor,'admin'), (reader,'consulta');
  perform set_config('request.jwt.claim.sub', actor::text, true);
  if (select array_agg(lot_number order by lot_number) from public.commercial_external_space_links
    where edition_id = edition) is distinct from array(select generate_series(1,68))
  or (select count(distinct geometry_id) from public.commercial_inventory_v where edition_id = edition
    and geometry_id is not null and area_m2 is not null) <> 68
  or (select count(*) from public.commercial_external_geometry where edition_id = edition
    and evidence->>'original_envelope_id' = 'indumoveis:external:lot:35-36-49-50'
    and declared_area_m2 = 227) <> 4
  or (select sum(area_m2) from public.commercial_inventory_v where edition_id = edition
    and geometry_id is not null) is distinct from 14844::numeric
  or (select gross_cents from public.commercial_inventory_v where edition_id = edition
    and geometry_id = 'indumoveis:external:lot:57') is distinct from 476700::bigint
  or exists (select 1 from public.commercial_inventory_v where edition_id = edition
    and segment_key = 'automobile' and tariff_cents is not null)
  then raise exception 'O estoque externo tem numeração, área ou segmentação divergente.'; end if;
  select space_id into strict corner_space from public.commercial_external_space_links
    where edition_id = edition and lot_number = 1;
  select space_id into strict regular_space from public.commercial_external_space_links
    where edition_id = edition and lot_number = 2;
  select space_id into strict pending_space from public.commercial_external_space_links
    where edition_id = edition and lot_number = 9;
  select space_id into strict vehicle_space from public.commercial_external_space_links
    where edition_id = edition and lot_number = 58;
  if (select tariff_cents from public.commercial_inventory_v where space_id = corner_space) is distinct from 2100::bigint
    or (select tariff_cents from public.commercial_inventory_v where space_id = regular_space) is distinct from 1900::bigint
    or not exists (select 1 from public.commercial_inventory_v where space_id = pending_space
      and corner_state = 'pending' and area_m2 = 203 and tariff_cents is null)
    or not exists (select 1 from public.commercial_inventory_v where space_id = vehicle_space
      and corner_state = 'corner' and tariff_cents is null and segment_key = 'automobile')
  then raise exception 'Precedência de esquina, pendência ou Salão do Automóvel incorreta.'; end if;
  terms := public.get_commercial_corner_review(edition, pending_space);
  if (terms->>'revision')::integer is distinct from 0 or terms->>'classification' is distinct from 'pending'
    or terms->'source'->>'originalEnvelopeId' is distinct from 'indumoveis:external:lot:09-10'
    or terms->'source'->>'envelopeSideStreet' is distinct from 'Rua Montevidéu'
  then raise exception 'O lote 09 perdeu a evidência do envelope original.'; end if;
  perform public.review_commercial_corner(edition, 2, 0, 'pending', 'Fixture de evidência inconclusiva.');
  if not exists (select 1 from public.commercial_inventory_v where space_id = regular_space
      and pricing_state = 'corner_pending' and tariff_cents is null)
  then raise exception 'A tarifa foi mantida após a classificação ficar pendente.'; end if;
  terms := public.get_commercial_corner_review(edition, regular_space);
  if (terms->>'revision')::integer is distinct from 1 or terms->>'classification' is distinct from 'pending'
    or terms->'reviews'->0->>'evidence' is distinct from 'Fixture de evidência inconclusiva.'
    or terms->'source'->>'frontage' is distinct from 'Rua Argentina'
    or public.get_commercial_corner_review(gen_random_uuid(), regular_space) is not null
  then raise exception 'A leitura da revisão perdeu a evidência ou o escopo da edição.'; end if;
  denied := false;
  begin
    perform public.review_commercial_corner(edition, 2, 0, 'regular', 'Fixture fora de versão.');
  exception when serialization_failure then denied := true; end;
  if not denied then raise exception 'Revisão de esquina concorrente aceita.'; end if;

  select array_agg(space_id) into p12_ids from (
    select i.space_id from public.commercial_inventory_v i
    join public.space_status_v s on s.id = i.space_id and s.edition_id = i.edition_id
    where i.edition_id = edition and i.pavilion_number = 12 and s.commercial_status = 'disponivel'
    order by i.lot_code::integer limit 2
  ) s;
  insert into public.companies(legal_name,trade_name) values('Fixture política','Fixture política') returning id into company;
  deal := public.save_deal(null, edition, company, null, null, null, p12_ids, array[100001,200002]::bigint[], null);
  perform public.transition_deal(deal,'negociacao',null);

  -- Simulate a contract created before the assignment trigger was installed.
  alter table public.contracts disable trigger contract_pricing_policy;
  insert into public.contracts(edition_id,deal_id,company_id,status,total_cents,body)
    values(edition,deal,company,'cancelado',87654,'Texto histórico') returning id into historical_contract;
  alter table public.contracts enable trigger contract_pricing_policy;
  insert into public.installments(edition_id,contract_id,number,due_date,amount_cents)
    values(edition,historical_contract,1,date '2025-10-30',87654) returning id into historical_installment;
  insert into public.payments(installment_id,amount_cents,paid_on)
    values(historical_installment,1234,date '2025-10-30');

  contract := public.create_contract_from_deal(deal);
  terms := public.get_contract_pricing_terms(contract);
  if (terms->>'policy_version')::integer is distinct from 1 or terms->>'scope' is distinct from 'internal'
    or jsonb_array_length(terms->'fee_rules') <> 4 or jsonb_array_length(terms->'discount_rules') <> 3
    or public.get_contract_pricing_terms(historical_contract) is not null
  then raise exception 'Escopo, política ou contrato legado incorretos: %', terms; end if;

  denied := false;
  begin
    perform public.record_contract_pricing_terms(contract,0,'cash_full,eligible_member','Fixture','{}',null,null);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Descontos cumulativos aceitos.'; end if;

  denied := false;
  begin
    perform public.record_contract_pricing_terms(contract,0,'cash_full','Fixture',
      array['internal_cleaning','internal_cleaning'],'Fixture',null);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Taxa duplicada por módulo foi aceita.'; end if;

  perform public.record_contract_pricing_terms(contract,0,'cash_full','Pagamento integral aprovado',
    array['internal_cleaning'],'Uma taxa para este expositor e contrato',null);
  select (fees->0->>'amount_cents')::bigint into fee_amount from public.commercial_contract_terms
  where contract_id = contract and version = 1 and jsonb_array_length(fees) = 1 and discount_basis_points = 1000;
  if fee_amount is distinct from 30000::bigint
    or (select total_cents from public.contracts where id = contract) is distinct from 300003::bigint then
    raise exception 'A taxa foi multiplicada ou alterou o total negociado.';
  end if;
  perform set_config('request.jwt.claim.sub', reader::text, true);
  denied := false;
  begin perform public.get_commercial_corner_review(edition, regular_space);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Um usuário de consulta leu evidência de revisão.'; end if;
  terms := public.get_contract_pricing_terms(contract);
  if terms ? 'fee_rules' or terms ? 'discount_rules' or terms ? 'recorded_terms'
    or (terms->>'installment_limit')::integer is distinct from 18 then
    raise exception 'Condições financeiras vazaram sem permissão.';
  end if;

  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform public.set_contract_status(contract,'emitido',null);
  terms := public.get_contract_pricing_terms(contract);
  today := (terms->>'today')::date;
  last_due := (terms->>'last_due')::date;
  denied := false;
  begin perform public.generate_installments(contract,1,today-1,1);
  exception when raise_exception then denied := sqlerrm like '%retroativo%'; end;
  if not denied then raise exception 'Vencimento retroativo não rejeitado.'; end if;
  denied := false;
  begin perform public.generate_installments(contract,1,greatest(last_due+1,today),1);
  exception when raise_exception then denied := sqlerrm like '%ultrapassa%'; end;
  if not denied then raise exception 'Vencimento além do encerramento não rejeitado.'; end if;
  if today <= (last_due - interval '1 month')::date then
    denied := false;
    begin perform public.generate_installments(contract,2,greatest(today,(terms->>'first_due')::date),1);
    exception when raise_exception then denied := sqlerrm like '%parcela única%'; end;
    if not denied then raise exception 'Desconto à vista permitiu mais de uma parcela.'; end if;
  end if;
  if today <= last_due then
    perform public.generate_installments(contract,1,greatest(today,(terms->>'first_due')::date),1);
    if (select sum(amount_cents) from public.installments where contract_id = contract) is distinct from 300003::numeric then
      raise exception 'O parcelamento mudou o total negociado.';
    end if;
  end if;

  select total_cents into historical_total from public.contracts
  where id = historical_contract and body = 'Texto histórico' and pricing_policy_version is null;
  if historical_total is distinct from 87654::bigint or not exists (
    select 1 from public.installments i join public.payments p on p.installment_id = i.id
    where i.id = historical_installment and i.amount_cents = 87654 and p.amount_cents = 1234
      and i.due_date = date '2025-10-30' and p.paid_on = date '2025-10-30'
  ) then raise exception 'Contrato ou pagamento histórico foi modificado.'; end if;
end $checks$;

select 'commercial pricing verification passed' as result;
rollback;
