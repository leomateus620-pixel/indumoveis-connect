begin;

alter table public.contracts add column if not exists pricing_policy_version integer;
do $constraint$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.contracts'::regclass
    and conname = 'contracts_pricing_policy_fk') then
    alter table public.contracts add constraint contracts_pricing_policy_fk
      foreign key (edition_id, pricing_policy_version) references public.commercial_pricing_policies;
  end if;
end $constraint$;

-- Bind a new contract to the published policy for its edition. Existing
-- contracts retain a null version, including drafts and installment schedules.
create or replace function public.assign_contract_pricing_policy()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $assign$
begin
  if tg_op = 'UPDATE' then
    if new.pricing_policy_version is distinct from old.pricing_policy_version
      or (old.pricing_policy_version is not null and new.edition_id is distinct from old.edition_id) then
      raise exception 'A política vinculada a um contrato é imutável.';
    end if;
  else
    select max(version) into new.pricing_policy_version
    from public.commercial_pricing_policies where edition_id = new.edition_id;
  end if;
  return new;
end $assign$;
revoke all on function public.assign_contract_pricing_policy() from public, anon, authenticated;
drop trigger if exists contract_pricing_policy on public.contracts;
create trigger contract_pricing_policy before insert or update of pricing_policy_version, edition_id on public.contracts
for each row execute function public.assign_contract_pricing_policy();

create unique index if not exists commercial_contract_identity
  on public.contracts(id, edition_id, pricing_policy_version);

create table if not exists public.commercial_contract_terms (
  edition_id uuid not null,
  policy_version integer not null,
  contract_id uuid not null,
  company_id uuid not null references public.companies(id),
  space_ids uuid[] not null,
  version integer not null check (version > 0),
  discount_modality text,
  discount_evidence text,
  discount_basis_points integer,
  discount_application_condition text,
  fees jsonb not null check (jsonb_typeof(fees) = 'array'),
  fee_evidence text,
  mixed_treatment text,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  primary key (edition_id, contract_id, version),
  foreign key (contract_id, edition_id, policy_version)
    references public.contracts(id, edition_id, pricing_policy_version) on delete cascade,
  foreign key (edition_id, policy_version, discount_modality) references public.commercial_discount_rules,
  check ((discount_modality is null) = (discount_basis_points is null))
);
alter table public.commercial_contract_terms enable row level security;
revoke all on public.commercial_contract_terms from public, anon, authenticated;

create or replace function public.commercial_contract_stock(p_contract_id uuid, p_edition_id uuid)
returns table (space_ids uuid[], scope text) language sql stable set search_path = pg_catalog, public as $stock$
  select coalesce(array_agg(cs.space_id order by cs.space_id), '{}'::uuid[]),
    case
      when count(i.space_id) = 0 or count(i.space_id) <> count(cs.space_id) then 'unknown'
      when bool_and(i.pavilion_number is not null) then 'internal'
      when bool_and(i.pavilion_number is null) then 'external'
      else 'mixed'
    end
  from public.contract_spaces cs
  left join public.commercial_inventory_v i on i.edition_id = p_edition_id and i.space_id = cs.space_id
  where cs.contract_id = p_contract_id
$stock$;
revoke all on function public.commercial_contract_stock(uuid,uuid) from public, anon, authenticated;

create or replace function public.get_contract_pricing_terms(p_contract_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $read$
declare
  c public.contracts;
  p public.commercial_pricing_policies;
  t public.commercial_contract_terms;
  stock record;
  result jsonb;
begin
  if not public.can_read('contratos') then
    raise exception 'Sem permissão para consultar a política contratual.' using errcode = '42501';
  end if;
  select * into c from public.contracts where id = p_contract_id;
  if c.pricing_policy_version is null then return null; end if;
  select * into strict p from public.commercial_pricing_policies
  where edition_id = c.edition_id and version = c.pricing_policy_version;
  select * into stock from public.commercial_contract_stock(c.id, c.edition_id);
  select * into t from public.commercial_contract_terms
  where edition_id = c.edition_id and contract_id = c.id order by version desc limit 1;

  result := jsonb_build_object(
    'policy_version', p.version, 'scope', stock.scope,
    'installment_limit', case when public.can_read('financeiro') and t.discount_modality = 'cash_full'
      and t.company_id = c.company_id and t.space_ids = stock.space_ids then 1 else p.installment_limit end,
    'first_due', p.first_document_due, 'last_due', p.last_document_due,
    'today', (now() at time zone (select timezone from public.editions where id = c.edition_id))::date
  );
  if not public.can_read('financeiro') then return result; end if;

  return result || jsonb_build_object(
    'discount_rules', coalesce((
      select jsonb_agg(jsonb_build_object('modality', d.modality, 'basis_points', d.basis_points,
        'eligibility', d.eligibility, 'application_condition', d.application_condition) order by d.modality)
      from public.commercial_discount_rules d where d.edition_id = c.edition_id and d.policy_version = p.version
    ), '[]'::jsonb),
    'fee_rules', coalesce((
      select jsonb_agg(jsonb_build_object('fee_key', f.fee_key, 'scope', f.scope, 'amount_cents', f.amount_cents,
        'application_condition', f.application_condition) order by f.fee_key)
      from public.commercial_fee_rules f where f.edition_id = c.edition_id and f.policy_version = p.version
    ), '[]'::jsonb),
    'recorded_terms', case when t.version is not null then jsonb_build_object(
      'version', t.version, 'discount_modality', t.discount_modality, 'discount_evidence', t.discount_evidence,
      'fee_keys', array(select f->>'fee_key' from jsonb_array_elements(t.fees) f),
      'fee_evidence', t.fee_evidence, 'mixed_treatment', t.mixed_treatment,
      'matches_contract', t.company_id = c.company_id and t.space_ids = stock.space_ids
    ) end
  );
end $read$;

create or replace function public.record_contract_pricing_terms(
  p_contract_id uuid, p_expected_version integer, p_discount_modality text, p_discount_evidence text,
  p_fee_keys text[], p_fee_evidence text, p_mixed_treatment text
) returns integer language plpgsql security definer set search_path = pg_catalog, public as $record$
declare
  c public.contracts;
  d public.commercial_discount_rules;
  stock record;
  fee_keys text[] := coalesce(p_fee_keys, '{}'::text[]);
  selected_fees jsonb;
  latest integer;
begin
  if not (public.can_write('contratos') and public.can_read('financeiro')) or auth.uid() is null then
    raise exception 'Sem permissão para registrar condições comerciais.' using errcode = '42501';
  end if;
  select * into c from public.contracts where id = p_contract_id for update;
  if c.pricing_policy_version is null or c.status <> 'elaboracao' then
    raise exception 'As condições da política exigem um contrato em elaboração vinculado à política.';
  end if;
  select coalesce(max(version), 0) into latest from public.commercial_contract_terms
  where edition_id = c.edition_id and contract_id = c.id;
  if latest is distinct from p_expected_version then
    raise exception 'As condições já foram alteradas. Recarregue antes de salvar.' using errcode = '40001';
  end if;
  select * into stock from public.commercial_contract_stock(c.id, c.edition_id);
  if p_discount_modality is not null then
    select * into d from public.commercial_discount_rules
    where edition_id = c.edition_id and policy_version = c.pricing_policy_version and modality = p_discount_modality;
    if not found or nullif(btrim(p_discount_evidence), '') is null then
      raise exception 'Escolha uma única modalidade e registre a elegibilidade ou condição do desconto.';
    end if;
  end if;
  if cardinality(fee_keys) > 0 then
    if stock.scope = 'unknown' or nullif(btrim(p_fee_evidence), '') is null then
      raise exception 'Confirme o escopo e registre a condição de incidência das taxas do expositor.';
    end if;
    if stock.scope = 'mixed' and nullif(btrim(p_mixed_treatment), '') is null then
      raise exception 'Registre o tratamento das taxas no contrato que combina áreas interna e externa.';
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('fee_key', f.fee_key, 'amount_cents', f.amount_cents,
    'scope', f.scope, 'condition', f.application_condition) order by f.fee_key), '[]'::jsonb)
  into selected_fees from public.commercial_fee_rules f
  where f.edition_id = c.edition_id and f.policy_version = c.pricing_policy_version
    and f.fee_key = any(fee_keys) and (f.scope = 'any' or f.scope = stock.scope or stock.scope = 'mixed');
  if cardinality(fee_keys) <> jsonb_array_length(selected_fees) then
    raise exception 'Cada taxa aplicável pode ser registrada uma vez por contrato e expositor.';
  end if;

  insert into public.commercial_contract_terms(
    edition_id, policy_version, contract_id, company_id, space_ids, version, discount_modality,
    discount_evidence, discount_basis_points, discount_application_condition, fees, fee_evidence,
    mixed_treatment, recorded_by
  ) values (
    c.edition_id, c.pricing_policy_version, c.id, c.company_id, stock.space_ids, latest + 1, d.modality,
    nullif(btrim(p_discount_evidence), ''), d.basis_points, d.application_condition, selected_fees,
    nullif(btrim(p_fee_evidence), ''), nullif(btrim(p_mixed_treatment), ''), auth.uid()
  );
  return latest + 1;
end $record$;

revoke all on function public.get_contract_pricing_terms(uuid) from public, anon;
revoke all on function public.record_contract_pricing_terms(uuid,integer,text,text,text[],text,text) from public, anon;
grant execute on function public.get_contract_pricing_terms(uuid) to authenticated;
grant execute on function public.record_contract_pricing_terms(uuid,integer,text,text,text[],text,text) to authenticated;

-- The existing RPC remains the only schedule generator. Older contracts keep
-- their existing behavior; the policy applies to the version assigned at creation.
create or replace function public.generate_installments(
  p_contract_id uuid, p_count integer, p_first_due date, p_interval_months integer
) returns void language plpgsql security definer set search_path = pg_catalog, public as $installments$
declare
  c public.contracts;
  p public.commercial_pricing_policies;
  t public.commercial_contract_terms;
  stock record;
  today date;
  base bigint;
  remainder bigint;
begin
  if not public.can_write('financeiro') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if p_count is null or p_count < 1 or p_count > 36 then raise exception 'Quantidade de parcelas inválida'; end if;
  if p_interval_months is null or p_interval_months < 1 or p_interval_months > 12 then
    raise exception 'Intervalo inválido';
  end if;
  if p_first_due is null then raise exception 'Informe o primeiro vencimento.'; end if;
  select * into c from public.contracts where id = p_contract_id for update;
  if not found then raise exception 'Contrato não encontrado'; end if;
  if c.status not in ('emitido','assinado') then
    raise exception 'Parcelas só podem ser geradas para contratos emitidos ou assinados';
  end if;
  if exists (select 1 from public.installments where contract_id = c.id) then
    raise exception 'O contrato já possui parcelas';
  end if;
  if c.pricing_policy_version is not null then
    select * into strict p from public.commercial_pricing_policies
    where edition_id = c.edition_id and version = c.pricing_policy_version;
    select (now() at time zone timezone)::date into strict today from public.editions where id = c.edition_id;
    if p_count > p.installment_limit then raise exception 'Quantidade de parcelas acima do limite da política.'; end if;
    if p_first_due < greatest(today, p.first_document_due) then
      raise exception 'O primeiro vencimento não pode ser retroativo.';
    end if;
    if (p_first_due + make_interval(months => (p_count - 1) * p_interval_months))::date > p.last_document_due then
      raise exception 'O último vencimento ultrapassa a data final da política.';
    end if;
    select * into t from public.commercial_contract_terms
    where edition_id = c.edition_id and contract_id = c.id order by version desc limit 1;
    if t.discount_modality = 'cash_full' and p_count <> 1 then
      select * into stock from public.commercial_contract_stock(c.id, c.edition_id);
      if t.company_id = c.company_id and t.space_ids = stock.space_ids then
        raise exception 'A modalidade de pagamento integral à vista exige parcela única.';
      end if;
    end if;
  end if;

  base := c.total_cents / p_count;
  remainder := c.total_cents - base * p_count;
  insert into public.installments(edition_id, contract_id, number, due_date, amount_cents)
  select c.edition_id, c.id, n, (p_first_due + make_interval(months => (n - 1) * p_interval_months))::date,
    base + case when n = p_count then remainder else 0 end
  from generate_series(1, p_count) as n;
end $installments$;

revoke all on function public.generate_installments(uuid,integer,date,integer) from public, anon;
grant execute on function public.generate_installments(uuid,integer,date,integer) to authenticated;
-- Application writes go through the finance RPCs, including payment status
-- reconciliation and installment generation.
revoke insert, update, delete on public.installments from anon, authenticated;

commit;
