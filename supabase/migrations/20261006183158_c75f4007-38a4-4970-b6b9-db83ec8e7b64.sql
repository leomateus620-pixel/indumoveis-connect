-- Agenda operacional integrada: tempo canônico, catálogos, relações, histórico e gravação atômica.
alter table public.editions add column if not exists timezone text not null default 'America/Sao_Paulo';
update public.editions set timezone = 'America/Sao_Paulo' where year = 2027;

alter table public.activities
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists all_day boolean not null default false,
  add column if not exists location text,
  add column if not exists version integer not null default 1,
  add column if not exists idempotency_key text,
  add column if not exists updated_at timestamptz not null default now();
update public.activities set start_at = due_at where start_at is null and due_at is not null;

create table public.activity_categories (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  slug text not null,
  name text not null,
  is_active boolean not null default true,
  source text,
  verified_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, slug), unique (edition_id, name)
);
grant select on public.activity_categories to authenticated;
grant all on public.activity_categories to service_role;
alter table public.activity_categories enable row level security;
create policy "read activity categories" on public.activity_categories for select to authenticated using (public.can_read('agenda'));

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  slug text not null,
  name text not null,
  is_active boolean not null default true,
  is_coordinating boolean not null default false,
  source_url text,
  verified_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, slug), unique (edition_id, name)
);
grant select on public.commissions to authenticated;
grant all on public.commissions to service_role;
alter table public.commissions enable row level security;
create policy "read commissions" on public.commissions for select to authenticated using (public.can_read('agenda'));

alter table public.activities add column if not exists category_id uuid references public.activity_categories(id) on delete set null;

create table public.activity_assignees (
  activity_id uuid not null references public.activities(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (activity_id, profile_id)
);
grant select on public.activity_assignees to authenticated;
grant all on public.activity_assignees to service_role;
alter table public.activity_assignees enable row level security;
create policy "read activity assignees" on public.activity_assignees for select to authenticated using (public.can_read('agenda'));

create table public.activity_commissions (
  activity_id uuid not null references public.activities(id) on delete cascade,
  commission_id uuid not null references public.commissions(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (activity_id, commission_id)
);
grant select on public.activity_commissions to authenticated;
grant all on public.activity_commissions to service_role;
alter table public.activity_commissions enable row level security;
create policy "read activity commissions" on public.activity_commissions for select to authenticated using (public.can_read('agenda'));

create table public.activity_versions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  actor uuid,
  created_at timestamptz not null default now(),
  unique (activity_id, version)
);
grant select on public.activity_versions to authenticated;
grant all on public.activity_versions to service_role;
alter table public.activity_versions enable row level security;
create policy "read activity versions" on public.activity_versions for select to authenticated using (public.can_read('agenda'));

create unique index activity_assignees_one_primary_uq on public.activity_assignees(activity_id) where is_primary;
create unique index activities_edition_idempotency_uq on public.activities(edition_id, idempotency_key) where idempotency_key is not null;
create index activities_edition_start_idx on public.activities(edition_id, start_at);
create index activities_related_idx on public.activities(related_type, related_id);
create index activity_assignees_profile_idx on public.activity_assignees(profile_id, activity_id);
create index activity_commissions_commission_idx on public.activity_commissions(commission_id, activity_id);

insert into public.activity_assignees(activity_id, profile_id, is_primary)
select a.id, a.assignee_id, true from public.activities a join public.profiles p on p.id=a.assignee_id
on conflict (activity_id, profile_id) do update set is_primary=true;

create or replace function public.validate_edition_timezone()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then raise exception 'Fuso horário inválido'; end if;
  return new;
end $$;
create trigger validate_edition_timezone_before_write before insert or update of timezone on public.editions for each row execute function public.validate_edition_timezone();

create or replace function public.validate_activity_fields()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.title := trim(new.title);
  if new.title = '' then raise exception 'Informe o título'; end if;
  if new.kind not in ('tarefa','reuniao','prazo','entrega','pendencia') then raise exception 'Tipo de atividade inválido'; end if;
  if new.related_type is not null and new.related_type not in ('company','deal','contract','inspection','space','installment') then raise exception 'Origem da atividade inválida'; end if;
  if tg_op = 'INSERT' then new.start_at := coalesce(new.start_at, new.due_at);
  elsif new.start_at is distinct from old.start_at then null;
  elsif new.due_at is distinct from old.due_at then new.start_at := new.due_at;
  end if;
  new.due_at := new.start_at;
  if new.end_at is not null and new.start_at is null then raise exception 'Informe o início antes do fim'; end if;
  if new.end_at is not null and new.end_at < new.start_at then raise exception 'O fim não pode ser anterior ao início'; end if;
  new.location := nullif(trim(coalesce(new.location, '')), '');
  new.updated_at := now();
  return new;
end $$;
create trigger validate_activity_before_write before insert or update on public.activities for each row execute function public.validate_activity_fields();
create trigger touch_activity_categories before update on public.activity_categories for each row execute function public.touch_updated_at();
create trigger touch_commissions before update on public.commissions for each row execute function public.touch_updated_at();

create or replace function public.validate_activity_reference(p_edition_id uuid, p_related_type text, p_related_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if (p_related_type is null) <> (p_related_id is null) then raise exception 'Origem incompleta'; end if;
  if p_related_type is null then return; end if;
  if not (
    (p_related_type = 'company' and exists (select 1 from public.companies where id = p_related_id)) or
    (p_related_type = 'deal' and exists (select 1 from public.deals where id = p_related_id and edition_id = p_edition_id)) or
    (p_related_type = 'contract' and exists (select 1 from public.contracts where id = p_related_id and edition_id = p_edition_id)) or
    (p_related_type = 'inspection' and exists (select 1 from public.inspections where id = p_related_id and edition_id = p_edition_id)) or
    (p_related_type = 'space' and exists (select 1 from public.spaces where id = p_related_id and edition_id = p_edition_id)) or
    (p_related_type = 'installment' and exists (select 1 from public.installments where id = p_related_id and edition_id = p_edition_id))
  ) then raise exception 'Origem inválida para esta edição'; end if;
end $$;
revoke execute on function public.validate_activity_reference(uuid,text,uuid) from public, anon, authenticated;

create or replace function public.activity_snapshot(p_activity_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select to_jsonb(a) || jsonb_build_object(
    'assignees', coalesce((select jsonb_agg(jsonb_build_object('profile_id', aa.profile_id, 'is_primary', aa.is_primary) order by aa.is_primary desc, aa.profile_id) from public.activity_assignees aa where aa.activity_id = a.id), '[]'::jsonb),
    'commissions', coalesce((select jsonb_agg(ac.commission_id order by ac.commission_id) from public.activity_commissions ac where ac.activity_id = a.id), '[]'::jsonb)
  ) from public.activities a where a.id = p_activity_id
$$;
revoke execute on function public.activity_snapshot(uuid) from public, anon, authenticated;

create or replace function public.save_activity(p_activity_id uuid,p_edition_id uuid,p_title text,p_description text,p_kind text,p_category_id uuid,p_start_local timestamp without time zone,p_end_local timestamp without time zone,p_all_day boolean,p_location text,p_primary_assignee uuid,p_assignee_ids uuid[],p_commission_ids uuid[],p_related_type text,p_related_id uuid,p_expected_version integer,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_version integer; v_timezone text; v_start timestamptz; v_end timestamptz; v_assignees uuid[] := coalesce(p_assignee_ids, array[]::uuid[]);
begin
  if not public.can_write('agenda') then raise exception 'Sem permissão'; end if;
  if p_edition_id is null then raise exception 'Edição não informada'; end if;
  select timezone into v_timezone from public.editions where id = p_edition_id;
  if v_timezone is null then raise exception 'Edição não encontrada'; end if;
  if coalesce(trim(p_title),'') = '' then raise exception 'Informe o título'; end if;
  if p_start_local is null and p_end_local is not null then raise exception 'Informe o início antes do fim'; end if;
  v_start := case when p_start_local is null then null else p_start_local at time zone v_timezone end;
  v_end := case when p_end_local is null then null else p_end_local at time zone v_timezone end;
  if v_end is not null and v_end < v_start then raise exception 'O fim não pode ser anterior ao início'; end if;
  if p_category_id is not null and not exists (select 1 from public.activity_categories where id=p_category_id and edition_id=p_edition_id) then raise exception 'Categoria inválida'; end if;
  if exists (select 1 from unnest(coalesce(p_commission_ids,array[]::uuid[])) x where not exists (select 1 from public.commissions c where c.id=x and c.edition_id=p_edition_id)) then raise exception 'Comissão inválida'; end if;
  if exists (select 1 from unnest(v_assignees || case when p_primary_assignee is null then array[]::uuid[] else array[p_primary_assignee] end) x where not exists (select 1 from public.profiles p join public.user_roles ur on ur.user_id=p.id where p.id=x)) then raise exception 'Responsável inválido'; end if;
  perform public.validate_activity_reference(p_edition_id,p_related_type,p_related_id);
  if p_activity_id is null then
    if p_idempotency_key is not null then select id into v_id from public.activities where edition_id=p_edition_id and idempotency_key=p_idempotency_key; end if;
    if v_id is not null then return v_id; end if;
    insert into public.activities(edition_id,title,description,kind,category_id,start_at,end_at,all_day,location,assignee_id,related_type,related_id,created_by,idempotency_key)
    values(p_edition_id,trim(p_title),nullif(trim(coalesce(p_description,'')),''),p_kind,p_category_id,v_start,v_end,coalesce(p_all_day,false),nullif(trim(coalesce(p_location,'')),''),p_primary_assignee,p_related_type,p_related_id,auth.uid(),p_idempotency_key)
    returning id,version into v_id,v_version;
  else
    select version into v_version from public.activities where id=p_activity_id and edition_id=p_edition_id for update;
    if v_version is null then raise exception 'Atividade não encontrada'; end if;
    if v_version <> p_expected_version then raise exception 'A atividade foi alterada por outra pessoa. Recarregue antes de salvar.'; end if;
    update public.activities set title=trim(p_title),description=nullif(trim(coalesce(p_description,'')),''),kind=p_kind,category_id=p_category_id,start_at=v_start,end_at=v_end,all_day=coalesce(p_all_day,false),location=nullif(trim(coalesce(p_location,'')),''),assignee_id=p_primary_assignee,related_type=p_related_type,related_id=p_related_id,version=version+1 where id=p_activity_id returning id,version into v_id,v_version;
  end if;
  delete from public.activity_assignees where activity_id=v_id;
  insert into public.activity_assignees(activity_id,profile_id,is_primary) select v_id,x,(x=p_primary_assignee) from (select distinct unnest(v_assignees || case when p_primary_assignee is null then array[]::uuid[] else array[p_primary_assignee] end) x) s;
  delete from public.activity_commissions where activity_id=v_id;
  insert into public.activity_commissions(activity_id,commission_id) select v_id,x from (select distinct unnest(coalesce(p_commission_ids,array[]::uuid[])) x) s;
  insert into public.activity_versions(activity_id,version,snapshot,actor) values(v_id,v_version,public.activity_snapshot(v_id),auth.uid());
  return v_id;
end $$;
revoke execute on function public.save_activity(uuid,uuid,text,text,text,uuid,timestamp without time zone,timestamp without time zone,boolean,text,uuid,uuid[],uuid[],text,uuid,integer,text) from public, anon;
grant execute on function public.save_activity(uuid,uuid,text,text,text,uuid,timestamp without time zone,timestamp without time zone,boolean,text,uuid,uuid[],uuid[],text,uuid,integer,text) to authenticated;

create or replace function public.set_activity_status(p_activity_id uuid,p_status activity_status,p_expected_version integer)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_version integer;
begin
  if not public.can_write('agenda') then raise exception 'Sem permissão'; end if;
  select version into v_version from public.activities where id=p_activity_id for update;
  if v_version is null then raise exception 'Atividade não encontrada'; end if;
  if v_version <> p_expected_version then raise exception 'A atividade foi alterada por outra pessoa. Recarregue antes de continuar.'; end if;
  update public.activities set status=p_status,version=version+1 where id=p_activity_id returning version into v_version;
  insert into public.activity_versions(activity_id,version,snapshot,actor) values(p_activity_id,v_version,public.activity_snapshot(p_activity_id),auth.uid());
  return v_version;
end $$;
revoke execute on function public.set_activity_status(uuid,activity_status,integer) from public, anon;
grant execute on function public.set_activity_status(uuid,activity_status,integer) to authenticated;

create or replace function public.save_activity_category(p_id uuid,p_edition_id uuid,p_name text,p_is_active boolean)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_slug text;
begin
  if not public.can_write('agenda') then raise exception 'Sem permissão'; end if;
  if not exists(select 1 from public.editions where id=p_edition_id) then raise exception 'Edição não encontrada'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Informe o nome da categoria'; end if;
  v_slug := trim(both '-' from regexp_replace(lower(translate(trim(p_name),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')),'[^a-z0-9]+','-','g'));
  if p_id is null then insert into public.activity_categories(edition_id,slug,name,is_active) values(p_edition_id,v_slug,trim(p_name),coalesce(p_is_active,true)) returning id into v_id;
  else update public.activity_categories set name=trim(p_name),is_active=coalesce(p_is_active,true) where id=p_id and edition_id=p_edition_id returning id into v_id; end if;
  if v_id is null then raise exception 'Categoria não encontrada'; end if; return v_id;
end $$;
revoke execute on function public.save_activity_category(uuid,uuid,text,boolean) from public, anon;
grant execute on function public.save_activity_category(uuid,uuid,text,boolean) to authenticated;

create or replace function public.save_commission(p_id uuid,p_edition_id uuid,p_name text,p_is_active boolean,p_is_coordinating boolean)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_slug text;
begin
  if not public.can_write('agenda') then raise exception 'Sem permissão'; end if;
  if not exists(select 1 from public.editions where id=p_edition_id) then raise exception 'Edição não encontrada'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Informe o nome da comissão'; end if;
  v_slug := trim(both '-' from regexp_replace(lower(translate(trim(p_name),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')),'[^a-z0-9]+','-','g'));
  if p_id is null then insert into public.commissions(edition_id,slug,name,is_active,is_coordinating) values(p_edition_id,v_slug,trim(p_name),coalesce(p_is_active,true),coalesce(p_is_coordinating,false)) returning id into v_id;
  else update public.commissions set name=trim(p_name),is_active=coalesce(p_is_active,true),is_coordinating=coalesce(p_is_coordinating,false) where id=p_id and edition_id=p_edition_id returning id into v_id; end if;
  if v_id is null then raise exception 'Comissão não encontrada'; end if; return v_id;
end $$;
revoke execute on function public.save_commission(uuid,uuid,text,boolean,boolean) from public, anon;
grant execute on function public.save_commission(uuid,uuid,text,boolean,boolean) to authenticated;

insert into public.activity_categories(edition_id,slug,name,is_active,source,verified_on)
select e.id,v.slug,v.name,true,'Taxonomia de referência aprovada para a Agenda Indumóveis','2026-10-06'::date from public.editions e cross join (values
 ('governanca-gestao','Governança e Gestão'),('programacao-eventos','Programação e Eventos'),('infraestrutura-operacoes','Infraestrutura e Operações'),('logistica-mobilidade','Logística e Mobilidade'),('comunicacao-marketing','Comunicação e Marketing'),('comercial-patrocinios','Comercial e Patrocínios'),('cerimonial-protocolo','Cerimonial e Protocolo'),('relacoes-institucionais-representacoes','Relações Institucionais e Representações'),('financeiro-administrativo','Financeiro e Administrativo'),('tecnologia-sistemas','Tecnologia e Sistemas')) v(slug,name) where e.year=2027 on conflict (edition_id,slug) do nothing;

insert into public.commissions(edition_id,slug,name,is_active,is_coordinating,source_url,verified_on)
select e.id,v.slug,v.name,true,v.coordinating,v.source,'2026-10-06'::date from public.editions e cross join (values
 ('imprensa','Comissão de Imprensa',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('marketing-divulgacao','Comissão de Marketing e Divulgação',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('comercializacao','Comissão de Comercialização',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('infraestrutura','Comissão de Infraestrutura',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('captacao-recursos','Comissão de Captação de Recursos',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('credenciamento','Comissão de Credenciamento',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('espaco-mao-na-massa','Comissão do Espaço Mão na Massa',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('recepcao','Comissão de Recepção',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('logistica-suprimentos','Comissão de Logística e Suprimentos',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('concurso-design-indumoveis','Comissão Concurso de Design Indumóveis',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('salao-imoveis','Comissão Salão de Imóveis',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('mostra-arq-design','Comissão Mostra Arq&Design',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('juridica','Comissão Jurídica',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('inovacao','Comissão Inovação',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('eventos','Comissão de Eventos',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('servicos','Comissão de Serviços',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('seguranca','Comissão de Segurança',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('ppci','Comissão de PPCI',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('acolhimento-voluntariado','Comissão de Acolhimento e Voluntariado',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('tecnologia-informatica','Comissão de Tecnologia e Informática',false,'https://www.indumoveis.com.br/comissao-voluntaria'),('arquitetura-ambientacao-parque','Comissão de Arquitetura e Ambientação do Parque',false,'https://www.indumoveis.com.br/canal/indumoveis-2027-intensifica-preparativos-e-tera-lancamento-oficial-em-julho'),('central','Comissão Central',true,'https://www.indumoveis.com.br/canal/indumoveis-2027-intensifica-preparativos-e-tera-lancamento-oficial-em-julho')) v(slug,name,coordinating,source) where e.year=2027 on conflict (edition_id,slug) do nothing;