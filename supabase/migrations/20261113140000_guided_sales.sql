begin;

-- A guided sale is a private, audited extension of a canonical deal and contract.
create table if not exists public.guided_sales (
  deal_id uuid primary key references public.deals(id),
  edition_id uuid not null references public.editions(id),
  contract_id uuid not null unique references public.contracts(id),
  company_id uuid not null references public.companies(id),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  idempotency_key uuid not null unique,
  payload_fingerprint text not null,
  quote jsonb not null,
  company_snapshot jsonb not null,
  payment jsonb not null,
  payment_schedule jsonb not null,
  signed_by uuid,
  signed_at timestamptz,
  signature_note text,
  signature_document_id uuid references public.documents(id),
  check ((signed_by is null) = (signed_at is null) and (signed_at is null) = (signature_note is null)
    and (signature_document_id is null) = (signed_at is null))
);

create table if not exists public.guided_sale_attachments (
  document_id uuid primary key references public.documents(id) on delete cascade,
  edition_id uuid not null references public.editions(id),
  staged_by uuid not null,
  deal_id uuid references public.guided_sales(deal_id),
  attached_by uuid,
  attached_at timestamptz,
  check ((deal_id is null) = (attached_at is null) and (attached_by is null) = (attached_at is null))
);
create index if not exists guided_sale_attachments_deal_idx
  on public.guided_sale_attachments(deal_id);

create table if not exists public.guided_sale_private_companies (
  company_id uuid primary key references public.companies(id) on delete cascade
);
create table if not exists public.guided_sale_private_participations (
  participation_id uuid primary key references public.company_participations(id) on delete cascade
);

alter table public.guided_sales enable row level security;
alter table public.guided_sale_attachments enable row level security;
alter table public.guided_sale_private_companies enable row level security;
alter table public.guided_sale_private_participations enable row level security;
revoke all on public.guided_sales, public.guided_sale_attachments,
  public.guided_sale_private_companies, public.guided_sale_private_participations
  from public, anon, authenticated;

create or replace function public.require_guided_sales_admin()
returns uuid language plpgsql stable security definer
set search_path = pg_catalog, public
as $admin$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Apenas administradores podem acessar o Modo Comercialização.'
      using errcode = '42501';
  end if;
  return auth.uid();
end $admin$;

create or replace function public.guided_sale_payment(
  p_edition_id uuid, p_policy_version integer, p_segment text, p_total bigint, p_input jsonb
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public
as $payment$
declare
  policy public.commercial_pricing_policies;
  local_today date;
  first_due date;
  last_due date;
  method text;
  mode text;
  installments integer;
  installment_interval integer;
  note text;
  discount text;
  discount_evidence text;
  fee_evidence text;
  fee_keys text[];
  fee_scope text := case when p_segment in ('external', 'automobile') then 'external' else 'internal' end;
  schedule jsonb;
begin
  select * into policy from public.commercial_pricing_policies
    where edition_id = p_edition_id and version = p_policy_version;
  if not found then
    raise exception 'A edição não possui uma política comercial publicada.' using errcode = '22023';
  end if;
  select (statement_timestamp() at time zone timezone)::date into strict local_today
    from public.editions where id = p_edition_id;
  if p_input is not null then
    if jsonb_typeof(p_input) <> 'object'
      or jsonb_typeof(p_input->'installmentCount') is distinct from 'number'
      or (p_input->>'installmentCount') !~ '^[0-9]{1,2}$'
      or coalesce(p_input->>'intervalMonths', '1') <> '1'
      or coalesce(p_input->>'firstDueOn', '') !~ '^\d{4}-\d{2}-\d{2}$'
    then raise exception 'Informe uma forma de pagamento e um vencimento válidos.' using errcode = '22023'; end if;

    method := p_input->>'method';
    mode := p_input->>'mode';
    installments := (p_input->>'installmentCount')::integer;
    installment_interval := 1;
    first_due := (p_input->>'firstDueOn')::date;
    note := nullif(btrim(p_input->>'note'), '');
    discount := nullif(btrim(p_input->>'discountModality'), '');
    discount_evidence := nullif(btrim(p_input->>'discountEvidence'), '');
    fee_evidence := nullif(btrim(p_input->>'feeEvidence'), '');
    if method is null or method not in ('pix','boleto','cartao','transferencia','dinheiro','outro')
      or mode is null or mode not in ('a_vista','parcelado')
      or installments < 1 or installments > policy.installment_limit
      or (mode = 'a_vista' and installments <> 1)
      or (mode = 'parcelado' and installments < 2)
      or (method = 'outro' and note is null)
      or length(note) > 1000
    then raise exception 'Revise a forma e a quantidade de parcelas.' using errcode = '22023'; end if;

    last_due := (first_due + make_interval(months => (installments - 1) * installment_interval))::date;
    if first_due < greatest(local_today, policy.first_document_due) or last_due > policy.last_document_due then
      raise exception 'O cronograma está fora do calendário da política comercial.' using errcode = '22023';
    end if;
    if discount is not null and (
      discount_evidence is null or length(discount_evidence) > 1000
      or not exists (
        select from public.commercial_discount_rules r
        where r.edition_id = p_edition_id and r.policy_version = p_policy_version and r.modality = discount
      )
      or (discount = 'cash_full' and mode <> 'a_vista')
      or (discount = 'installments_on_time' and (mode <> 'parcelado' or method not in ('cartao','boleto')))
    ) then raise exception 'Revise a condição e a evidência do desconto.' using errcode = '22023'; end if;

    if p_input ? 'feeKeys' and jsonb_typeof(p_input->'feeKeys') <> 'array' then
      raise exception 'Revise as taxas selecionadas.' using errcode = '22023';
    end if;
    select coalesce(array_agg(key order by key), '{}'::text[]) into fee_keys
      from jsonb_array_elements_text(coalesce(p_input->'feeKeys', '[]'::jsonb)) as keys(key);
    if cardinality(fee_keys) <> (
      select count(*) from public.commercial_fee_rules r
      where r.edition_id = p_edition_id and r.policy_version = p_policy_version
        and r.fee_key = any(fee_keys) and r.scope in (fee_scope, 'any')
    ) or (cardinality(fee_keys) > 0 and (fee_evidence is null or length(fee_evidence) > 1000)) then
      raise exception 'Confira as taxas aplicáveis e registre sua evidência.' using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'number', n, 'dueOn', (first_due + make_interval(months => (n - 1) * installment_interval))::date,
      'amountCents', p_total / installments + case when n = installments then p_total % installments else 0 end
    ) order by n), '[]'::jsonb) into schedule
    from generate_series(1, installments) as n;
  end if;

  return jsonb_build_object(
    'policy', jsonb_build_object('version', policy.version, 'firstDueOn', policy.first_document_due,
      'lastDueOn', policy.last_document_due, 'maxInstallments', policy.installment_limit, 'today', local_today),
    'payment', case when p_input is not null then jsonb_strip_nulls(jsonb_build_object(
      'method', method, 'mode', mode, 'installmentCount', installments, 'firstDueOn', first_due,
      'intervalMonths', installment_interval, 'note', note, 'discountModality', discount,
      'discountEvidence', case when discount is not null then discount_evidence end,
      'feeKeys', fee_keys, 'feeEvidence', case when cardinality(fee_keys) > 0 then fee_evidence end
    )) end,
    'schedule', coalesce(schedule, '[]'::jsonb)
  );
end $payment$;

create or replace function public.preview_guided_sale(
  p_edition_id uuid, p_space_ids uuid[], p_agreed_overrides jsonb default '{}', p_payment jsonb default null
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public
as $preview$
declare
  lot record;
  item jsonb;
  lots jsonb := '[]'::jsonb;
  overrides jsonb := coalesce(p_agreed_overrides, '{}'::jsonb);
  segment text;
  version integer;
  area numeric := 0;
  gross bigint := 0;
  amount bigint;
  total bigint := 0;
  reason text;
  payment jsonb;
  result jsonb;
begin
  perform public.require_guided_sales_admin();
  if not exists (select from public.editions where id = p_edition_id and is_active and not is_historical) then
    raise exception 'Selecione a edição ativa para comercializar os lotes.' using errcode = '22023';
  end if;
  if array_ndims(p_space_ids) is distinct from 1 or cardinality(p_space_ids) not between 1 and 500
    or cardinality(p_space_ids) <> (select count(distinct id) from unnest(p_space_ids) as ids(id))
  then raise exception 'Selecione entre 1 e 500 lotes distintos.' using errcode = '22023'; end if;
  if jsonb_typeof(overrides) <> 'object' or exists (
    select from jsonb_object_keys(overrides) k
    where not exists (select from unnest(p_space_ids) as ids(id) where id::text = k)
  ) then raise exception 'Os valores acordados devem corresponder aos lotes selecionados.' using errcode = '22023'; end if;

  for lot in
    select * from public.commercial_lot_facts_v
    where edition_id = p_edition_id and space_id = any(p_space_ids)
    order by space_id
  loop
    if lot.commercial_status <> 'disponivel' then
      raise exception 'O lote % não está mais disponível.', lot.lot_code using errcode = '23505';
    end if;
    if lot.area_pending or lot.area_m2 is null or lot.corner_state = 'pending'
      or lot.pricing_state in ('area_pending', 'corner_pending') then
      raise exception 'O lote % ainda precisa de revisão de área ou de esquina.', lot.lot_code
        using errcode = '22023';
    end if;
    if lot.pricing_state <> 'priced'
      and not (lot.pricing_state = 'no_tariff' and lot.segment_key in ('p1', 'automobile'))
    then raise exception 'A política comercial ainda não permite a venda do lote %.', lot.lot_code
      using errcode = '22023'; end if;
    if segment is null then
      segment := lot.segment_key;
      version := lot.policy_version;
    end if;
    if segment is distinct from lot.segment_key or version is distinct from lot.policy_version then
      raise exception 'Selecione os lotes do mesmo pavilhão ou segmento externo.' using errcode = '22023';
    end if;

    item := overrides->(lot.space_id::text);
    reason := null;
    if item is not null then
      reason := nullif(btrim(item->>'reason'), '');
      if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'amountCents') is distinct from 'number'
        or coalesce(item->>'amountCents', '') !~ '^[1-9][0-9]{0,11}$'
        or reason is null or length(reason) > 500
      then raise exception 'Informe um valor acordado e a justificativa para o lote %.', lot.lot_code
        using errcode = '22023'; end if;
      amount := (item->>'amountCents')::bigint;
    else
      amount := lot.gross_cents;
    end if;
    if amount is null or amount <= 0 then
      raise exception 'Informe o valor acordado e a justificativa para o lote %.', lot.lot_code
        using errcode = '22023';
    end if;
    area := area + lot.area_m2;
    gross := gross + lot.gross_cents;
    total := total + amount;
    lots := lots || jsonb_build_array(jsonb_build_object(
      'id', lot.space_id, 'code', lot.lot_code, 'areaM2', lot.area_m2,
      'tariffCents', lot.tariff_cents, 'tableCents', lot.gross_cents, 'grossCents', lot.gross_cents,
      'agreedCents', amount,
      'priceReason', reason, 'planRevisionId', lot.plan_revision_id, 'pricingState', lot.pricing_state,
      'cornerState', lot.corner_state
    ));
  end loop;
  if jsonb_array_length(lots) <> cardinality(p_space_ids) then
    raise exception 'Há um lote sem vínculo comercial nesta edição.' using errcode = '22023';
  end if;

  payment := public.guided_sale_payment(p_edition_id, version, segment, total, p_payment);
  result := jsonb_build_object(
    'editionId', p_edition_id, 'segmentKey', segment, 'lots', lots,
    'areaM2', area, 'grossCents', gross, 'totalCents', total
  ) || payment;
  return result || jsonb_build_object(
    'quoteFingerprint', encode(extensions.digest(result::text, 'sha256'), 'hex')
  );
end $preview$;

create or replace function public.begin_guided_sale_attachment(
  p_edition_id uuid, p_name text, p_mime text, p_size bigint, p_idempotency_key uuid
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $attachment$
declare
  actor uuid := public.require_guided_sales_admin();
  storage_key text := 'guided-sale:' || p_idempotency_key::text;
  prior public.documents;
  result jsonb;
begin
  if p_idempotency_key is null or p_name is null or length(p_name) > 255 or p_name !~* '\.pdf$'
    or p_mime is distinct from 'application/pdf'
  then raise exception 'Envie um contrato em PDF.' using errcode = '22023'; end if;
  if not exists (select from public.editions where id = p_edition_id and is_active and not is_historical) then
    raise exception 'Selecione a edição ativa para anexar o contrato.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || storage_key, 0));
  select d.* into prior from public.documents d
    where d.uploaded_by = actor and d.idempotency_key = storage_key;
  if found and (
    prior.edition_id is distinct from p_edition_id or prior.name is distinct from p_name
    or prior.mime_type is distinct from p_mime or prior.size_bytes is distinct from p_size
    or not exists (select from public.guided_sale_attachments where document_id = prior.id)
  ) then
    raise exception 'A chave do arquivo já está em uso. Selecione o PDF novamente.' using errcode = '22023';
  end if;

  result := public.begin_document_upload(p_edition_id, p_name, null, null, 'contrato',
    p_mime, p_size, '[]'::jsonb, storage_key);
  insert into public.guided_sale_attachments(document_id, edition_id, staged_by)
  values ((result->>'id')::uuid, p_edition_id, actor)
  on conflict (document_id) do nothing;
  return result;
end $attachment$;

create or replace function public.cancel_guided_sale_attachment(p_attachment_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $cancel_attachment$
declare
  actor uuid := public.require_guided_sales_admin();
  attachment public.guided_sale_attachments;
  doc public.documents;
begin
  select * into attachment from public.guided_sale_attachments where document_id = p_attachment_id for update;
  if not found then return; end if;
  if attachment.staged_by <> actor or attachment.deal_id is not null then
    raise exception 'Somente quem iniciou um envio pendente pode cancelá-lo.' using errcode = '42501';
  end if;
  select * into strict doc from public.documents where id = p_attachment_id for update;
  if exists (select from storage.objects where bucket_id = 'documents' and name = doc.storage_path) then
    raise exception 'Remova o arquivo pendente do armazenamento antes de cancelar.' using errcode = '22023';
  end if;
  perform public.cancel_document_upload(p_attachment_id);
end $cancel_attachment$;

create or replace function public.attach_guided_sale_contract(p_deal_id uuid, p_attachment_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $attach$
declare
  actor uuid := public.require_guided_sales_admin();
  sale public.guided_sales;
  attachment public.guided_sale_attachments;
  doc public.documents;
begin
  select * into sale from public.guided_sales where deal_id = p_deal_id for update;
  if not found then raise exception 'Venda não encontrada.' using errcode = '22023'; end if;
  select * into attachment from public.guided_sale_attachments where document_id = p_attachment_id for update;
  if not found or attachment.edition_id <> sale.edition_id then
    raise exception 'O contrato precisa pertencer à edição da venda.' using errcode = '22023';
  end if;
  if attachment.deal_id = sale.deal_id then return; end if;
  if attachment.deal_id is not null or attachment.staged_by <> actor then
    raise exception 'Use um PDF enviado por você para esta venda.' using errcode = '42501';
  end if;
  select * into strict doc from public.documents where id = p_attachment_id for update;
  if doc.root_id <> doc.id or doc.uploaded_by <> actor or doc.status <> 'pendente'
    or doc.mime_type <> 'application/pdf' or doc.category <> 'contrato' then
    raise exception 'Envie um contrato em PDF pelo Modo Comercialização.' using errcode = '22023';
  end if;
  if exists (select from public.document_links where document_id = doc.id) then
    raise exception 'O arquivo já pertence a outro registro.' using errcode = '22023';
  end if;
  update public.guided_sale_attachments
    set deal_id = sale.deal_id, attached_by = actor, attached_at = now()
    where document_id = doc.id;
  perform public.finalize_document_upload(doc.id);
  insert into public.document_links(document_id, entity_type, entity_id) values
    (doc.id, 'deal', sale.deal_id), (doc.id, 'contract', sale.contract_id);
end $attach$;

create or replace function public.guard_guided_sale_document()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $document_guard$
begin
  if tg_table_name = 'document_links' then
    if exists (
      select from public.guided_sale_attachments a join public.guided_sales s using (deal_id)
      where a.document_id = old.document_id
        and ((old.entity_type = 'deal' and old.entity_id = s.deal_id)
          or (old.entity_type = 'contract' and old.entity_id = s.contract_id))
    ) then raise exception 'O vínculo original do PDF da venda é permanente.' using errcode = '42501'; end if;
    return old;
  end if;
  if old.status = 'pendente' and new.status = 'ativo' and exists (
    select from public.guided_sale_attachments a where a.document_id = new.id and a.deal_id is null
  ) then raise exception 'Vincule o PDF a uma venda para finalizar o envio.' using errcode = '42501'; end if;
  return new;
end $document_guard$;
drop trigger if exists guided_sale_document_activation on public.documents;
create trigger guided_sale_document_activation before update of status on public.documents
for each row execute function public.guard_guided_sale_document();
drop trigger if exists guided_sale_document_link_removal on public.document_links;
create trigger guided_sale_document_link_removal before delete on public.document_links
for each row execute function public.guard_guided_sale_document();

-- Serialize canonical stock mutations per edition, then lock physical lot rows.
-- Both direct commercial work and the wizard use these same functions.
create or replace function public.lock_guided_sale_edition(p_edition_id uuid)
returns void language sql security definer
set search_path = pg_catalog, public
as $edition_lock$
  select pg_advisory_xact_lock(hashtextextended('commercial-edition:' || p_edition_id::text, 0))
$edition_lock$;


create or replace function public.create_contract_from_deal(p_deal_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare d record; v_id uuid; v_body text; v_num text; v_edition uuid; v_year text; v_sequence bigint;
begin
  if not public.can_write('contratos') then raise exception 'Sem permissão'; end if;
  select edition_id into v_edition from public.deals where id = p_deal_id;
  perform public.lock_guided_sale_edition(v_edition);
  select * into d from public.deals where id = p_deal_id for update;
  if d.id is null then raise exception 'Negociação não encontrada'; end if;
  if exists (select from public.guided_sales where deal_id = p_deal_id) then
    perform public.require_guided_sales_admin();
  end if;
  if d.status not in ('negociacao','reservada') then raise exception 'O contrato pode ser preparado para negociações em andamento ou reservadas'; end if;
  select id into v_id from public.contracts where deal_id = p_deal_id and status <> 'cancelado';
  if v_id is not null then return v_id; end if;
  select coalesce(contract_template, '') into v_body from public.editions where id = d.edition_id;
  select to_char(now() at time zone timezone, 'YYYY') into v_year from public.editions where id = d.edition_id;
  select coalesce(max(substring(number from 6)::bigint), 0) + 1 into v_sequence
  from public.contracts
  where edition_id = d.edition_id and number ~ ('^' || v_year || '-[0-9]{1,15}$');
  v_num := v_year || '-' || lpad(v_sequence::text, greatest(4, length(v_sequence::text)), '0');
  insert into public.contracts(edition_id, deal_id, company_id, number, body, total_cents, created_by, deal_snapshot)
  values (d.edition_id, d.id, d.company_id, v_num, v_body, d.total_cents, auth.uid(), public.deal_snapshot(d.id)) returning id into v_id;
  insert into public.contract_spaces(contract_id, space_id) select v_id, space_id from public.deal_spaces where deal_id = d.id;
  insert into public.contract_versions(contract_id, version, body, created_by) values (v_id, 1, v_body, auth.uid());
  return v_id;
end $$;

create or replace function public.set_contract_status(p_contract_id uuid, p_to contract_status, p_note text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare c record; v_deal deal_status; v_edition uuid; v_deal_id uuid;
begin
  if not public.can_write('contratos') then raise exception 'Sem permissão'; end if;
  select edition_id, deal_id into v_edition, v_deal_id from public.contracts where id = p_contract_id;
  perform public.lock_guided_sale_edition(v_edition);
  select status into v_deal from public.deals where id = v_deal_id for update;
  select * into c from public.contracts where id = p_contract_id for update;
  if c.id is null then raise exception 'Contrato não encontrado'; end if;
  if not (
    (c.status = 'elaboracao' and p_to in ('emitido','cancelado')) or
    (c.status = 'emitido' and p_to in ('elaboracao','assinado','cancelado')) or
    (c.status = 'assinado' and p_to = 'cancelado')
  ) then raise exception 'Transição inválida: % → %', c.status, p_to; end if;
  if p_to = 'assinado' and coalesce(trim(p_note),'') = '' then raise exception 'Descreva como a assinatura foi obtida'; end if;
  if p_to = 'cancelado' and coalesce(trim(p_note),'') = '' then raise exception 'Informe o motivo do cancelamento'; end if;
  if p_to = 'assinado' and v_deal not in ('reservada','negociacao','contratada') then
    raise exception 'A negociação está % e não pode ser contratada', v_deal;
  end if;
  update public.contracts set status = p_to,
    issued_at = case when p_to = 'emitido' then now() else issued_at end,
    signed_at = case when p_to = 'assinado' then now() else signed_at end,
    signature_note = case when p_to = 'assinado' then p_note else signature_note end
  where id = p_contract_id;
  if p_to = 'assinado' and v_deal <> 'contratada' then
    update public.deals set status = 'contratada' where id = c.deal_id;
    insert into public.deal_events(deal_id, from_status, to_status, note, actor)
    values (c.deal_id, v_deal, 'contratada', 'Assinatura do contrato ' || coalesce(c.number,'') || ' registrada', auth.uid());
  elsif p_to = 'cancelado' then
    perform public.reconcile_contract_cancellation(c.id);
    if v_deal not in ('perdida','cancelada') then
      update public.deals set status = 'cancelada' where id = c.deal_id;
      insert into public.deal_events(deal_id, from_status, to_status, note, actor)
      values (c.deal_id, v_deal, 'cancelada', 'Contrato cancelado: ' || p_note, auth.uid());
    end if;
  end if;
end $$;

create or replace function public.transition_deal(p_deal_id uuid, p_to deal_status, p_note text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_from deal_status; r record; v_edition uuid;
begin
  if not public.can_write('comercial') then raise exception 'Sem permissão'; end if;
  select edition_id into v_edition from public.deals where id = p_deal_id;
  perform public.lock_guided_sale_edition(v_edition);
  select status into v_from from public.deals where id = p_deal_id for update;
  if v_from is null then raise exception 'Negociação não encontrada'; end if;
  if not (
    (v_from = 'proposta' and p_to in ('negociacao','perdida','cancelada')) or
    (v_from = 'negociacao' and p_to in ('proposta','reservada','perdida','cancelada')) or
    (v_from = 'reservada' and p_to in ('negociacao','contratada','cancelada')) or
    (v_from = 'contratada' and p_to in ('cancelada'))
  ) then raise exception 'Transição inválida: % → %', v_from, p_to; end if;
  if p_to = 'contratada' and not exists (select 1 from public.contracts where deal_id = p_deal_id and status = 'assinado') then
    raise exception 'Só é possível marcar como contratada após registrar a assinatura do contrato';
  end if;
  if p_to in ('perdida','cancelada') and coalesce(trim(p_note),'') = '' then raise exception 'Informe o motivo'; end if;
  if p_to in ('proposta','negociacao') and exists (select 1 from public.contracts where deal_id = p_deal_id and status in ('emitido','assinado')) then
    raise exception 'Há contrato emitido ou assinado. Volte o contrato para elaboração ou cancele-o antes';
  end if;
  update public.deals set status = p_to, reserved_at = case when p_to = 'reservada' then now() else reserved_at end where id = p_deal_id;
  insert into public.deal_events(deal_id, from_status, to_status, note, actor) values (p_deal_id, v_from, p_to, p_note, auth.uid());
  if p_to in ('perdida','cancelada') then
    for r in select id from public.contracts where deal_id = p_deal_id and status <> 'cancelado' for update loop
      update public.contracts set status = 'cancelado' where id = r.id;
      perform public.reconcile_contract_cancellation(r.id);
    end loop;
  end if;
end $$;

create or replace function public.save_deal(p_deal_id uuid, p_edition_id uuid, p_company_id uuid, p_owner_id uuid, p_conditions text, p_notes text, p_space_ids uuid[], p_prices bigint[], p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid; v_conflict text; v_status deal_status; i int;
begin
  if not public.can_write('comercial') then raise exception 'Sem permissão para editar negociações'; end if;
  perform public.lock_guided_sale_edition(p_edition_id);
  if p_deal_id is not null and not exists (
    select from public.deals where id = p_deal_id and edition_id = p_edition_id
  ) then raise exception 'A negociação não pertence a esta edição.'; end if;
  if p_deal_id is not null and exists (select from public.guided_sales where deal_id = p_deal_id) then
    raise exception 'As condições originais ficam no histórico da venda.' using errcode = '42501';
  end if;
  if p_space_ids is null or array_length(p_space_ids,1) is null then raise exception 'Selecione ao menos um espaço'; end if;
  if array_length(p_space_ids,1) <> coalesce(array_length(p_prices,1),0) then raise exception 'Valores inconsistentes'; end if;
  if p_deal_id is null and p_idempotency_key is not null then
    select id into v_id from public.deals where idempotency_key = p_idempotency_key;
    if v_id is not null then
      if exists (select from public.guided_sales where deal_id = v_id) then
        perform public.require_guided_sales_admin();
      end if;
      return v_id;
    end if;
  end if;
  if p_deal_id is not null and exists (select 1 from public.contracts where deal_id = p_deal_id and status in ('emitido','assinado')) then
    raise exception 'Negociação com contrato emitido ou assinado não pode ser editada. Volte o contrato para elaboração antes';
  end if;
  perform 1 from public.spaces where id = any(p_space_ids) order by id for update;
  if (select count(*) from public.spaces where id = any(p_space_ids) and edition_id = p_edition_id) <> array_length(p_space_ids,1) then
    raise exception 'Espaço inválido para esta edição';
  end if;
  select string_agg(s.code, ', ') into v_conflict from public.spaces s where s.id = any(p_space_ids) and s.blocked;
  if v_conflict is not null then raise exception 'Espaço bloqueado: %', v_conflict; end if;
  select string_agg(distinct s.code, ', ') into v_conflict
    from public.deal_spaces ds join public.deals d on d.id = ds.deal_id join public.spaces s on s.id = ds.space_id
    where ds.space_id = any(p_space_ids) and d.status in ('proposta','negociacao','reservada','contratada')
      and (p_deal_id is null or d.id <> p_deal_id);
  if v_conflict is not null then raise exception 'Espaço já vinculado a outra negociação ativa: %', v_conflict; end if;
  if p_deal_id is null then
    insert into public.deals(edition_id, company_id, owner_id, conditions, notes, idempotency_key, created_by)
    values (p_edition_id, p_company_id, coalesce(p_owner_id, auth.uid()), p_conditions, p_notes, p_idempotency_key, auth.uid())
    returning id into v_id;
    insert into public.deal_events(deal_id, to_status, note, actor) values (v_id, 'proposta', 'Negociação criada', auth.uid());
    insert into public.company_participations(company_id, edition_id, status) values (p_company_id, p_edition_id, 'em_negociacao')
      on conflict (company_id, edition_id) do nothing;
  else
    select status into v_status from public.deals where id = p_deal_id for update;
    if v_status in ('contratada','perdida','cancelada') then raise exception 'Negociação % não pode ser editada', v_status; end if;
    update public.deals set company_id = p_company_id, owner_id = p_owner_id, conditions = p_conditions, notes = p_notes where id = p_deal_id;
    delete from public.deal_spaces where deal_id = p_deal_id;
    v_id := p_deal_id;
  end if;
  for i in 1..array_length(p_space_ids,1) loop
    insert into public.deal_spaces(deal_id, space_id, price_cents) values (v_id, p_space_ids[i], coalesce(p_prices[i],0));
  end loop;
  update public.deals set total_cents = (select coalesce(sum(price_cents),0) from public.deal_spaces where deal_id = v_id) where id = v_id;
  return v_id;
end $$;

create or replace function public.guard_guided_sale_signature()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $signature_guard$
declare
  sale public.guided_sales;
begin
  select * into sale from public.guided_sales where contract_id = old.id;
  if not found then return new; end if;
  if old.edition_id is distinct from new.edition_id or old.company_id is distinct from new.company_id
    or old.deal_id is distinct from new.deal_id or old.created_by is distinct from new.created_by
    or old.total_cents is distinct from new.total_cents or old.deal_snapshot is distinct from new.deal_snapshot
  then raise exception 'A identidade e a cotação da venda ficam registradas no histórico.' using errcode = '42501'; end if;
  if old.status is distinct from new.status and new.status in ('emitido', 'assinado')
    and (sale.signed_by is distinct from auth.uid() or sale.signed_at is null
      or (new.status = 'assinado' and sale.signature_note is distinct from new.signature_note)
      or not exists (
        select from public.guided_sale_attachments a
        join public.documents d on d.id = a.document_id
        join public.document_links l on l.document_id = d.id
        where a.deal_id = sale.deal_id and d.status = 'ativo' and d.mime_type = 'application/pdf'
          and l.entity_type = 'contract' and l.entity_id = sale.contract_id
      ))
  then raise exception 'Anexe o contrato e registre a assinatura pelo Modo Comercialização.' using errcode = '42501'; end if;
  return new;
end $signature_guard$;
drop trigger if exists guided_sale_signature on public.contracts;
create trigger guided_sale_signature before update on public.contracts
for each row execute function public.guard_guided_sale_signature();

create or replace function public.guard_guided_sale_deal()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $deal_guard$
begin
  if tg_table_name = 'deal_spaces' then
    if (tg_op <> 'INSERT' and exists (select from public.guided_sales where deal_id = old.deal_id))
      or (tg_op <> 'DELETE' and exists (select from public.guided_sales where deal_id = new.deal_id))
    then raise exception 'Os lotes da venda ficam registrados no histórico.' using errcode = '42501'; end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if exists (select from public.guided_sales where deal_id = old.id) and (
    old.created_by is distinct from new.created_by
    or old.owner_id is distinct from new.owner_id
    or old.edition_id is distinct from new.edition_id
    or old.company_id is distinct from new.company_id
    or old.total_cents is distinct from new.total_cents
    or old.conditions is distinct from new.conditions
    or old.notes is distinct from new.notes
    or (new.status is distinct from old.status and new.status not in ('contratada','cancelada','perdida'))
  ) then raise exception 'A constituição da venda fica registrada no histórico.' using errcode = '42501'; end if;
  return new;
end $deal_guard$;
drop trigger if exists guided_sale_deal_update on public.deals;
create trigger guided_sale_deal_update before update on public.deals
for each row execute function public.guard_guided_sale_deal();
drop trigger if exists guided_sale_lot_history on public.deal_spaces;
create trigger guided_sale_lot_history before insert or update or delete on public.deal_spaces
for each row execute function public.guard_guided_sale_deal();

create or replace function public.guided_sale_result(p_deal_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public
as $result$
  select jsonb_build_object('dealId', s.deal_id, 'contractId', s.contract_id,
    'companyId', s.company_id, 'status', d.status)
  from public.guided_sales s join public.deals d on d.id = s.deal_id
  where s.deal_id = p_deal_id
$result$;

create or replace function public.get_guided_sale(p_deal_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public
as $get$
declare
  result jsonb;
begin
  perform public.require_guided_sales_admin();
  select public.guided_sale_result(s.deal_id) || jsonb_build_object(
    'editionId', s.edition_id, 'createdBy', s.created_by, 'createdAt', s.created_at,
    'createdByName', p.full_name, 'quote', s.quote, 'payment', s.payment,
    'schedule', s.payment_schedule,
    'company', s.company_snapshot,
    'signature', case when s.signed_at is not null then jsonb_build_object(
      'signedBy', s.signed_by, 'signedAt', s.signed_at, 'note', s.signature_note,
      'documentId', s.signature_document_id
    ) end,
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', current_doc.id, 'name', current_doc.name, 'createdAt', current_doc.created_at,
        'storagePath', current_doc.storage_path
      ) order by a.attached_at, a.document_id)
      from public.guided_sale_attachments a
      join public.documents current_doc on current_doc.root_id = a.document_id and current_doc.is_current
        and current_doc.status = 'ativo'
      where a.deal_id = s.deal_id and public.can_read_document(current_doc.id)
    ), '[]'::jsonb)
  ) into result from public.guided_sales s
  left join public.profiles p on p.id = s.created_by
  where s.deal_id = p_deal_id;
  return result;
end $get$;

create or replace function public.complete_guided_sale(
  p_deal_id uuid, p_signature_note text, p_attachment_id uuid default null, p_payment jsonb default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $complete$
declare
  actor uuid := public.require_guided_sales_admin();
  sale public.guided_sales;
  deal public.deals;
  contract public.contracts;
  signed_note text := nullif(btrim(p_signature_note), '');
  verified jsonb;
  normalized_payment jsonb;
  current_terms integer;
  existing_edition uuid;
  signed_document_id uuid;
  expected_space_ids uuid[];
begin
  if signed_note is null or length(signed_note) > 1000 then
    raise exception 'Registre como a assinatura do contrato foi obtida.' using errcode = '22023';
  end if;
  select edition_id into existing_edition from public.guided_sales where deal_id = p_deal_id;
  perform public.lock_guided_sale_edition(existing_edition);
  select * into sale from public.guided_sales where deal_id = p_deal_id for update;
  if not found then raise exception 'Venda não encontrada.' using errcode = '22023'; end if;
  select * into strict deal from public.deals where id = p_deal_id for update;
  select * into strict contract from public.contracts where id = sale.contract_id for update;
  if deal.status = 'contratada' and contract.status = 'assinado' then
    if sale.signature_note is distinct from signed_note or sale.signed_by is distinct from actor
      or (p_attachment_id is not null and not exists (
        select from public.guided_sale_attachments where document_id = p_attachment_id and deal_id = sale.deal_id
      ))
    then raise exception 'Esta venda já tem assinatura registrada.' using errcode = '23505'; end if;
    return public.guided_sale_result(sale.deal_id);
  end if;
  if deal.status <> 'reservada' or contract.status <> 'elaboracao'
    or not exists (select from public.editions where id = sale.edition_id and is_active and not is_historical)
  then raise exception 'A venda não está aguardando assinatura na edição ativa.' using errcode = '22023'; end if;

  select array_agg((lot->>'id')::uuid order by (lot->>'id')::uuid)
    into expected_space_ids from jsonb_array_elements(sale.quote->'lots') as lots(lot);
  perform from public.spaces where edition_id = sale.edition_id and id = any(expected_space_ids)
    order by id for update;
  if expected_space_ids is distinct from (
      select array_agg(space_id order by space_id) from public.contract_spaces where contract_id = sale.contract_id
    ) or exists (
      select from unnest(expected_space_ids) as requested(space_id)
      left join public.commercial_lot_facts_v f
        on f.edition_id = sale.edition_id and f.space_id = requested.space_id
      where f.commercial_status is distinct from 'reservado' or f.active_deal_id is distinct from sale.deal_id
    )
  then raise exception 'Os lotes da reserva mudaram. Confira a situação no mapa antes de concluir.'
    using errcode = '40001'; end if;

  if p_attachment_id is not null then
    perform public.attach_guided_sale_contract(p_deal_id, p_attachment_id);
  end if;
  select d.id into signed_document_id
  from public.guided_sale_attachments a
  join public.documents root on root.id = a.document_id
  join public.documents d on d.root_id = root.id and d.is_current
  join storage.objects o on o.bucket_id = 'documents' and o.name = d.storage_path
  where a.deal_id = sale.deal_id and d.status = 'ativo' and d.mime_type = 'application/pdf'
    and (p_attachment_id is null or p_attachment_id = a.document_id)
  order by a.attached_at desc, a.document_id desc limit 1
  for share of root, d;
  if signed_document_id is null then
    raise exception 'Anexe o contrato assinado em PDF para concluir a venda.' using errcode = '22023';
  end if;

  verified := public.guided_sale_payment(sale.edition_id, contract.pricing_policy_version,
    sale.quote->>'segmentKey', deal.total_cents, coalesce(p_payment, sale.payment));
  normalized_payment := verified->'payment';
  select coalesce(max(version), 0) into current_terms from public.commercial_contract_terms
  where edition_id = sale.edition_id and contract_id = sale.contract_id;
  if normalized_payment is distinct from sale.payment or current_terms = 0 then
    perform public.record_contract_pricing_terms(sale.contract_id, current_terms,
      normalized_payment->>'discountModality', normalized_payment->>'discountEvidence',
      array(select jsonb_array_elements_text(normalized_payment->'feeKeys')), normalized_payment->>'feeEvidence', null);
  end if;

  update public.guided_sales set payment = normalized_payment, payment_schedule = verified->'schedule',
    signed_at = now(), signed_by = actor, signature_note = signed_note,
    signature_document_id = signed_document_id where deal_id = sale.deal_id;
  perform public.set_contract_status(sale.contract_id, 'emitido', null);
  perform public.set_contract_status(sale.contract_id, 'assinado', signed_note);
  perform public.generate_installments(sale.contract_id, (normalized_payment->>'installmentCount')::integer,
    (normalized_payment->>'firstDueOn')::date, (normalized_payment->>'intervalMonths')::integer);
  return public.guided_sale_result(sale.deal_id);
end $complete$;

create or replace function public.save_guided_sale(
  p_edition_id uuid, p_space_ids uuid[], p_agreed_overrides jsonb, p_payment jsonb,
  p_quote_fingerprint text, p_company_id uuid, p_company jsonb, p_idempotency_key uuid,
  p_signature_note text default null, p_attachment_id uuid default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $save$
declare
  actor uuid := public.require_guided_sales_admin();
  prior public.guided_sales;
  expected_fingerprint text;
  quote jsonb;
  payment jsonb;
  space_ids uuid[];
  prices bigint[];
  saved_company_id uuid := p_company_id;
  prior_participation_id uuid;
  created_participation_id uuid;
  saved_deal_id uuid;
  saved_contract_id uuid;
  saved_company_snapshot jsonb;
  signed_note text := nullif(btrim(p_signature_note), '');
begin
  if p_idempotency_key is null or p_quote_fingerprint is null
    or jsonb_typeof(p_payment) is distinct from 'object' then
    raise exception 'Revise os valores e a forma de pagamento antes de salvar.' using errcode = '22023';
  end if;
  if (p_company_id is null) = (p_company is null) then
    raise exception 'Selecione uma empresa existente ou preencha um novo cadastro.' using errcode = '22023';
  end if;
  if signed_note is not null and p_attachment_id is null then
    raise exception 'Anexe o contrato assinado em PDF para concluir a venda.' using errcode = '22023';
  end if;
  select array_agg(id order by id) into space_ids from unnest(p_space_ids) as ids(id);
  expected_fingerprint := encode(extensions.digest(jsonb_build_array(
    p_edition_id, space_ids, coalesce(p_agreed_overrides, '{}'::jsonb), p_payment, p_quote_fingerprint,
    p_company_id, p_company, signed_note, p_attachment_id
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('guided-sale:' || p_idempotency_key::text, 0));
  select * into prior from public.guided_sales where idempotency_key = p_idempotency_key;
  if found then
    if prior.created_by <> actor or prior.payload_fingerprint <> expected_fingerprint then
      raise exception 'A chave da venda já foi usada para outros dados.' using errcode = '23505';
    end if;
    return public.guided_sale_result(prior.deal_id);
  end if;

  perform public.lock_guided_sale_edition(p_edition_id);
  perform from public.editions where id = p_edition_id and is_active and not is_historical for share;
  if not found then raise exception 'Selecione a edição ativa para comercializar os lotes.' using errcode = '22023'; end if;
  perform from public.commercial_pricing_policies where edition_id = p_edition_id for share;
  -- The external review/link operations lock their documentary row before spaces.
  perform from public.commercial_external_geometry g
    join public.commercial_external_space_links l using (edition_id, lot_number)
    where g.edition_id = p_edition_id and l.space_id = any(space_ids)
    order by g.lot_number for share of g;
  perform from public.pavilion_plan_revisions p
    where p.edition_id = p_edition_id and p.is_current and exists (
      select from public.pavilion_environments e
      where e.edition_id = p.edition_id and e.pavilion_number = p.pavilion_number
        and e.space_id = any(space_ids)
    ) order by p.pavilion_number for share;
  perform from public.spaces where edition_id = p_edition_id and id = any(space_ids)
    order by id for update;

  quote := public.preview_guided_sale(p_edition_id, p_space_ids, p_agreed_overrides, p_payment);
  if quote->>'quoteFingerprint' is distinct from p_quote_fingerprint then
    raise exception 'A cotação foi alterada. Revise os valores e confirme novamente.' using errcode = '40001';
  end if;
  payment := quote->'payment';
  select array_agg((lot->>'agreedCents')::bigint order by (lot->>'id')::uuid) into prices
  from jsonb_array_elements(quote->'lots') as lots(lot);

  if saved_company_id is null then
    if jsonb_typeof(p_company) <> 'object' or nullif(btrim(p_company->>'tax_id'), '') is null then
      raise exception 'Informe a identificação e os dados da empresa.' using errcode = '22023';
    end if;
    saved_company_id := (public.save_company_participation(null, p_edition_id,
      p_company, null, null, null, 'guided-sale:' || p_idempotency_key::text)->>'company_id')::uuid;
    insert into public.guided_sale_private_companies(company_id) values (saved_company_id);
  else
    perform from public.companies where id = saved_company_id and not is_demo for update;
    if not found then raise exception 'Empresa não encontrada.' using errcode = '22023'; end if;
    select id into prior_participation_id from public.company_participations
    where company_id = saved_company_id and edition_id = p_edition_id for update;
  end if;

  saved_deal_id := public.save_deal(null, p_edition_id, saved_company_id, actor, null, null,
    space_ids, prices, null);
  if prior_participation_id is null then
    select id into strict created_participation_id from public.company_participations
    where company_id = saved_company_id and edition_id = p_edition_id;
    insert into public.guided_sale_private_participations(participation_id)
    values (created_participation_id) on conflict do nothing;
  end if;
  perform public.transition_deal(saved_deal_id, 'negociacao', 'Criada pelo Modo Comercialização');
  perform public.transition_deal(saved_deal_id, 'reservada', 'Aguardando assinatura do contrato');
  saved_contract_id := public.create_contract_from_deal(saved_deal_id);
  select jsonb_build_object('id', c.id, 'legalName', c.legal_name, 'tradeName', c.trade_name,
    'taxId', c.tax_id) into strict saved_company_snapshot
    from public.companies c where c.id = saved_company_id;
  insert into public.guided_sales(deal_id, edition_id, contract_id, company_id, created_by,
    idempotency_key, payload_fingerprint, quote, company_snapshot, payment, payment_schedule)
  values (saved_deal_id, p_edition_id, saved_contract_id, saved_company_id, actor,
    p_idempotency_key, expected_fingerprint, quote, saved_company_snapshot, payment, quote->'schedule');
  perform public.record_contract_pricing_terms(saved_contract_id, 0,
    payment->>'discountModality', payment->>'discountEvidence',
    array(select jsonb_array_elements_text(payment->'feeKeys')), payment->>'feeEvidence', null);

  if signed_note is not null then
    return public.complete_guided_sale(saved_deal_id, signed_note, p_attachment_id, null);
  end if;
  if p_attachment_id is not null then
    perform public.attach_guided_sale_contract(saved_deal_id, p_attachment_id);
  end if;
  return public.guided_sale_result(saved_deal_id);
end $save$;

revoke all on function public.require_guided_sales_admin(),
  public.guided_sale_payment(uuid,integer,text,bigint,jsonb),
  public.guided_sale_result(uuid), public.lock_guided_sale_edition(uuid),
  public.guard_guided_sale_document(), public.guard_guided_sale_signature(),
  public.guard_guided_sale_deal()
  from public, anon, authenticated;

revoke all on function public.preview_guided_sale(uuid,uuid[],jsonb,jsonb),
  public.save_guided_sale(uuid,uuid[],jsonb,jsonb,text,uuid,jsonb,uuid,text,uuid),
  public.get_guided_sale(uuid), public.complete_guided_sale(uuid,text,uuid,jsonb),
  public.begin_guided_sale_attachment(uuid,text,text,bigint,uuid),
  public.cancel_guided_sale_attachment(uuid), public.attach_guided_sale_contract(uuid,uuid)
  from public, anon;
grant execute on function public.preview_guided_sale(uuid,uuid[],jsonb,jsonb),
  public.save_guided_sale(uuid,uuid[],jsonb,jsonb,text,uuid,jsonb,uuid,text,uuid),
  public.get_guided_sale(uuid), public.complete_guided_sale(uuid,text,uuid,jsonb),
  public.begin_guided_sale_attachment(uuid,text,text,bigint,uuid),
  public.cancel_guided_sale_attachment(uuid), public.attach_guided_sale_contract(uuid,uuid)
  to authenticated;

commit;
