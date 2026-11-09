"""Reproduce the immutable Pavilhão 13 SQL seed from its reviewed schematic geometry.
No company names, reservations, prices or inferred areas are imported.
"""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
plan=json.loads((ROOT/'src/features/pavilion-interior/pavilion13.generated.json').read_text())
assert plan['pavilionNumber']==13 and isinstance(plan['revision'],int) and plan['revision']>0
commercial=[e for e in plan['environments'] if e['kind']=='commercial']
assert len(commercial)==80
assert {e['code'] for e in commercial}=={str(i).zfill(2) for i in range(1,81)}
assert all(e['declaredAreaM2'] is None for e in plan['environments'])
assert not any(p['kind']=='external' for e in plan['environments'] for p in e['parts'])
assert 'RESERVADO' not in json.dumps(plan,ensure_ascii=False).upper()
header='''-- Pavilhão 13, Salão de Imóveis: 80 equal schematic lots, not surveyed dimensions.
-- The documentary total belongs only in technical documentation, never in this payload.
-- New individual areas remain NULL. Existing commercial records are not rewritten.
begin;
'''
seed=r'''
do $seed$
declare payload jsonb := $plan$PAYLOAD$plan$::jsonb;
  ed uuid; fp uuid; rev uuid; env jsonb; part jsonb; element jsonb; env_index integer:=0; element_index integer:=0;
  space uuid; candidate_ids uuid[]; existing_area numeric; payload_hash text; existing_hash text;
  canonical_sector text:='Pavilhão 13 — Salão de Imóveis';
begin
  perform pg_advisory_xact_lock(hashtextextended('pavilion-13-interior-seed',0));
  if (select count(*) from public.editions where is_active)<>1 then raise exception 'Selecione exatamente uma edição ativa antes de instalar a planta.'; end if;
  select id into ed from public.editions where is_active for update;
  payload_hash:=encode(extensions.digest(payload::text,'sha256'),'hex');
  select id,payload_sha256 into rev,existing_hash from public.pavilion_plan_revisions
    where edition_id=ed and pavilion_number=13 and revision=(payload->>'revision')::integer;
  if found then
    if existing_hash<>payload_hash then raise exception 'A revisão % do Pavilhão 13 já existe com outra geometria. Crie uma nova revisão.',payload->>'revision'; end if;
    return;
  end if;
  insert into public.floor_plans(edition_id,name,storage_path,pavilion_number,source_uri)
    values(ed,canonical_sector,null,13,'repository:docs/references/pavilion-13/salao-imoveis-rev07.pdf')
    on conflict(edition_id,pavilion_number) where pavilion_number is not null do nothing;
  select id into fp from public.floor_plans where edition_id=ed and pavilion_number=13 for update;
  insert into public.pavilion_plan_revisions(edition_id,floor_plan_id,pavilion_number,stable_id,revision,
    source_name,source_sha256,payload_sha256,coordinate_system,bounds,source_document,is_current)
    values(ed,fp,13,payload->>'id',(payload->>'revision')::integer,payload->'source'->>'document',payload->'source'->>'sha256',payload_hash,
      jsonb_build_object('units','schematic drawing units','origin','top-left','x','right','y','down','metricScale',null),payload->'bounds',payload->'source',false)
    returning id into rev;
  for env in select value from jsonb_array_elements(payload->'environments') loop
    space:=null; existing_area:=null;
    if env->>'kind'='commercial' then
      -- A bare code 01 is not an identity: edition and P13 namespace/sector/plan
      -- must also match. Conflicting or ambiguous existing identities abort atomically.
      select array_agg(s.id order by s.id) into candidate_ids from public.spaces s
        left join public.floor_plans f on f.id=s.floor_plan_id and f.edition_id=s.edition_id
        where s.edition_id=ed and (
          (s.code='P13-'||(env->>'code') and (f.pavilion_number is null or f.pavilion_number=13)) or
          ((f.pavilion_number=13 or s.sector in(canonical_sector,'Pavilhão 13','Salão de Imóveis','P13'))
           and s.code in(env->>'code',((env->>'code')::integer)::text,'P13-'||(env->>'code')))
        );
      if coalesce(cardinality(candidate_ids),0)>1 then raise exception 'Reconciliação ambígua para o lote % do Pavilhão 13.',env->>'code'; end if;
      space:=candidate_ids[1];
      if space is null then
        if exists(select 1 from public.spaces where edition_id=ed and code='P13-'||(env->>'code')) then
          raise exception 'O código P13-% já pertence a outro pavilhão.',env->>'code';
        end if;
        insert into public.spaces(edition_id,code,sector,area_m2,floor_plan_id,is_demo)
          values(ed,'P13-'||(env->>'code'),canonical_sector,null,fp,false) returning id into space;
      else
        select area_m2 into existing_area from public.spaces where id=space;
      end if;
      -- No UPDATE of spaces: existing areas, prices, blocked state, identity,
      -- floor-plan links, negotiations and contracts remain intact.
    end if;
    insert into public.pavilion_environments(edition_id,id,pavilion_number,code,kind,space_id)
      values(ed,env->>'id',13,env->>'code',env->>'kind',space) on conflict(edition_id,id) do nothing;
    if not exists(select 1 from public.pavilion_environments e where e.edition_id=ed and e.id=env->>'id' and
      e.pavilion_number=13 and e.code=env->>'code' and e.kind=env->>'kind' and e.space_id is not distinct from space) then
      raise exception 'Identidade de ambiente conflitante: %.',env->>'code';
    end if;
    insert into public.pavilion_environment_revisions(edition_id,revision_id,environment_id,name,declared_area_m2,function_label,label,display_order)
      values(ed,rev,env->>'id',env->>'name',case when existing_area>0 then existing_area else null end,env->>'functionLabel',env->'label',env_index);
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
  if (select count(*) from public.pavilion_environments where edition_id=ed and pavilion_number=13 and kind='commercial')<>80
    or exists(select 1 from public.pavilion_environment_parts where revision_id=rev and kind='external')
    or (select count(*) from public.pavilion_environment_revisions v join public.pavilion_environments e on e.edition_id=v.edition_id and e.id=v.environment_id where v.revision_id=rev and e.code ~ '^[0-9]{2}$')<>80 then
    raise exception 'O Pavilhão 13 deve conter exatamente 80 lotes comerciais e nenhuma extensão externa.';
  end if;
  update public.pavilion_plan_revisions set is_current=false where edition_id=ed and pavilion_number=13 and is_current;
  update public.pavilion_plan_revisions set is_current=true where id=rev;
end $seed$;
commit;
'''.replace('PAYLOAD',json.dumps(plan,ensure_ascii=False,separators=(',',':')))
output='20261108231000_pavilion_13_salao_imoveis_seed.sql' if plan['revision']==1 else f"20261108232000_pavilion_13_lot_names_revision{plan['revision']}.sql"
(ROOT/'supabase/migrations'/output).write_text(header+seed)
print('Pavilhão 13 immutable seed generated.')
