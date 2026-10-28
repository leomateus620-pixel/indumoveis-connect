-- Validação sobre a importação real já persistida, sem exportar dados cadastrais.
-- Executar em conexão administrativa; a única saída é o marcador de sucesso.
-- Todas as alterações, inclusive contatos, auditoria e chaves idempotentes, são revertidas.
begin;

create temporary table company_2025_reuse_test_context(data jsonb not null);
grant select,update on company_2025_reuse_test_context to authenticated;

do $$
declare v_admin uuid; v_history uuid; v_current uuid; v_company uuid; v_batch uuid;
  v_snapshot_hash text; v_occupation_hash text; v_counts jsonb;
begin
  select user_id into v_admin from public.user_roles where role='admin' order by user_id limit 1;
  if v_admin is null then raise exception 'Pré-condição: administrador existente necessário.'; end if;
  select id,edition_id into v_batch,v_history from public.company_import_batches
    where file_sha256='65c45671d2aa424d075f800681faf8981e059a392c59a5388005c34abc95ef4a'
      and status='applied';
  if v_batch is null then raise exception 'Pré-condição: importação completa de 2025 necessária.'; end if;
  select id into v_current from public.editions where year=2027 and is_active and not is_historical;
  if v_current is null then raise exception 'Pré-condição: edição 2027 ativa necessária.'; end if;
  if (select count(*) from public.companies)<>107 then raise exception 'Pré-condição: conjunto inicial de 107 empresas necessário.'; end if;
  if (select count(*) from public.company_import_rows where batch_id=v_batch and status='applied')<>111 then raise exception 'Pré-condição: 111 linhas aplicadas necessárias.'; end if;
  select r.company_id into v_company from public.company_import_rows r
    where r.batch_id=v_batch and r.status='applied'
      and not exists(select 1 from public.company_participations p where p.company_id=r.company_id and p.edition_id=v_current)
    order by r.source_row limit 1;
  if v_company is null then raise exception 'Pré-condição: empresa histórica sem participação em 2027 necessária.'; end if;
  select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb)::text) into v_snapshot_hash
    from public.company_participations p where p.edition_id=v_history;
  select md5(coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]'::jsonb)::text) into v_occupation_hash
    from public.company_participation_occupations o where o.edition_id=v_history;
  v_counts:=jsonb_build_object('companies',(select count(*) from public.companies),
    'participations',(select count(*) from public.company_participations),
    'current_participations',(select count(*) from public.company_participations where edition_id=v_current),
    'occupations',(select count(*) from public.company_participation_occupations),
    'deals',(select count(*) from public.deals),'deal_spaces',(select count(*) from public.deal_spaces),
    'spaces',(select count(*) from public.spaces),'contracts',(select count(*) from public.contracts),
    'installments',(select count(*) from public.installments),'payments',(select count(*) from public.payments));
  insert into company_2025_reuse_test_context values(jsonb_build_object(
    'company_id',v_company,'history_id',v_history,'current_id',v_current,
    'snapshot_hash',v_snapshot_hash,'occupation_hash',v_occupation_hash,'counts',v_counts,
    'operation_prefix','persisted-reuse-test-'||gen_random_uuid()::text));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
end $$;

-- As gravações exercitam a autorização real, sem privilégios do proprietário da conexão.
set local role authenticated;
do $$
declare t jsonb; v_company uuid; v_history uuid; v_current uuid; v_part uuid;
  v_original_stamp timestamptz; v_stamp timestamptz; v_version integer; v_result jsonb;
  v_rejected boolean:=false; v_detail jsonb;
begin
  select data into t from company_2025_reuse_test_context;
  v_company:=(t->>'company_id')::uuid; v_history:=(t->>'history_id')::uuid; v_current:=(t->>'current_id')::uuid;
  select updated_at into v_original_stamp from public.companies where id=v_company;
  begin
    perform public.save_company_participation(v_company,v_current,'{}'::jsonb,'[]'::jsonb,
      '1970-01-01'::timestamptz,null,t->>'operation_prefix'||'-stale-company');
  exception when others then
    if sqlerrm not like '%alterada por outra pessoa%' then raise exception 'Validação de concorrência da empresa falhou inesperadamente.'; end if;
    v_rejected:=true;
  end;
  if not v_rejected then raise exception 'Timestamp desatualizado aceito.'; end if;

  v_result:=public.save_company_participation(v_company,v_current,'{}'::jsonb,'[]'::jsonb,
    v_original_stamp,null,t->>'operation_prefix'||'-create');
  v_part:=(v_result->>'participation_id')::uuid;
  if (v_result->>'company_id')::uuid<>v_company then raise exception 'Reutilização criou outra empresa.'; end if;
  if public.save_company_participation(v_company,v_current,'{}'::jsonb,'[]'::jsonb,
      v_original_stamp,null,t->>'operation_prefix'||'-create') is distinct from v_result then raise exception 'Salvamento repetido não foi idempotente.'; end if;
  if (select count(*) from public.companies)<>107 then raise exception 'Reutilização duplicou empresa.'; end if;
  if (select count(*) from public.company_participations)<>(t->'counts'->>'participations')::bigint+1 then raise exception 'Quantidade de participações incorreta.'; end if;
  if (select count(*) from public.company_participations where edition_id=v_current)<>(t->'counts'->>'current_participations')::bigint+1 then raise exception 'Participação adicionada à edição errada.'; end if;
  if (select status from public.company_participations where id=v_part)<>'cadastrado' then raise exception 'Participação recebeu estado comercial.'; end if;
  if exists(select 1 from public.company_participation_occupations where participation_id=v_part) then raise exception 'Ocupações antigas foram copiadas automaticamente.'; end if;

  select updated_at into v_stamp from public.companies where id=v_company;
  select version into v_version from public.company_participations where id=v_part;
  v_rejected:=false;
  begin
    perform public.save_company_participation(v_company,v_current,'{"city":"Alteração que deve ser revertida"}'::jsonb,null,
      v_stamp,v_version-1,t->>'operation_prefix'||'-stale-participation');
  exception when others then
    if sqlerrm not like '%participação já existe ou foi alterada%' then raise exception 'Validação de versão falhou inesperadamente.'; end if;
    v_rejected:=true;
  end;
  if not v_rejected then raise exception 'Versão desatualizada de participação aceita.'; end if;

  perform public.save_company_participation(v_company,v_current,
    '{"city":"Município sintético de validação","email":"validacao@example.invalid","phone":"00000000000","representative_name":"Contato sintético de validação"}'::jsonb,
    null,v_stamp,v_version,t->>'operation_prefix'||'-update');
  v_detail:=public.get_company_participation(v_company,v_current);
  if v_detail->'company'->>'city'<>'Município sintético de validação' or
     v_detail->'company'->>'email'<>'validacao@example.invalid' or
     v_detail->'company'->>'phone'<>'00000000000' then raise exception 'Localização ou contato atual não foram atualizados.'; end if;
  if not exists(select 1 from public.contacts where company_id=v_company and name='Contato sintético de validação' and is_primary) then raise exception 'Representante atual não foi salvo.'; end if;
  if (v_detail->'participation'->>'version')::integer<>v_version+1 then raise exception 'Versão da participação não avançou.'; end if;
  if v_detail->'participation'->'registration_snapshot'->>'city'<>'Município sintético de validação' then raise exception 'Retrato de 2027 não foi atualizado.'; end if;
  if jsonb_array_length(v_detail->'occupations')<>0 then raise exception 'Atualização criou ocupação em 2027.'; end if;
  if (public.get_company_participation(v_company,v_history)->'participation'->>'snapshot_locked')::boolean is distinct from true then raise exception 'Histórico perdeu proteção.'; end if;
  if (select count(*) from public.companies)<>107 then raise exception 'Atualização duplicou empresa.'; end if;
  update company_2025_reuse_test_context set data=data||jsonb_build_object('current_participation_id',v_part);
end $$;
reset role;

-- Compara o conteúdo integral de todos os registros históricos, inclusive metadados internos.
do $$
declare t jsonb; v_hash text; v_counts jsonb;
begin
  select data into t from company_2025_reuse_test_context;
  select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb)::text) into v_hash
    from public.company_participations p where p.edition_id=(t->>'history_id')::uuid;
  if v_hash is distinct from t->>'snapshot_hash' then raise exception 'Uma participação histórica foi modificada.'; end if;
  select md5(coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]'::jsonb)::text) into v_hash
    from public.company_participation_occupations o where o.edition_id=(t->>'history_id')::uuid;
  if v_hash is distinct from t->>'occupation_hash' then raise exception 'Uma ocupação histórica foi modificada.'; end if;
  v_counts:=jsonb_build_object('occupations',(select count(*) from public.company_participation_occupations),
    'deals',(select count(*) from public.deals),'deal_spaces',(select count(*) from public.deal_spaces),
    'spaces',(select count(*) from public.spaces),'contracts',(select count(*) from public.contracts),
    'installments',(select count(*) from public.installments),'payments',(select count(*) from public.payments));
  if v_counts is distinct from ((t->'counts')-array['companies','participations','current_participations']) then raise exception 'Reutilização alterou ocupações ou registros comerciais/financeiros.'; end if;
  if not exists(select 1 from public.editions where id=(t->>'current_id')::uuid and is_active) or
      exists(select 1 from public.editions where id=(t->>'history_id')::uuid and is_active) then raise exception 'Edição global ativa foi alterada.'; end if;
end $$;

select 'company_2025_reuse_persisted_pass' as result;
rollback;
