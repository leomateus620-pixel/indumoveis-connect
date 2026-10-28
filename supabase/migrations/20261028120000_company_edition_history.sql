-- Empresas reutilizáveis, participação por edição e ocupações informativas.
-- A importação nunca escreve em spaces, deals, contracts ou financeiro.
alter table public.editions add column if not exists is_historical boolean not null default false;
alter table public.editions alter column starts_on drop not null;
alter table public.editions alter column ends_on drop not null;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='editions_dates_complete_or_historical') then
    alter table public.editions add constraint editions_dates_complete_or_historical check
      ((is_historical or (starts_on is not null and ends_on is not null)) and
       (starts_on is null or ends_on is null or ends_on >= starts_on));
  end if;
end $$;

alter table public.companies
  add column if not exists tax_id_type text,
  add column if not exists street text,
  add column if not exists address_number text,
  add column if not exists neighborhood text,
  add column if not exists postal_code text,
  add column if not exists address_complement text;
alter table public.company_participations
  add column if not exists registration_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists snapshot_locked boolean not null default false,
  add column if not exists version integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();

-- A identificação só repõe zeros quando existe uma única alternativa com DV válido.
create or replace function public.company_document_info(p_raw text)
returns jsonb language plpgsql immutable set search_path=public as $$
declare d text:=regexp_replace(coalesce(p_raw,''),'[^0-9]','','g'); candidate text; candidates text[]:=array[]::text[];
  types text[]:=array[]::text[]; size integer; n integer; s integer; digit integer; i integer; w integer; valid boolean;
begin
  if nullif(trim(p_raw),'') is not null and p_raw !~ '^[0-9./[:space:]-]+$' then
    return jsonb_build_object('identity',null,'normalized',null,'type','unknown','status','invalid_characters');
  end if;
  if d='' then return jsonb_build_object('identity',null,'normalized',null,'type',null,'status','missing'); end if;
  foreach size in array array[11,14] loop
    if length(d)>size then continue; end if;
    candidate:=lpad(d,size,'0');
    if candidate = repeat(substr(candidate,1,1),size) then continue; end if;
    valid:=true;
    for n in size-2..size-1 loop
      s:=0;
      for i in 1..n loop
        if size=11 then w:=n+2-i; else w:=mod(n-i,8)+2; end if;
        s:=s+substr(candidate,i,1)::integer*w;
      end loop;
      digit:=11-mod(s,11); if digit>=10 then digit:=0; end if;
      if digit<>substr(candidate,n+1,1)::integer then valid:=false; exit; end if;
    end loop;
    if valid then candidates:=array_append(candidates,candidate); types:=array_append(types,case when size=11 then 'cpf' else 'cnpj' end); end if;
  end loop;
  if cardinality(candidates)=1 then
    return jsonb_build_object('identity',candidates[1],'normalized',candidates[1],'type',types[1],
      'status',case when candidates[1]=d then 'valid' else 'restored_leading_zero' end);
  end if;
  return jsonb_build_object('identity',d,'normalized',null,'type','unknown',
    'status',case when cardinality(candidates)>1 then 'ambiguous' else 'invalid' end);
end $$;

create or replace function public.company_registration_snapshot(p_company_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('legal_name',c.legal_name,'trade_name',c.trade_name,'tax_id',c.tax_id,
    'tax_id_type',c.tax_id_type,'email',c.email,'phone',c.phone,'city',c.city,'state',c.state,
    'street',c.street,'address_number',c.address_number,'neighborhood',c.neighborhood,
    'postal_code',c.postal_code,'address_complement',c.address_complement,
    'representative_name',(select name from public.contacts where company_id=c.id and is_primary order by created_at,id limit 1),
    'contacts',coalesce((select jsonb_agg(jsonb_build_object('name',name,'role',role,'email',email,'phone',phone,'is_primary',is_primary) order by is_primary desc,created_at,id) from public.contacts where company_id=c.id),'[]'::jsonb))
  from public.companies c where c.id=p_company_id
$$;
update public.company_participations set registration_snapshot=public.company_registration_snapshot(company_id)
where registration_snapshot='{}'::jsonb;

create or replace function public.guard_company_participation_snapshot()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if TG_OP='UPDATE' then
    if OLD.snapshot_locked and (NEW.registration_snapshot is distinct from OLD.registration_snapshot or
        NEW.company_id<>OLD.company_id or NEW.edition_id<>OLD.edition_id or not NEW.snapshot_locked) then
      raise exception 'O retrato de uma participação histórica é imutável.';
    end if;
    NEW.version:=OLD.version+1; NEW.updated_at:=clock_timestamp();
  end if;
  if NEW.registration_snapshot='{}'::jsonb then NEW.registration_snapshot:=public.company_registration_snapshot(NEW.company_id); end if;
  if exists(select 1 from public.editions where id=NEW.edition_id and is_historical) then NEW.snapshot_locked:=true; end if;
  return NEW;
end $$;
drop trigger if exists company_participation_snapshot_guard on public.company_participations;
create trigger company_participation_snapshot_guard before insert or update on public.company_participations
for each row execute function public.guard_company_participation_snapshot();

create table if not exists public.company_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_sha256 text not null unique check(file_sha256 ~ '^[a-f0-9]{64}$'),
  source_name text not null,
  payload_fingerprint text not null,
  edition_id uuid references public.editions(id),
  status text not null default 'prepared' check(status in ('prepared','applied','needs_review')),
  source_row_count integer not null,
  reconciliation jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
create table if not exists public.company_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.company_import_batches(id),
  source_row integer not null,
  source_values jsonb not null,
  source_document_raw text,
  prepared_data jsonb not null,
  issues jsonb not null default '[]'::jsonb,
  conflicts jsonb not null default '[]'::jsonb,
  status text not null default 'prepared' check(status in ('prepared','applied','blocked')),
  company_id uuid references public.companies(id),
  participation_id uuid references public.company_participations(id),
  failure text,
  unique(batch_id,source_row)
);
create table if not exists public.company_participation_occupations (
  id uuid primary key default gen_random_uuid(),
  participation_id uuid not null references public.company_participations(id) on delete cascade,
  edition_id uuid not null references public.editions(id),
  area_label text not null check(length(trim(area_label))>0),
  module_codes text[] not null default array[]::text[],
  module_count integer generated always as (cardinality(module_codes)) stored,
  area_total numeric(14,4) not null check(area_total>=0 and area_total<>'NaN'::numeric),
  kind text not null check(kind in ('historical','declared')),
  source_import_row_id uuid unique references public.company_import_rows(id),
  source_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(array_position(module_codes,null) is null),
  check(array_position(module_codes,'') is null)
);
create index if not exists company_occupations_participation_idx on public.company_participation_occupations(participation_id);
create index if not exists company_occupations_edition_idx on public.company_participation_occupations(edition_id);
create index if not exists company_participations_edition_idx on public.company_participations(edition_id);
create index if not exists companies_document_identity_idx on public.companies((public.company_document_info(tax_id)->>'identity'));

create or replace function public.guard_company_occupation()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_edition uuid; v_historical boolean;
begin
  if TG_OP<>'INSERT' and OLD.kind='historical' then raise exception 'Ocupações históricas são imutáveis.'; end if;
  if TG_OP='DELETE' then return OLD; end if;
  select p.edition_id,e.is_historical into v_edition,v_historical from public.company_participations p
    join public.editions e on e.id=p.edition_id where p.id=NEW.participation_id;
  if v_edition is null or NEW.edition_id<>v_edition then raise exception 'A ocupação pertence a outra edição.'; end if;
  if (NEW.kind='historical') is distinct from v_historical then raise exception 'Tipo de ocupação incompatível com a edição.'; end if;
  NEW.updated_at:=clock_timestamp(); return NEW;
end $$;
drop trigger if exists company_occupation_guard on public.company_participation_occupations;
create trigger company_occupation_guard before insert or update or delete on public.company_participation_occupations
for each row execute function public.guard_company_occupation();

create table if not exists public.company_save_requests (
  idempotency_key text primary key,
  actor uuid not null,
  fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

-- Somente RPCs escrevem a operação composta. save_deal continua SECURITY DEFINER.
revoke insert,update,delete on public.companies,public.company_participations from authenticated;
do $$ declare t text; begin
  foreach t in array array['company_participation_occupations','company_import_batches','company_import_rows','company_save_requests'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
grant select(id,participation_id,edition_id,area_label,module_codes,module_count,area_total,kind,created_at,updated_at)
  on public.company_participation_occupations to authenticated;
grant select on public.company_import_batches,public.company_import_rows to authenticated;
drop policy if exists "read company occupations" on public.company_participation_occupations;
create policy "read company occupations" on public.company_participation_occupations for select to authenticated using(public.can_read('empresas'));
drop policy if exists "admin company import batches" on public.company_import_batches;
create policy "admin company import batches" on public.company_import_batches for select to authenticated using(public.has_role(auth.uid(),'admin'));
drop policy if exists "admin company import rows" on public.company_import_rows;
create policy "admin company import rows" on public.company_import_rows for select to authenticated using(public.has_role(auth.uid(),'admin'));

create or replace view public.company_exhibitors_v with(security_invoker=true) as
select c.id,p.id as participation_id,p.edition_id,p.status,p.snapshot_locked,p.version,
  case when p.snapshot_locked then p.registration_snapshot->>'trade_name' else c.trade_name end as trade_name,
  case when p.snapshot_locked then p.registration_snapshot->>'legal_name' else c.legal_name end as legal_name,
  case when p.snapshot_locked then p.registration_snapshot->>'tax_id' else c.tax_id end as tax_id,
  case when p.snapshot_locked then p.registration_snapshot->>'city' else c.city end as city,
  case when p.snapshot_locked then p.registration_snapshot->>'state' else c.state end as state,
  coalesce(a.area_labels,array[]::text[]) as area_labels,coalesce(o.occupation_count,0) as occupation_count,
  coalesce(o.total_area,0::numeric) as total_area,coalesce(o.module_count,0) as module_count
from public.company_participations p join public.companies c on c.id=p.company_id
left join lateral (select count(*)::integer as occupation_count,sum(area_total) as total_area,sum(module_count)::integer as module_count
  from public.company_participation_occupations where participation_id=p.id) o on true
left join lateral (select array_agg(distinct label order by label) as area_labels from (
    select area_label as label from public.company_participation_occupations where participation_id=p.id
    union
    select s.sector from public.deals d join public.deal_spaces ds on ds.deal_id=d.id
      join public.spaces s on s.id=ds.space_id and s.edition_id=p.edition_id
      where d.company_id=c.id and d.edition_id=p.edition_id and d.status not in ('perdida','cancelada')
        and nullif(trim(s.sector),'') is not null
  ) labels) a on true;
revoke all on public.company_exhibitors_v from anon,authenticated;
grant select on public.company_exhibitors_v to authenticated;

create or replace function public.get_company_participation(p_company_id uuid,p_edition_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare c public.companies; p public.company_participations;
begin
  if not public.can_read('empresas') then raise exception 'Sem permissão para consultar empresas.'; end if;
  select * into c from public.companies where id=p_company_id;
  if c.id is null then return null; end if;
  select * into p from public.company_participations where company_id=c.id and edition_id=p_edition_id;
  return jsonb_build_object('company',to_jsonb(c),'participation',case when p.id is null then null else to_jsonb(p) end,
    'occupations',coalesce((select jsonb_agg(to_jsonb(o)-'source_import_row_id'-'source_snapshot' order by o.created_at,o.id)
      from public.company_participation_occupations o where participation_id=p.id),'[]'::jsonb),
    'contacts',coalesce((select jsonb_agg(to_jsonb(ct) order by is_primary desc,created_at,id) from public.contacts ct where company_id=c.id),'[]'::jsonb));
end $$;

create or replace function public.save_company_participation(
  p_company_id uuid,p_edition_id uuid,p_company jsonb,p_occupations jsonb,
  p_expected_company_updated_at timestamptz,p_expected_participation_version integer,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.companies; p public.company_participations; e public.editions; v_info jsonb; v_doc text;
  v_id uuid; v_count integer; v_entry jsonb; v_codes text[]; v_key text; v_representative text;
  v_existing public.company_save_requests; v_fingerprint text; v_result jsonb;
begin
  if not public.can_write('empresas') then raise exception 'Sem permissão para alterar empresas.'; end if;
  if p_idempotency_key is null or length(p_idempotency_key)<8 then raise exception 'Chave de operação obrigatória.'; end if;
  v_fingerprint:=md5(jsonb_build_array(p_company_id,p_edition_id,p_company,p_occupations,p_expected_company_updated_at,p_expected_participation_version)::text);
  perform pg_advisory_xact_lock(hashtextextended('company-save:'||p_idempotency_key,0));
  select * into v_existing from public.company_save_requests where idempotency_key=p_idempotency_key;
  if v_existing.idempotency_key is not null then
    if v_existing.actor<>auth.uid() or v_existing.fingerprint<>v_fingerprint then raise exception 'Chave de operação reutilizada com dados diferentes.'; end if;
    return v_existing.result;
  end if;
  if jsonb_typeof(p_company)<>'object' then raise exception 'Dados da empresa inválidos.'; end if;
  select * into e from public.editions where id=p_edition_id;
  if e.id is null then raise exception 'Edição não encontrada.'; end if;
  if p_company_id is not null then
    select * into c from public.companies where id=p_company_id for update;
    if c.id is null then raise exception 'Empresa não encontrada.'; end if;
    if p_expected_company_updated_at is null or c.updated_at<>p_expected_company_updated_at then raise exception 'A empresa foi alterada por outra pessoa. Recarregue antes de salvar.'; end if;
  end if;
  if p_company_id is null or p_company ? 'tax_id' then
    v_info:=public.company_document_info(p_company->>'tax_id'); v_doc:=v_info->>'identity';
  else v_info:=public.company_document_info(c.tax_id); v_doc:=v_info->>'identity'; end if;
  if (v_info->>'status')='invalid_characters' then raise exception 'Documento contém caracteres inválidos.'; end if;
  if v_doc is not null and (v_info->>'normalized') is null and
    (p_company_id is null or (public.company_document_info(c.tax_id)->>'identity') is distinct from v_doc) then
    raise exception 'Informe um CPF ou CNPJ com dígitos verificadores válidos.';
  end if;
  if v_doc is not null then
    perform pg_advisory_xact_lock(hashtextextended('company-document:'||v_doc,0));
    select count(*),min(id::text)::uuid into v_count,v_id from public.companies
      where public.company_document_info(tax_id)->>'identity'=v_doc and (p_company_id is null or id<>p_company_id);
    if v_count>0 then raise exception 'Já existe uma empresa com este documento. Reutilize o cadastro existente.' using errcode='23505'; end if;
  end if;
  -- jsonb_populate_record respeita atualizações parciais; somente campos permitidos são projetados.
  c:=jsonb_populate_record(c,p_company - array['id','created_at','created_by','updated_at','is_demo','tax_id_type']);
  c.legal_name:=nullif(trim(c.legal_name),''); c.trade_name:=nullif(trim(c.trade_name),'');
  if c.legal_name is null or length(c.legal_name)<2 or length(c.legal_name)>200 then raise exception 'Informe uma razão social válida (2 a 200 caracteres).'; end if;
  if c.trade_name is null or length(c.trade_name)>120 then raise exception 'Informe um nome fantasia válido (até 120 caracteres).'; end if;
  if c.state is not null and trim(c.state)<>'' and c.state !~ '^[A-Za-z]{2}$' then raise exception 'UF inválida.'; end if;
  if c.email is not null and trim(c.email)<>'' and c.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'E-mail inválido.'; end if;
  if c.postal_code is not null and trim(c.postal_code)<>'' and regexp_replace(c.postal_code,'[^0-9]','','g') !~ '^[0-9]{8}$' then raise exception 'CEP inválido.'; end if;
  c.tax_id:=v_doc; c.tax_id_type:=v_info->>'type';
  if p_company_id is null then
    insert into public.companies(legal_name,trade_name,tax_id,tax_id_type,email,phone,website,city,state,segment,notes,
      street,address_number,neighborhood,postal_code,address_complement,created_by)
    values(c.legal_name,c.trade_name,c.tax_id,c.tax_id_type,nullif(trim(c.email),''),nullif(trim(c.phone),''),nullif(trim(c.website),''),nullif(trim(c.city),''),nullif(upper(trim(c.state)),''),nullif(trim(c.segment),''),nullif(trim(c.notes),''),
      nullif(trim(c.street),''),nullif(trim(c.address_number),''),nullif(trim(c.neighborhood),''),nullif(trim(c.postal_code),''),nullif(trim(c.address_complement),''),auth.uid()) returning * into c;
  else
    update public.companies set legal_name=c.legal_name,trade_name=c.trade_name,tax_id=c.tax_id,tax_id_type=c.tax_id_type,
      email=nullif(trim(c.email),''),phone=nullif(trim(c.phone),''),website=nullif(trim(c.website),''),city=nullif(trim(c.city),''),state=nullif(upper(trim(c.state)),''),segment=nullif(trim(c.segment),''),notes=nullif(trim(c.notes),''),
      street=nullif(trim(c.street),''),address_number=nullif(trim(c.address_number),''),neighborhood=nullif(trim(c.neighborhood),''),postal_code=nullif(trim(c.postal_code),''),address_complement=nullif(trim(c.address_complement),'')
      where id=p_company_id returning * into c;
  end if;
  if p_company ? 'representative_name' then
    v_representative:=nullif(trim(p_company->>'representative_name'),'');
    select id into v_id from public.contacts where company_id=c.id and is_primary order by created_at,id limit 1 for update;
    if v_representative is null and v_id is not null then raise exception 'Para remover o representante, remova o contato na ficha da empresa.'; end if;
    if v_representative is not null then
      if v_id is null then insert into public.contacts(company_id,name,role,is_primary) values(c.id,v_representative,'Representante',true);
      else update public.contacts set name=v_representative where id=v_id; end if;
    end if;
  end if;
  select * into p from public.company_participations where company_id=c.id and edition_id=e.id for update;
  if p.id is not null then
    if p_expected_participation_version is null or p.version<>p_expected_participation_version then raise exception 'A participação já existe ou foi alterada. Abra o registro atualizado.'; end if;
    if p.snapshot_locked and p_occupations is not null then raise exception 'As ocupações históricas são somente leitura.'; end if;
    if not p.snapshot_locked then update public.company_participations set registration_snapshot=public.company_registration_snapshot(c.id) where id=p.id returning * into p; end if;
  else
    if p_expected_participation_version is not null then raise exception 'A participação não existe mais. Recarregue antes de salvar.'; end if;
    insert into public.company_participations(company_id,edition_id,status,registration_snapshot,snapshot_locked)
    values(c.id,e.id,case when e.is_historical then 'historico' else 'cadastrado' end,public.company_registration_snapshot(c.id),e.is_historical) returning * into p;
  end if;
  if p_occupations is not null then
    if jsonb_typeof(p_occupations)<>'array' or jsonb_array_length(p_occupations)>100 then raise exception 'Lista de ocupações inválida.'; end if;
    delete from public.company_participation_occupations where participation_id=p.id and kind='declared';
    for v_entry in select value from jsonb_array_elements(p_occupations) loop
      if jsonb_typeof(v_entry->'module_codes')<>'array' then raise exception 'Informe os códigos de módulos em uma lista.'; end if;
      select coalesce(array_agg(trim(value)),array[]::text[]) into v_codes from jsonb_array_elements_text(v_entry->'module_codes');
      if not e.is_historical then
        if exists(select 1 from unnest(v_codes) as requested(module_code) left join public.spaces s on s.edition_id=e.id and s.code=requested.module_code
          where s.id is null or (nullif(trim(s.sector),'') is not null and s.sector<>trim(v_entry->>'area_label'))) then
          raise exception 'Confira área e códigos na estrutura da edição selecionada.';
        end if;
      end if;
      insert into public.company_participation_occupations(participation_id,edition_id,area_label,module_codes,area_total,kind)
      values(p.id,e.id,trim(v_entry->>'area_label'),v_codes,(v_entry->>'area_total')::numeric,case when e.is_historical then 'historical' else 'declared' end);
    end loop;
  end if;
  v_result:=jsonb_build_object('id',c.id,'company_id',c.id,'participation_id',p.id,'version',p.version);
  insert into public.company_save_requests(idempotency_key,actor,fingerprint,result) values(p_idempotency_key,auth.uid(),v_fingerprint,v_result);
  return v_result;
end $$;

create or replace function public.stage_company_import(p_file_sha256 text,p_source_name text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.company_import_batches; r jsonb; v_fingerprint text; v_row integer;
begin
  if not (public.has_role(auth.uid(),'admin') or coalesce(auth.role()='service_role',false) or
    (auth.uid() is null and session_user in ('postgres','supabase_admin'))) then raise exception 'Somente administradores podem importar o histórico.'; end if;
  if p_file_sha256 !~ '^[a-f0-9]{64}$' or nullif(trim(p_source_name),'') is null or
     jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'Lote de importação inválido.'; end if;
  v_fingerprint:=md5(p_rows::text);
  perform pg_advisory_xact_lock(hashtextextended('company-import:'||p_file_sha256,0));
  select * into b from public.company_import_batches where file_sha256=p_file_sha256 for update;
  if b.id is not null then
    if b.payload_fingerprint<>v_fingerprint then raise exception 'O mesmo arquivo já foi preparado com conteúdo diferente.'; end if;
    return jsonb_build_object('batch_id',b.id,'source_row_count',b.source_row_count,'status',b.status,'reused',true);
  end if;
  insert into public.company_import_batches(file_sha256,source_name,payload_fingerprint,source_row_count,created_by)
  values(p_file_sha256,p_source_name,v_fingerprint,jsonb_array_length(p_rows),auth.uid()) returning * into b;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_row:=(r->>'source_row')::integer;
    if v_row is null then raise exception 'Toda linha deve possuir seu número original.'; end if;
    insert into public.company_import_rows(batch_id,source_row,source_values,source_document_raw,prepared_data,issues)
    values(b.id,v_row,coalesce(r->'source_values','{}'::jsonb),r->>'source_document_raw',r,coalesce(r->'issues','[]'::jsonb));
  end loop;
  return jsonb_build_object('batch_id',b.id,'source_row_count',b.source_row_count,'status',b.status,'reused',false);
end $$;

create or replace function public.company_import_reconciliation(p_batch_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not (public.has_role(auth.uid(),'admin') or coalesce(auth.role()='service_role',false) or
    (auth.uid() is null and session_user in ('postgres','supabase_admin'))) then raise exception 'Sem permissão para consultar a conciliação.'; end if;
  select jsonb_build_object('batch_id',b.id,'file_sha256',b.file_sha256,'status',b.status,'edition_id',b.edition_id,
    'source_rows',b.source_row_count,
    'staged_rows',(select count(*) from public.company_import_rows where batch_id=b.id),
    'applied_rows',(select count(*) from public.company_import_rows where batch_id=b.id and status='applied'),
    'blocked_rows',(select count(*) from public.company_import_rows where batch_id=b.id and status='blocked'),
    'source_documents',(select count(distinct source_document_raw) from public.company_import_rows where batch_id=b.id),
    'normalized_documents',(select count(distinct public.company_document_info(source_document_raw)->>'identity') from public.company_import_rows where batch_id=b.id),
    'companies',(select count(distinct company_id) from public.company_import_rows where batch_id=b.id and status='applied'),
    'participations',(select count(distinct participation_id) from public.company_import_rows where batch_id=b.id and status='applied'),
    'occupations',(select count(*) from public.company_participation_occupations o join public.company_import_rows r on r.id=o.source_import_row_id where r.batch_id=b.id),
    'module_identifiers',(select coalesce(sum(o.module_count),0) from public.company_participation_occupations o join public.company_import_rows r on r.id=o.source_import_row_id where r.batch_id=b.id),
    'area_total',(select coalesce(sum(o.area_total),0) from public.company_participation_occupations o join public.company_import_rows r on r.id=o.source_import_row_id where r.batch_id=b.id),
    'rows_with_conflicts',(select count(*) from public.company_import_rows where batch_id=b.id and conflicts<>'[]'::jsonb),
    'missing_representative',(select count(*) from public.company_import_rows where batch_id=b.id and nullif(trim(prepared_data->'snapshot'->>'representative_name'),'') is null),
    'missing_phone',(select count(*) from public.company_import_rows where batch_id=b.id and nullif(trim(prepared_data->'snapshot'->>'phone'),'') is null),
    'missing_email',(select count(*) from public.company_import_rows where batch_id=b.id and nullif(trim(prepared_data->'snapshot'->>'email'),'') is null))
  into result from public.company_import_batches b where b.id=p_batch_id;
  if result is null then raise exception 'Lote não encontrado.'; end if;
  return result;
end $$;

create or replace function public.apply_company_import(p_batch_id uuid,p_edition_year integer default 2025)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.company_import_batches; r public.company_import_rows; e public.editions; c public.companies; p public.company_participations;
  v_info jsonb; v_snapshot jsonb; v_occupation jsonb; v_codes text[]; v_conflicts jsonb; v_key text; v_value text;
  v_doc text; v_count integer; v_id uuid; v_error text; v_report jsonb;
begin
  if not (public.has_role(auth.uid(),'admin') or coalesce(auth.role()='service_role',false) or
    (auth.uid() is null and session_user in ('postgres','supabase_admin'))) then raise exception 'Somente administradores podem importar o histórico.'; end if;
  if p_edition_year is null or p_edition_year<>2025 then raise exception 'Este importador é exclusivo do histórico de 2025.'; end if;
  select * into b from public.company_import_batches where id=p_batch_id for update;
  if b.id is null then raise exception 'Prepare o lote antes de aplicá-lo.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('company-import-edition:'||p_edition_year::text,0));
  select count(*) into v_count from public.editions where year=p_edition_year;
  if v_count>1 then raise exception 'Mais de uma edição possui esse ano. Concilie a edição antes de importar.'; end if;
  select * into e from public.editions where year=p_edition_year for update;
  if e.is_active then raise exception 'Uma edição ativa não pode receber importação histórica.'; end if;
  if e.id is null then
    insert into public.editions(name,year,starts_on,ends_on,is_active,is_historical)
    values('Indumóveis '||p_edition_year::text,p_edition_year,null,null,false,true) returning * into e;
  elsif not e.is_historical then
    update public.editions set is_historical=true where id=e.id returning * into e;
  end if;
  if b.edition_id is not null and b.edition_id<>e.id then raise exception 'O lote já está vinculado a outra edição.'; end if;
  update public.company_import_batches set edition_id=e.id where id=b.id;
  for r in select * from public.company_import_rows where batch_id=b.id and status<>'applied' order by source_row for update loop
    -- Cada linha é atômica. Falhas ficam preservadas na preparação para revisão.
    begin
      c:=null; p:=null; v_conflicts:='[]'::jsonb;
      v_snapshot:=r.prepared_data->'snapshot'; v_occupation:=r.prepared_data->'occupation';
      if jsonb_typeof(v_snapshot)<>'object' or jsonb_typeof(v_occupation)<>'object' then raise exception 'Retrato ou ocupação inválidos.'; end if;
      if nullif(trim(v_snapshot->>'legal_name'),'') is null or nullif(trim(v_snapshot->>'trade_name'),'') is null then raise exception 'Razão social e nome fantasia são obrigatórios.'; end if;
      v_info:=public.company_document_info(r.source_document_raw); v_doc:=v_info->>'identity';
      if v_doc is null then raise exception 'Documento ausente: conciliação manual necessária.'; end if;
      if nullif(r.prepared_data->>'document_normalized','') is not null and
        (v_info->>'normalized') is distinct from (r.prepared_data->>'document_normalized') then raise exception 'Normalização documental divergente da validação do banco.'; end if;
      if (v_info->>'status') in ('invalid','ambiguous') then
        v_conflicts:=v_conflicts||jsonb_build_array(jsonb_build_object('field','tax_id','reason',v_info->>'status','source',r.source_document_raw));
      end if;
      v_snapshot:=v_snapshot||jsonb_build_object('tax_id',v_doc,'tax_id_type',v_info->>'type');
      if jsonb_typeof(v_occupation->'module_codes')<>'array' then raise exception 'Lista de códigos de módulos inválida.'; end if;
      select coalesce(array_agg(value),array[]::text[]) into v_codes from jsonb_array_elements_text(v_occupation->'module_codes');
      if cardinality(v_codes)=0 then raise exception 'Ocupação sem identificadores de módulos.'; end if;
      perform pg_advisory_xact_lock(hashtextextended('company-document:'||v_doc,0));
      select count(*),min(id::text)::uuid into v_count,v_id from public.companies where public.company_document_info(tax_id)->>'identity'=v_doc;
      if v_count>1 then raise exception 'Documento corresponde a mais de um cadastro existente; revisão necessária.'; end if;
      if v_id is null then
        insert into public.companies(legal_name,trade_name,tax_id,tax_id_type,email,phone,city,state,created_by)
        values(trim(v_snapshot->>'legal_name'),trim(v_snapshot->>'trade_name'),v_doc,v_info->>'type',
          nullif(trim(v_snapshot->>'email'),''),nullif(trim(v_snapshot->>'phone'),''),nullif(trim(v_snapshot->>'city'),''),nullif(trim(v_snapshot->>'state'),''),auth.uid()) returning * into c;
      else
        select * into c from public.companies where id=v_id for update;
        foreach v_key in array array['legal_name','trade_name','email','phone','city','state'] loop
          v_value:=nullif(trim(v_snapshot->>v_key),'');
          if v_value is not null and nullif(trim(to_jsonb(c)->>v_key),'') is not null and
             lower(trim(to_jsonb(c)->>v_key))<>lower(v_value) then
            v_conflicts:=v_conflicts||jsonb_build_array(jsonb_build_object('field',v_key,'existing',to_jsonb(c)->>v_key,'source',v_value,'resolution','existing_preserved'));
          end if;
        end loop;
        -- Nunca substitui dados correntes preenchidos, nem por valores divergentes.
        update public.companies set
          email=coalesce(nullif(trim(email),''),nullif(trim(v_snapshot->>'email'),'')),
          phone=coalesce(nullif(trim(phone),''),nullif(trim(v_snapshot->>'phone'),'')),
          city=coalesce(nullif(trim(city),''),nullif(trim(v_snapshot->>'city'),'')),
          state=coalesce(nullif(trim(state),''),nullif(trim(v_snapshot->>'state'),'')),
          tax_id_type=coalesce(tax_id_type,v_info->>'type')
        where id=c.id returning * into c;
      end if;
      v_value:=nullif(trim(v_snapshot->>'representative_name'),'');
      if v_value is not null and not exists(select 1 from public.contacts where company_id=c.id and lower(trim(name))=lower(v_value)) then
        insert into public.contacts(company_id,name,role,is_primary) values(c.id,v_value,'Representante',
          not exists(select 1 from public.contacts where company_id=c.id and is_primary));
      end if;
      select * into p from public.company_participations where company_id=c.id and edition_id=e.id for update;
      if p.id is null then
        insert into public.company_participations(company_id,edition_id,status,registration_snapshot,snapshot_locked)
        values(c.id,e.id,'historico',v_snapshot,true) returning * into p;
      else
        foreach v_key in array array['legal_name','trade_name','tax_id','email','phone','city','state','representative_name'] loop
          if (p.registration_snapshot->>v_key) is distinct from (v_snapshot->>v_key) then
            v_conflicts:=v_conflicts||jsonb_build_array(jsonb_build_object('field','snapshot.'||v_key,'existing',p.registration_snapshot->>v_key,'source',v_snapshot->>v_key,'resolution','participation_preserved_row_snapshot_retained'));
          end if;
        end loop;
        if not p.snapshot_locked then update public.company_participations set snapshot_locked=true where id=p.id returning * into p; end if;
      end if;
      insert into public.company_participation_occupations(participation_id,edition_id,area_label,module_codes,area_total,kind,source_import_row_id,source_snapshot)
      values(p.id,e.id,trim(v_occupation->>'area_label'),v_codes,(v_occupation->>'area_total')::numeric,'historical',r.id,v_snapshot);
      update public.company_import_rows set status='applied',company_id=c.id,participation_id=p.id,conflicts=v_conflicts,failure=null where id=r.id;
    exception when others then
      get stacked diagnostics v_error=message_text;
      update public.company_import_rows set status='blocked',failure=v_error where id=r.id;
    end;
  end loop;
  update public.company_import_batches set status=case when exists(select 1 from public.company_import_rows where batch_id=b.id and status<>'applied')
      or exists(select 1 from public.company_import_rows where batch_id=b.id and conflicts<>'[]'::jsonb) then 'needs_review' else 'applied' end,
    applied_at=now() where id=b.id;
  v_report:=public.company_import_reconciliation(b.id);
  update public.company_import_batches set reconciliation=v_report where id=b.id;
  return v_report;
end $$;

-- Nenhuma função auxiliar herda EXECUTE para anônimos.
revoke all on function public.company_document_info(text),public.company_registration_snapshot(uuid),
  public.guard_company_participation_snapshot(),public.guard_company_occupation(),
  public.get_company_participation(uuid,uuid),public.save_company_participation(uuid,uuid,jsonb,jsonb,timestamptz,integer,text),
  public.stage_company_import(text,text,jsonb),public.apply_company_import(uuid,integer),public.company_import_reconciliation(uuid)
from public,anon,authenticated;
grant execute on function public.get_company_participation(uuid,uuid),
  public.save_company_participation(uuid,uuid,jsonb,jsonb,timestamptz,integer,text),
  public.stage_company_import(text,text,jsonb),public.apply_company_import(uuid,integer),public.company_import_reconciliation(uuid)
to authenticated,service_role;
grant execute on function public.company_document_info(text) to authenticated,service_role;
