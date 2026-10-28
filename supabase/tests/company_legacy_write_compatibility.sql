-- Valida o frontend ainda publicado sem persistir dados ou imprimir cadastros.
begin;
create temporary table company_legacy_write_test_context(data jsonb not null);
grant select,update on company_legacy_write_test_context to authenticated;
do $$
declare v_admin uuid; v_reader uuid:=gen_random_uuid(); v_history uuid; v_company uuid; v_hash text;
begin
  if has_function_privilege('authenticated','public.guard_legacy_company_identity()','EXECUTE') then raise exception 'Helper de compatibilidade exposto.'; end if;
  if has_column_privilege('authenticated','public.companies','created_by','UPDATE') or
     has_column_privilege('authenticated','public.companies','is_demo','INSERT') or
     has_column_privilege('authenticated','public.companies','tax_id_type','UPDATE') or
     has_table_privilege('authenticated','public.companies','DELETE') then raise exception 'Compatibilidade concedeu campos protegidos.'; end if;
  if has_table_privilege('authenticated','public.company_participations','INSERT,UPDATE,DELETE') or
     has_table_privilege('authenticated','public.company_participation_occupations','INSERT,UPDATE,DELETE') then raise exception 'Escrita composta foi liberada fora das RPCs.'; end if;
  select user_id into v_admin from public.user_roles where role='admin' order by user_id limit 1;
  select id into v_history from public.editions where year=2025 and is_historical;
  select company_id into v_company from public.company_participations where edition_id=v_history order by company_id limit 1;
  if v_admin is null or v_company is null then raise exception 'Pré-condição: administrador e histórico persistido necessários.'; end if;
  insert into public.user_roles(user_id,role) values(v_reader,'consulta');
  select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb)::text) into v_hash from public.company_participations p where p.edition_id=v_history;
  insert into company_legacy_write_test_context values(jsonb_build_object('admin_id',v_admin,'reader_id',v_reader,
    'history_id',v_history,'historical_company_id',v_company,'history_hash',v_hash,
    'participations',(select count(*) from public.company_participations),
    'occupations',(select count(*) from public.company_participation_occupations),
    'deals',(select count(*) from public.deals),'contracts',(select count(*) from public.contracts),
    'installments',(select count(*) from public.installments),'payments',(select count(*) from public.payments)));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare t jsonb; v_id uuid; v_rejected boolean:=false; v_stamp timestamptz;
begin
  select data into t from company_legacy_write_test_context;
  insert into public.companies(legal_name,trade_name,tax_id,email,phone,website,city,state,segment,notes,created_by)
    values('Empresa sintética de compatibilidade LTDA','Compatibilidade sintética','99.999.999/0001-91',
      'compatibilidade@example.invalid',null,null,'Cidade sintética','SC',null,null,gen_random_uuid()) returning id into v_id;
  if (select tax_id from public.companies where id=v_id)<>'99999999000191' or
     (select tax_id_type from public.companies where id=v_id)<>'cnpj' then raise exception 'INSERT legado não normalizou documento.'; end if;
  if (select created_by from public.companies where id=v_id) is distinct from auth.uid() then raise exception 'INSERT legado permitiu atribuir outra autoria.'; end if;
  select updated_at into v_stamp from public.companies where id=v_id;
  update public.companies set city='Cidade atualizada',email='atualizado@example.invalid' where id=v_id;
  if (select city from public.companies where id=v_id)<>'Cidade atualizada' or
     (select updated_at from public.companies where id=v_id)<=v_stamp then raise exception 'UPDATE legado falhou ou não atualizou carimbo.'; end if;
  begin
    insert into public.companies(legal_name,trade_name,tax_id,created_by)
      values('Duplicata sintética LTDA','Duplicata sintética','99999999000191',auth.uid());
  exception when unique_violation then v_rejected:=true; end;
  if not v_rejected then raise exception 'INSERT legado aceitou documento duplicado.'; end if;
  v_rejected:=false;
  begin
    update public.companies set tax_id='12345678900001' where id=v_id;
  exception when others then
    if sqlerrm not like '%dígitos verificadores válidos%' then raise exception 'Validação legada de documento falhou inesperadamente.'; end if;
    v_rejected:=true;
  end;
  if not v_rejected then raise exception 'UPDATE legado aceitou documento inválido.'; end if;
  update public.companies set city='Município sintético de rollout',email='rollout@example.invalid'
    where id=(t->>'historical_company_id')::uuid;
  if exists(select 1 from public.company_participations where company_id=v_id) then raise exception 'INSERT legado criou participação implicitamente.'; end if;
  if (select count(*) from public.company_participations)<>(t->>'participations')::bigint or
     (select count(*) from public.company_participation_occupations)<>(t->>'occupations')::bigint then raise exception 'Escrita legada alterou participações ou ocupações.'; end if;
  update company_legacy_write_test_context set data=data||jsonb_build_object('legacy_company_id',v_id);
end $$;
reset role;
do $$
declare t jsonb; v_hash text;
begin
  select data into t from company_legacy_write_test_context;
  select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb)::text) into v_hash from public.company_participations p where p.edition_id=(t->>'history_id')::uuid;
  if v_hash is distinct from t->>'history_hash' then raise exception 'UPDATE legado reescreveu histórico.'; end if;
  if (select count(*) from public.deals)<>(t->>'deals')::bigint or
     (select count(*) from public.contracts)<>(t->>'contracts')::bigint or
     (select count(*) from public.installments)<>(t->>'installments')::bigint or
     (select count(*) from public.payments)<>(t->>'payments')::bigint then raise exception 'Escrita legada alterou registros comerciais/financeiros.'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',t->>'reader_id','role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare t jsonb; v_rejected boolean:=false; v_count bigint;
begin
  select data into t from company_legacy_write_test_context;
  begin
    insert into public.companies(legal_name,trade_name,created_by) values('Tentativa sintética LTDA','Somente leitura',auth.uid());
  exception when insufficient_privilege then v_rejected:=true; end;
  if not v_rejected then raise exception 'Leitor conseguiu cadastrar empresa.'; end if;
  update public.companies set city='Alteração proibida' where id=(t->>'legacy_company_id')::uuid;
  get diagnostics v_count=row_count;
  if v_count<>0 then raise exception 'Leitor conseguiu alterar empresa.'; end if;
end $$;
reset role;
select 'company_legacy_write_compatibility_pass' as result;
rollback;
