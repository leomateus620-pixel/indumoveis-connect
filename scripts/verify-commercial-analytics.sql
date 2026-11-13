-- Run as an administrative PostgreSQL role, in a test database or through the
-- direct connector. The fixture, users' roles and all workflow effects roll back.
begin;
do $$
declare
  ed uuid := (select id from public.editions where is_active and year = 2027);
  other_ed uuid := gen_random_uuid();
  admin_actor uuid := gen_random_uuid();
  reader_actor uuid := gen_random_uuid();
  company uuid;
  deal uuid;
  contract uuid;
  ids uuid[];
  rollup jsonb;
  details jsonb;
  pavilion jsonb;
  before_sales int;
  before_received bigint;
  before_open bigint;
  before_contracted bigint;
  fixture_total bigint := 45001;
  expected_receipt bigint := 1000;
  month_start date := greatest(date '2026-11-13', (now() at time zone 'America/Sao_Paulo')::date);
  fixture_installment uuid;
begin
  if ed is null then raise exception 'Missing edition 2027'; end if;
  select array_agg(space_id order by lot_code) into ids from (
    select f.space_id, f.lot_code from public.commercial_lot_facts_v f
    where f.edition_id = ed and f.segment_key = 'p12' and f.commercial_status = 'disponivel'
    order by length(f.lot_code), f.lot_code limit 2
  ) chosen;
  if cardinality(ids) is distinct from 2 then raise exception 'Need two available P12 lots for test'; end if;
  insert into public.editions (id,name,year,starts_on,ends_on,is_active)
    values (other_ed,'Fixture',2099,'2099-01-01','2099-01-02',false);
  -- Use existing users when the deployed role table has an auth.users foreign key.
  -- No auth users or passwords are created by this script.
  if exists(select from pg_constraint where conrelid='public.user_roles'::regclass and confrelid='auth.users'::regclass) then
    -- A fixture account would require an auth record on deployments with an FK.
    raise exception 'Run the workflow fixture on the local Supabase-compatible test database';
  end if;
  insert into public.user_roles(user_id,role) values (admin_actor,'admin'), (reader_actor,'consulta');
  perform set_config('request.jwt.claim.sub', admin_actor::text, true);

  rollup := public.get_commercial_overview(ed);
  select value into pavilion from jsonb_array_elements(rollup->'segments') where value->>'key'='p12';
  before_sales := (pavilion->>'sold')::int;
  if (pavilion->>'total')::int <> 254 or (pavilion->>'knownAreaM2')::numeric <> 848
    or (pavilion->>'grossCents')::bigint <> 22896000 then raise exception 'P12 area, lots or table price mismatch: %', pavilion; end if;
  if (select (value->>'soldPercent') is not null from jsonb_array_elements(rollup->'segments')
    where value->>'key'='p3') then raise exception 'P3 has invented denominator'; end if;
  if (public.get_commercial_overview(other_ed)->'overall'->>'total')::int <> 0 then raise exception 'edition inventory leaked'; end if;

  details := public.get_commercial_details(ed,'p12');
  before_received := coalesce((details->'totals'->>'receivedCents')::bigint,0);
  before_open := coalesce((details->'totals'->>'openCents')::bigint,0);
  before_contracted := coalesce((details->'totals'->>'contractedCents')::bigint,0);
  insert into public.companies(legal_name,trade_name) values ('Fixture comercial','Fixture comercial') returning id into company;
  deal := public.save_deal(null, ed, company, null, null, null, ids, array[25000,20001]::bigint[], null);
  perform public.transition_deal(deal,'negociacao',null);
  perform public.transition_deal(deal,'reservada',null);
  select value into pavilion from jsonb_array_elements(public.get_commercial_overview(ed)->'segments')
    where value->>'key'='p12';
  if (pavilion->>'sold')::int <> before_sales then raise exception 'Reservation counted as sale'; end if;

  contract := public.create_contract_from_deal(deal);
  perform public.set_contract_status(contract,'emitido',null);
  perform public.set_contract_status(contract,'assinado','Assinatura da verificação transacional');
  select value into pavilion from jsonb_array_elements(public.get_commercial_overview(ed)->'segments')
    where value->>'key'='p12';
  if (pavilion->>'sold')::int <> before_sales+2
    or (pavilion->>'soldPercent')::numeric <> round(100.0*(before_sales+2)/254,2) then
    raise exception 'Canonical sold count or percentage mismatch: %', pavilion;
  end if;
  details := public.get_commercial_details(ed,'p12');
  if (details->'totals'->>'contractedCents')::bigint <> before_contracted+fixture_total
    then raise exception 'Contract was counted more than once'; end if;
  if not exists (select from jsonb_array_elements(details->'events') a
    where (a->>'signed')::int >= 2 and a->>'date' = ((now() at time zone 'America/Sao_Paulo')::date)::text)
    then raise exception 'Signature event missing'; end if;

  -- Insert an installment fixture directly to test partial receipts without relying on the current calendar.
  insert into public.installments(edition_id,contract_id,number,due_date,amount_cents)
    values (ed,contract,1,month_start,fixture_total) returning id into fixture_installment;
  insert into public.payments(installment_id,amount_cents,paid_on)
    values (fixture_installment,expected_receipt,month_start);
  details := public.get_commercial_details(ed,'p12');
  if (details->'totals'->>'receivedCents')::bigint <> before_received+expected_receipt or
    (details->'totals'->>'openCents')::bigint <> before_open+fixture_total-expected_receipt
    then raise exception 'Receipts or open amounts mismatch'; end if;

  perform set_config('request.jwt.claim.sub', reader_actor::text, true);
  rollup := public.get_commercial_overview(ed);
  details := public.get_commercial_details(ed,'p12');
  if (rollup->>'financial')::boolean or (rollup->'overall') ? 'grossCents' or
     details->'totals' <> 'null'::jsonb or exists (
       select from jsonb_array_elements(details->'lots') lot
       where lot ? 'tariffCents' or lot ? 'grossCents' or (lot->'deal') ? 'spacePriceCents'
     ) then raise exception 'Finance data leaked to read-only role'; end if;
  if has_table_privilege('authenticated','public.commercial_lot_facts_v','select') or
     has_function_privilege('anon','public.get_commercial_details(uuid,text)','execute') then
    raise exception 'Unexpected direct grants';
  end if;

  perform set_config('request.jwt.claim.sub', admin_actor::text, true);
  perform public.set_contract_status(contract,'cancelado','Cancelamento da verificação transacional');
  details := public.get_commercial_details(ed,'p12');
  if (details->'totals'->>'receivedCents')::bigint <> before_received+expected_receipt
    or coalesce((details->'totals'->>'contractedCents')::bigint,0) <> before_contracted
    then raise exception 'Cancellation rewrote receipt or kept cancelled contract in sales'; end if;
  if not exists (select from jsonb_array_elements(details->'events') a
    where (a->>'cancelled')::int >= 2 and a->>'date' = ((now() at time zone 'America/Sao_Paulo')::date)::text)
    then raise exception 'Cancellation event missing'; end if;
  if (select count(*) from public.commercial_lot_facts_v where space_id=any(ids) and commercial_status='disponivel') <> 2
    then raise exception 'Cancellation did not release lots'; end if;
  deal := public.save_deal(null, ed, company, null, null, null, ids, array[25000,20001]::bigint[], null);
  perform public.transition_deal(deal,'negociacao',null);
  select value into pavilion from jsonb_array_elements(public.get_commercial_overview(ed)->'segments')
    where value->>'key'='p12';
  if (pavilion->>'sold')::int <> before_sales or
    (select count(*) from public.commercial_lot_facts_v where space_id=any(ids) and commercial_status='em_negociacao') <> 2
    then raise exception 'Reopening changed sale count or failed to restore negotiation'; end if;

  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin
    perform public.get_commercial_overview(ed);
    raise exception 'Expected access denial';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
select 'verified: edition isolation, financial redaction, signature, cancellation and reopening' as result;
