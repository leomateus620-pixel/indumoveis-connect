"""Build the Pavilhão 12 SQL migration from the reviewed vector plan."""

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PLAN_FILE = ROOT / "src/features/pavilion-interior/pavilion12.generated.json"
MIGRATION = ROOT / "supabase/migrations/20261109002800_pavilion_12_moveis_seriados_seed.sql"
SOURCE_SHA256 = "f933d506774daf59c7cdd2749bea6eafd3784de10f2a99a814abf76e2db96c37"
CODES = {str(code) for code in range(1, 255)}


SQL = r'''-- Pavilhão 12, Móveis Seriados, extracted from the documented revision 07 plan.
-- The 1,650 m² total belongs to the pavilion. The source declares no individual lot areas.
begin;

do $seed$
declare
  payload jsonb := $plan$__PLAN__$plan$::jsonb;
  edition uuid;
  plan_id uuid;
  new_revision_id uuid;
  revision_number integer := (payload->>'revision')::integer;
  payload_hash text := encode(extensions.digest(payload::text,'sha256'),'hex');
  existing_hash text;
  environment jsonb;
  part jsonb;
  element jsonb;
  environment_index integer := 0;
  element_index integer := 0;
  lot_code text;
  stock_id uuid;
  candidate_ids uuid[];
  conflicting_plan boolean;
  sector_name constant text := 'Pavilhão 12 — Móveis Seriados';
  aliases constant text[] := array[
    lower(sector_name), 'pavilhão 12', 'pavilhao 12', 'p12',
    'móveis seriados', 'moveis seriados', 'pavilhão 12 · móveis seriados'
  ];
begin
  perform pg_advisory_xact_lock(hashtextextended('pavilion-12-interior-seed',0));
  if (select count(*) from public.editions where is_active) <> 1 then
    raise exception 'Selecione exatamente uma edição ativa antes de instalar a planta.';
  end if;
  -- Match the stock reconciliation lock order used for Pavilhão 8.
  lock table public.spaces in share row exclusive mode;
  select id into strict edition from public.editions where is_active for update;

  select r.id,r.payload_sha256 into new_revision_id,existing_hash
  from public.pavilion_plan_revisions r
  where r.edition_id=edition and r.pavilion_number=12 and r.revision=revision_number;
  if found then
    if existing_hash <> payload_hash then
      raise exception 'A revisão % do Pavilhão 12 já existe com outra geometria.',revision_number;
    end if;
    return;
  end if;

  insert into public.floor_plans(edition_id,name,storage_path,pavilion_number,source_uri)
    values(edition,sector_name,null,12,null)
    on conflict(edition_id,pavilion_number) where pavilion_number is not null do nothing;
  select id into strict plan_id from public.floor_plans
    where edition_id=edition and pavilion_number=12 for update;

  insert into public.pavilion_plan_revisions(
    edition_id,floor_plan_id,pavilion_number,stable_id,revision,source_name,source_sha256,
    payload_sha256,coordinate_system,bounds,source_document,total_area_m2,is_current
  ) values(
    edition,plan_id,12,payload->>'id',revision_number,payload->'source'->>'document',
    payload->'source'->>'sha256',payload_hash,
    jsonb_build_object('units','native PDF drawing points','origin','page top-left','x','right','y','down','metricScale',null),
    payload->'bounds',payload->'source',(payload->>'totalAreaM2')::numeric,false
  ) returning id into new_revision_id;

  for environment in select value from jsonb_array_elements(payload->'environments') loop
    lot_code := environment->>'code';

    select array_agg(s.id order by s.id),coalesce(bool_or(f.pavilion_number<>12),false)
    into candidate_ids,conflicting_plan
    from public.spaces s
    left join public.floor_plans f on f.id=s.floor_plan_id and f.edition_id=s.edition_id
    where s.edition_id=edition and (
      btrim(s.code) ~* ('^p12[-_.[:space:]]+0*'||lot_code||'$') or (
        (f.pavilion_number=12 or lower(btrim(s.sector))=any(aliases) or lower(btrim(f.name))=any(aliases))
        and btrim(s.code) ~ ('^0*'||lot_code||'$')
      )
    );
    if conflicting_plan or coalesce(cardinality(candidate_ids),0)>1 then
      raise exception 'Reconciliação ambígua para o lote % do Pavilhão 12.',lot_code;
    end if;
    stock_id := candidate_ids[1];
    if stock_id is null then
      insert into public.spaces(edition_id,code,sector,area_m2,floor_plan_id,is_demo)
        values(edition,'P12-'||lot_code,sector_name,null,plan_id,false) returning id into stock_id;
    end if;

    -- Keep the existing stock ID and its commercial and area fields intact.
    insert into public.pavilion_environments(edition_id,id,pavilion_number,code,kind,space_id)
      values(edition,environment->>'id',12,lot_code,'commercial',stock_id)
      on conflict(edition_id,id) do nothing;
    if not exists(
      select 1 from public.pavilion_environments e
      where e.edition_id=edition and e.id=environment->>'id' and e.pavilion_number=12
        and e.code=lot_code and e.kind='commercial' and e.space_id=stock_id
    ) then
      raise exception 'Identidade de ambiente conflitante para o lote % do Pavilhão 12.',lot_code;
    end if;

    insert into public.pavilion_environment_revisions(
      edition_id,revision_id,environment_id,name,declared_area_m2,function_label,label,display_order
    ) values(
      edition,new_revision_id,environment->>'id',environment->>'name',null,
      environment->>'functionLabel',environment->'label',environment_index
    );
    environment_index := environment_index+1;
    for part in select value from jsonb_array_elements(environment->'parts') loop
      insert into public.pavilion_environment_parts(id,edition_id,revision_id,environment_id,kind,path,polygon)
        values(part->>'id',edition,new_revision_id,environment->>'id',part->>'kind',part->>'path',part->'polygon');
    end loop;
  end loop;

  for element in select value from jsonb_array_elements(payload->'architecture') loop
    insert into public.pavilion_architecture_elements(id,edition_id,revision_id,kind,path,label,label_at,stroke_width,display_order)
      values(element->>'id',edition,new_revision_id,element->>'kind',element->>'path',element->>'label',
        element->'labelAt',(element->>'strokeWidth')::numeric,element_index);
    element_index := element_index+1;
  end loop;

  if environment_index<>254
    or (select count(*) from public.pavilion_environments e
      where e.edition_id=edition and e.pavilion_number=12 and e.kind='commercial')<>254
    or (select count(*) from public.pavilion_environment_parts p
      where p.revision_id=new_revision_id and p.kind='interior' and p.polygon is not null)<>254
    or exists(select 1 from public.pavilion_environment_parts p
      where p.revision_id=new_revision_id and p.kind<>'interior') then
    raise exception 'O Pavilhão 12 exige 254 lotes com polígonos interiores individuais.';
  end if;
  update public.pavilion_plan_revisions r set is_current=false
    where r.edition_id=edition and r.pavilion_number=12 and r.is_current;
  update public.pavilion_plan_revisions r set is_current=true where r.id=new_revision_id;
end $seed$;

commit;
'''


def compact_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def readable_payload(plan):
    """Keep each vector item on its own line in the self-contained migration."""
    fields = []
    for key, value in plan.items():
        if key in ("environments", "architecture"):
            encoded = "[\n" + ",\n".join(compact_json(item) for item in value) + "\n]"
        else:
            encoded = compact_json(value)
        fields.append(f"{compact_json(key)}:{encoded}")
    return "{\n" + ",\n".join(fields) + "\n}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="check the stored SQL instead of writing")
    parser.add_argument("--source-pdf", type=Path, help="verify a local copy of the original PDF")
    args = parser.parse_args()
    plan = json.loads(PLAN_FILE.read_text(encoding="utf-8"))
    assert (plan["id"], plan["pavilionNumber"], plan["revision"], plan["totalAreaM2"]) == (
        "indumoveis:pavilion:12:moveis-seriados", 12, 1, 1650,
    )
    assert plan["source"]["sha256"] == SOURCE_SHA256
    if args.source_pdf:
        assert hashlib.sha256(args.source_pdf.read_bytes()).hexdigest() == SOURCE_SHA256
    assert len(plan["environments"]) == len(CODES)
    assert {env["code"] for env in plan["environments"]} == CODES
    for env in plan["environments"]:
        code = env["code"]
        assert env["id"] == f"indumoveis:pavilion:12:environment:{code}"
        assert env["kind"] == "commercial" and env["declaredAreaM2"] is None
        assert env["name"] == f"Lote {code}"
        assert len(env["parts"]) == 1
        part = env["parts"][0]
        assert part["id"] == f"{code}:interior" and part["kind"] == "interior"
        assert len(part["polygon"]) >= 4 and part["polygon"][0] == part["polygon"][-1]

    payload = readable_payload(plan)
    assert "$plan$" not in payload and "$seed$" not in payload
    sql = SQL.replace("__PLAN__", payload)
    if args.check:
        if not MIGRATION.exists() or MIGRATION.read_text(encoding="utf-8") != sql:
            parser.exit(1, "Pavilhão 12 SQL differs from the reviewed fixture.\n")
    else:
        MIGRATION.write_text(sql, encoding="utf-8")


if __name__ == "__main__":
    main()
