
-- ========== ENUMS ==========
create type public.app_role as enum ('admin','comercial','financeiro','operacao','consulta');
create type public.deal_status as enum ('proposta','negociacao','reservada','contratada','perdida','cancelada');
create type public.contract_status as enum ('elaboracao','emitido','assinado','cancelado');
create type public.installment_status as enum ('aberta','paga','cancelada');
create type public.inspection_kind as enum ('entrega','devolucao');
create type public.inspection_status as enum ('agendada','em_andamento','concluida');
create type public.activity_status as enum ('aberta','concluida','cancelada');

-- ========== CORE ACCESS ==========
create table public.profiles (
  id uuid primary key,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role app_role not null,
  unique (user_id, role)
);
create table public.role_permissions (
  role app_role not null,
  module text not null,
  can_read boolean not null default false,
  can_write boolean not null default false,
  primary key (role, module)
);

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.can_read(_module text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    where ur.user_id = auth.uid() and rp.module = _module and (rp.can_read or rp.can_write)
  ) or public.has_role(auth.uid(), 'admin')
$$;

create or replace function public.can_write(_module text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    where ur.user_id = auth.uid() and rp.module = _module and rp.can_write
  ) or public.has_role(auth.uid(), 'admin')
$$;

create or replace function public.has_any_role()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid())
$$;

-- ========== EDITIONS ==========
create table public.editions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year int not null,
  starts_on date not null,
  ends_on date not null,
  venue text,
  is_active boolean not null default false,
  reservation_hold_days int,            -- null = sem política de vencimento
  reservation_expiry_action text,       -- 'alertar' | null
  contract_template text,
  created_at timestamptz not null default now()
);

-- ========== COMPANIES ==========
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text not null,
  tax_id text,
  email text, phone text, website text,
  city text, state text, segment text,
  notes text,
  is_demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index companies_tax_id_uq on public.companies (regexp_replace(tax_id, '\D', '', 'g')) where tax_id is not null and tax_id <> '';

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, role text, email text, phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.company_participations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  status text not null default 'prospect',
  notes text,
  created_at timestamptz not null default now(),
  unique (company_id, edition_id)
);

-- ========== SPACES ==========
create table public.floor_plans (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  name text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  code text not null,
  sector text,
  area_m2 numeric(10,2),
  list_price_cents bigint,
  blocked boolean not null default false,
  floor_plan_id uuid references public.floor_plans(id) on delete set null,
  pos_x numeric, pos_y numeric, pos_w numeric, pos_h numeric,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (edition_id, code)
);

-- ========== DEALS ==========
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  owner_id uuid,
  status deal_status not null default 'proposta',
  total_cents bigint not null default 0,
  conditions text,
  notes text,
  reserved_at timestamptz,
  idempotency_key text unique,
  is_demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.deal_spaces (
  deal_id uuid not null references public.deals(id) on delete cascade,
  space_id uuid not null references public.spaces(id),
  price_cents bigint not null default 0,
  primary key (deal_id, space_id)
);
create table public.deal_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  from_status deal_status,
  to_status deal_status not null,
  note text,
  actor uuid,
  created_at timestamptz not null default now()
);

-- ========== CONTRACTS ==========
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  deal_id uuid not null references public.deals(id),
  company_id uuid not null references public.companies(id),
  number text,
  status contract_status not null default 'elaboracao',
  body text not null default '',
  current_version int not null default 1,
  total_cents bigint not null default 0,
  issued_at timestamptz,
  signed_at timestamptz,
  signature_note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index contracts_active_deal_uq on public.contracts(deal_id) where status <> 'cancelado';
create table public.contract_spaces (
  contract_id uuid not null references public.contracts(id) on delete cascade,
  space_id uuid not null references public.spaces(id),
  primary key (contract_id, space_id)
);
create table public.contract_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  version int not null,
  body text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (contract_id, version)
);

-- ========== FINANCE ==========
create table public.installments (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  number int not null,
  due_date date not null,
  amount_cents bigint not null check (amount_cents >= 0),
  status installment_status not null default 'aberta',
  created_at timestamptz not null default now(),
  unique (contract_id, number)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null references public.installments(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  paid_on date not null,
  method text,
  note text,
  idempotency_key text unique,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- ========== INSPECTIONS ==========
create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  items jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  space_id uuid not null references public.spaces(id),
  company_id uuid references public.companies(id),
  contract_id uuid references public.contracts(id),
  kind inspection_kind not null,
  scheduled_for date,
  status inspection_status not null default 'agendada',
  inspector_id uuid,
  notes text,
  acceptance_name text,
  acceptance_at timestamptz,
  acceptance_signature text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  position int not null default 0,
  label text not null,
  condition text not null default 'pendente',
  note text
);

-- ========== ACTIVITIES ==========
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  title text not null,
  description text,
  kind text not null default 'tarefa',
  due_at timestamptz,
  status activity_status not null default 'aberta',
  assignee_id uuid,
  related_type text,
  related_id uuid,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- ========== DOCUMENTS ==========
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid references public.editions(id) on delete set null,
  name text not null,
  category text not null default 'geral',
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  version int not null default 1,
  previous_id uuid references public.documents(id),
  uploaded_by uuid,
  created_at timestamptz not null default now()
);
create table public.document_links (
  document_id uuid not null references public.documents(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  primary key (document_id, entity_type, entity_id)
);

-- ========== AUDIT ==========
create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text,
  action text not null,
  actor uuid,
  changes jsonb,
  created_at timestamptz not null default now()
);

-- ========== GRANTS ==========
do $$ declare t text; begin
  foreach t in array array['profiles','user_roles','role_permissions','editions','companies','contacts','company_participations','floor_plans','spaces','deals','deal_spaces','deal_events','contracts','contract_spaces','contract_versions','installments','payments','checklist_templates','inspections','inspection_items','activities','documents','document_links','audit_log'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ========== POLICIES ==========
create policy "profiles read" on public.profiles for select to authenticated using (public.has_any_role() or id = auth.uid());
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid());
create policy "roles read own or admin" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.can_read('admin'));
create policy "roles admin write" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "perms read" on public.role_permissions for select to authenticated using (true);
create policy "perms admin write" on public.role_permissions for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "editions read" on public.editions for select to authenticated using (public.has_any_role());
create policy "editions write" on public.editions for all to authenticated using (public.can_write('admin')) with check (public.can_write('admin'));
create policy "audit read" on public.audit_log for select to authenticated using (public.can_read('admin'));

do $$ declare r record; begin
  for r in select * from (values
    ('companies','empresas'),('contacts','empresas'),('company_participations','empresas'),
    ('floor_plans','mapa'),('spaces','mapa'),
    ('deals','comercial'),('deal_spaces','comercial'),('deal_events','comercial'),
    ('contracts','contratos'),('contract_spaces','contratos'),('contract_versions','contratos'),
    ('installments','financeiro'),('payments','financeiro'),
    ('checklist_templates','vistorias'),('inspections','vistorias'),('inspection_items','vistorias'),
    ('activities','agenda'),
    ('documents','documentos'),('document_links','documentos')
  ) as v(tbl, module) loop
    execute format('create policy "read %1$s" on public.%1$I for select to authenticated using (public.can_read(%2$L))', r.tbl, r.module);
    execute format('create policy "insert %1$s" on public.%1$I for insert to authenticated with check (public.can_write(%2$L))', r.tbl, r.module);
    execute format('create policy "update %1$s" on public.%1$I for update to authenticated using (public.can_write(%2$L))', r.tbl, r.module);
    execute format('create policy "delete %1$s" on public.%1$I for delete to authenticated using (public.can_write(%2$L))', r.tbl, r.module);
  end loop;
end $$;

-- ========== DEFAULT PERMISSIONS ==========
insert into public.role_permissions(role, module, can_read, can_write) values
 ('comercial','dashboard',true,false),('comercial','mapa',true,true),('comercial','comercial',true,true),('comercial','empresas',true,true),('comercial','contratos',true,true),('comercial','vistorias',true,false),('comercial','financeiro',true,false),('comercial','agenda',true,true),('comercial','documentos',true,true),
 ('financeiro','dashboard',true,false),('financeiro','mapa',true,false),('financeiro','comercial',true,false),('financeiro','empresas',true,false),('financeiro','contratos',true,false),('financeiro','vistorias',true,false),('financeiro','financeiro',true,true),('financeiro','agenda',true,true),('financeiro','documentos',true,true),
 ('operacao','dashboard',true,false),('operacao','mapa',true,false),('operacao','comercial',true,false),('operacao','empresas',true,false),('operacao','contratos',true,false),('operacao','vistorias',true,true),('operacao','agenda',true,true),('operacao','documentos',true,true),
 ('consulta','dashboard',true,false),('consulta','mapa',true,false),('consulta','comercial',true,false),('consulta','empresas',true,false),('consulta','contratos',true,false),('consulta','vistorias',true,false),('consulta','agenda',true,false),('consulta','documentos',true,false);

-- ========== VIEW: SPACE STATUS ==========
create view public.space_status_v with (security_invoker = on) as
select s.*,
  case
    when s.blocked then 'bloqueado'
    when exists (select 1 from public.deal_spaces ds join public.deals d on d.id = ds.deal_id where ds.space_id = s.id and d.status = 'contratada') then 'vendido'
    when exists (select 1 from public.deal_spaces ds join public.deals d on d.id = ds.deal_id where ds.space_id = s.id and d.status = 'reservada') then 'reservado'
    when exists (select 1 from public.deal_spaces ds join public.deals d on d.id = ds.deal_id where ds.space_id = s.id and d.status in ('proposta','negociacao')) then 'em_negociacao'
    else 'disponivel' end as commercial_status,
  (select ds.deal_id from public.deal_spaces ds join public.deals d on d.id = ds.deal_id
     where ds.space_id = s.id and d.status in ('proposta','negociacao','reservada','contratada') limit 1) as active_deal_id
from public.spaces s;
grant select on public.space_status_v to authenticated;

-- ========== AUDIT TRIGGER ==========
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log(table_name, record_id, action, actor, changes)
  values (TG_TABLE_NAME,
          coalesce((case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end)->>'id', ''),
          TG_OP, auth.uid(),
          case when TG_OP = 'UPDATE' then jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
               when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end);
  return coalesce(NEW, OLD);
end $$;
do $$ declare t text; begin
  foreach t in array array['companies','spaces','deals','contracts','installments','payments','inspections','documents','user_roles','role_permissions','editions'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_trigger()', t);
  end loop;
end $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin NEW.updated_at = now(); return NEW; end $$;
create trigger t_companies before update on public.companies for each row execute function public.touch_updated_at();
create trigger t_deals before update on public.deals for each row execute function public.touch_updated_at();
create trigger t_contracts before update on public.contracts for each row execute function public.touch_updated_at();

-- ========== RPC: PROFILE BOOTSTRAP ==========
create or replace function public.ensure_profile()
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text; nm text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select email, coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name') into em, nm from auth.users where id = uid;
  insert into public.profiles(id, email, full_name) values (uid, em, nm) on conflict (id) do nothing;
  -- primeiro usuário do sistema torna-se administrador
  perform pg_advisory_xact_lock(4242);
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles(user_id, role) values (uid, 'admin') on conflict do nothing;
  end if;
  return json_build_object('roles', (select coalesce(json_agg(role), '[]'::json) from public.user_roles where user_id = uid));
end $$;

-- ========== RPC: SAVE DEAL (transacional, com checagem de conflito) ==========
create or replace function public.save_deal(
  p_deal_id uuid, p_edition_id uuid, p_company_id uuid, p_owner_id uuid,
  p_conditions text, p_notes text, p_space_ids uuid[], p_prices bigint[], p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_conflict text; v_status deal_status; i int;
begin
  if not public.can_write('comercial') then raise exception 'Sem permissão para editar negociações'; end if;
  if p_space_ids is null or array_length(p_space_ids,1) is null then raise exception 'Selecione ao menos um espaço'; end if;
  if array_length(p_space_ids,1) <> coalesce(array_length(p_prices,1),0) then raise exception 'Valores inconsistentes'; end if;

  if p_deal_id is null and p_idempotency_key is not null then
    select id into v_id from public.deals where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;

  -- trava os espaços para evitar operações concorrentes
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

-- ========== RPC: TRANSITION DEAL ==========
create or replace function public.transition_deal(p_deal_id uuid, p_to deal_status, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_from deal_status; v_conflict text;
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
  if p_to in ('perdida','cancelada') and coalesce(trim(p_note),'') = '' then
    raise exception 'Informe o motivo';
  end if;
  update public.deals set status = p_to, reserved_at = case when p_to = 'reservada' then now() else reserved_at end where id = p_deal_id;
  insert into public.deal_events(deal_id, from_status, to_status, note, actor) values (p_deal_id, v_from, p_to, p_note, auth.uid());
end $$;

-- ========== RPC: CONTRACTS ==========
create or replace function public.create_contract_from_deal(p_deal_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
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
  insert into public.contracts(edition_id, deal_id, company_id, number, body, total_cents, created_by)
  values (d.edition_id, d.id, d.company_id, v_num, v_body, d.total_cents, auth.uid()) returning id into v_id;
  insert into public.contract_spaces(contract_id, space_id) select v_id, space_id from public.deal_spaces where deal_id = d.id;
  insert into public.contract_versions(contract_id, version, body, created_by) values (v_id, 1, v_body, auth.uid());
  return v_id;
end $$;

create or replace function public.save_contract_body(p_contract_id uuid, p_body text)
returns int language plpgsql security definer set search_path = public as $$
declare c record; v int;
begin
  if not public.can_write('contratos') then raise exception 'Sem permissão'; end if;
  select * into c from public.contracts where id = p_contract_id for update;
  if c.status <> 'elaboracao' then raise exception 'Somente contratos em elaboração podem ser editados'; end if;
  v := c.current_version + 1;
  insert into public.contract_versions(contract_id, version, body, created_by) values (p_contract_id, v, p_body, auth.uid());
  update public.contracts set body = p_body, current_version = v where id = p_contract_id;
  return v;
end $$;

create or replace function public.set_contract_status(p_contract_id uuid, p_to contract_status, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if not public.can_write('contratos') then raise exception 'Sem permissão'; end if;
  select * into c from public.contracts where id = p_contract_id for update;
  if not (
    (c.status = 'elaboracao' and p_to in ('emitido','cancelado')) or
    (c.status = 'emitido' and p_to in ('elaboracao','assinado','cancelado')) or
    (c.status = 'assinado' and p_to = 'cancelado')
  ) then raise exception 'Transição inválida: % → %', c.status, p_to; end if;
  if p_to = 'assinado' and coalesce(trim(p_note),'') = '' then raise exception 'Descreva como a assinatura foi obtida'; end if;
  update public.contracts set status = p_to,
    issued_at = case when p_to = 'emitido' then now() else issued_at end,
    signed_at = case when p_to = 'assinado' then now() else signed_at end,
    signature_note = case when p_to = 'assinado' then p_note else signature_note end
  where id = p_contract_id;
end $$;

-- ========== RPC: FINANCE ==========
create or replace function public.generate_installments(p_contract_id uuid, p_count int, p_first_due date, p_interval_months int)
returns void language plpgsql security definer set search_path = public as $$
declare c record; base bigint; rest bigint; i int;
begin
  if not public.can_write('financeiro') then raise exception 'Sem permissão'; end if;
  if p_count < 1 or p_count > 36 then raise exception 'Quantidade de parcelas inválida'; end if;
  select * into c from public.contracts where id = p_contract_id for update;
  if c.status = 'cancelado' then raise exception 'Contrato cancelado'; end if;
  if exists (select 1 from public.installments where contract_id = p_contract_id) then raise exception 'O contrato já possui parcelas'; end if;
  base := c.total_cents / p_count; rest := c.total_cents - base * p_count;
  for i in 1..p_count loop
    insert into public.installments(edition_id, contract_id, number, due_date, amount_cents)
    values (c.edition_id, c.id, i, (p_first_due + make_interval(months => (i-1) * greatest(p_interval_months,1)))::date,
            base + case when i = p_count then rest else 0 end);
  end loop;
end $$;

create or replace function public.register_payment(p_installment_id uuid, p_amount_cents bigint, p_paid_on date, p_method text, p_note text, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = public as $$
declare ins record; v_id uuid; paid bigint;
begin
  if not public.can_write('financeiro') then raise exception 'Sem permissão'; end if;
  if p_idempotency_key is not null then
    select id into v_id from public.payments where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;
  select * into ins from public.installments where id = p_installment_id for update;
  if ins.status = 'cancelada' then raise exception 'Parcela cancelada'; end if;
  select coalesce(sum(amount_cents),0) into paid from public.payments where installment_id = p_installment_id;
  if paid + p_amount_cents > ins.amount_cents then raise exception 'Valor excede o saldo da parcela'; end if;
  insert into public.payments(installment_id, amount_cents, paid_on, method, note, idempotency_key, created_by)
  values (p_installment_id, p_amount_cents, p_paid_on, p_method, p_note, p_idempotency_key, auth.uid()) returning id into v_id;
  if paid + p_amount_cents = ins.amount_cents then update public.installments set status = 'paga' where id = p_installment_id; end if;
  return v_id;
end $$;

-- ========== RPC: INSPECTION ==========
create or replace function public.create_inspection(p_edition_id uuid, p_space_id uuid, p_kind inspection_kind, p_scheduled date, p_template_id uuid, p_inspector uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_company uuid; v_contract uuid; items jsonb; i int;
begin
  if not public.can_write('vistorias') then raise exception 'Sem permissão'; end if;
  select c.id, c.company_id into v_contract, v_company from public.contract_spaces cs join public.contracts c on c.id = cs.contract_id
    where cs.space_id = p_space_id and c.status <> 'cancelado' order by c.created_at desc limit 1;
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

grant execute on function public.ensure_profile, public.save_deal, public.transition_deal, public.create_contract_from_deal, public.save_contract_body, public.set_contract_status, public.generate_installments, public.register_payment, public.create_inspection, public.can_read, public.can_write, public.has_role, public.has_any_role to authenticated;

-- ========== SEED: real edition config & editable base checklist ==========
insert into public.editions(name, year, starts_on, ends_on, is_active) values ('Indumóveis 2027', 2027, '2027-05-14', '2027-05-23', true);
insert into public.checklist_templates(name, items) values ('Checklist base (editar antes do uso)', '["Piso","Paredes / divisórias","Instalação elétrica","Iluminação","Limpeza geral"]'::jsonb);
