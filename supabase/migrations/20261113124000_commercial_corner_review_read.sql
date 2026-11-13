begin;

create or replace function public.get_commercial_corner_review(p_edition_id uuid, p_space_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $review$
declare
  observation public.commercial_external_geometry;
  latest public.commercial_corner_reviews;
begin
  if not (public.can_write('mapa') and public.can_write('comercial')) then
    raise exception 'Sem permissão para consultar a revisão de esquina.' using errcode = '42501';
  end if;
  select x.* into observation
  from public.commercial_external_space_links l
  join public.commercial_external_geometry x using (edition_id, lot_number)
  join public.editions e on e.id = l.edition_id and e.is_active
  where l.edition_id = p_edition_id and l.space_id = p_space_id;
  if not found then return null; end if;

  select * into latest from public.commercial_corner_reviews r
  where r.edition_id = observation.edition_id and r.lot_number = observation.lot_number
  order by r.revision desc limit 1;
  return jsonb_build_object(
    'lotNumber', observation.lot_number,
    'geometryId', observation.geometry_id,
    'classification', coalesce(latest.classification, observation.observed_classification),
    'revision', coalesce(latest.revision, 0),
    'source', jsonb_build_object(
      'document', observation.evidence->>'document',
      'sourceSha256', observation.source_sha256,
      'frontage', observation.evidence->>'frontage',
      'intersection', observation.evidence->'intersection',
      'envelopeSideStreet', observation.evidence->>'envelope_side_street',
      'originalEnvelopeId', observation.evidence->>'original_envelope_id',
      'basis', observation.evidence->>'classification_basis'
    ),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'revision', r.revision, 'classification', r.classification,
        'evidence', r.evidence, 'reviewedAt', r.reviewed_at
      ) order by r.revision desc)
      from public.commercial_corner_reviews r
      where r.edition_id = observation.edition_id and r.lot_number = observation.lot_number
    ), '[]'::jsonb)
  );
end $review$;
revoke all on function public.get_commercial_corner_review(uuid,uuid) from public, anon;
grant execute on function public.get_commercial_corner_review(uuid,uuid) to authenticated;

commit;
