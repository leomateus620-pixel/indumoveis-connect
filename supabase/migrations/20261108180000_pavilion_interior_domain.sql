-- Interactive plans are revisioned separately from uploaded floor-plan files.
-- All geometry units are PDF drawing points; declared m² never come from polygon area.
begin;
alter table public.floor_plans alter column storage_path drop not null;
alter table public.floor_plans add column if not exists pavilion_number smallint;
alter table public.floor_plans add column if not exists source_uri text;
create unique index if not exists floor_plans_edition_pavilion_key on public.floor_plans(edition_id,pavilion_number) where pavilion_number is not null;
create unique index if not exists floor_plans_id_edition_key on public.floor_plans(id,edition_id);
create unique index if not exists spaces_id_edition_key on public.spaces(id,edition_id);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='spaces_floor_plan_edition_fkey') then
    alter table public.spaces add constraint spaces_floor_plan_edition_fkey foreign key(floor_plan_id,edition_id) references public.floor_plans(id,edition_id);
  end if;
end $$;

create or replace function public.pavilion_valid_point(p jsonb)
returns boolean language sql immutable set search_path=public as $$
  select coalesce(jsonb_typeof(p)='array' and jsonb_array_length(p)=2
    and jsonb_typeof(p->0)='number' and jsonb_typeof(p->1)='number'
    and abs((p->>0)::numeric)<1000000 and abs((p->>1)::numeric)<1000000,false)
$$;
create or replace function public.pavilion_valid_path(p text)
returns boolean language sql immutable set search_path=public as $$
  select coalesce(length(p) between 5 and 1000000 and p ~ '^[[:space:]]*[Mm]'
    and p !~ '[^MmLlHhVvCcSsQqTtAaZz0-9eE.,+[:space:]-]',false)
$$;
-- Polygon topology: closed, >=3 distinct vertices, finite points, nonzero area,
-- and no intersecting non-adjacent segments. Curved boundaries retain native SVG paths.
create or replace function public.pavilion_valid_polygon(p jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
declare n integer; i integer; j integer; a jsonb; b jsonb; c jsonb; d jsonb;
  ax numeric; ay numeric; bx numeric; byy numeric; cx numeric; cy numeric; dx numeric; dy numeric;
  o1 numeric; o2 numeric; o3 numeric; o4 numeric; signed_area numeric:=0;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p)<>'array' then return false; end if;
  n:=jsonb_array_length(p);
  if n<4 or p->0<>p->(n-1) then return false; end if;
  for i in 0..n-1 loop if not public.pavilion_valid_point(p->i) then return false; end if; end loop;
  for i in 0..n-2 loop
    a:=p->i; b:=p->(i+1); if a=b then return false; end if;
    ax:=(a->>0)::numeric; ay:=(a->>1)::numeric; bx:=(b->>0)::numeric; byy:=(b->>1)::numeric;
    signed_area:=signed_area+ax*byy-bx*ay;
    for j in i+2..n-2 loop
      if i=0 and j=n-2 then continue; end if;
      c:=p->j; d:=p->(j+1); cx:=(c->>0)::numeric; cy:=(c->>1)::numeric; dx:=(d->>0)::numeric; dy:=(d->>1)::numeric;
      o1:=(bx-ax)*(cy-ay)-(byy-ay)*(cx-ax); o2:=(bx-ax)*(dy-ay)-(byy-ay)*(dx-ax);
      o3:=(dx-cx)*(ay-cy)-(dy-cy)*(ax-cx); o4:=(dx-cx)*(byy-cy)-(dy-cy)*(bx-cx);
      if o1*o2<=0 and o3*o4<=0 and greatest(least(ax,bx),least(cx,dx))<=least(greatest(ax,bx),greatest(cx,dx))
        and greatest(least(ay,byy),least(cy,dy))<=least(greatest(ay,byy),greatest(cy,dy)) then return false; end if;
    end loop;
  end loop;
  return abs(signed_area)>0.0001;
exception when others then return false;
end $$;

create table if not exists public.pavilion_plan_revisions (
  id uuid primary key default gen_random_uuid(), edition_id uuid not null references public.editions(id),
  floor_plan_id uuid not null, pavilion_number smallint not null check(pavilion_number>0),
  stable_id text not null, revision integer not null check(revision>0), source_name text not null,
  source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
  payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
  coordinate_system jsonb not null check(jsonb_typeof(coordinate_system)='object'),
  bounds jsonb not null check(jsonb_typeof(bounds)='object' and
    (bounds->>'maxX')::numeric>(bounds->>'minX')::numeric and (bounds->>'maxY')::numeric>(bounds->>'minY')::numeric),
  is_current boolean not null default false, created_at timestamptz not null default now(),
  unique(id,edition_id), unique(edition_id,pavilion_number,revision),
  foreign key(floor_plan_id,edition_id) references public.floor_plans(id,edition_id)
);
create unique index if not exists pavilion_plan_current_key on public.pavilion_plan_revisions(edition_id,pavilion_number) where is_current;
create table if not exists public.pavilion_environments (
  edition_id uuid not null references public.editions(id), id text not null,
  pavilion_number smallint not null check(pavilion_number>0), code text not null,
  kind text not null check(kind in ('commercial','support','hall','circulation')),
  space_id uuid, primary key(edition_id,id), unique(edition_id,pavilion_number,code), unique(edition_id,space_id),
  foreign key(space_id,edition_id) references public.spaces(id,edition_id),
  check((kind='commercial')=(space_id is not null)),
  check(kind<>'commercial' or code ~ '^(0[1-9]|1[0-4])$')
);
create table if not exists public.pavilion_environment_revisions (
  edition_id uuid not null, revision_id uuid not null, environment_id text not null,
  name text not null, declared_area_m2 numeric(10,2) check(declared_area_m2>0),
  function_label text, label jsonb not null check(public.pavilion_valid_point(label)), display_order integer not null,
  primary key(revision_id,environment_id), unique(revision_id,environment_id,edition_id),
  foreign key(revision_id,edition_id) references public.pavilion_plan_revisions(id,edition_id),
  foreign key(edition_id,environment_id) references public.pavilion_environments(edition_id,id)
);
create table if not exists public.pavilion_environment_parts (
  id text not null, edition_id uuid not null, revision_id uuid not null, environment_id text not null,
  kind text not null check(kind in ('interior','external')), path text not null check(public.pavilion_valid_path(path)),
  polygon jsonb check(public.pavilion_valid_polygon(polygon)), primary key(revision_id,id),
  foreign key(revision_id,environment_id,edition_id) references public.pavilion_environment_revisions(revision_id,environment_id,edition_id)
);
create unique index if not exists pavilion_environment_external_key on public.pavilion_environment_parts(revision_id,environment_id) where kind='external';
create table if not exists public.pavilion_architecture_elements (
  id text not null, edition_id uuid not null, revision_id uuid not null,
  kind text not null check(kind in ('wall','door','access','guide')), path text not null check(public.pavilion_valid_path(path)),
  label text, label_at jsonb check(label_at is null or public.pavilion_valid_point(label_at)),
  primary key(revision_id,id), foreign key(revision_id,edition_id) references public.pavilion_plan_revisions(id,edition_id)
);

-- Published revisions and their geometry are append-only. Reprinting a plan requires a new revision.
create or replace function public.guard_pavilion_revision_immutable()
returns trigger language plpgsql set search_path=public as $$
begin
  if TG_TABLE_NAME='pavilion_plan_revisions' and TG_OP='UPDATE' and
    (to_jsonb(NEW)-'is_current')=(to_jsonb(OLD)-'is_current') then return NEW; end if;
  raise exception 'Uma revisão publicada é imutável; crie uma nova revisão.';
end $$;
do $$ declare t text; begin
  foreach t in array array['pavilion_plan_revisions','pavilion_environment_revisions','pavilion_environment_parts','pavilion_architecture_elements'] loop
    execute format('drop trigger if exists pavilion_revision_immutable on public.%I',t);
    execute format('create trigger pavilion_revision_immutable before update or delete on public.%I for each row execute function public.guard_pavilion_revision_immutable()',t);
  end loop;
  foreach t in array array['pavilion_plan_revisions','pavilion_environments','pavilion_environment_revisions','pavilion_environment_parts','pavilion_architecture_elements'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('drop policy if exists "map read" on public.%I',t);
    execute format('create policy "map read" on public.%I for select to authenticated using (public.can_read(''mapa''))',t);
  end loop;
end $$;

-- Direct REST and RPC readers share RLS; map-only readers receive no prices, company or deal data.
create or replace function public.get_pavilion_interior(p_edition_id uuid,p_pavilion_number integer default 1,p_revision integer default null)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare r public.pavilion_plan_revisions; result jsonb;
begin
  if not public.can_read('mapa') then raise exception 'Sem permissão para consultar o mapa.' using errcode='42501'; end if;
  if not exists(select 1 from public.editions where id=p_edition_id and is_active) then return null; end if;
  select * into r from public.pavilion_plan_revisions where edition_id=p_edition_id and pavilion_number=p_pavilion_number
    and ((p_revision is null and is_current) or revision=p_revision) order by revision desc limit 1;
  if not found then return null; end if;
  select jsonb_build_object('id',r.stable_id,'editionId',r.edition_id,'databasePlanId',r.floor_plan_id,'revisionId',r.id,
    'revision',r.revision,'pavilionNumber',r.pavilion_number,'bounds',r.bounds,'coordinateSystem',r.coordinate_system,
    'environments',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'code',e.code,'name',v.name,'kind',e.kind,
      'declaredAreaM2',v.declared_area_m2,'functionLabel',v.function_label,'label',v.label,
      'parts',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',p.id,'kind',p.kind,'path',p.path,'polygon',p.polygon)) order by p.kind,p.id)
        from public.pavilion_environment_parts p where p.revision_id=r.id and p.environment_id=e.id),'[]'::jsonb)) order by v.display_order)
      from public.pavilion_environment_revisions v join public.pavilion_environments e on e.edition_id=v.edition_id and e.id=v.environment_id where v.revision_id=r.id),'[]'::jsonb),
    'architecture',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',a.id,'kind',a.kind,'path',a.path,'label',a.label,'labelAt',a.label_at)) order by a.id)
      from public.pavilion_architecture_elements a where a.revision_id=r.id),'[]'::jsonb)) into result;
  return result;
end $$;
create or replace function public.get_pavilion_interior_commercial(p_edition_id uuid,p_floor_plan_id uuid,p_revision integer)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb;
begin
  if not public.can_read('mapa') or not public.can_read('comercial') then
    raise exception 'Sem permissão para consultar informações comerciais.' using errcode='42501'; end if;
  if not exists(select 1 from public.editions where id=p_edition_id and is_active) then return '{}'::jsonb; end if;
  select coalesce(jsonb_object_agg(e.code,jsonb_strip_nulls(jsonb_build_object('status',s.commercial_status,
      'exhibitor',case when public.can_read('empresas') then (select c.trade_name from public.deals d join public.companies c on c.id=d.company_id where d.id=s.active_deal_id) else null end))),'{}'::jsonb)
    into result from public.pavilion_plan_revisions r
    join public.pavilion_environment_revisions v on v.revision_id=r.id
    join public.pavilion_environments e on e.edition_id=v.edition_id and e.id=v.environment_id
    join public.space_status_v s on s.id=e.space_id and s.edition_id=e.edition_id
    where r.edition_id=p_edition_id and r.floor_plan_id=p_floor_plan_id and r.revision=p_revision and e.kind='commercial';
  return result;
end $$;
revoke all on function public.get_pavilion_interior(uuid,integer,integer) from public,anon;
revoke all on function public.get_pavilion_interior_commercial(uuid,uuid,integer) from public,anon;
grant execute on function public.get_pavilion_interior(uuid,integer,integer) to authenticated;
grant execute on function public.get_pavilion_interior_commercial(uuid,uuid,integer) to authenticated;
commit;
