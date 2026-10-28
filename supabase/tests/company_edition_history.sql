-- Execute em uma conexão administrativa. Tudo é revertido no fim.
-- Dados exclusivamente sintéticos; nenhum dado do arquivo de expositores.
begin;

-- Permissões explícitas importam mesmo quando o projeto concede defaults amplos.
do $$
begin
  if has_function_privilege('anon','public.get_company_participation(uuid,uuid)','EXECUTE') then raise exception 'Anon pode consultar ficha'; end if;
  if has_function_privilege('authenticated','public.company_registration_snapshot(uuid)','EXECUTE') then raise exception 'Helper privado exposto'; end if;
  if has_function_privilege('authenticated','public.guard_company_occupation()','EXECUTE') then raise exception 'Trigger helper exposto'; end if;
  if has_table_privilege('authenticated','public.company_import_rows','INSERT,UPDATE,DELETE') then raise exception 'Preparação admite escrita direta'; end if;
  if has_table_privilege('authenticated','public.company_import_batches','INSERT,UPDATE,DELETE') then raise exception 'Lote admite escrita direta'; end if;
  if has_table_privilege('authenticated','public.company_save_requests','SELECT,INSERT,UPDATE,DELETE') then raise exception 'Idempotência exposta'; end if;
  if has_table_privilege('authenticated','public.company_participation_occupations','INSERT,UPDATE,DELETE') then raise exception 'Ocupações admitem escrita direta'; end if;
  if has_column_privilege('authenticated','public.company_participation_occupations','source_snapshot','SELECT') then raise exception 'Origem técnica exposta ao leitor comum'; end if;
  if has_column_privilege('authenticated','public.company_participation_occupations','source_import_row_id','SELECT') then raise exception 'Rastreabilidade técnica exposta ao leitor comum'; end if;
  if has_table_privilege('authenticated','public.companies','INSERT,UPDATE,DELETE') then raise exception 'Empresa admite escrita fora da operação atômica'; end if;
  if has_table_privilege('authenticated','public.company_participations','INSERT,UPDATE,DELETE') then raise exception 'Participação admite escrita direta'; end if;
end $$;

create temporary table company_history_test_context(data jsonb);
grant select,insert,update on company_history_test_context to authenticated;
insert into public.user_roles(user_id,role) values('10000000-0000-4000-8000-000000000025','admin');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000025","role":"authenticated"}',true);

-- Escrita/consulta autorizadas pela sessão; checks de auth executados dentro das RPCs.
set local role authenticated;
do $$
declare v_edition uuid; v_result jsonb; v_second jsonb; v_batch jsonb; v_report jsonb; v_rows jsonb;
  v_company uuid; v_part uuid; v_stamp timestamptz; v_version integer; v_snapshot jsonb;
  v_count bigint; v_rejected boolean:=false;
begin
  select id into v_edition from public.editions where is_active order by year desc limit 1;
  if v_edition is null then raise exception 'Teste requer a edição ativa existente.'; end if;
  v_result:=public.save_company_participation(null,v_edition,
    '{"legal_name":"Empresa Sintética de Teste LTDA","trade_name":"Teste transacional","tax_id":"99999999000191","email":"atual@example.invalid","city":"Cidade atual","state":"SC"}'::jsonb,
    '[]'::jsonb,null,null,'company-test-manual-0001');
  v_company:=(v_result->>'company_id')::uuid; v_part:=(v_result->>'participation_id')::uuid;
  v_second:=public.save_company_participation(null,v_edition,
    '{"legal_name":"Empresa Sintética de Teste LTDA","trade_name":"Teste transacional","tax_id":"99999999000191","email":"atual@example.invalid","city":"Cidade atual","state":"SC"}'::jsonb,
    '[]'::jsonb,null,null,'company-test-manual-0001');
  if v_second<>v_result then raise exception 'Repetição do salvamento não foi idempotente'; end if;
  if (select status from public.company_participations where id=v_part)<>'cadastrado' then raise exception 'Cadastro gerou estado comercial'; end if;
  if exists(select 1 from public.deals where company_id=v_company) then raise exception 'Cadastro criou negociação'; end if;
  if exists(select 1 from public.contracts where company_id=v_company) then raise exception 'Cadastro criou contrato'; end if;

  -- Dois conjuntos no mesmo documento continuam duas ocupações.
  v_rows:=jsonb_build_array(
    jsonb_build_object('source_row',2,'source_values',jsonb_build_object('synthetic',true),'source_document_raw','99999999000191',
      'document_normalized','99999999000191','document_type','cnpj','document_status','valid','issues','[]'::jsonb,
      'snapshot',jsonb_build_object('legal_name','Empresa Sintética de Teste LTDA','trade_name','Nome histórico sintético','tax_id','99999999000191','city','Cidade histórica','state','SC','email','historico@example.invalid','phone',null,'representative_name',null),
      'occupation',jsonb_build_object('area_label','Área Externa Especial','module_codes',jsonb_build_array('001','002'),'area_total','10.25')),
    jsonb_build_object('source_row',3,'source_values',jsonb_build_object('synthetic',true),'source_document_raw','99999999000191',
      'document_normalized','99999999000191','document_type','cnpj','document_status','valid','issues','[]'::jsonb,
      'snapshot',jsonb_build_object('legal_name','Empresa Sintética de Teste LTDA','trade_name','Nome histórico sintético','tax_id','99999999000191','city','Cidade histórica','state','SC','email','historico@example.invalid','phone',null,'representative_name',null),
      'occupation',jsonb_build_object('area_label','Mostra Arq&Design','module_codes',jsonb_build_array('A01'),'area_total','5.5')));
  v_batch:=public.stage_company_import(repeat('f',64),'fixture-sintetica-sem-dados-reais.xlsx',v_rows);
  v_report:=public.apply_company_import((v_batch->>'batch_id')::uuid,2025);
  if (v_report->>'occupations')::int<>2 or (v_report->>'companies')::int<>1 or (v_report->>'participations')::int<>1
    or (v_report->>'module_identifiers')::int<>3 or (v_report->>'area_total')::numeric<>15.75 then raise exception 'Conciliação incorreta: %',v_report; end if;
  v_second:=public.stage_company_import(repeat('f',64),'fixture-sintetica-sem-dados-reais.xlsx',v_rows);
  if v_second->>'batch_id'<>v_batch->>'batch_id' or not (v_second->>'reused')::boolean then raise exception 'Preparação duplicou lote'; end if;
  v_second:=public.apply_company_import((v_batch->>'batch_id')::uuid,2025);
  if v_second<>v_report then raise exception 'Reimportação alterou contagens'; end if;
  if (select email from public.companies where id=v_company)<>'atual@example.invalid' then raise exception 'Importação sobrescreveu contato atual'; end if;
  if (select count(*) from public.contacts where company_id=v_company)<>0 then raise exception 'Representante ausente gerou contato'; end if;
  if (v_report->>'rows_with_conflicts')::int<>2 then raise exception 'Conflitos não registrados'; end if;

  select p.registration_snapshot into v_snapshot from public.company_participations p join public.editions e on e.id=p.edition_id where p.company_id=v_company and e.year=2025;
  select updated_at into v_stamp from public.companies where id=v_company;
  select version into v_version from public.company_participations where id=v_part;
  perform public.save_company_participation(v_company,v_edition,
    '{"trade_name":"Atualizado em nova edição","city":"Nova cidade","email":"novo@example.invalid"}'::jsonb,null,v_stamp,v_version,'company-test-edit-0001');
  if v_snapshot is distinct from (select p.registration_snapshot from public.company_participations p join public.editions e on e.id=p.edition_id where p.company_id=v_company and e.year=2025) then raise exception 'Edição nova alterou retrato histórico'; end if;
  if (select trade_name from public.company_exhibitors_v where id=v_company and edition_id=(v_report->>'edition_id')::uuid)<>'Nome histórico sintético' then raise exception 'Grade histórica mostra cadastro atual'; end if;
  if (public.get_company_participation(v_company,(v_report->>'edition_id')::uuid)->'occupations'->0->>'kind')<>'historical' then raise exception 'Ficha não respeita edição'; end if;
  if jsonb_array_length(public.get_company_participation(v_company,v_edition)->'occupations')<>0 then raise exception 'Histórico vazou para ocupação atual'; end if;
  begin
    perform public.save_company_participation(v_company,v_edition,'{}'::jsonb,null,'1970-01-01'::timestamptz,v_version,'company-test-stale-0001');
  exception when others then v_rejected:=sqlerrm like '%alterada por outra pessoa%'; end;
  if not v_rejected then raise exception 'Concorrência desatualizada aceita'; end if;
  v_rejected:=false;
  begin
    select updated_at into v_stamp from public.companies where id=v_company;
    select version into v_version from public.company_participations where id=v_part;
    perform public.save_company_participation(v_company,v_edition,'{}'::jsonb,
      '[{"area_label":"Área sem correspondência","module_codes":["MODULO-TESTE-INEXISTENTE"],"area_total":"10"}]'::jsonb,v_stamp,v_version,'company-test-copy-0001');
  exception when others then
    if sqlerrm not like '%Confira área e códigos%' then raise exception 'Falha inesperada ao validar correspondência: %',sqlerrm; end if;
    v_rejected:=true; end;
  if not v_rejected then raise exception 'Reaproveitamento aceitou códigos sem correspondência'; end if;
  insert into company_history_test_context values(jsonb_build_object('company_id',v_company,'historical_edition_id',v_report->>'edition_id'));
end $$;
reset role;

-- A proteção de imutabilidade também bloqueia SQL administrativo acidental.
do $$
declare v_company uuid; v_rejected boolean:=false;
begin
  select (data->>'company_id')::uuid into v_company from company_history_test_context;
  begin
    update public.company_participations set registration_snapshot=registration_snapshot||'{"trade_name":"Não deve alterar"}'::jsonb where company_id=v_company and snapshot_locked;
  exception when others then v_rejected:=sqlerrm like '%histórica é imutável%'; end;
  if not v_rejected then raise exception 'Retrato histórico mutável'; end if;
  v_rejected:=false;
  begin
    update public.company_participation_occupations set area_total=999 where participation_id in(select id from public.company_participations where company_id=v_company) and kind='historical';
  exception when others then v_rejected:=sqlerrm like '%históricas são imutáveis%'; end;
  if not v_rejected then raise exception 'Ocupação histórica mutável'; end if;
end $$;

-- Sem vínculo de acesso: RLS esconde grade/ocupações e RPCs rejeitam escrita.
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000025","role":"authenticated"}',true);
set local role authenticated;
do $$
declare v_rejected boolean:=false; v_company uuid;
begin
  select (data->>'company_id')::uuid into v_company from company_history_test_context;
  if exists(select 1 from public.company_exhibitors_v where id=v_company) then raise exception 'RLS vazou empresas'; end if;
  if exists(select 1 from public.company_participation_occupations) then raise exception 'RLS vazou ocupações'; end if;
  if exists(select 1 from public.company_import_rows) then raise exception 'RLS vazou origem administrativa'; end if;
  begin perform public.get_company_participation(v_company,null); exception when others then v_rejected:=sqlerrm like '%Sem permissão%'; end;
  if not v_rejected then raise exception 'RPC de leitura sem permissão'; end if;
  v_rejected:=false;
  begin perform public.save_company_participation(null,null,'{}',null,null,null,'company-test-denied-0001'); exception when others then v_rejected:=sqlerrm like '%Sem permissão%'; end;
  if not v_rejected then raise exception 'RPC de escrita sem permissão'; end if;
  v_rejected:=false;
  begin perform public.apply_company_import(gen_random_uuid(),2025); exception when others then v_rejected:=sqlerrm like '%Somente administradores%'; end;
  if not v_rejected then raise exception 'Importação sem permissão'; end if;
end $$;
reset role;
select 'company_edition_history_regressions_pass' as result;
rollback;
