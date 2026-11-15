-- Prices are documentary totals per space, not inferred rates per square metre.
-- Apply ONLY through the Indumóveis Lovable SQL connector. Published migrations remain intact.
begin;

create table if not exists public.commercial_fixed_prices (
  edition_id uuid not null,
  policy_version integer not null,
  space_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  source_name text not null check (length(btrim(source_name)) > 0),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_page integer not null check (source_page > 0),
  primary key (edition_id, policy_version, space_id),
  foreign key (edition_id, policy_version) references public.commercial_pricing_policies,
  foreign key (space_id, edition_id) references public.spaces(id, edition_id)
);
alter table public.commercial_fixed_prices enable row level security;
revoke all on public.commercial_fixed_prices from public, anon, authenticated;

alter table public.pavilion_environments drop constraint if exists pavilion_commercial_code_scope;
alter table public.pavilion_environments add constraint pavilion_commercial_code_scope check (
  kind <> 'commercial' or
  (pavilion_number = 1 and code ~ '^(0[1-9]|1[0-5])$') or
  (pavilion_number = 8 and code in ('01','03','04','05','06','07','08')) or
  (pavilion_number = 12 and code ~ '^([1-9][0-9]?|1[0-9]{2}|2[0-4][0-9]|25[0-4])$') or
  (pavilion_number = 13 and code ~ '^(0[1-9]|[1-7][0-9]|80)$')
);

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
    fixed.amount_cents as fixed_cents,
    case when fixed.space_id is not null then 'fixed' else 'per_m2' end as pricing_basis,
    jsonb_build_object('name', coalesce(fixed.source_name, policy.source_name),
      'sha256', coalesce(fixed.source_sha256, policy.source_sha256), 'page', fixed.source_page) as price_source,
    coalesce(rule.segment_key, case when i.external_number is null then 'p' || i.pavilion_number
      when i.external_number between 43 and 50 or i.external_number between 58 and 65 then 'automobile'
      else 'external' end) as segment_key,
    case
      when fixed.space_id is not null then
        case when i.assignment_pending is true or i.area_m2 is null then 'area_pending' else 'priced' end
      when rule.regular_cents is null then 'no_tariff'
      when i.assignment_pending is true or i.area_m2 is null then 'area_pending'
      when i.external_number is not null and i.corner_state = 'pending' then 'corner_pending'
      else 'priced'
    end as pricing_state,
    case
      when fixed.space_id is not null then null
      when rule.regular_cents is null or i.assignment_pending is true or i.area_m2 is null then null
      when i.external_number is not null and i.corner_state = 'pending' then null
      when i.external_number is not null and i.corner_state = 'corner' then rule.corner_cents
      else rule.regular_cents
    end as tariff_cents
  from inventory i
  left join lateral (
    select p.version, p.source_name, p.source_sha256 from public.commercial_pricing_policies p
    where p.edition_id = i.edition_id order by p.version desc limit 1
  ) policy on true
  left join public.commercial_fixed_prices fixed on fixed.edition_id = i.edition_id
    and fixed.policy_version = policy.version and fixed.space_id = i.space_id
  left join lateral (
    select r.* from public.commercial_pricing_rules r
    where r.edition_id = i.edition_id and r.policy_version = policy.version
      and (r.pavilion_number = i.pavilion_number or r.lot_range @> i.external_number)
    order by r.rule_key limit 1
  ) rule on true
)
select edition_id, space_id, pavilion_number, segment_key, lot_code, geometry_id, area_m2,
  (area_m2 is null or assignment_pending is true) as area_pending,
  tariff_cents, case when fixed_cents is not null then
    case when pricing_state = 'priced' then fixed_cents end
    else public.commercial_gross_cents(area_m2, tariff_cents) end as gross_cents,
  pricing_state, corner_state, environment_id, plan_revision_id, policy_version, policy_source, pricing_basis, price_source
from rates;

-- Preserve existing column order: PostgreSQL expands i.* when a view is created.
create or replace view public.commercial_lot_facts_v as
select i.edition_id, i.space_id, i.pavilion_number, i.segment_key, i.lot_code,
  i.geometry_id, i.area_m2, i.area_pending, i.tariff_cents, i.gross_cents,
  i.pricing_state, i.corner_state, i.environment_id, i.plan_revision_id, i.policy_version, i.policy_source,
  s.commercial_status, s.active_deal_id, i.pricing_basis, i.price_source
from public.commercial_inventory_v i
join public.space_commercial_state_v s on s.id=i.space_id and s.edition_id=i.edition_id;
revoke all on public.commercial_inventory_v, public.commercial_lot_facts_v from public, anon, authenticated;

create or replace function public.get_commercial_lots(p_edition_id uuid, p_segment text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_admin boolean := public.has_role(auth.uid(),'admin');
  v_financial boolean := v_admin and public.can_read('financeiro');
  v_companies boolean := v_admin and public.can_read('empresas');
begin
  perform public.require_commercial_scope(p_edition_id, p_segment);
  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', f.space_id, 'segmentKey', f.segment_key, 'code', f.lot_code,
        'environmentId', f.environment_id, 'geometryId', f.geometry_id, 'areaM2', f.area_m2,
        'areaPending', f.area_pending, 'status', case when v_admin or f.commercial_status='disponivel' then f.commercial_status else 'indisponivel' end,
        'pricingState', case when v_admin then f.pricing_state else 'no_tariff' end, 'cornerState', case when v_admin then f.corner_state end,
        'deal', case when d.id is not null then
          jsonb_build_object('id', d.id, 'status', d.status) ||
          case when v_companies then jsonb_build_object('companyName', c.trade_name) else '{}'::jsonb end ||
          case when v_financial then jsonb_build_object('spacePriceCents', ds.price_cents) else '{}'::jsonb end
        end
      ) || case when v_financial then jsonb_build_object(
        'tariffCents', f.tariff_cents, 'grossCents', f.gross_cents,
        'pricingBasis', f.pricing_basis, 'priceSource', f.price_source,
        'policyVersion', f.policy_version, 'policySource', f.policy_source
      ) else '{}'::jsonb end
      order by f.pavilion_number nulls last, f.segment_key, length(f.lot_code), f.lot_code, f.space_id
    ), '[]'::jsonb)
    from public.commercial_lot_facts_v f
    left join public.deals d on v_admin and d.id = f.active_deal_id and d.edition_id = f.edition_id
    left join public.deal_spaces ds on v_financial and ds.deal_id = d.id and ds.space_id = f.space_id
    left join public.companies c on v_companies and c.id = d.company_id
    where f.edition_id = p_edition_id and (p_segment is null or f.segment_key = p_segment)
  );
end $$;

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
      and not (lot.pricing_state = 'no_tariff' and lot.segment_key = 'automobile')
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
      'pricingBasis', lot.pricing_basis, 'priceSource', lot.price_source,
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

-- Documentary source SHA256 is independent from the unchanged geometry PDF.
do $seed$
declare
  -- SHA256 of the revision-2 catalogue serialized by PostgreSQL jsonb::text.
  geometry_source jsonb := $source${"revisionName":"mostra-arq-design-2-2026-11-15","document":"Mostra Arq&Design 1 (1).pdf","page":1,"sha256":"088ab9d98e61ed98c98b45834c5813416d9fd09a10af195aeeae29bfc9a4c02a","pageWidth":1092.062,"pageHeight":565.096,"coordinateSystem":"PDF points; origin top-left; x right; y down; no metric conversion"}$source$::jsonb;
  ed uuid;
  prior public.pavilion_plan_revisions;
  successor public.pavilion_plan_revisions;
  space15 uuid;
  expected_hash constant text := 'b013dc6fd0216629e711402f4fda951f92955dcf9c953dec5c8fd8ba0dab18bb';
  prices bigint[] := array[450000,660000,660000,1020000,1020000,660000,660000,
    1020000,1020000,660000,960000,1500000,960000,1500000,450000];
  areas numeric[] := array[111.66,47.50,47.50,74.81,74.81,47.50,47.50,
    74.81,74.81,47.50,69.17,129.43,69.48,254.81,32.33];
  baseline jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('pavilion-1-fixed-prices',0));
  if (select count(*) from public.editions where is_active) <> 1 then
    raise exception 'Selecione exatamente uma edição ativa.';
  end if;
  select id into strict ed from public.editions where is_active and not is_historical
    and year=2027 and starts_on=date '2027-05-14' and ends_on=date '2027-05-23' for update;
  if (select max(version) from public.commercial_pricing_policies where edition_id=ed) is distinct from 1
    or not exists(select from public.commercial_pricing_policies where edition_id=ed and version=1
      and source_sha256='a88df5c19bafc242704e58eb1b46bb7c721254573a52a63b2e5e777028734b5c') then
    raise exception 'Política comercial diferente da versão documental esperada.';
  end if;
  lock table public.spaces in share row exclusive mode;
  select jsonb_agg(to_jsonb(i) order by space_id) into baseline
    from public.commercial_inventory_v i where edition_id=ed and segment_key<>'p1';
  select * into strict prior from public.pavilion_plan_revisions
    where edition_id=ed and pavilion_number=1 and revision=1;
  if prior.payload_sha256<>'90c8e9d2cd6b2b8dd4ae708d97cc49c62eb59dac5378061f7219e262671777c3'
    or (select array_agg(v.declared_area_m2 order by e.code)
      from public.pavilion_environment_revisions v join public.pavilion_environments e
      on e.edition_id=v.edition_id and e.id=v.environment_id
      where v.revision_id=prior.id and e.code ~ '^[0-9]{2}$') is distinct from areas then
    raise exception 'A planta ou as metragens do P1 diferem da fonte revisada.';
  end if;
  select * into successor from public.pavilion_plan_revisions
    where edition_id=ed and pavilion_number=1 and revision=2;
  if found and (successor.payload_sha256<>expected_hash or not successor.is_current) then
    raise exception 'A revisão 2 do P1 já existe com outra origem ou foi substituída.';
  end if;
  if successor.id is null and not prior.is_current then
    raise exception 'A revisão vigente do P1 mudou; revise a migração antes de aplicar.';
  end if;

  select id into space15 from public.spaces where edition_id=ed and code='P1-15';
  if space15 is null then
    insert into public.spaces(edition_id,code,sector,area_m2,floor_plan_id,is_demo)
      values(ed,'P1-15','Pavilhão 1 — Mostra ARQ & Design',32.33,prior.floor_plan_id,false)
      returning id into space15;
  elsif not exists(select from public.spaces where id=space15 and floor_plan_id=prior.floor_plan_id
    and area_m2=32.33 and not is_demo) then
    raise exception 'O código P1-15 já pertence a outro cadastro.';
  end if;
  if not exists(select from public.pavilion_environments where edition_id=ed and pavilion_number=1
    and code='15' and id='indumoveis:pavilion:1:environment:15'
    and ((kind='support' and space_id is null) or (kind='commercial' and space_id=space15))) then
    raise exception 'A identidade do ambiente 15 mudou.';
  end if;
  update public.pavilion_environments set kind='commercial',space_id=space15
    where edition_id=ed and pavilion_number=1 and code='15' and kind='support';

  if successor.id is null then
    insert into public.pavilion_plan_revisions(edition_id,floor_plan_id,pavilion_number,stable_id,revision,
      source_name,source_sha256,payload_sha256,coordinate_system,bounds,source_document,total_area_m2,is_current)
    values(ed,prior.floor_plan_id,1,prior.stable_id,2,prior.source_name,prior.source_sha256,expected_hash,
      prior.coordinate_system,prior.bounds,geometry_source,prior.total_area_m2,false)
    returning * into successor;
    insert into public.pavilion_environment_revisions
      (edition_id,revision_id,environment_id,name,declared_area_m2,function_label,label,display_order)
    select edition_id,successor.id,environment_id,name,declared_area_m2,
      case when environment_id='indumoveis:pavilion:1:environment:15' then 'Banheiros' else function_label end,
      label,display_order from public.pavilion_environment_revisions where revision_id=prior.id;
    insert into public.pavilion_environment_parts(id,edition_id,revision_id,environment_id,kind,path,polygon)
    select id,edition_id,successor.id,environment_id,kind,path,polygon
      from public.pavilion_environment_parts where revision_id=prior.id;
    insert into public.pavilion_architecture_elements(id,edition_id,revision_id,kind,path,label,label_at,stroke_width,display_order)
    select id,edition_id,successor.id,kind,path,label,label_at,stroke_width,display_order
      from public.pavilion_architecture_elements where revision_id=prior.id;
    update public.pavilion_plan_revisions set is_current=false where id=prior.id;
    update public.pavilion_plan_revisions set is_current=true where id=successor.id;
  end if;

  insert into public.commercial_fixed_prices(edition_id,policy_version,space_id,amount_cents,source_name,source_sha256,source_page)
  select ed,1,e.space_id,prices[e.code::integer],'Mostra Arq&Design.pdf',
    '8868c5a7b077a6b88223986dea8faf8b42bcde5df36a1a1ed71408ee42dfbef7',1
  from public.pavilion_environments e where e.edition_id=ed and e.pavilion_number=1 and e.kind='commercial'
  on conflict(edition_id,policy_version,space_id) do nothing;

  if (select count(*) from public.commercial_inventory_v where edition_id=ed and segment_key='p1')<>15
    or exists(select from public.commercial_inventory_v i where edition_id=ed and segment_key='p1'
      and (gross_cents is distinct from prices[lot_code::integer] or area_m2 is distinct from areas[lot_code::integer]
        or tariff_cents is not null or pricing_state<>'priced' or pricing_basis<>'fixed'
        or price_source->>'sha256'<>'8868c5a7b077a6b88223986dea8faf8b42bcde5df36a1a1ed71408ee42dfbef7'))
    or (select sum(gross_cents) from public.commercial_inventory_v where edition_id=ed and segment_key='p1')<>13200000
    or (select sum(area_m2) from public.commercial_inventory_v where edition_id=ed and segment_key='p1')<>1203.62
    or (select count(*) from public.pavilion_environment_parts where revision_id=successor.id and kind='external')<>5 then
    raise exception 'Cobertura, áreas ou preços do P1 divergentes.';
  end if;
  if baseline is distinct from (select jsonb_agg(to_jsonb(i) order by space_id)
    from public.commercial_inventory_v i where edition_id=ed and segment_key<>'p1') then
    raise exception 'A alteração modificou o inventário de outro segmento.';
  end if;
end $seed$;

commit;
