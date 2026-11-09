-- Pavilhão 8, Fornecedores e Construção Civil: seven spaces extracted from the plan.
-- Only the pavilion total is documented. The geometry does not establish lot areas.
begin;

do $seed$
declare
  payload jsonb := $plan${"id":"indumoveis:pavilion:8:fornecedores-construcao-civil","revision":1,"pavilionNumber":8,"totalAreaM2":937.32,"bounds":{"minX":67,"minY":78,"maxX":528,"maxY":814},"source":{"revisionName":"pavilhao-08-rev02-2025-11-14","document":"Pav 08 - 02 - 14.11.25.pdf","page":1,"sha256":"63e3762f7d20b34359f451da1cac63ad7e03327496695106dff4b9c11e239767","pageWidth":595.276,"pageHeight":841.89,"coordinateSystem":"Native PDF drawing points; origin page top-left; x right; y down; no metric conversion"},"environments":[{"id":"indumoveis:pavilion:8:environment:01","code":"01","name":"Lote 01","kind":"commercial","declaredAreaM2":null,"label":[153.589,614.771],"parts":[{"id":"01:interior","kind":"interior","path":"M90.293 488.210 L230.998 488.210 L230.998 615.214 L165.351 767.198 L90.293 767.198 Z","polygon":[[90.293,488.21],[230.998,488.21],[230.998,615.214],[165.351,767.198],[90.293,767.198],[90.293,488.21]]}]},{"id":"indumoveis:pavilion:8:environment:03","code":"03","name":"Lote 03","kind":"commercial","declaredAreaM2":null,"label":[160.645,316.788],"parts":[{"id":"03:interior","kind":"interior","path":"M90.293 240.002 L230.998 240.002 L230.998 393.574 L90.293 393.574 Z","polygon":[[90.293,240.002],[230.998,240.002],[230.998,393.574],[90.293,393.574],[90.293,240.002]]}]},{"id":"indumoveis:pavilion:8:environment:04","code":"04","name":"Lote 04","kind":"commercial","declaredAreaM2":null,"label":[160.645,174.336],"parts":[{"id":"04:interior","kind":"interior","path":"M90.293 108.670 L230.998 108.670 L230.998 240.002 L90.293 240.002 Z","polygon":[[90.293,108.67],[230.998,108.67],[230.998,240.002],[90.293,240.002],[90.293,108.67]]}]},{"id":"indumoveis:pavilion:8:environment:05","code":"05","name":"Lote 05","kind":"commercial","declaredAreaM2":null,"label":[434.549,224.357],"parts":[{"id":"05:interior","kind":"interior","path":"M364.197 152.380 L504.901 152.380 L504.901 296.335 L364.197 296.335 Z","polygon":[[364.197,152.38],[504.901,152.38],[504.901,296.335],[364.197,296.335],[364.197,152.38]]}]},{"id":"indumoveis:pavilion:8:environment:06","code":"06","name":"Lote 06","kind":"commercial","declaredAreaM2":null,"label":[434.549,497.673],"parts":[{"id":"06:interior","kind":"interior","path":"M364.197 382.017 L504.901 382.017 L504.901 613.329 L364.197 613.329 Z","polygon":[[364.197,382.017],[504.901,382.017],[504.901,613.329],[364.197,613.329],[364.197,382.017]]}]},{"id":"indumoveis:pavilion:8:environment:07","code":"07","name":"Lote 07","kind":"commercial","declaredAreaM2":null,"label":[449.304,682.455],"parts":[{"id":"07:interior","kind":"interior","path":"M364.197 613.329 L504.901 613.329 L504.901 767.198 L429.883 767.198 Z","polygon":[[364.197,613.329],[504.901,613.329],[504.901,767.198],[429.883,767.198],[364.197,613.329]]}]},{"id":"indumoveis:pavilion:8:environment:08","code":"08","name":"Lote 08","kind":"commercial","declaredAreaM2":null,"label":[297.598,726.63],"parts":[{"id":"08:interior","kind":"interior","path":"M274.049 671.696 L321.146 671.696 L359.881 767.198 L235.314 767.198 Z","polygon":[[274.049,671.696],[321.146,671.696],[359.881,767.198],[235.314,767.198],[274.049,671.696]]}]}],"architecture":[{"id":"p8:perimeter","kind":"wall","path":"M465.423 106.804 L87.493 106.804 L87.493 393.574 M87.493 488.210 L87.493 769.084 L165.351 769.084 M235.314 769.084 L359.881 769.084 M429.883 769.084 L507.741 769.084 L507.741 382.017 M507.741 296.335 L507.741 106.804","strokeWidth":1.4},{"id":"p8:main-entrance","kind":"access","path":"M200.333 789.084 L200.333 776.084 M196.823 780.244 L200.333 776.084 L203.843 780.244 M394.882 789.084 L394.882 776.084 M391.372 780.244 L394.882 776.084 L398.392 780.244","label":"Entrada do pavilhão","labelAt":[297.597,803],"strokeWidth":1.15},{"id":"p8:rear-exit","kind":"access","path":"M486.582 113.804 L486.582 99.804 M482.802 104.284 L486.582 99.804 L490.362 104.284","label":"Saída dos fundos","labelAt":[434.549,133],"strokeWidth":1.15},{"id":"p8:rear-label","kind":"access","path":"M290.597 95.000 L304.597 95.000","label":"Fundos do pavilhão","labelAt":[297.597,89],"strokeWidth":0.8},{"id":"p8:left-passage","kind":"access","path":"M76.493 440.892 L96.493 440.892 M90.093 435.492 L96.493 440.892 L90.093 446.292","strokeWidth":1.15},{"id":"p8:right-passage","kind":"access","path":"M518.741 339.176 L498.741 339.176 M505.141 344.576 L498.741 339.176 L505.141 333.776","strokeWidth":1.15}]}$plan$::jsonb;
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
  legacy_code text;
  code_pattern text;
  stock_code text;
  stock_id uuid;
  candidate_ids uuid[];
  conflicting_plan boolean;
  sector_name constant text := 'Pavilhão 8 — Fornecedores e Construção Civil';
  aliases constant text[] := array[
    lower(sector_name), 'pavilhão 8', 'pavilhão 08', 'pavilhao 8', 'pavilhao 08',
    'p8', 'p08', 'fornecedores e construção civil', 'fornecedores e construcao civil',
    'pavilhão 8 · fornecedores e construção civil'
  ];
begin
  perform pg_advisory_xact_lock(hashtextextended('pavilion-8-interior-seed',0));
  if (select count(*) from public.editions where is_active) <> 1 then
    raise exception 'Selecione exatamente uma edição ativa antes de instalar a planta.';
  end if;
  -- Match stock writes' table-before-edition lock order during reconciliation.
  lock table public.spaces in share row exclusive mode;
  select id into strict edition from public.editions where is_active for update;

  select r.id,r.payload_sha256 into new_revision_id,existing_hash
  from public.pavilion_plan_revisions r
  where r.edition_id=edition and r.pavilion_number=8 and r.revision=revision_number;
  if found then
    if existing_hash <> payload_hash then
      raise exception 'A revisão % do Pavilhão 8 já existe com outra geometria.',revision_number;
    end if;
    return;
  end if;

  insert into public.floor_plans(edition_id,name,storage_path,pavilion_number,source_uri)
    values(edition,sector_name,null,8,'repository:docs/references/pavilion-8/fornecedores-construcao-civil-rev02.pdf')
    on conflict(edition_id,pavilion_number) where pavilion_number is not null do nothing;
  select id into strict plan_id from public.floor_plans
    where edition_id=edition and pavilion_number=8 for update;

  insert into public.pavilion_plan_revisions(
    edition_id,floor_plan_id,pavilion_number,stable_id,revision,source_name,source_sha256,
    payload_sha256,coordinate_system,bounds,source_document,total_area_m2,is_current
  ) values(
    edition,plan_id,8,payload->>'id',revision_number,payload->'source'->>'document',
    payload->'source'->>'sha256',payload_hash,
    jsonb_build_object('units','native PDF drawing points','origin','page top-left','x','right','y','down','metricScale',null),
    payload->'bounds',payload->'source',(payload->>'totalAreaM2')::numeric,false
  ) returning id into new_revision_id;

  for environment in select value from jsonb_array_elements(payload->'environments') loop
    lot_code := environment->>'code';
    legacy_code := (lot_code::integer)::text;
    stock_code := 'P8-'||lot_code;
    code_pattern := '^p0?8[-_.[:space:]]+0?'||legacy_code||'$';

    select array_agg(s.id order by s.id),coalesce(bool_or(f.pavilion_number<>8),false)
    into candidate_ids,conflicting_plan
    from public.spaces s
    left join public.floor_plans f on f.id=s.floor_plan_id and f.edition_id=s.edition_id
    where s.edition_id=edition and (
      btrim(s.code) ~* code_pattern or (
        (f.pavilion_number=8 or lower(btrim(s.sector))=any(aliases) or lower(btrim(f.name))=any(aliases))
        and btrim(s.code) in (lot_code,legacy_code)
      )
    );
    if conflicting_plan or coalesce(cardinality(candidate_ids),0)>1 then
      raise exception 'Reconciliação ambígua para o lote % do Pavilhão 8.',lot_code;
    end if;
    stock_id := candidate_ids[1];
    if stock_id is null then
      insert into public.spaces(edition_id,code,sector,area_m2,floor_plan_id,is_demo)
        values(edition,stock_code,sector_name,null,plan_id,false) returning id into stock_id;
    end if;

    -- The pre-existing stock row (area, deals, price, notes and plan linkage) stays intact.
    insert into public.pavilion_environments(edition_id,id,pavilion_number,code,kind,space_id)
      values(edition,environment->>'id',8,lot_code,'commercial',stock_id)
      on conflict(edition_id,id) do nothing;
    if not exists(
      select 1 from public.pavilion_environments e
      where e.edition_id=edition and e.id=environment->>'id' and e.pavilion_number=8
        and e.code=lot_code and e.kind='commercial' and e.space_id=stock_id
    ) then
      raise exception 'Identidade de ambiente conflitante para o lote % do Pavilhão 8.',lot_code;
    end if;

    insert into public.pavilion_environment_revisions(
      edition_id,revision_id,environment_id,name,declared_area_m2,label,display_order
    ) values(edition,new_revision_id,environment->>'id',environment->>'name',null,environment->'label',environment_index);
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

  if environment_index<>7 or (select count(*) from public.pavilion_environment_parts p
    where p.revision_id=new_revision_id and p.kind='interior' and p.polygon is not null)<>7 then
    raise exception 'O Pavilhão 8 exige sete lotes com polígonos individuais.';
  end if;
  update public.pavilion_plan_revisions r set is_current=false
    where r.edition_id=edition and r.pavilion_number=8 and r.is_current;
  update public.pavilion_plan_revisions r set is_current=true where r.id=new_revision_id;
end $seed$;

commit;
