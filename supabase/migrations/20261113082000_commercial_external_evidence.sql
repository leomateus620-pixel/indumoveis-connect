begin;

do $external$
declare
  target_edition uuid;
  source_hash constant text := '5f00945cc6ed5af18cbfc83be5334cd4a17850f6d9e356203268f197a50d35d0';
begin
  select p.edition_id into strict target_edition
  from public.commercial_pricing_policies p join public.editions e on e.id = p.edition_id
  where e.is_active and p.version = 1
    and p.source_sha256 = 'a88df5c19bafc242704e58eb1b46bb7c721254573a52a63b2e5e777028734b5c';

  -- Record the individual codes and their documentary footprint. Where an
  -- envelope touches a crossing, the exact corner member awaits a revised plan.
  with corners(lot_number, streets) as (values
    (1, array['Rua Argentina','Alameda Mercosul']),
    (8, array['Rua Argentina','Rua Montevidéu']),
    (14, array['Rua Argentina','Rua Brasília']),
    (15, array['Rua Uruguai','Alameda Mercosul']),
    (22, array['Rua Uruguai','Rua Montevidéu']),
    (23, array['Rua Uruguai','Rua Montevidéu']),
    (28, array['Rua Uruguai','Rua Brasília']),
    (29, array['Rua Uruguai','Alameda Mercosul']),
    (51, array['Rua Brasil','Rua Montevidéu']),
    (56, array['Rua Brasil','Rua Brasília']),
    (57, array['Rua Brasil','Alameda Mercosul']),
    (58, array['Rua Brasil','Alameda Mercosul']),
    (65, array['Rua Brasil','Rua Montevidéu']),
    (66, array['Rua Brasil','Rua Montevidéu'])
  ), envelopes(suffix, members, side_street) as (values
    ('09-10', array[9,10], 'Rua Montevidéu'),
    ('31-32-33-34', array[31,32,33,34], null),
    ('35-36-49-50', array[35,36,49,50], 'Rua Montevidéu'),
    ('37-38', array[37,38], 'Rua Montevidéu'),
    ('39-40', array[39,40], null),
    ('41-42', array[41,42], 'Rua Brasília'),
    ('43-44', array[43,44], 'Alameda Mercosul')
  ), shapes as (
    select n.lot_number, c.streets as intersection, e.suffix, e.side_street,
      case
        when n.lot_number between 1 and 14 then 'Rua Argentina'
        when n.lot_number between 15 and 42 then 'Rua Uruguai'
        else 'Rua Brasil'
      end as frontage,
      case
        when n.lot_number = 57 then 'O'
        when n.lot_number between 58 and 65 then 'L'
        when n.lot_number between 66 and 68 then 'F'
        when n.lot_number between 29 and 36 or n.lot_number between 43 and 50 then 'J'
        when n.lot_number between 37 and 42 or n.lot_number between 51 and 56 then 'E'
        when n.lot_number between 1 and 8 or n.lot_number between 15 and 22 then 'I'
        else 'D'
      end as block
    from generate_series(1,68) n(lot_number)
    left join corners c using (lot_number)
    left join envelopes e on n.lot_number = any(e.members)
  )
  insert into public.commercial_external_geometry(
    edition_id, lot_number, geometry_id, source_sha256, declared_area_m2, observed_classification, evidence
  )
  select target_edition, lot_number,
    'indumoveis:external:lot:' || lpad(lot_number::text, 2, '0'), source_hash,
    case
      when lot_number in (14,28) then 243
      when lot_number <= 28 then 203
      else 227
    end,
    case when intersection is not null then 'corner' when side_street is not null then 'pending' else 'regular' end,
    jsonb_build_object(
      'document', 'V1 - Mapa parque Externo (10).pdf',
      'page', 1,
      'a2_reference', 'docs/validation/park-registration-2026-11-02/park-correspondence.md',
      'block', block,
      'original_envelope_id', case when suffix is not null then 'indumoveis:external:lot:' || suffix end,
      'frontage', frontage,
      'intersection', intersection,
      'envelope_side_street', side_street,
      'classification_basis', case
        when intersection is not null then 'O lote individual ocupa o encontro das duas vias no contorno da quadra.'
        when side_street is not null then 'O envelope original chega ao encontro das vias. A divisão desenhada individualiza a seleção e a frente de esquina aguarda confirmação.'
        when suffix is not null then 'O envelope original inteiro tem frente para uma só via.'
        else 'O lote individual ocupa trecho de frente sem encontro de duas vias.'
      end,
      'area_basis', case
        when lot_number = 57 then 'Área de 227 m² confirmada pelo solicitante da evolução comercial em 13/11/2026.'
        when lot_number in (14,28) then 'Anotação de 243 m² no lote.'
        when suffix is not null then 'Área do módulo declarada na faixa do PDF e confirmada para os módulos individualizados da mesma quadra em 13/11/2026.'
        when lot_number <= 28 then 'Área de 203 m² declarada para o módulo da faixa.'
        else 'Área de 227 m² declarada para o módulo da faixa.'
      end
    )
  from shapes
  on conflict (edition_id, lot_number) do nothing;

  if (select count(*) from public.commercial_external_geometry
    where edition_id = target_edition and source_sha256 = source_hash) <> 68 then
    raise exception 'As observações externas não correspondem à implantação documental.';
  end if;
end $external$;

commit;
