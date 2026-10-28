-- Exercita o caminho direto já existente de contatos como usuário autenticado.
-- Dados reais são selecionados internamente, nunca impressos. Tudo é revertido.
begin;
create temporary table company_contact_version_test_context(data jsonb not null);
grant select on company_contact_version_test_context to authenticated;

do $$
declare v_admin uuid; v_history uuid; v_current uuid; v_companies uuid[]; v_snapshot_hash text; v_occupation_hash text;
begin
  if has_function_privilege('authenticated','public.touch_company_after_contact_change()','EXECUTE') or
     has_function_privilege('anon','public.touch_company_after_contact_change()','EXECUTE') then raise exception 'Helper de concorrência exposto.'; end if;
  select user_id into v_admin from public.user_roles where role='admin' order by user_id limit 1;
  select id into v_history from public.editions where year=2025 and is_historical;
  select id into v_current from public.editions where year=2027 and is_active;
  select array_agg(company_id order by company_id) into v_companies from
    (select company_id from public.company_participations where edition_id=v_history order by company_id limit 2) selected;
  if v_admin is null or v_history is null or v_current is null or cardinality(v_companies)<>2 then raise exception 'Pré-condição: histórico persistido, edição ativa e administrador necessários.'; end if;
  select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb)::text) into v_snapshot_hash from public.company_participations p where p.edition_id=v_history;
  select md5(coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]'::jsonb)::text) into v_occupation_hash from public.company_participation_occupations o where o.edition_id=v_history;
  insert into company_contact_version_test_context values(jsonb_build_object('company_a',v_companies[1],'company_b',v_companies[2],
    'history_id',v_history,'current_id',v_current,'snapshot_hash',v_snapshot_hash,'occupation_hash',v_occupation_hash));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare t jsonb; v_a uuid; v_b uuid; v_contact uuid; v_a_stamp timestamptz; v_b_stamp timestamptz;
  v_next_stamp timestamptz; v_rejected boolean:=false;
begin
  select data into t from company_contact_version_test_context;
  v_a:=(t->>'company_a')::uuid; v_b:=(t->>'company_b')::uuid;
  select updated_at into v_a_stamp from public.companies where id=v_a;
  insert into public.contacts(company_id,name,role,is_primary) values(v_a,'Contato sintético de concorrência','Teste',false) returning id into v_contact;
  select updated_at into v_next_stamp from public.companies where id=v_a;
  if v_next_stamp<=v_a_stamp then raise exception 'Inserção de contato não avançou timestamp da empresa.'; end if;
  begin
    perform public.save_company_participation(v_a,(t->>'current_id')::uuid,'{}'::jsonb,null,
      v_a_stamp,null,'contact-concurrency-test-'||gen_random_uuid()::text);
  exception when others then
    if sqlerrm not like '%alterada por outra pessoa%' then raise exception 'Validação de formulário desatualizado falhou inesperadamente.'; end if;
    v_rejected:=true;
  end;
  if not v_rejected then raise exception 'Formulário anterior à alteração de contato foi aceito.'; end if;
  v_a_stamp:=v_next_stamp;
  update public.contacts set name='Contato sintético alterado' where id=v_contact;
  select updated_at into v_next_stamp from public.companies where id=v_a;
  if v_next_stamp<=v_a_stamp then raise exception 'Edição de contato não avançou timestamp da empresa.'; end if;
  v_a_stamp:=v_next_stamp;
  select updated_at into v_b_stamp from public.companies where id=v_b;
  update public.contacts set company_id=v_b where id=v_contact;
  if (select updated_at from public.companies where id=v_a)<=v_a_stamp or
     (select updated_at from public.companies where id=v_b)<=v_b_stamp then raise exception 'Transferência não invalidou ambas as empresas.'; end if;
  select updated_at into v_b_stamp from public.companies where id=v_b;
  delete from public.contacts where id=v_contact;
  if (select updated_at from public.companies where id=v_b)<=v_b_stamp then raise exception 'Remoção de contato não avançou timestamp da empresa.'; end if;
end $$;
reset role;
do $$
declare t jsonb; v_hash text;
begin
  select data into t from company_contact_version_test_context;
  select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb)::text) into v_hash from public.company_participations p where p.edition_id=(t->>'history_id')::uuid;
  if v_hash is distinct from t->>'snapshot_hash' then raise exception 'Alteração de contato reescreveu participação histórica.'; end if;
  select md5(coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]'::jsonb)::text) into v_hash from public.company_participation_occupations o where o.edition_id=(t->>'history_id')::uuid;
  if v_hash is distinct from t->>'occupation_hash' then raise exception 'Alteração de contato reescreveu ocupação histórica.'; end if;
end $$;
select 'company_contact_version_pass' as result;
rollback;
