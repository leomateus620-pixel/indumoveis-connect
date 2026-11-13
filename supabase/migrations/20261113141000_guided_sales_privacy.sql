begin;

create schema if not exists guided_sales_security;
revoke all on schema guided_sales_security from public,anon;
grant usage on schema guided_sales_security to authenticated;

-- Privacy markers are never returned by PostgREST. These predicates are shared by
-- RLS and privileged legacy RPCs, so a broader module role cannot bypass them.
create or replace function guided_sales_security.entity_is_private(p_kind text,p_id uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if p_id is null then return false; end if;
  case p_kind
    when 'company' then return exists(select from public.guided_sale_private_companies p where p.company_id=p_id);
    when 'participation' then return exists(
      select from public.company_participations p
      where p.id=p_id and (guided_sales_security.entity_is_private('company',p.company_id)
        or exists(select from public.guided_sale_private_participations x where x.participation_id=p.id)));
    when 'deal' then return exists(select from public.guided_sales s where s.deal_id=p_id)
      or exists(select from public.deals d where d.id=p_id and guided_sales_security.entity_is_private('company',d.company_id));
    when 'contract' then return exists(
      select from public.contracts c where c.id=p_id and
        (guided_sales_security.entity_is_private('deal',c.deal_id) or guided_sales_security.entity_is_private('company',c.company_id)));
    when 'installment' then return exists(
      select from public.installments i where i.id=p_id and guided_sales_security.entity_is_private('contract',i.contract_id));
    when 'inspection' then return exists(
      select from public.inspections i where i.id=p_id and
        (guided_sales_security.entity_is_private('contract',i.contract_id) or guided_sales_security.entity_is_private('company',i.company_id)));
    when 'activity' then return exists(
      select from public.activities a where a.id=p_id and a.related_type is distinct from 'activity'
        and guided_sales_security.entity_is_private(a.related_type,a.related_id));
    else return false;
  end case;
end $$;
revoke all on function guided_sales_security.entity_is_private(text,uuid) from public,anon,authenticated;

create or replace function guided_sales_security.entity_visible(p_kind text,p_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select public.has_role(auth.uid(),'admin') or not guided_sales_security.entity_is_private(p_kind,p_id)
$$;
revoke all on function guided_sales_security.entity_visible(text,uuid) from public,anon,authenticated;
grant execute on function guided_sales_security.entity_visible(text,uuid) to authenticated;

-- Restrictive policies combine with, rather than replace, the module policies.
do $policy$
declare r record;
begin
  for r in select * from (values
    ('companies','company','id'), ('contacts','company','company_id'),
    ('company_participations','participation','id'),
    ('company_participation_occupations','participation','participation_id'),
    ('deals','deal','id'), ('deal_spaces','deal','deal_id'), ('deal_events','deal','deal_id'),
    ('contracts','contract','id'), ('contract_spaces','contract','contract_id'),
    ('contract_versions','contract','contract_id'), ('installments','contract','contract_id'),
    ('payments','installment','installment_id'), ('inspections','inspection','id'),
    ('inspection_items','inspection','inspection_id'),
    ('activities','activity','id'), ('activity_versions','activity','activity_id'),
    ('activity_assignees','activity','activity_id'), ('activity_commissions','activity','activity_id')
  ) as v(tbl,kind,col) loop
    execute format('drop policy if exists guided_sale_privacy on public.%I',r.tbl);
    execute format('create policy guided_sale_privacy on public.%I as restrictive for all to authenticated using (guided_sales_security.entity_visible(%L,%I)) with check (guided_sales_security.entity_visible(%L,%I))',r.tbl,r.kind,r.col,r.kind,r.col);
  end loop;
end $policy$;

-- Existing clients already write these transaction-owned rows through RPCs.
-- Revoke raw mutation privileges so no client can create a parallel write path.
revoke insert,update,delete on public.deals,public.deal_spaces,public.deal_events,
  public.contracts,public.contract_spaces,public.contract_versions,public.payments
  from public,anon,authenticated;

-- SECURITY DEFINER mutations from legacy menus still pass through these triggers.
-- Check old AND new identities, including new inspections/activity associations.
create or replace function public.guard_guided_private_write()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare old_row jsonb; new_row jsonb; row_value jsonb; restricted boolean;
begin
  if auth.uid() is null or public.has_role(auth.uid(),'admin') then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op <> 'INSERT' then old_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_row := to_jsonb(new); end if;
  foreach row_value in array array[old_row,new_row] loop
    if row_value is null then continue; end if;
    restricted := guided_sales_security.entity_is_private(tg_argv[0],(row_value->>tg_argv[1])::uuid);
    if tg_table_name in ('deals','contracts','company_participations','inspections') then
      restricted := restricted or guided_sales_security.entity_is_private('company',(row_value->>'company_id')::uuid);
    end if;
    if tg_table_name='inspections' then
      restricted := restricted or guided_sales_security.entity_is_private('contract',(row_value->>'contract_id')::uuid);
    elsif tg_table_name='activities' then
      restricted := restricted or guided_sales_security.entity_is_private(row_value->>'related_type',(row_value->>'related_id')::uuid);
    end if;
    if restricted then raise exception 'Registro não encontrado ou sem acesso.' using errcode='42501'; end if;
  end loop;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.guard_guided_private_write() from public,anon,authenticated;

do $triggers$
declare r record;
begin
  for r in select * from (values
    ('companies','company','id'), ('contacts','company','company_id'),
    ('company_participations','participation','id'),
    ('company_participation_occupations','participation','participation_id'),
    ('deals','deal','id'), ('deal_spaces','deal','deal_id'), ('deal_events','deal','deal_id'),
    ('contracts','contract','id'), ('contract_spaces','contract','contract_id'),
    ('contract_versions','contract','contract_id'), ('installments','contract','contract_id'),
    ('payments','installment','installment_id'), ('inspections','inspection','id'),
    ('inspection_items','inspection','inspection_id'), ('activities','activity','id')
  ) as v(tbl,kind,col) loop
    execute format('drop trigger if exists guard_guided_private_write on public.%I',r.tbl);
    execute format('create trigger guard_guided_private_write before insert or update or delete on public.%I for each row execute function public.guard_guided_private_write(%L,%L)',r.tbl,r.kind,r.col);
  end loop;
end $triggers$;

-- The private canonical state does not depend on which deals the viewer can see.
-- Occupancy is still derived once from existing deals; the public view masks it.
create or replace view public.space_commercial_state_v as
select s.id,s.edition_id,
  case when s.blocked then 'bloqueado'
       when d.status='contratada' then 'vendido'
       when d.status='reservada' then 'reservado'
       when d.status in ('proposta','negociacao') then 'em_negociacao'
       else 'disponivel' end as commercial_status,
  d.id as active_deal_id
from public.spaces s
left join lateral (
  select d.id,d.status
  from public.deal_spaces ds join public.deals d on d.id=ds.deal_id and d.edition_id=s.edition_id
  where ds.space_id=s.id and d.status in ('proposta','negociacao','reservada','contratada')
  order by case d.status when 'contratada' then 1 when 'reservada' then 2 else 3 end,d.id
  limit 1
) d on true;
revoke all on public.space_commercial_state_v from public,anon,authenticated;

create or replace function public.get_space_availability(p_space_id uuid)
returns table(commercial_status text,active_deal_id uuid)
language sql stable security definer set search_path=pg_catalog,public as $$
  select case when public.has_role(auth.uid(),'admin') or s.commercial_status='disponivel'
           then s.commercial_status else 'indisponivel' end,
         case when public.has_role(auth.uid(),'admin') then s.active_deal_id else null end
  from public.space_commercial_state_v s where s.id=p_space_id and public.can_read('mapa')
$$;
revoke all on function public.get_space_availability(uuid) from public,anon,authenticated;
grant execute on function public.get_space_availability(uuid) to authenticated;

create or replace view public.space_status_v with(security_invoker=true) as
select s.*,a.commercial_status,a.active_deal_id
from public.spaces s cross join lateral public.get_space_availability(s.id) a;
create or replace view public.commercial_lot_facts_v as
select i.*,s.commercial_status,s.active_deal_id
from public.commercial_inventory_v i
join public.space_commercial_state_v s on s.id=i.space_id and s.edition_id=i.edition_id;

-- A document associated to any private entity remains private even if unlinked.
-- Shared, already-published documents cannot be repurposed as private ones.
create table if not exists public.guided_private_document_roots (
  root_id uuid primary key references public.documents(id) on delete cascade
);
alter table public.guided_private_document_roots enable row level security;
revoke all on public.guided_private_document_roots from public,anon,authenticated;

create or replace function public.guard_guided_document_link()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.documents;
begin
  if not guided_sales_security.entity_is_private(new.entity_type,new.entity_id) then return new; end if;
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'Registro vinculado não encontrado.' using errcode='42501';
  end if;
  select * into d from public.documents where id=new.document_id for update;
  if d.status='ativo'
    and not exists(select from public.guided_sale_attachments where document_id=d.id)
    and not exists(select from public.guided_private_document_roots where root_id=d.id)
  then raise exception 'Envie uma cópia privada do documento para este vínculo.'; end if;
  insert into public.guided_private_document_roots(root_id) values(d.id) on conflict do nothing;
  return new;
end $$;
revoke all on function public.guard_guided_document_link() from public,anon,authenticated;
drop trigger if exists guard_guided_document_link on public.document_links;
create trigger guard_guided_document_link before insert or update on public.document_links
for each row execute function public.guard_guided_document_link();

create or replace function public.can_read_document(_doc uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select public.can_read('documentos') and exists (
    select 1 from public.documents d where d.id=_doc
      and (d.status='ativo' or d.uploaded_by=auth.uid())
      and (public.has_role(auth.uid(),'admin') or (
        not exists(select from public.guided_sale_attachments a where a.document_id=coalesce(d.root_id,d.id))
        and not exists(select from public.guided_private_document_roots r where r.root_id=coalesce(d.root_id,d.id))
      ))
      and not exists(select from public.document_links l where l.document_id=coalesce(d.root_id,d.id)
        and (not public.can_read(public.doc_entity_module(l.entity_type))
          or not guided_sales_security.entity_visible(l.entity_type,l.entity_id))))
$$;

create or replace function public.can_read_document_object(_path text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select case when exists(select from public.documents d where d.storage_path=_path)
    then exists(select from public.documents d where d.storage_path=_path and public.can_read_document(d.id))
    else (public.can_read('mapa') and exists(select from public.floor_plans f where f.storage_path=_path)) end
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
  if not v_found or not guided_sales_security.entity_visible(_type,_id) then raise exception 'Registro vinculado não encontrado' using errcode='42501'; end if;
  if _edition is not null and v_ed is not null and v_ed <> _edition then raise exception 'O registro vinculado é de outra edição'; end if;
end $$;

create or replace function public.finalize_document_upload(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, storage as $$
declare d record;
begin
  select * into d from public.documents where id = p_id for update;
  if d.id is null then raise exception 'Envio não encontrado'; end if;
  if not public.can_read_document(d.id) then raise exception 'Envio não encontrado'; end if;
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

create or replace function public.begin_document_upload(p_edition_id uuid, p_name text, p_title text, p_description text,
  p_category text, p_mime text, p_size bigint, p_links jsonb, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_existing record; l jsonb; v_ok boolean;
begin
  if p_idempotency_key is not null then
    select * into v_existing from documents where uploaded_by = auth.uid() and idempotency_key = p_idempotency_key;
    if v_existing.id is not null and not public.can_read_document(v_existing.id) then raise exception 'Envio não encontrado'; end if;
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
    if v_existing.id is not null and not public.can_read_document(v_existing.id) then raise exception 'Envio não encontrado'; end if;
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

create or replace function public.validate_activity_reference(p_edition_id uuid, p_related_type text, p_related_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if (p_related_type is null) <> (p_related_id is null) then raise exception 'Origem incompleta'; end if;
  if p_related_type is null then return; end if;
  if not guided_sales_security.entity_visible(p_related_type,p_related_id) then raise exception 'Origem inválida para esta edição' using errcode='42501'; end if;
  if not (
    (p_related_type = 'company' and exists (select 1 from public.companies where id = p_related_id)) or
    (p_related_type = 'deal' and exists (select 1 from public.deals where id = p_related_id and edition_id = p_edition_id)) or
    (p_related_type = 'contract' and exists (select 1 from public.contracts where id = p_related_id and edition_id = p_edition_id)) or
    (p_related_type = 'inspection' and exists (select 1 from public.inspections where id = p_related_id and edition_id = p_edition_id)) or
    (p_related_type = 'space' and exists (select 1 from public.spaces where id = p_related_id and edition_id = p_edition_id)) or
    (p_related_type = 'installment' and exists (select 1 from public.installments where id = p_related_id and edition_id = p_edition_id))
  ) then raise exception 'Origem inválida para esta edição'; end if;
end $$;

create or replace function public.get_company_participation(p_company_id uuid,p_edition_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare c public.companies; p public.company_participations;
begin
  if not public.can_read('empresas') then raise exception 'Sem permissão para consultar empresas.'; end if;
  select * into c from public.companies where id=p_company_id;
  if c.id is null or not guided_sales_security.entity_visible('company',c.id) then return null; end if;
  select * into p from public.company_participations where company_id=c.id and edition_id=p_edition_id and guided_sales_security.entity_visible('participation',id);
  return jsonb_build_object('company',to_jsonb(c),'participation',case when p.id is null then null else to_jsonb(p) end,
    'occupations',coalesce((select jsonb_agg(to_jsonb(o)-'source_import_row_id'-'source_snapshot' order by o.created_at,o.id)
      from public.company_participation_occupations o where participation_id=p.id),'[]'::jsonb),
    'contacts',coalesce((select jsonb_agg(to_jsonb(ct) order by is_primary desc,created_at,id) from public.contacts ct where company_id=c.id),'[]'::jsonb));
end $$;

create or replace function public.get_contract_pricing_terms(p_contract_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $read$
declare
  c public.contracts;
  p public.commercial_pricing_policies;
  t public.commercial_contract_terms;
  stock record;
  result jsonb;
begin
  if not public.can_read('contratos') then
    raise exception 'Sem permissão para consultar a política contratual.' using errcode = '42501';
  end if;
  select * into c from public.contracts where id = p_contract_id;
  if c.pricing_policy_version is null or not guided_sales_security.entity_visible('deal',c.deal_id) then return null; end if;
  select * into strict p from public.commercial_pricing_policies
  where edition_id = c.edition_id and version = c.pricing_policy_version;
  select * into stock from public.commercial_contract_stock(c.id, c.edition_id);
  select * into t from public.commercial_contract_terms
  where edition_id = c.edition_id and contract_id = c.id order by version desc limit 1;

  result := jsonb_build_object(
    'policy_version', p.version, 'scope', stock.scope,
    'installment_limit', case when public.can_read('financeiro') and t.discount_modality = 'cash_full'
      and t.company_id = c.company_id and t.space_ids = stock.space_ids then 1 else p.installment_limit end,
    'first_due', p.first_document_due, 'last_due', p.last_document_due,
    'today', (now() at time zone (select timezone from public.editions where id = c.edition_id))::date
  );
  if not public.can_read('financeiro') then return result; end if;

  return result || jsonb_build_object(
    'discount_rules', coalesce((
      select jsonb_agg(jsonb_build_object('modality', d.modality, 'basis_points', d.basis_points,
        'eligibility', d.eligibility, 'application_condition', d.application_condition) order by d.modality)
      from public.commercial_discount_rules d where d.edition_id = c.edition_id and d.policy_version = p.version
    ), '[]'::jsonb),
    'fee_rules', coalesce((
      select jsonb_agg(jsonb_build_object('fee_key', f.fee_key, 'scope', f.scope, 'amount_cents', f.amount_cents,
        'application_condition', f.application_condition) order by f.fee_key)
      from public.commercial_fee_rules f where f.edition_id = c.edition_id and f.policy_version = p.version
    ), '[]'::jsonb),
    'recorded_terms', case when t.version is not null then jsonb_build_object(
      'version', t.version, 'discount_modality', t.discount_modality, 'discount_evidence', t.discount_evidence,
      'fee_keys', array(select f->>'fee_key' from jsonb_array_elements(t.fees) f),
      'fee_evidence', t.fee_evidence, 'mixed_treatment', t.mixed_treatment,
      'matches_contract', t.company_id = c.company_id and t.space_ids = stock.space_ids
    ) end
  );
end $read$;

create or replace function public.record_contract_pricing_terms(
  p_contract_id uuid, p_expected_version integer, p_discount_modality text, p_discount_evidence text,
  p_fee_keys text[], p_fee_evidence text, p_mixed_treatment text
) returns integer language plpgsql security definer set search_path = pg_catalog, public as $record$
declare
  c public.contracts;
  d public.commercial_discount_rules;
  stock record;
  fee_keys text[] := coalesce(p_fee_keys, '{}'::text[]);
  selected_fees jsonb;
  latest integer;
begin
  if not (public.can_write('contratos') and public.can_read('financeiro')) or auth.uid() is null then
    raise exception 'Sem permissão para registrar condições comerciais.' using errcode = '42501';
  end if;
  select * into c from public.contracts where id = p_contract_id and guided_sales_security.entity_visible('deal',deal_id) for update;
  if c.pricing_policy_version is null or c.status <> 'elaboracao' then
    raise exception 'As condições da política exigem um contrato em elaboração vinculado à política.';
  end if;
  select coalesce(max(version), 0) into latest from public.commercial_contract_terms
  where edition_id = c.edition_id and contract_id = c.id;
  if latest is distinct from p_expected_version then
    raise exception 'As condições já foram alteradas. Recarregue antes de salvar.' using errcode = '40001';
  end if;
  select * into stock from public.commercial_contract_stock(c.id, c.edition_id);
  if p_discount_modality is not null then
    select * into d from public.commercial_discount_rules
    where edition_id = c.edition_id and policy_version = c.pricing_policy_version and modality = p_discount_modality;
    if not found or nullif(btrim(p_discount_evidence), '') is null then
      raise exception 'Escolha uma única modalidade e registre a elegibilidade ou condição do desconto.';
    end if;
  end if;
  if cardinality(fee_keys) > 0 then
    if stock.scope = 'unknown' or nullif(btrim(p_fee_evidence), '') is null then
      raise exception 'Confirme o escopo e registre a condição de incidência das taxas do expositor.';
    end if;
    if stock.scope = 'mixed' and nullif(btrim(p_mixed_treatment), '') is null then
      raise exception 'Registre o tratamento das taxas no contrato que combina áreas interna e externa.';
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('fee_key', f.fee_key, 'amount_cents', f.amount_cents,
    'scope', f.scope, 'condition', f.application_condition) order by f.fee_key), '[]'::jsonb)
  into selected_fees from public.commercial_fee_rules f
  where f.edition_id = c.edition_id and f.policy_version = c.pricing_policy_version
    and f.fee_key = any(fee_keys) and (f.scope = 'any' or f.scope = stock.scope or stock.scope = 'mixed');
  if cardinality(fee_keys) <> jsonb_array_length(selected_fees) then
    raise exception 'Cada taxa aplicável pode ser registrada uma vez por contrato e expositor.';
  end if;

  insert into public.commercial_contract_terms(
    edition_id, policy_version, contract_id, company_id, space_ids, version, discount_modality,
    discount_evidence, discount_basis_points, discount_application_condition, fees, fee_evidence,
    mixed_treatment, recorded_by
  ) values (
    c.edition_id, c.pricing_policy_version, c.id, c.company_id, stock.space_ids, latest + 1, d.modality,
    nullif(btrim(p_discount_evidence), ''), d.basis_points, d.application_condition, selected_fees,
    nullif(btrim(p_fee_evidence), ''), nullif(btrim(p_mixed_treatment), ''), auth.uid()
  );
  return latest + 1;
end $record$;

create or replace function public.register_payment(p_installment_id uuid, p_amount_cents bigint, p_paid_on date, p_method text, p_note text, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = public as $$
declare ins record; v_id uuid; paid bigint;
begin
  if not public.can_write('financeiro') then raise exception 'Sem permissão'; end if;
  if p_idempotency_key is not null then
    select id into v_id from public.payments where idempotency_key = p_idempotency_key and installment_id=p_installment_id
      and guided_sales_security.entity_visible('installment',installment_id);
    if v_id is not null then return v_id; end if;
  end if;
  select * into ins from public.installments where id = p_installment_id and guided_sales_security.entity_visible('contract',contract_id) for update;
  if not found then raise exception 'Parcela não encontrada.' using errcode='42501'; end if;
  if ins.status = 'cancelada' then raise exception 'Parcela cancelada'; end if;
  select coalesce(sum(amount_cents),0) into paid from public.payments where installment_id = p_installment_id;
  if paid + p_amount_cents > ins.amount_cents then raise exception 'Valor excede o saldo da parcela'; end if;
  insert into public.payments(installment_id, amount_cents, paid_on, method, note, idempotency_key, created_by)
  values (p_installment_id, p_amount_cents, p_paid_on, p_method, p_note, p_idempotency_key, auth.uid()) returning id into v_id;
  if paid + p_amount_cents = ins.amount_cents then update public.installments set status = 'paga' where id = p_installment_id; end if;
  return v_id;
end $$;

create or replace function public.create_inspection(p_edition_id uuid, p_space_id uuid, p_kind inspection_kind, p_scheduled date, p_template_id uuid, p_inspector uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_company uuid; v_contract uuid; items jsonb; i int;
begin
  if not public.can_write('vistorias') then raise exception 'Sem permissão'; end if;
  select c.id, c.company_id into v_contract, v_company from public.contract_spaces cs join public.contracts c on c.id = cs.contract_id
    where cs.space_id=p_space_id and c.edition_id=p_edition_id and c.status <> 'cancelado'
      and guided_sales_security.entity_visible('deal',c.deal_id) order by c.created_at desc limit 1;
  insert into public.inspections(edition_id, space_id, company_id, contract_id, kind, scheduled_for, inspector_id)
  values (p_edition_id, p_space_id, v_company, v_contract, p_kind, p_scheduled, coalesce(p_inspector, auth.uid())) returning id into v_id;
  select t.items into items from public.checklist_templates t where t.id = p_template_id;
  if items is not null then
    for i in 0..jsonb_array_length(items)-1 loop
      insert into public.inspection_items(inspection_id, position, label) values (v_id, i, items->>i);
    end loop;
  end if;
  return v_id;
end $$;

create or replace function public.require_commercial_scope(p_edition_id uuid, p_segment text)
returns void
language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
begin
  if not public.can_read('mapa') then
    raise exception 'Sem permissão para consultar o inventário comercial.' using errcode = '42501';
  end if;
  if not exists (select from public.editions where id = p_edition_id) then
    raise exception 'Edição não encontrada.' using errcode = '22023';
  end if;
  if p_segment is not null and p_segment not in ('p1','p3','p8','p12','p13','p14','external','automobile') then
    raise exception 'Segmento comercial inválido.' using errcode = '22023';
  end if;
end $$;

create or replace function public.get_commercial_overview(p_edition_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v_financial boolean := public.can_read('financeiro');
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'Indicadores comerciais restritos à administração.' using errcode='42501';
  end if;
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
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'Indicadores comerciais restritos à administração.' using errcode='42501';
  end if;
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

create or replace function public.get_commercial_lots(p_edition_id uuid, p_segment text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_admin boolean := public.has_role(auth.uid(),'admin');
  v_financial boolean := v_admin and public.can_read('financeiro');
  v_companies boolean := v_admin and public.can_read('empresas');
begin
  perform public.require_commercial_scope(p_edition_id, p_segment);
  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', f.space_id, 'segmentKey', f.segment_key, 'code', f.lot_code,
        'environmentId', f.environment_id, 'geometryId', f.geometry_id, 'areaM2', f.area_m2,
        'areaPending', f.area_pending, 'status', case when v_admin or f.commercial_status='disponivel' then f.commercial_status else 'indisponivel' end,
        'pricingState', case when v_admin then f.pricing_state else 'no_tariff' end, 'cornerState', case when v_admin then f.corner_state end,
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
    left join public.deals d on v_admin and d.id = f.active_deal_id and d.edition_id = f.edition_id
    left join public.deal_spaces ds on v_financial and ds.deal_id = d.id and ds.space_id = f.space_id
    left join public.companies c on v_companies and c.id = d.company_id
    where f.edition_id = p_edition_id and (p_segment is null or f.segment_key = p_segment)
  );
end $$;

create or replace function public.get_pavilion_interior_commercial(p_edition_id uuid,p_floor_plan_id uuid,p_revision integer,p_pavilion_number integer default 1)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb;
begin
  if not public.can_read('mapa') or not public.can_read('comercial') then
    raise exception 'Sem permissão para consultar informações comerciais.' using errcode='42501'; end if;
  if not exists(select 1 from public.editions where id=p_edition_id and is_active) then return '{}'::jsonb; end if;
  select coalesce(jsonb_object_agg(e.code,jsonb_strip_nulls(jsonb_build_object('status',s.commercial_status,
      'exhibitor',case when public.has_role(auth.uid(),'admin') then (select c.trade_name from public.deals d join public.companies c on c.id=d.company_id where d.id=s.active_deal_id) else null end))),'{}'::jsonb)
    into result from public.pavilion_plan_revisions r
    join public.pavilion_environment_revisions v on v.revision_id=r.id
    join public.pavilion_environments e on e.edition_id=v.edition_id and e.id=v.environment_id and e.pavilion_number=r.pavilion_number
    join public.space_status_v s on s.id=e.space_id and s.edition_id=e.edition_id
    where r.edition_id=p_edition_id and r.floor_plan_id=p_floor_plan_id and r.pavilion_number=p_pavilion_number and r.revision=p_revision and e.kind='commercial';
  return result;
end $$;
-- Expose only the masked stock. Both views used by the trusted analytics stay private.
revoke all on public.commercial_lot_facts_v from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
