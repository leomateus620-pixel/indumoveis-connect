begin;

create index if not exists commercial_deal_spaces_space_idx on public.deal_spaces(space_id);
create index if not exists commercial_deal_events_sale_idx on public.deal_events(deal_id, created_at)
  where to_status = 'contratada' or from_status = 'contratada';
create index if not exists commercial_payments_installment_idx on public.payments(installment_id);

-- Both public RPCs and all consumers see the same canonical lot inventory and state.
create or replace view public.commercial_lot_facts_v as
select i.*, s.commercial_status, s.active_deal_id
from public.commercial_inventory_v i
join public.space_status_v s on s.id = i.space_id and s.edition_id = i.edition_id;

revoke all on public.commercial_lot_facts_v from public, anon, authenticated;

create or replace function public.require_commercial_scope(p_edition_id uuid, p_segment text)
returns void
language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
begin
  if not (public.can_read('mapa') and public.can_read('comercial')) then
    raise exception 'Sem permissão para consultar o inventário comercial.' using errcode = '42501';
  end if;
  if not exists (select from public.editions where id = p_edition_id) then
    raise exception 'Edição não encontrada.' using errcode = '22023';
  end if;
  if p_segment is not null and p_segment not in ('p1','p3','p8','p12','p13','p14','external','automobile') then
    raise exception 'Segmento comercial inválido.' using errcode = '22023';
  end if;
end $$;
revoke all on function public.require_commercial_scope(uuid,text) from public, anon, authenticated;

create or replace function public.get_commercial_overview(p_edition_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v_financial boolean := public.can_read('financeiro');
begin
  perform public.require_commercial_scope(p_edition_id, null);
  return (
    with segments(key, pavilion_number, label, description, position) as (values
      ('p1', 1, 'Pavilhão 1', 'Mostra ARQ & Design', 1),
      ('p3', 3, 'Pavilhão 3', 'Construção civil, móveis e mobiliário', 2),
      ('p8', 8, 'Pavilhão 8', 'Fornecedores e construção civil', 3),
      ('p12', 12, 'Pavilhão 12', 'Móveis seriados e decoração', 4),
      ('p13', 13, 'Pavilhão 13', 'Imobiliárias, construtoras e instituições financeiras', 5),
      ('p14', 14, 'Pavilhão 14', 'Construção civil e mobiliário · Sinduscom', 6),
      ('external', null, 'Área externa', 'Indústria, comércio e serviços', 7),
      ('automobile', null, 'Salão do Automóvel', 'Área externa · segmento automotivo', 8)
    ), scopes as (
      select key from segments union all select 'overall'
    ), facts as materialized (
      select * from public.commercial_lot_facts_v where edition_id = p_edition_id
    ), stats as (
      select q.key, count(f.space_id) as lot_count,
        count(*) filter (where f.commercial_status = 'vendido') as sold,
        count(*) filter (where f.commercial_status = 'reservado') as reserved,
        count(*) filter (where f.commercial_status = 'em_negociacao') as negotiating,
        count(*) filter (where f.commercial_status = 'disponivel') as available,
        count(*) filter (where f.commercial_status = 'bloqueado') as blocked,
        count(f.area_m2) as area_count,
        count(f.area_m2) filter (where f.commercial_status = 'vendido') as sold_area_count,
        sum(f.area_m2) as area_m2,
        sum(f.area_m2) filter (where f.commercial_status = 'vendido') as sold_area_m2,
        count(f.gross_cents) as priced,
        count(f.gross_cents) filter (where f.commercial_status = 'disponivel') as available_priced,
        sum(f.gross_cents) as gross,
        sum(f.gross_cents) filter (where f.commercial_status = 'disponivel') as available_gross
      from scopes q left join facts f on q.key = 'overall' or q.key = f.segment_key
      group by q.key
    ), aggregate as (
      select key, jsonb_build_object(
        'total', lot_count, 'sold', sold, 'reserved', reserved, 'negotiating', negotiating,
        'available', available, 'blocked', blocked,
        'soldPercent', round(100.0 * sold / nullif(lot_count, 0), 2),
        'knownAreaM2', area_m2,
        'soldAreaM2', case when area_count > 0 and sold = 0 then 0 else sold_area_m2 end,
        'areaKnownCount', area_count, 'soldAreaKnownCount', sold_area_count,
        'soldAreaPercent', case when area_count > 0 and sold = sold_area_count
          then round(100 * coalesce(sold_area_m2, 0) / nullif(area_m2, 0), 2) end
      ) || case when v_financial then jsonb_build_object(
        'pricedCount', priced, 'grossCents', gross,
        'availableGrossCents', case when available = 0 and priced > 0 then 0 else available_gross end,
        'availablePricedCount', available_priced
      ) else '{}'::jsonb end as payload from stats
    )
    select jsonb_build_object(
      'overall', (select payload from aggregate where key = 'overall'),
      'segments', (select jsonb_agg(a.payload || jsonb_build_object(
        'key', s.key, 'pavilionNumber', s.pavilion_number, 'label', s.label, 'description', s.description
      ) order by s.position) from segments s join aggregate a using (key)),
      'financial', v_financial,
      'activity', true
    )
  );
end $$;

create or replace function public.get_commercial_lots(p_edition_id uuid, p_segment text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_financial boolean := public.can_read('financeiro');
  v_companies boolean := public.can_read('empresas');
begin
  perform public.require_commercial_scope(p_edition_id, p_segment);
  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', f.space_id, 'segmentKey', f.segment_key, 'code', f.lot_code,
        'environmentId', f.environment_id, 'geometryId', f.geometry_id, 'areaM2', f.area_m2,
        'areaPending', f.area_pending, 'status', f.commercial_status,
        'pricingState', f.pricing_state, 'cornerState', f.corner_state,
        'deal', case when d.id is not null then
          jsonb_build_object('id', d.id, 'status', d.status) ||
          case when v_companies then jsonb_build_object('companyName', c.trade_name) else '{}'::jsonb end ||
          case when v_financial then jsonb_build_object('spacePriceCents', ds.price_cents) else '{}'::jsonb end
        end
      ) || case when v_financial then jsonb_build_object(
        'tariffCents', f.tariff_cents, 'grossCents', f.gross_cents,
        'policyVersion', f.policy_version, 'policySource', f.policy_source
      ) else '{}'::jsonb end
      order by f.pavilion_number nulls last, f.segment_key, length(f.lot_code), f.lot_code, f.space_id
    ), '[]'::jsonb)
    from public.commercial_lot_facts_v f
    left join public.deals d on d.id = f.active_deal_id and d.edition_id = f.edition_id
    left join public.deal_spaces ds on v_financial and ds.deal_id = d.id and ds.space_id = f.space_id
    left join public.companies c on v_companies and c.id = d.company_id
    where f.edition_id = p_edition_id and (p_segment is null or f.segment_key = p_segment)
  );
end $$;

create or replace function public.get_commercial_details(p_edition_id uuid, p_segment text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_lots jsonb;
  v_events jsonb;
  v_totals jsonb;
  v_contracts boolean := public.can_read('contratos');
begin
  v_lots := public.get_commercial_lots(p_edition_id, p_segment);

  -- Events record actual signature transitions and reversals. Deduplicate the lot on
  -- each civil date and direction; neither draft contract versions nor reservations count.
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', ev.day, 'signed', ev.signed, 'cancelled', ev.cancelled
  ) order by ev.day), '[]'::jsonb) into v_events
  from (
    select (de.created_at at time zone e.timezone)::date as day,
      count(distinct f.space_id) filter (where de.to_status = 'contratada') as signed,
      count(distinct f.space_id) filter (where de.from_status = 'contratada') as cancelled
    from public.editions e
    join public.deals d on d.edition_id = e.id and not d.is_demo
    join public.deal_events de on de.deal_id = d.id
    join public.deal_spaces ds on ds.deal_id = d.id
    join public.commercial_lot_facts_v f on f.space_id = ds.space_id and f.edition_id = e.id
    where e.id = p_edition_id and (p_segment is null or f.segment_key = p_segment)
      and (de.to_status = 'contratada' or de.from_status = 'contratada')
    group by 1
  ) ev;

  if public.can_read('financeiro') then
    -- Monetary values are sums of complete deals/contracts, not per-lot multipliers.
    -- In a filtered scope, mixed deals/contract snapshots are reported separately and
    -- contribute no inferred allocation of fees, receipts, or other shared amounts.
    with inventory as materialized (
      select space_id, segment_key from public.commercial_lot_facts_v where edition_id = p_edition_id
    ), deal_scope as (
      select d.id, d.status, d.total_cents,
        bool_and(coalesce(i.segment_key = p_segment, false)) as wholly_in_scope
      from public.deals d
      join public.deal_spaces ds on ds.deal_id = d.id
      left join inventory i on i.space_id = ds.space_id
      where d.edition_id = p_edition_id and not d.is_demo
        and d.status in ('proposta','negociacao','reservada')
      group by d.id
      having bool_or(i.space_id is not null and (p_segment is null or i.segment_key = p_segment))
    ), contract_scope as (
      select c.id, c.deal_id, c.status, c.signed_at, c.total_cents, d.status as deal_status,
        bool_and(coalesce(i.segment_key = p_segment, false)) as wholly_in_scope
      from public.contracts c
      join public.deals d on d.id = c.deal_id and d.edition_id = c.edition_id and not d.is_demo
      join public.contract_spaces cs on cs.contract_id = c.id
      left join inventory i on i.space_id = cs.space_id
      where v_contracts and c.edition_id = p_edition_id
      group by c.id, d.status
      having bool_or(i.space_id is not null and (p_segment is null or i.segment_key = p_segment))
    ), installment_receipts as (
      select i.status, i.amount_cents, sum(p.amount_cents) as paid
      from contract_scope c
      join public.installments i on i.contract_id = c.id and i.edition_id = p_edition_id
      left join public.payments p on p.installment_id = i.id
      where p_segment is null or c.wholly_in_scope
      group by i.id
    )
    select jsonb_build_object(
      'contractedCents', (select sum(total_cents) from contract_scope
        where status = 'assinado' and signed_at is not null and deal_status = 'contratada'
          and (p_segment is null or wholly_in_scope)),
      'negotiatingCents', (select sum(total_cents) from deal_scope where p_segment is null or wholly_in_scope),
      'receivedCents', (select sum(paid) from installment_receipts),
      'openCents', (select sum(greatest(amount_cents - coalesce(paid, 0), 0))
        from installment_receipts where status = 'aberta'),
      'mixedDealsExcluded', case when p_segment is not null then (
        select count(*) from (
          select id from deal_scope where not wholly_in_scope
          union select deal_id from contract_scope where not wholly_in_scope and status <> 'cancelado'
        ) mixed
      ) else 0 end
    ) into v_totals;
  end if;
  return jsonb_build_object('lots', v_lots, 'events', v_events, 'totals', v_totals);
end $$;

revoke all on function public.get_commercial_overview(uuid) from public, anon, authenticated;
revoke all on function public.get_commercial_lots(uuid,text) from public, anon, authenticated;
revoke all on function public.get_commercial_details(uuid,text) from public, anon, authenticated;
grant execute on function public.get_commercial_overview(uuid) to authenticated;
grant execute on function public.get_commercial_lots(uuid,text) to authenticated;
grant execute on function public.get_commercial_details(uuid,text) to authenticated;

commit;
