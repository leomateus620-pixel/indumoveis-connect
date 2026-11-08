"""Produce the versioned SQL seed from the reviewed PDF-point geometry.
Run only before a revision is applied. Applied revisions are immutable.
"""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
plan = json.loads((ROOT / 'src/features/pavilion-interior/plan.generated.json').read_text())
assert plan['revision'] == 1
assert len([e for e in plan['environments'] if e['kind'] == 'commercial']) == 14
assert [e['code'] for e in plan['environments'] if any(p['kind']=='external' for p in e['parts'])] == ['04','05','08','09','12']
base=(ROOT/'supabase/migrations/20261108180000_pavilion_interior_domain.sql').read_text()
rpc=base[base.index('create or replace function public.get_pavilion_interior('):base.index('create or replace function public.get_pavilion_interior_commercial(')]
rpc=rpc.replace("'coordinateSystem',r.coordinate_system,", "'coordinateSystem',r.coordinate_system,'source',r.source_document,")
rpc=rpc.replace("'path',a.path,'label',a.label", "'path',a.path,'strokeWidth',a.stroke_width,'label',a.label")
rpc=rpc.replace(' order by a.id)', ' order by a.display_order,a.id)')
rpc=rpc.replace(' order by p.kind,p.id)', " order by case p.kind when 'interior' then 0 else 1 end,p.id)")
header='''-- Reviewed Mostra ARQ & Design plan. Source geometry is independent of official m².
-- Exactly one active edition must exist; this migration never writes historical editions.
begin;
alter table public.pavilion_plan_revisions add column if not exists source_document jsonb not null default '{}'::jsonb;
alter table public.pavilion_architecture_elements add column if not exists stroke_width numeric;
alter table public.pavilion_architecture_elements add column if not exists display_order integer not null default 0;
'''
seed=r'''
-- Reconciliation uses edition + Pavilhão 1 identity + environment code, never a bare "01".
do $seed$
declare payload jsonb := $plan$PAYLOAD$plan$::jsonb;
  ed uuid; fp uuid; rev uuid; env jsonb; part jsonb; element jsonb; env_index integer:=0; element_index integer:=0;
  space uuid; candidate_ids uuid[]; payload_hash text; existing_hash text; canonical_sector text:='Pavilhão 1 — Mostra ARQ & Design';
begin
  perform pg_advisory_xact_lock(hashtextextended('pavilion-1-interior-seed',0));
  if (select count(*) from public.editions where is_active)<>1 then raise exception 'Selecione exatamente uma edição ativa antes de instalar a planta.'; end if;
  select id into ed from public.editions where is_active for update;
  payload_hash:=encode(extensions.digest(payload::text,'sha256'),'hex');
  select id,payload_sha256 into rev,existing_hash from public.pavilion_plan_revisions
    where edition_id=ed and pavilion_number=1 and revision=(payload->>'revision')::integer;
  if found then
    if existing_hash<>payload_hash then raise exception 'A revisão 1 já existe com outra geometria. Crie uma nova revisão.'; end if;
    return;
  end if;
  insert into public.floor_plans(edition_id,name,storage_path,pavilion_number,source_uri)
    values(ed,'Pavilhão 1 — Mostra ARQ & Design',null,1,'repository:docs/references/pavilion-1/mostra-arq-design.pdf')
    on conflict(edition_id,pavilion_number) where pavilion_number is not null do nothing;
  select id into fp from public.floor_plans where edition_id=ed and pavilion_number=1 for update;
  insert into public.pavilion_plan_revisions(edition_id,floor_plan_id,pavilion_number,stable_id,revision,
    source_name,source_sha256,payload_sha256,coordinate_system,bounds,source_document,is_current)
    values(ed,fp,1,payload->>'id',(payload->>'revision')::integer,payload->'source'->>'document',payload->'source'->>'sha256',payload_hash,
      jsonb_build_object('units','PDF points','origin','top-left','x','right','y','down','metricScale',null),payload->'bounds',payload->'source',false)
    returning id into rev;
  for env in select value from jsonb_array_elements(payload->'environments') loop
    space:=null;
    if env->>'kind'='commercial' then
      select array_agg(s.id order by s.id) into candidate_ids from public.spaces s where s.edition_id=ed
        and (s.floor_plan_id=fp or s.sector=canonical_sector)
        and s.code in (env->>'code',((env->>'code')::integer)::text,'P1-'||(env->>'code'));
      if coalesce(cardinality(candidate_ids),0)>1 then raise exception 'Reconciliação ambígua para o espaço % do Pavilhão 1.',env->>'code'; end if;
      space:=candidate_ids[1];
      if space is null then
        if exists(select 1 from public.spaces where edition_id=ed and code='P1-'||(env->>'code')) then
          raise exception 'O código P1-% já pertence a outra identidade comercial.',env->>'code';
        end if;
        insert into public.spaces(edition_id,code,sector,area_m2,floor_plan_id,is_demo)
          values(ed,'P1-'||(env->>'code'),canonical_sector,(env->>'declaredAreaM2')::numeric,fp,false) returning id into space;
      end if;
      -- Existing prices, blocked state, contracts, deals, area and identity remain untouched.
    end if;
    insert into public.pavilion_environments(edition_id,id,pavilion_number,code,kind,space_id)
      values(ed,env->>'id',1,env->>'code',env->>'kind',space) on conflict(edition_id,id) do nothing;
    if not exists(select 1 from public.pavilion_environments e where e.edition_id=ed and e.id=env->>'id' and
      e.pavilion_number=1 and e.code=env->>'code' and e.kind=env->>'kind' and e.space_id is not distinct from space) then
      raise exception 'Identidade de ambiente conflitante: %.',env->>'code';
    end if;
    insert into public.pavilion_environment_revisions(edition_id,revision_id,environment_id,name,declared_area_m2,function_label,label,display_order)
      values(ed,rev,env->>'id',env->>'name',(env->>'declaredAreaM2')::numeric,env->>'functionLabel',env->'label',env_index);
    env_index:=env_index+1;
    for part in select value from jsonb_array_elements(env->'parts') loop
      insert into public.pavilion_environment_parts(id,edition_id,revision_id,environment_id,kind,path,polygon)
        values(part->>'id',ed,rev,env->>'id',part->>'kind',part->>'path',part->'polygon');
    end loop;
  end loop;
  for element in select value from jsonb_array_elements(payload->'architecture') loop
    insert into public.pavilion_architecture_elements(id,edition_id,revision_id,kind,path,label,label_at,stroke_width,display_order)
      values(element->>'id',ed,rev,element->>'kind',element->>'path',element->>'label',element->'labelAt',(element->>'strokeWidth')::numeric,element_index);
    element_index:=element_index+1;
  end loop;
  if (select count(*) from public.pavilion_environments where edition_id=ed and pavilion_number=1 and kind='commercial')<>14
    or (select count(*) from public.pavilion_environment_parts where revision_id=rev and kind='external')<>5
    or (select count(*) from public.pavilion_environment_revisions v join public.pavilion_environments e on e.edition_id=v.edition_id and e.id=v.environment_id where v.revision_id=rev and e.code ~ '^[0-9]{2}$')<>15 then
    raise exception 'A revisão deve conter 15 espaços numerados, 14 comerciais e cinco extensões.';
  end if;
  update public.pavilion_plan_revisions set is_current=false where edition_id=ed and pavilion_number=1 and is_current;
  update public.pavilion_plan_revisions set is_current=true where id=rev;
end $seed$;
commit;
'''.replace('PAYLOAD',json.dumps(plan,ensure_ascii=False,separators=(',',':')))
(ROOT/'supabase/migrations/20261108181000_pavilion_1_mostra_seed.sql').write_text(header+rpc+seed)
print('Versioned seed generated.')
