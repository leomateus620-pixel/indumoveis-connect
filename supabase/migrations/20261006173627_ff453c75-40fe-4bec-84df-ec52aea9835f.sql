alter table public.contracts add column if not exists deal_snapshot jsonb;
create unique index if not exists installments_contract_number_uq on public.installments(contract_id, number);

create or replace function public.deal_snapshot(p_deal_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'company_id', d.company_id,
    'conditions', coalesce(d.conditions,''),
    'total_cents', d.total_cents,
    'spaces', coalesce((select jsonb_agg(jsonb_build_object('space_id', ds.space_id, 'price_cents', ds.price_cents) order by ds.space_id)
                        from public.deal_spaces ds where ds.deal_id = d.id), '[]'::jsonb))
  from public.deals d where d.id = p_deal_id
$$;
revoke execute on function public.deal_snapshot(uuid) from public, anon;

update public.contracts c set deal_snapshot = public.deal_snapshot(c.deal_id) where deal_snapshot is null;

create or replace function public.reconcile_contract_cancellation(p_contract_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.installments i set status = 'cancelada'
   where i.contract_id = p_contract_id and i.status = 'aberta'
     and not exists (select 1 from public.payments p where p.installment_id = i.id);
end $$;
revoke execute on function public.reconcile_contract_cancellation(uuid) from public, anon, authenticated;

create or replace function public.create_contract_from_deal(p_deal_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare d record; v_id uuid; v_body text; v_num text;
begin
  if not public.can_write('contratos') then raise exception 'Sem permissão'; end if;
  select * into d from public.deals where id = p_deal_id for update;
  if d.id is null then raise exception 'Negociação não encontrada'; end if;
  if d.status not in ('negociacao','reservada') then raise exception 'O contrato pode ser preparado para negociações em andamento ou reservadas'; end if;
  select id into v_id from public.contracts where deal_id = p_deal_id and status <> 'cancelado';
  if v_id is not null then return v_id; end if;
  select coalesce(contract_template, '') into v_body from public.editions where id = d.edition_id;
  v_num := to_char(now(), 'YYYY') || '-' || lpad(((select count(*) from public.contracts where edition_id = d.edition_id) + 1)::text, 4, '0');
  insert into public.contracts(edition_id, deal_id, company_id, number, body, total_cents, created_by, deal_snapshot)
  values (d.edition_id, d.id, d.company_id, v_num, v_body, d.total_cents, auth.uid(), public.deal_snapshot(d.id)) returning id into v_id;
  insert into public.contract_spaces(contract_id, space_id) select v_id, space_id from public.deal_spaces where deal_id = d.id;
  insert into public.contract_versions(contract_id, version, body, created_by) values (v_id, 1, v_body, auth.uid());
  return v_id;
end $$;

create or replace function public.refresh_contract_from_deal(p_contract_id uuid, p_expected_version integer)
returns void language plpgsql security definer set search_path to 'public' as $$
declare c record; d record;
begin
  if not public.can_write('contratos') then raise exception 'Sem permissão'; end if;
  select * into c from public.contracts where id = p_contract_id for update;
  if c.id is null then raise exception 'Contrato não encontrado'; end if;
  if c.status <> 'elaboracao' then raise exception 'Somente contratos em elaboração podem ser atualizados'; end if;
  if c.current_version <> p_expected_version then raise exception 'O contrato foi alterado por outra pessoa. Recarregue antes de continuar.'; end if;
  select * into d from public.deals where id = c.deal_id;
  update public.contracts set company_id = d.company_id, total_cents = d.total_cents, deal_snapshot = public.deal_snapshot(d.id) where id = c.id;
  delete from public.contract_spaces where contract_id = c.id;
  insert into public.contract_spaces(contract_id, space_id) select c.id, space_id from public.deal_spaces where deal_id = d.id;
end $$;

drop function if exists public.save_contract_body(uuid, text);
create or replace function public.save_contract_body(p_contract_id uuid, p_body text, p_expected_version integer)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare c record; v int;
begin
  if not public.can_write('contratos') then raise exception 'Sem permissão'; end if;
  select * into c from public.contracts where id = p_contract_id for update;
  if c.status <> 'elaboracao' then raise exception 'Somente contratos em elaboração podem ser editados'; end if;
  if c.current_version <> p_expected_version then raise exception 'O contrato foi alterado por outra pessoa (versão %). Recarregue antes de salvar.', c.current_version; end if;
  v := c.current_version + 1;
  insert into public.contract_versions(contract_id, version, body, created_by) values (p_contract_id, v, p_body, auth.uid());
  update public.contracts set body = p_body, current_version = v where id = p_contract_id;
  return v;
end $$;

create or replace function public.set_contract_status(p_contract_id uuid, p_to contract_status, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare c record; v_deal deal_status;
begin
  if not public.can_write('contratos') then raise exception 'Sem permissão'; end if;
  select * into c from public.contracts where id = p_contract_id for update;
  if c.id is null then raise exception 'Contrato não encontrado'; end if;
  if not (
    (c.status = 'elaboracao' and p_to in ('emitido','cancelado')) or
    (c.status = 'emitido' and p_to in ('elaboracao','assinado','cancelado')) or
    (c.status = 'assinado' and p_to = 'cancelado')
  ) then raise exception 'Transição inválida: % → %', c.status, p_to; end if;
  if p_to = 'assinado' and coalesce(trim(p_note),'') = '' then raise exception 'Descreva como a assinatura foi obtida'; end if;
  if p_to = 'cancelado' and coalesce(trim(p_note),'') = '' then raise exception 'Informe o motivo do cancelamento'; end if;
  select status into v_deal from public.deals where id = c.deal_id for update;
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
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_from deal_status; r record;
begin
  if not public.can_write('comercial') then raise exception 'Sem permissão'; end if;
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

create or replace function public.generate_installments(p_contract_id uuid, p_count integer, p_first_due date, p_interval_months integer)
returns void language plpgsql security definer set search_path to 'public' as $$
declare c record; base bigint; rest bigint; i int;
begin
  if not public.can_write('financeiro') then raise exception 'Sem permissão'; end if;
  if p_count < 1 or p_count > 36 then raise exception 'Quantidade de parcelas inválida'; end if;
  if p_interval_months < 1 or p_interval_months > 12 then raise exception 'Intervalo inválido'; end if;
  select * into c from public.contracts where id = p_contract_id for update;
  if c.id is null then raise exception 'Contrato não encontrado'; end if;
  if c.status not in ('emitido','assinado') then raise exception 'Parcelas só podem ser geradas para contratos emitidos ou assinados'; end if;
  if exists (select 1 from public.installments where contract_id = p_contract_id) then raise exception 'O contrato já possui parcelas'; end if;
  base := c.total_cents / p_count; rest := c.total_cents - base * p_count;
  for i in 1..p_count loop
    insert into public.installments(edition_id, contract_id, number, due_date, amount_cents)
    values (c.edition_id, c.id, i, (p_first_due + make_interval(months => (i-1) * p_interval_months))::date,
            base + case when i = p_count then rest else 0 end);
  end loop;
end $$;

create or replace function public.save_deal(p_deal_id uuid, p_edition_id uuid, p_company_id uuid, p_owner_id uuid, p_conditions text, p_notes text, p_space_ids uuid[], p_prices bigint[], p_idempotency_key text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_conflict text; v_status deal_status; i int;
begin
  if not public.can_write('comercial') then raise exception 'Sem permissão para editar negociações'; end if;
  if p_space_ids is null or array_length(p_space_ids,1) is null then raise exception 'Selecione ao menos um espaço'; end if;
  if array_length(p_space_ids,1) <> coalesce(array_length(p_prices,1),0) then raise exception 'Valores inconsistentes'; end if;
  if p_deal_id is null and p_idempotency_key is not null then
    select id into v_id from public.deals where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;
  if p_deal_id is not null and exists (select 1 from public.contracts where deal_id = p_deal_id and status in ('emitido','assinado')) then
    raise exception 'Negociação com contrato emitido ou assinado não pode ser editada. Volte o contrato para elaboração antes';
  end if;
  perform 1 from public.spaces where id = any(p_space_ids) for update;
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