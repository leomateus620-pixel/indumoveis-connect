begin;

do $inventory$
declare
  target_edition uuid;
  source public.commercial_external_geometry;
  existing public.spaces;
  link public.commercial_external_space_links;
  stock_id uuid;
  canonical_code text;
  canonical_sector text;
begin
  perform pg_advisory_xact_lock(hashtextextended('indumoveis-commercial-pricing-2027', 0));
  select p.edition_id into strict target_edition
  from public.commercial_pricing_policies p join public.editions e on e.id = p.edition_id
  where e.is_active and p.version = 1
    and p.source_sha256 = 'a88df5c19bafc242704e58eb1b46bb7c721254573a52a63b2e5e777028734b5c';
  lock table public.spaces in share row exclusive mode;
  lock table public.commercial_external_space_links in share row exclusive mode;

  for source in select * from public.commercial_external_geometry
    where edition_id = target_edition
      and source_sha256 = '5f00945cc6ed5af18cbfc83be5334cd4a17850f6d9e356203268f197a50d35d0'
    order by lot_number
  loop
    select * into link from public.commercial_external_space_links
    where edition_id = target_edition and lot_number = source.lot_number;
    if found then continue; end if;

    canonical_code := 'EXT-' || lpad(source.lot_number::text, 2, '0');
    canonical_sector := case when source.lot_number between 43 and 50 or source.lot_number between 58 and 65
      then 'Salão do Automóvel' else 'Área externa — Indústria, comércio e serviços' end;

    -- Reuse a scoped canonical space when its sector and edition agree. A
    -- bare numeric legacy code does not establish this documentary identity.
    select * into existing from public.spaces
    where edition_id = target_edition and code = canonical_code for update;
    if found then
      if existing.is_demo or existing.sector is distinct from canonical_sector
        or existing.floor_plan_id is not null
        or exists (select 1 from public.pavilion_environments where edition_id = target_edition and space_id = existing.id)
        or (existing.area_m2 is not null and source.declared_area_m2 is not null and existing.area_m2 <> source.declared_area_m2) then
        raise exception 'O estoque % exige conciliação de identidade ou área.', canonical_code;
      end if;
      stock_id := existing.id;
      if existing.area_m2 is null and source.declared_area_m2 is not null then
        update public.spaces set area_m2 = source.declared_area_m2
        where id = stock_id and edition_id = target_edition;
      end if;
    else
      insert into public.spaces(edition_id, code, sector, area_m2)
      values (target_edition, canonical_code, canonical_sector, source.declared_area_m2)
      returning id into stock_id;
    end if;

    insert into public.commercial_external_space_links(edition_id, space_id, lot_number, evidence)
    values (target_edition, stock_id, source.lot_number,
      'Cadastro documental da edição 2027. V1 - Mapa parque Externo (10).pdf, página 1. Origem da área em commercial_external_geometry. Migração 20261113082500.');
  end loop;

  if (select count(*) from public.commercial_external_space_links where edition_id = target_edition) <> 68
    or (select count(*) from public.commercial_inventory_v where edition_id = target_edition and segment_key = 'external') <> 52
    or (select count(*) from public.commercial_inventory_v where edition_id = target_edition and segment_key = 'automobile') <> 16
    or (select count(distinct geometry_id) from public.commercial_inventory_v
      where edition_id = target_edition and segment_key in ('external','automobile')) <> 68
    or (select sum(area_m2) from public.commercial_inventory_v
      where edition_id = target_edition and segment_key in ('external','automobile')) is distinct from 14844::numeric
  then raise exception 'A implantação deve vincular 68 espaços às geometrias individuais e conciliar 14.844 m².'; end if;
end $inventory$;

commit;
