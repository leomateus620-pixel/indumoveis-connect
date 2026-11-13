begin;

create table if not exists public.commercial_pricing_policies (
  edition_id uuid not null references public.editions(id),
  version integer not null check (version > 0),
  source_name text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  document_date date not null,
  published_at timestamptz not null default now(),
  installment_limit integer not null check (installment_limit between 1 and 36),
  first_document_due date not null,
  last_document_due date not null check (last_document_due >= first_document_due),
  primary key (edition_id, version)
);

create table if not exists public.commercial_pricing_rules (
  edition_id uuid not null,
  policy_version integer not null,
  rule_key text not null,
  pavilion_number smallint,
  lot_range int4range,
  segment_key text not null,
  segment_name text not null,
  regular_cents bigint check (regular_cents > 0),
  corner_cents bigint check (corner_cents > 0),
  primary key (edition_id, policy_version, rule_key),
  foreign key (edition_id, policy_version) references public.commercial_pricing_policies,
  check (num_nonnulls(pavilion_number, lot_range) = 1),
  check (corner_cents is null or (lot_range is not null and regular_cents is not null)),
  check (lot_range is null or (not isempty(lot_range) and lot_range <@ int4range(1, 69)))
);

create table if not exists public.commercial_discount_rules (
  edition_id uuid not null,
  policy_version integer not null,
  modality text not null check (modality in ('cash_full', 'installments_on_time', 'eligible_member')),
  basis_points integer not null check (basis_points between 1 and 10000),
  eligibility text not null,
  application_condition text not null,
  primary key (edition_id, policy_version, modality),
  foreign key (edition_id, policy_version) references public.commercial_pricing_policies
);

create table if not exists public.commercial_fee_rules (
  edition_id uuid not null,
  policy_version integer not null,
  fee_key text not null,
  scope text not null check (scope in ('internal', 'external', 'any')),
  amount_cents bigint not null check (amount_cents > 0),
  application_condition text not null,
  primary key (edition_id, policy_version, fee_key),
  foreign key (edition_id, policy_version) references public.commercial_pricing_policies
);

create table if not exists public.commercial_area_groups (
  edition_id uuid not null,
  policy_version integer not null,
  group_key text not null,
  source_name text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  pavilion_number smallint not null,
  source_revision_id uuid not null,
  document_codes integer[] not null,
  matched_codes text[] not null,
  total_m2 numeric check (total_m2 > 0),
  individual_m2 numeric generated always as (total_m2 / cardinality(matched_codes)) stored,
  validation_state text not null check (validation_state in ('confirmed', 'pending')),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  primary key (edition_id, policy_version, group_key),
  foreign key (edition_id, policy_version) references public.commercial_pricing_policies,
  foreign key (source_revision_id, edition_id) references public.pavilion_plan_revisions(id, edition_id),
  check (cardinality(matched_codes) > 0),
  check (validation_state = 'pending' or (total_m2 is not null and cardinality(document_codes) = cardinality(matched_codes)))
);

create table if not exists public.commercial_area_assignments (
  edition_id uuid not null,
  policy_version integer not null,
  group_key text not null,
  environment_id text not null,
  space_id uuid not null,
  source_code text not null,
  lot_code text not null,
  previous_space_m2 numeric,
  previous_plan_m2 numeric,
  primary key (edition_id, policy_version, space_id),
  foreign key (edition_id, policy_version, group_key) references public.commercial_area_groups,
  foreign key (edition_id, environment_id) references public.pavilion_environments(edition_id, id),
  foreign key (space_id, edition_id) references public.spaces(id, edition_id)
);

-- Source observations are documentary geometry, independent of the existence of a commercial space.
create table if not exists public.commercial_external_geometry (
  edition_id uuid not null references public.editions(id),
  lot_number integer not null check (lot_number between 1 and 68),
  geometry_id text not null check (geometry_id ~ '^indumoveis:external:lot:[0-9]{2}(-[0-9]{2})*$'),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  declared_area_m2 numeric check (declared_area_m2 > 0),
  observed_classification text not null check (observed_classification in ('corner', 'regular', 'pending')),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  primary key (edition_id, lot_number)
);

create table if not exists public.commercial_external_space_links (
  edition_id uuid not null,
  space_id uuid not null,
  lot_number integer not null,
  evidence text not null check (length(btrim(evidence)) > 0),
  linked_by uuid,
  linked_at timestamptz not null default now(),
  primary key (edition_id, lot_number),
  unique (edition_id, space_id),
  foreign key (edition_id, lot_number) references public.commercial_external_geometry,
  foreign key (space_id, edition_id) references public.spaces(id, edition_id)
);

create table if not exists public.commercial_corner_reviews (
  edition_id uuid not null,
  lot_number integer not null,
  revision integer not null check (revision > 0),
  classification text not null check (classification in ('corner', 'regular', 'pending')),
  evidence text not null check (length(btrim(evidence)) > 0),
  reviewed_by uuid not null,
  reviewed_at timestamptz not null default now(),
  primary key (edition_id, lot_number, revision),
  foreign key (edition_id, lot_number) references public.commercial_external_geometry
);

-- Data are exposed only through individually authorized RPCs. The inventory view
-- is an internal projection so no caller can bypass its financial payload checks.
do $permissions$
declare t text;
begin
  foreach t in array array[
    'commercial_pricing_policies','commercial_pricing_rules','commercial_discount_rules',
    'commercial_fee_rules','commercial_area_groups','commercial_area_assignments',
    'commercial_external_geometry','commercial_external_space_links','commercial_corner_reviews'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
  end loop;
end $permissions$;

create or replace function public.link_commercial_external_space(
  p_edition_id uuid, p_space_id uuid, p_lot_number integer, p_evidence text
) returns void
language plpgsql security definer set search_path = pg_catalog, public as $link$
declare
  stock public.spaces;
  source public.commercial_external_geometry;
begin
  if not (public.can_write('mapa') and public.can_write('comercial')) or auth.uid() is null then
    raise exception 'Sem permissão para vincular o espaço externo.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.editions where id = p_edition_id and is_active) then
    raise exception 'O vínculo precisa pertencer à edição ativa.';
  end if;
  select * into source from public.commercial_external_geometry
  where edition_id = p_edition_id and lot_number = p_lot_number for update;
  if not found then raise exception 'Lote externo fora da implantação confirmada.'; end if;
  select * into stock from public.spaces
  where id = p_space_id and edition_id = p_edition_id and not is_demo for update;
  if not found or exists (
    select 1 from public.floor_plans f
    where f.id = stock.floor_plan_id and f.edition_id = p_edition_id and f.pavilion_number is not null
  ) or exists (
    select 1 from public.pavilion_environments e where e.edition_id = p_edition_id and e.space_id = p_space_id
  ) then
    raise exception 'O espaço precisa pertencer ao estoque externo da edição.';
  end if;
  if source.declared_area_m2 is not null and stock.area_m2 is not null
    and stock.area_m2 <> source.declared_area_m2 then
    raise exception 'A área existente diverge da implantação. Concilie as fontes antes de vincular.';
  end if;
  insert into public.commercial_external_space_links(edition_id, space_id, lot_number, evidence, linked_by)
  values (p_edition_id, p_space_id, p_lot_number, p_evidence, auth.uid());
  if stock.area_m2 is null and source.declared_area_m2 is not null then
    update public.spaces set area_m2 = source.declared_area_m2
    where id = p_space_id and edition_id = p_edition_id;
  end if;
end $link$;

create or replace function public.review_commercial_corner(
  p_edition_id uuid, p_lot_number integer, p_expected_revision integer,
  p_classification text, p_evidence text
) returns integer
language plpgsql security definer set search_path = pg_catalog, public as $review$
declare latest integer;
begin
  if not (public.can_write('mapa') and public.can_write('comercial')) or auth.uid() is null then
    raise exception 'Sem permissão para revisar a classificação externa.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.editions where id = p_edition_id and is_active) then
    raise exception 'A revisão precisa pertencer à edição ativa.';
  end if;
  perform 1 from public.commercial_external_geometry
  where edition_id = p_edition_id and lot_number = p_lot_number for update;
  if not found then raise exception 'Lote externo fora da implantação confirmada.'; end if;
  select coalesce(max(revision), 0) into latest from public.commercial_corner_reviews
  where edition_id = p_edition_id and lot_number = p_lot_number;
  if latest is distinct from p_expected_revision then
    raise exception 'A classificação já foi revisada. Recarregue antes de salvar.' using errcode = '40001';
  end if;
  insert into public.commercial_corner_reviews(edition_id, lot_number, revision, classification, evidence, reviewed_by)
  values (p_edition_id, p_lot_number, latest + 1, p_classification, p_evidence, auth.uid());
  return latest + 1;
end $review$;

revoke all on function public.link_commercial_external_space(uuid,uuid,integer,text) from public, anon;
revoke all on function public.review_commercial_corner(uuid,integer,integer,text,text) from public, anon;
grant execute on function public.link_commercial_external_space(uuid,uuid,integer,text) to authenticated;
grant execute on function public.review_commercial_corner(uuid,integer,integer,text,text) to authenticated;

-- Multiplication in numeric, rounded once to the nearest cent (half up for positive values).
create or replace function public.commercial_gross_cents(p_area_m2 numeric, p_tariff_cents bigint)
returns bigint language sql immutable strict set search_path = pg_catalog as $gross$
  select round(p_area_m2 * p_tariff_cents)::bigint
$gross$;
revoke all on function public.commercial_gross_cents(numeric,bigint) from public, anon, authenticated;

create or replace view public.commercial_inventory_v as
with inventory as (
  select s.edition_id, s.id as space_id, e.pavilion_number::integer as pavilion_number,
    e.code as lot_code, e.id as environment_id, r.id as plan_revision_id, null::text as geometry_id,
    null::integer as external_number, null::text as corner_state,
    coalesce(v.declared_area_m2, nullif(greatest(s.area_m2, 0), 0)) as area_m2,
    g.validation_state = 'pending' as assignment_pending
  from public.pavilion_plan_revisions r
  join public.pavilion_environment_revisions v on v.edition_id = r.edition_id and v.revision_id = r.id
  join public.pavilion_environments e on e.edition_id = v.edition_id and e.id = v.environment_id
    and e.pavilion_number = r.pavilion_number and e.kind = 'commercial'
  join public.spaces s on s.edition_id = e.edition_id and s.id = e.space_id and not s.is_demo
  left join lateral (
    select p.version from public.commercial_pricing_policies p
    where p.edition_id = s.edition_id order by p.version desc limit 1
  ) policy on true
  left join public.commercial_area_assignments a on a.edition_id = s.edition_id and a.space_id = s.id
    and a.policy_version = policy.version
  left join public.commercial_area_groups g on g.edition_id = a.edition_id and g.policy_version = a.policy_version
    and g.group_key = a.group_key
  where r.is_current

  union all

  select s.edition_id, s.id, null::integer, lpad(x.lot_number::text, 2, '0'), null::text, null::uuid,
    x.geometry_id, x.lot_number, coalesce(review.classification, x.observed_classification),
    case when x.declared_area_m2 = s.area_m2 then x.declared_area_m2 end, false
  from public.commercial_external_space_links l
  join public.spaces s on s.edition_id = l.edition_id and s.id = l.space_id and not s.is_demo
  join public.commercial_external_geometry x on x.edition_id = l.edition_id and x.lot_number = l.lot_number
  left join lateral (
    select r.classification from public.commercial_corner_reviews r
    where r.edition_id = x.edition_id and r.lot_number = x.lot_number
    order by r.revision desc limit 1
  ) review on true
  where not exists (
    select 1 from public.pavilion_environments e where e.edition_id = l.edition_id and e.space_id = l.space_id
  )
), rates as (
  select i.*, policy.version as policy_version, policy.source_name as policy_source,
    coalesce(rule.segment_key, case when i.external_number is null then 'p' || i.pavilion_number
      when i.external_number between 43 and 50 or i.external_number between 58 and 65 then 'automobile'
      else 'external' end) as segment_key,
    case
      when rule.regular_cents is null then 'no_tariff'
      when i.assignment_pending is true or i.area_m2 is null then 'area_pending'
      when i.external_number is not null and i.corner_state = 'pending' then 'corner_pending'
      else 'priced'
    end as pricing_state,
    case
      when rule.regular_cents is null or i.assignment_pending is true or i.area_m2 is null then null
      when i.external_number is not null and i.corner_state = 'pending' then null
      when i.external_number is not null and i.corner_state = 'corner' then rule.corner_cents
      else rule.regular_cents
    end as tariff_cents
  from inventory i
  left join lateral (
    select p.version, p.source_name from public.commercial_pricing_policies p
    where p.edition_id = i.edition_id order by p.version desc limit 1
  ) policy on true
  left join lateral (
    select r.* from public.commercial_pricing_rules r
    where r.edition_id = i.edition_id and r.policy_version = policy.version
      and (r.pavilion_number = i.pavilion_number or r.lot_range @> i.external_number)
    order by r.rule_key limit 1
  ) rule on true
)
select edition_id, space_id, pavilion_number, segment_key, lot_code, geometry_id, area_m2,
  (area_m2 is null or assignment_pending is true) as area_pending,
  tariff_cents, public.commercial_gross_cents(area_m2, tariff_cents) as gross_cents,
  pricing_state, corner_state, environment_id, plan_revision_id, policy_version, policy_source
from rates;

revoke all on public.commercial_inventory_v from public, anon, authenticated;

commit;
