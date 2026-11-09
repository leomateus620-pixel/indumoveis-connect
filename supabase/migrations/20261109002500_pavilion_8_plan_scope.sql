-- Extend the existing plan metadata and code scope for the seven documented Pavilhão 8 lots.
begin;

alter table public.pavilion_plan_revisions
  add column if not exists total_area_m2 numeric(10,2) check (total_area_m2 > 0);

alter table public.pavilion_environments
  drop constraint if exists pavilion_commercial_code_scope;
alter table public.pavilion_environments
  add constraint pavilion_commercial_code_scope check (
    kind <> 'commercial' or
    (pavilion_number = 1 and code ~ '^(0[1-9]|1[0-4])$') or
    (pavilion_number = 8 and code in ('01','03','04','05','06','07','08')) or
    (pavilion_number = 13 and code ~ '^(0[1-9]|[1-7][0-9]|80)$')
  );

-- The RPC keeps its signature, grants, edition and RLS checks. Omit unset totals.
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
    'revision',r.revision,'pavilionNumber',r.pavilion_number,'bounds',r.bounds,'coordinateSystem',r.coordinate_system,'source',r.source_document,
    'environments',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'code',e.code,'name',v.name,'kind',e.kind,
      'declaredAreaM2',v.declared_area_m2,'functionLabel',v.function_label,'label',v.label,
      'parts',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',p.id,'kind',p.kind,'path',p.path,'polygon',p.polygon)) order by case p.kind when 'interior' then 0 else 1 end,p.id)
        from public.pavilion_environment_parts p where p.revision_id=r.id and p.environment_id=e.id),'[]'::jsonb)) order by v.display_order)
      from public.pavilion_environment_revisions v join public.pavilion_environments e on e.edition_id=v.edition_id and e.id=v.environment_id where v.revision_id=r.id),'[]'::jsonb),
    'architecture',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',a.id,'kind',a.kind,'path',a.path,'strokeWidth',a.stroke_width,'label',a.label,'labelAt',a.label_at)) order by a.display_order,a.id)
      from public.pavilion_architecture_elements a where a.revision_id=r.id),'[]'::jsonb)) into result;
  if r.total_area_m2 is not null then
    result := result || jsonb_build_object('totalAreaM2', r.total_area_m2);
  end if;
  return result;
end $$;

commit;
