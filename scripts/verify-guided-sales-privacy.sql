-- Run as an administrator of the database. All fixture writes are rolled back.
begin;
do $test$
declare
  ed uuid := (select id from public.editions where is_active and year=2027);
  admin_id uuid := gen_random_uuid();
  viewer_id uuid := gen_random_uuid();
  current_role_name public.app_role;
  space_id uuid;
  buyer uuid;
  sale_id uuid;
  installment_id uuid;
  payment_id uuid;
  document_id uuid;
  snapshot jsonb;
  quoted jsonb;
  payment jsonb;
  sale jsonb;
  file_path text;
  rights record;
  due date;
  matches_count int;
begin
  select i.space_id into strict space_id from public.commercial_inventory_v i
    join public.space_commercial_state_v s on s.id=i.space_id
    where i.edition_id=ed and i.segment_key='p12' and i.lot_code='3' and s.commercial_status='disponivel';
  select (now() at time zone timezone)::date into due from public.editions where id=ed;
  insert into public.user_roles(user_id,role) values(admin_id,'admin');
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  payment := jsonb_build_object('method','pix','mode','a_vista','installmentCount',1,
    'intervalMonths',1,'firstDueOn',due);
  quoted := public.preview_guided_sale(ed,array[space_id],'{}',payment);
  snapshot := public.begin_guided_sale_attachment(ed,'privado.pdf','application/pdf',42,gen_random_uuid());
  document_id := (snapshot->>'id')::uuid;
  file_path := snapshot->>'storage_path';
  insert into storage.objects(bucket_id,name,metadata) values
    ('documents',file_path,'{"mimetype":"application/pdf","size":42}');
  sale := public.save_guided_sale(ed,array[space_id],'{}',payment,quoted->>'quoteFingerprint',null,
    '{"legal_name":"Empresa privada de verificação","trade_name":"Privada","tax_id":"11222333000181","representative_name":"Pessoa privada","email":"private@example.invalid"}',
    gen_random_uuid(),'Assinatura de teste.',document_id);
  sale_id := (sale->>'dealId')::uuid;
  buyer := (sale->>'companyId')::uuid;
  select id into strict installment_id from public.installments i where i.contract_id=(sale->>'contractId')::uuid;
  payment_id := public.register_payment(installment_id,100,due,'pix','Fixture',gen_random_uuid()::text);
  if not public.can_read_document_object(file_path) then raise exception 'Admin cannot read signed PDF'; end if;

  foreach current_role_name in array array['comercial','financeiro','operacao','consulta']::public.app_role[] loop
    insert into public.user_roles(user_id,role) values(viewer_id,current_role_name);
    perform set_config('request.jwt.claim.sub',viewer_id::text,true);
    execute 'set local role authenticated';
    if exists(select from public.deals where id=sale_id)
      or exists(select from public.deal_events where deal_id=sale_id)
      or exists(select from public.deal_spaces where deal_id=sale_id)
      or exists(select from public.contracts where id=(sale->>'contractId')::uuid)
      or exists(select from public.contract_versions where contract_id=(sale->>'contractId')::uuid)
      or exists(select from public.installments where id=installment_id)
      or exists(select from public.payments where id=payment_id)
      or exists(select from public.companies where id=buyer)
      or exists(select from public.contacts where company_id=buyer)
      or exists(select from public.company_participations where company_id=buyer)
      or exists(select from public.documents where id=document_id)
      or exists(select from public.document_links l where l.document_id=(snapshot->>'id')::uuid)
      or public.can_read_document_object(file_path)
    then raise exception 'Private relation exposed to role %',current_role_name; end if;

    select s.commercial_status,s.active_deal_id into rights from public.space_status_v s where id=space_id;
    if rights.commercial_status is distinct from 'indisponivel' or rights.active_deal_id is not null
    then raise exception 'Incorrect masked stock for %: %',current_role_name,rights; end if;
    select count(*) into matches_count from jsonb_array_elements(public.get_commercial_lots(ed,'p12')) as l
      where l->>'id'=space_id::text and l->>'status'='indisponivel'
        and l->'deal'='null'::jsonb and not l ? 'grossCents' and not l ? 'tariffCents';
    if matches_count <> 1 then raise exception 'Map projection exposes private data'; end if;
    if public.get_company_participation(buyer,ed) is not null
      or public.get_contract_pricing_terms((sale->>'contractId')::uuid) is not null
    then raise exception 'Legacy definer leaked private data'; end if;

    begin
      perform public.get_guided_sale(sale_id);
      raise exception 'Private sale RPC did not reject viewer';
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.get_commercial_overview(ed);
      raise exception 'Dashboard RPC did not reject viewer';
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.get_commercial_details(ed,'p12');
      raise exception 'Dashboard details RPC did not reject viewer';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
    delete from public.user_roles where user_id=viewer_id and role=current_role_name;
  end loop;
end $test$;
rollback;
select 'guided sale privacy and stock masking verified' as result;
