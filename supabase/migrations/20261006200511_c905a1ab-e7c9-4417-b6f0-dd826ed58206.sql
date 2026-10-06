-- ===== Schema =====
alter table public.documents
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists status text not null default 'ativo',
  add column if not exists is_current boolean not null default true,
  add column if not exists root_id uuid references public.documents(id),
  add column if not exists idempotency_key text;
update public.documents set root_id = id where root_id is null and previous_id is null;
alter table public.documents add constraint documents_status_chk check (status in ('pendente','ativo'));
create unique index if not exists documents_root_version_uq on public.documents(root_id, version);
create unique index if not exists documents_idem_uq on public.documents(uploaded_by, idempotency_key) where idempotency_key is not null;
create unique index if not exists documents_path_uq on public.documents(storage_path);
create index if not exists documents_current_idx on public.documents(is_current, status, edition_id);
create index if not exists document_links_entity_idx on public.document_links(entity_type, entity_id);
create trigger t_documents before update on public.documents for each row execute function public.touch_updated_at();

-- ===== Helpers =====
create or replace function public.doc_entity_module(_type text) returns text
language sql immutable set search_path = public as $$
  select case _type when 'company' then 'empresas' when 'deal' then 'comercial' when 'contract' then 'contratos'
    when 'inspection' then 'vistorias' when 'space' then 'mapa' when 'installment' then 'financeiro'
    when 'activity' then 'agenda' else null end
$$;

create or replace function public.can_read_document(_doc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_read('documentos') and exists (
    select 1 from public.documents d where d.id = _doc
      and (d.status = 'ativo' or d.uploaded_by = auth.uid())
      and not exists (select 1 from public.document_links l where l.document_id = coalesce(d.root_id, d.id)
                      and not public.can_read(public.doc_entity_module(l.entity_type))))
$$;

create or replace function public.can_read_document_object(_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.documents d where d.storage_path = _path and public.can_read_document(d.id))
      or (public.can_read('mapa') and exists (select 1 from public.floor_plans f where f.storage_path = _path))
$$;

create or replace function public.validate_doc_entity(_type text, _id uuid, _edition uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_ed uuid; v_found boolean := true;
begin
  if public.doc_entity_module(_type) is null then raise exception 'Tipo de vínculo inválido'; end if;
  if not public.can_read(public.doc_entity_module(_type)) then raise exception 'Sem acesso ao registro vinculado'; end if;
  case _type
    when 'company' then select exists(select 1 from companies where id=_id) into v_found;
    when 'deal' then select edition_id into v_ed from deals where id=_id; v_found := found;
    when 'contract' then select edition_id into v_ed from contracts where id=_id; v_found := found;
    when 'inspection' then select edition_id into v_ed from inspections where id=_id; v_found := found;
    when 'space' then select edition_id into v_ed from spaces where id=_id; v_found := found;
    when 'installment' then select edition_id into v_ed from installments where id=_id; v_found := found;
    when 'activity' then select edition_id into v_ed from activities where id=_id; v_found := found;
  end case;
  if not v_found then raise exception 'Registro vinculado não encontrado'; end if;
  if _edition is not null and v_ed is not null and v_ed <> _edition then raise exception 'O registro vinculado é de outra edição'; end if;
end $$;

create or replace function public.doc_entity_label(_type text, _id uuid) returns text
language sql stable set search_path = public as $$
  select case _type
    when 'company' then (select trade_name from companies where id=_id)
    when 'deal' then (select 'Negociação · ' || c.trade_name from deals d join companies c on c.id=d.company_id where d.id=_id)
    when 'contract' then (select 'Contrato ' || coalesce(number,'s/n') from contracts where id=_id)
    when 'inspection' then (select 'Vistoria · ' || s.code from inspections i join spaces s on s.id=i.space_id where i.id=_id)
    when 'space' then (select 'Espaço ' || code from spaces where id=_id)
    when 'installment' then (select 'Parcela ' || i.number || coalesce(' · contrato ' || c.number,'') from installments i join contracts c on c.id=i.contract_id where i.id=_id)
    when 'activity' then (select title from activities where id=_id)
  end
$$;

create or replace function public.doc_validate_file(_name text, _size bigint) returns void
language plpgsql immutable set search_path = public as $$
begin
  if coalesce(trim(_name),'') = '' then raise exception 'Arquivo sem nome'; end if;
  if _size is null or _size <= 0 then raise exception 'Arquivo vazio'; end if;
  if _size > 26214400 then raise exception 'Arquivo acima de 25 MB'; end if;
  if lower(substring(_name from '\.([^.]+)$')) is null or lower(substring(_name from '\.([^.]+)$')) not in
     ('pdf','jpg','jpeg','png','webp','docx','xlsx','pptx','dwg','zip','txt','csv') then
    raise exception 'Formato não permitido. Aceitos: PDF, JPG, PNG, WEBP, DOCX, XLSX, PPTX, DWG, ZIP, TXT, CSV';
  end if;
end $$;

create or replace function public.doc_safe_path(_edition uuid, _id uuid, _name text) returns text
language sql immutable set search_path = public as $$
  select coalesce(_edition::text,'geral') || '/' || _id::text || '/' ||
    left(regexp_replace(_name, '[^A-Za-z0-9._-]+', '_', 'g'), 120)
$$;

-- ===== Write operations =====
create or replace function public.begin_document_upload(p_edition_id uuid, p_name text, p_title text, p_description text,
  p_category text, p_mime text, p_size bigint, p_links jsonb, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_existing record; l jsonb; v_ok boolean;
begin
  if p_idempotency_key is not null then
    select * into v_existing from documents where uploaded_by = auth.uid() and idempotency_key = p_idempotency_key;
    if v_existing.id is not null then return jsonb_build_object('id', v_existing.id, 'storage_path', v_existing.storage_path, 'status', v_existing.status); end if;
  end if;
  perform public.doc_validate_file(p_name, p_size);
  if coalesce(trim(p_category),'') = '' then raise exception 'Informe a categoria'; end if;
  if p_edition_id is not null and not exists (select 1 from editions where id = p_edition_id) then raise exception 'Edição não encontrada'; end if;
  if not public.can_read('documentos') then raise exception 'Sem permissão para Documentos'; end if;
  v_ok := public.can_write('documentos') or (p_category = 'planta' and public.can_write('mapa'));
  for l in select * from jsonb_array_elements(coalesce(p_links,'[]'::jsonb)) loop
    perform public.validate_doc_entity(l->>'type', (l->>'id')::uuid, p_edition_id);
    if public.can_write(public.doc_entity_module(l->>'type')) then v_ok := true; end if;
  end loop;
  if not v_ok then raise exception 'Sem permissão para enviar este documento'; end if;
  insert into documents(id, root_id, edition_id, name, title, description, category, storage_path, mime_type, size_bytes,
    version, uploaded_by, status, is_current, idempotency_key)
  values (v_id, v_id, p_edition_id, p_name, nullif(trim(coalesce(p_title,'')),''), nullif(trim(coalesce(p_description,'')),''),
    p_category, public.doc_safe_path(p_edition_id, v_id, p_name), nullif(p_mime,''), p_size, 1, auth.uid(), 'pendente', false, p_idempotency_key);
  insert into document_links(document_id, entity_type, entity_id)
    select v_id, x->>'type', (x->>'id')::uuid from jsonb_array_elements(coalesce(p_links,'[]'::jsonb)) x on conflict do nothing;
  return jsonb_build_object('id', v_id, 'storage_path', public.doc_safe_path(p_edition_id, v_id, p_name), 'status', 'pendente');
end $$;

create or replace function public.begin_document_version(p_root_id uuid, p_expected_version integer, p_name text, p_mime text,
  p_size bigint, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; cur record; v_id uuid := gen_random_uuid(); v_existing record; v_path text;
begin
  if p_idempotency_key is not null then
    select * into v_existing from documents where uploaded_by = auth.uid() and idempotency_key = p_idempotency_key;
    if v_existing.id is not null then return jsonb_build_object('id', v_existing.id, 'storage_path', v_existing.storage_path, 'status', v_existing.status, 'version', v_existing.version); end if;
  end if;
  perform public.doc_validate_file(p_name, p_size);
  select * into r from documents where id = p_root_id and root_id = id for update;
  if r.id is null then raise exception 'Documento não encontrado'; end if;
  if not (public.can_read_document(r.id) and public.can_write('documentos')) then raise exception 'Sem permissão para enviar nova versão'; end if;
  select * into cur from documents where root_id = p_root_id and is_current;
  if cur.version <> p_expected_version then
    raise exception 'Outra pessoa já enviou a versão %. Recarregue o documento antes de enviar.', cur.version;
  end if;
  if exists (select 1 from documents where root_id = p_root_id and status = 'pendente') then
    raise exception 'Já existe um envio de nova versão em andamento para este documento';
  end if;
  v_path := public.doc_safe_path(cur.edition_id, v_id, p_name);
  insert into documents(id, root_id, previous_id, edition_id, name, title, description, category, storage_path, mime_type, size_bytes,
    version, uploaded_by, status, is_current, idempotency_key)
  values (v_id, p_root_id, cur.id, cur.edition_id, p_name, cur.title, cur.description, cur.category, v_path, nullif(p_mime,''), p_size,
    cur.version + 1, auth.uid(), 'pendente', false, p_idempotency_key);
  return jsonb_build_object('id', v_id, 'storage_path', v_path, 'status', 'pendente', 'version', cur.version + 1);
exception when unique_violation then
  raise exception 'Outra pessoa enviou uma versão ao mesmo tempo. Recarregue o documento.';
end $$;

create or replace function public.finalize_document_upload(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, storage as $$
declare d record;
begin
  select * into d from public.documents where id = p_id for update;
  if d.id is null then raise exception 'Envio não encontrado'; end if;
  if d.status = 'ativo' then return jsonb_build_object('id', d.id, 'status', 'ativo'); end if;
  if d.uploaded_by is distinct from auth.uid() then raise exception 'Somente quem iniciou o envio pode concluí-lo'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = d.storage_path) then
    raise exception 'O arquivo ainda não chegou ao armazenamento. Tente enviar novamente.';
  end if;
  perform 1 from public.documents where id = d.root_id for update;
  update public.documents set is_current = false where root_id = d.root_id and is_current and id <> d.id;
  update public.documents set status = 'ativo', is_current = true where id = d.id;
  return jsonb_build_object('id', d.id, 'status', 'ativo');
end $$;

create or replace function public.cancel_document_upload(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select * into d from documents where id = p_id for update;
  if d.id is null then return; end if;
  if d.status <> 'pendente' or d.uploaded_by is distinct from auth.uid() then raise exception 'Somente envios pendentes próprios podem ser cancelados'; end if;
  delete from document_links where document_id = d.id;
  delete from documents where id = d.id;
end $$;

create or replace function public.update_document_meta(p_root_id uuid, p_title text, p_description text, p_category text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from documents where id = p_root_id and root_id = id) then raise exception 'Documento não encontrado'; end if;
  if not (public.can_read_document(p_root_id) and public.can_write('documentos')) then raise exception 'Sem permissão para editar'; end if;
  if coalesce(trim(p_category),'') = '' then raise exception 'Informe a categoria'; end if;
  update documents set title = nullif(trim(coalesce(p_title,'')),''), description = nullif(trim(coalesce(p_description,'')),''),
    category = p_category where root_id = p_root_id;
end $$;

create or replace function public.link_document(p_doc_id uuid, p_type text, p_entity_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select r.* into d from documents x join documents r on r.id = x.root_id where x.id = p_doc_id;
  if d.id is null then raise exception 'Documento não encontrado'; end if;
  if not public.can_read_document(d.id) then raise exception 'Sem acesso ao documento'; end if;
  if not (public.can_write('documentos') or public.can_write(public.doc_entity_module(p_type))) then raise exception 'Sem permissão para vincular'; end if;
  perform public.validate_doc_entity(p_type, p_entity_id, d.edition_id);
  insert into document_links(document_id, entity_type, entity_id) values (d.id, p_type, p_entity_id) on conflict do nothing;
end $$;

create or replace function public.unlink_document(p_doc_id uuid, p_type text, p_entity_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select r.* into d from documents x join documents r on r.id = x.root_id where x.id = p_doc_id;
  if d.id is null then raise exception 'Documento não encontrado'; end if;
  if not public.can_read_document(d.id) then raise exception 'Sem acesso ao documento'; end if;
  if not (public.can_write('documentos') or public.can_write(public.doc_entity_module(p_type))) then raise exception 'Sem permissão para desvincular'; end if;
  delete from document_links where document_id = d.id and entity_type = p_type and entity_id = p_entity_id;
end $$;

-- ===== Search (invoker: RLS applies) =====
create or replace function public.search_documents(p_scope text, p_edition_id uuid, p_q text, p_category text, p_collection text,
  p_link_type text, p_uploader uuid, p_from date, p_to date, p_sort text, p_limit integer, p_offset integer,
  p_entity_type text default null, p_entity_id uuid default null)
returns jsonb language plpgsql stable set search_path = public as $$
declare v_rows jsonb; v_total bigint; v_facets jsonb; q text := nullif(lower(trim(coalesce(p_q,''))),'');
begin
  create temp table if not exists _docs on commit drop as select 1 as x limit 0;
  drop table _docs;
  create temp table _docs on commit drop as
  select d.*, coalesce(d.title, d.name) as display_name,
    coalesce((select jsonb_agg(jsonb_build_object('type', l.entity_type, 'id', l.entity_id, 'label', public.doc_entity_label(l.entity_type, l.entity_id)) order by l.entity_type)
              from document_links l where l.document_id = d.root_id), '[]'::jsonb) as links,
    (select min(created_at) from documents f where f.root_id = d.root_id) as first_created_at
  from documents d
  where d.is_current and d.status = 'ativo'
    and (p_scope = 'all' or (p_scope = 'general' and d.edition_id is null) or (p_scope = 'edition' and d.edition_id = p_edition_id))
    and (p_entity_type is null or exists (select 1 from document_links l where l.document_id = d.root_id and l.entity_type = p_entity_type and l.entity_id = p_entity_id));
  if q is not null then
    delete from _docs t where not (lower(t.display_name) like '%'||q||'%' or lower(t.name) like '%'||q||'%'
      or lower(coalesce(t.description,'')) like '%'||q||'%'
      or exists (select 1 from jsonb_array_elements(t.links) e where lower(coalesce(e->>'label','')) like '%'||q||'%'));
  end if;
  if p_link_type is not null then
    delete from _docs t where not exists (select 1 from jsonb_array_elements(t.links) e where e->>'type' = p_link_type);
  end if;
  if p_uploader is not null then delete from _docs where uploaded_by is distinct from p_uploader; end if;
  if p_from is not null then delete from _docs where created_at < p_from::timestamptz; end if;
  if p_to is not null then delete from _docs where created_at >= (p_to + 1)::timestamptz; end if;
  select jsonb_build_object(
    'all', count(*), 'recent', count(*) filter (where created_at >= now() - interval '30 days'),
    'unlinked', count(*) filter (where jsonb_array_length(links) = 0),
    'categories', coalesce((select jsonb_object_agg(category, n) from (select category, count(*) n from _docs group by category) c), '{}'::jsonb))
  into v_facets from _docs;
  if p_collection = 'recent' then delete from _docs where created_at < now() - interval '30 days';
  elsif p_collection = 'unlinked' then delete from _docs where jsonb_array_length(links) > 0; end if;
  if p_category is not null then delete from _docs where category <> p_category; end if;
  select count(*) into v_total from _docs;
  select coalesce(jsonb_agg(to_jsonb(s) - 'idempotency_key'), '[]'::jsonb) into v_rows from (
    select * from _docs order by
      case when p_sort = 'name' then lower(display_name) end asc,
      case when p_sort = 'category' then category end asc,
      case when coalesce(p_sort,'recent') = 'recent' then created_at end desc,
      created_at desc
    limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0)) s;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'facets', v_facets);
end $$;

-- ===== Policies =====
drop policy if exists "read documents" on public.documents;
drop policy if exists "insert documents" on public.documents;
drop policy if exists "update documents" on public.documents;
drop policy if exists "delete documents" on public.documents;
create policy "read documents" on public.documents for select to authenticated using (public.can_read_document(id));
drop policy if exists "read document_links" on public.document_links;
drop policy if exists "insert document_links" on public.document_links;
drop policy if exists "update document_links" on public.document_links;
drop policy if exists "delete document_links" on public.document_links;
create policy "read document_links" on public.document_links for select to authenticated using (public.can_read_document(document_id));
revoke insert, update, delete on public.documents, public.document_links from authenticated;

drop policy if exists "docs read" on storage.objects;
drop policy if exists "docs insert" on storage.objects;
drop policy if exists "docs delete" on storage.objects;
create policy "docs read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.can_read_document_object(name));
create policy "docs insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and exists (select 1 from public.documents d where d.storage_path = name and d.status = 'pendente' and d.uploaded_by = auth.uid()));
create policy "docs delete pending" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and exists (select 1 from public.documents d where d.storage_path = name and d.status = 'pendente' and d.uploaded_by = auth.uid()));

-- ===== Grants =====
revoke execute on function public.doc_entity_module, public.can_read_document, public.can_read_document_object, public.validate_doc_entity,
  public.doc_entity_label, public.doc_validate_file, public.doc_safe_path, public.begin_document_upload, public.begin_document_version,
  public.finalize_document_upload, public.cancel_document_upload, public.update_document_meta, public.link_document, public.unlink_document,
  public.search_documents from public, anon;
grant execute on function public.doc_entity_module, public.can_read_document, public.can_read_document_object, public.doc_entity_label,
  public.begin_document_upload, public.begin_document_version, public.finalize_document_upload, public.cancel_document_upload,
  public.update_document_meta, public.link_document, public.unlink_document, public.search_documents to authenticated;