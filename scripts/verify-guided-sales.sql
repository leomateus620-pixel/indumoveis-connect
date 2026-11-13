-- Run against a migrated disposable database or inside a Lovable read/write
-- verification transaction. All fixture records and document objects roll back.
begin;
do $check$
declare
  edition uuid;
  other_edition uuid;
  author_id uuid := gen_random_uuid();
  signer_id uuid := gen_random_uuid();
  fixture_company_id uuid;
  pending_id uuid;
  lot_ids uuid[];
  other_lot_id uuid;
  a_vista jsonb;
  parcelado jsonb;
  quote jsonb;
  saved jsonb;
  inspected jsonb;
  attachment jsonb;
  attachment_key uuid;
  request_id uuid := gen_random_uuid();
  fixture_deal_id uuid;
  fixture_contract_id uuid;
begin
  insert into public.user_roles(user_id,role) values (author_id,'admin'), (signer_id,'admin');
  perform set_config('request.jwt.claim.sub',author_id::text,true);
  select id into strict edition from public.editions where is_active and year=2027;
  select id into other_edition from public.editions where year=2025 limit 1;
  if other_edition is null then
    insert into public.editions(name,year,starts_on,ends_on,is_historical)
    values ('Edição histórica de verificação',2025,'2025-05-01','2025-05-02',true)
    returning id into other_edition;
  end if;
  select array_agg(space_id order by space_id) into lot_ids from (
    select space_id from public.commercial_lot_facts_v
    where edition_id=edition and segment_key='p12' and commercial_status='disponivel'
      and area_m2=4 and gross_cents=108000 order by lot_code limit 2
  ) available;
  if cardinality(lot_ids) <> 2 then raise exception 'Missing available P12 fixture lots'; end if;
  select space_id into strict pending_id from public.commercial_lot_facts_v
    where edition_id=edition and segment_key='p13' and lot_code='36';
  select space_id into strict other_lot_id from public.commercial_lot_facts_v
    where edition_id=edition and segment_key='external' and lot_code='01';

  a_vista := jsonb_build_object('method','pix','mode','a_vista','installmentCount',1,
    'firstDueOn','2027-03-30','intervalMonths',1);
  parcelado := jsonb_build_object('method','boleto','mode','parcelado','installmentCount',2,
    'firstDueOn','2027-02-28','intervalMonths',1,'discountModality','installments_on_time',
    'discountEvidence','Acordo de cobrança no vencimento.',
    'feeKeys',jsonb_build_array('internal_cleaning'),'feeEvidence','Prevista na contratação.');
  quote := public.preview_guided_sale(edition,lot_ids,'{}',a_vista);
  if (quote->>'totalCents')::bigint <> 216000 or (quote->>'areaM2')::numeric <> 8
    or (quote->'schedule'->0->>'amountCents')::bigint <> 216000
    or (quote->>'grossCents')::bigint <> 216000
    then raise exception 'Invalid quote %',quote; end if;

  begin
    perform public.preview_guided_sale(edition,array[lot_ids[1],lot_ids[1]],'{}',a_vista);
    raise exception 'Duplicate lot accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.preview_guided_sale(edition,array[lot_ids[1],null::uuid],'{}',a_vista);
    raise exception 'Null lot accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.preview_guided_sale(edition,array[lot_ids[1],other_lot_id],'{}',a_vista);
    raise exception 'Cross-scope lot accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.preview_guided_sale(other_edition,lot_ids,'{}',a_vista);
    raise exception 'Inactive edition accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.preview_guided_sale(edition,array[pending_id],'{}',a_vista);
    raise exception 'Pending area accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.preview_guided_sale(edition,lot_ids,'{}',jsonb_set(a_vista,'{firstDueOn}','"2027-04-01"'));
    raise exception 'Out-of-policy date accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_guided_sale(edition,lot_ids,'{}',a_vista,'stale',null,
      '{"trade_name":"Teste Modo Comercialização","legal_name":"Teste Modo Comercialização LTDA","tax_id":"11222333000181"}',
      request_id);
    raise exception 'Stale quote accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.save_guided_sale(edition,lot_ids,'{}',a_vista,quote->>'quoteFingerprint',null,
      '{"trade_name":"Teste Modo Comercialização","legal_name":"Teste Modo Comercialização LTDA","tax_id":"11222333000181"}',
      request_id, 'Original assinado.', gen_random_uuid());
    raise exception 'Invalid attachment accepted';
  exception when invalid_parameter_value then null; end;
  if exists (select from public.companies c where c.tax_id='11222333000181') then
    raise exception 'Company survived failed sale transaction';
  end if;

  saved := public.save_guided_sale(edition,lot_ids,'{}',a_vista,quote->>'quoteFingerprint',null,
    '{"trade_name":"Teste Modo Comercialização","legal_name":"Teste Modo Comercialização LTDA","tax_id":"11222333000181"}',
    request_id);
  fixture_deal_id := (saved->>'dealId')::uuid;
  fixture_contract_id := (saved->>'contractId')::uuid;
  fixture_company_id := (saved->>'companyId')::uuid;
  if saved->>'status'<>'reservada' or exists (
    select from public.installments i where i.contract_id=fixture_contract_id
  ) then raise exception 'Incorrect reservation %',saved; end if;
  if not exists (select from public.guided_sale_private_companies p where p.company_id=fixture_company_id)
    or not exists (
      select from public.guided_sale_private_participations a join public.company_participations p on p.id=a.participation_id
      where p.company_id=fixture_company_id and p.edition_id=edition
    ) then raise exception 'Company or participation not restricted'; end if;
  if public.save_guided_sale(edition,lot_ids,'{}',a_vista,quote->>'quoteFingerprint',null,
    '{"trade_name":"Teste Modo Comercialização","legal_name":"Teste Modo Comercialização LTDA","tax_id":"11222333000181"}',
    request_id) <> saved
    then raise exception 'Retry was not idempotent'; end if;
  begin
    perform public.save_guided_sale(edition,lot_ids,'{}',a_vista,quote->>'quoteFingerprint',fixture_company_id,null,request_id);
    raise exception 'Changed payload replay accepted';
  exception when unique_violation then null; end;
  begin
    perform public.save_deal(null,edition,fixture_company_id,null,null,null,lot_ids,array[108000,108000]::bigint[],null);
    raise exception 'Legacy flow claimed reserved lots';
  exception when raise_exception then
    if sqlerrm = 'Legacy flow claimed reserved lots' then raise; end if;
  end;
  begin
    perform public.set_contract_status(fixture_contract_id,'emitido',null);
    raise exception 'Canonical bypass issued contract';
  exception when insufficient_privilege then null; end;
  begin
    perform public.complete_guided_sale(fixture_deal_id,'Original recebido e assinado.');
    raise exception 'Signature without PDF accepted';
  exception when invalid_parameter_value then null; end;

  perform set_config('request.jwt.claim.sub',signer_id::text,true);
  attachment_key := gen_random_uuid();
  attachment := public.begin_guided_sale_attachment(edition,'Contrato teste.pdf','application/pdf',999,attachment_key);
  if public.begin_guided_sale_attachment(edition,'Contrato teste.pdf','application/pdf',999,attachment_key)
    <> attachment then raise exception 'Attachment stage not idempotent'; end if;
  insert into storage.objects(bucket_id,name) values ('documents',attachment->>'storage_path');
  saved := public.complete_guided_sale(fixture_deal_id,'Original recebido e assinado.',(attachment->>'id')::uuid,parcelado);
  if saved->>'status'<>'contratada' then raise exception 'Incorrect completed status %',saved; end if;
  if (select count(*) from public.installments i where i.contract_id=fixture_contract_id and i.status='aberta') <> 2
    or exists (
      select from public.payments p join public.installments i on i.id=p.installment_id where i.contract_id=fixture_contract_id
    ) then raise exception 'Incorrect installments or synthetic receipt'; end if;
  if exists (select from public.space_status_v where id=any(lot_ids) and commercial_status<>'vendido') then
    raise exception 'Canonical lot status mismatch';
  end if;
  inspected := public.get_guided_sale(fixture_deal_id);
  if jsonb_array_length(inspected->'attachments')<>1 or (inspected->>'createdBy')::uuid<>author_id
    or (inspected->'signature'->>'signedBy')::uuid<>signer_id
    or inspected->'signature'->>'documentId' <> attachment->>'id'
    or jsonb_array_length(inspected->'schedule') <> 2 or jsonb_array_length(inspected->'quote'->'schedule') <> 1
    or inspected->'company'->>'tradeName' <> 'Teste Modo Comercialização'
    then raise exception 'Missing audit, payment revision or PDF %',inspected; end if;

  perform public.set_contract_status(fixture_contract_id,'cancelado','Cancelamento da verificação.');
  if exists (select from public.space_status_v where id=any(lot_ids) and commercial_status<>'disponivel')
    or exists (select from public.installments i where i.contract_id=fixture_contract_id and i.status<>'cancelada')
    or (public.get_guided_sale(fixture_deal_id)->'signature'->>'documentId') is null then
    raise exception 'Canonical cancellation did not release stock or preserve evidence';
  end if;
end $check$;
select 'guided sale transactional workflow verified' as result;
rollback;
