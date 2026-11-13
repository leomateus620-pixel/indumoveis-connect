begin;

do $seed$
declare
  target_edition uuid;
  plan public.pavilion_plan_revisions;
  successor uuid;
  pavilion integer;
  expected_count integer;
  expected_revision integer;
  expected_source text;
  input_group record;
  match_row record;
  g record;
  total_area numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended('indumoveis-commercial-pricing-2027', 0));
  -- Use the active edition's identity and independently verify the edition named by the source.
  if (select count(*) from public.editions where is_active) <> 1 then
    raise exception 'Selecione exatamente uma edição ativa antes de instalar a política.';
  end if;
  select id into strict target_edition from public.editions
  where is_active and year = 2027 and starts_on = date '2027-05-14' and ends_on = date '2027-05-23'
  for update;
  if exists (select 1 from public.commercial_pricing_policies where edition_id = target_edition and version = 1) then
    if not exists (
      select 1 from public.commercial_pricing_policies where edition_id = target_edition and version = 1
        and source_sha256 = 'a88df5c19bafc242704e58eb1b46bb7c721254573a52a63b2e5e777028734b5c'
    ) or (select count(*) from public.commercial_area_assignments where edition_id = target_edition and policy_version = 1) <> 341 then
      raise exception 'A versão 1 da política contém outra origem ou está incompleta.';
    end if;
    return;
  end if;

  -- Serialize against stock edits while the documentary links are reconciled.
  lock table public.spaces in share row exclusive mode;
  insert into public.commercial_pricing_policies(
    edition_id, version, source_name, source_sha256, document_date,
    installment_limit, first_document_due, last_document_due
  ) values (
    target_edition, 1, 'Política de Locação de Espaço - 2027 (10ª edição) - nova identidade.pdf',
    'a88df5c19bafc242704e58eb1b46bb7c721254573a52a63b2e5e777028734b5c',
    date '2025-05-26', 18, date '2025-10-30', date '2027-03-30'
  );

  insert into public.commercial_pricing_rules(
    edition_id, policy_version, rule_key, pavilion_number, lot_range, segment_key, segment_name, regular_cents, corner_cents
  )
  select target_edition, 1, x.*
  from (values
    ('p1', 1, null::int4range, 'p1', 'Mostra ARQ & Design', null::integer, null::integer),
    ('p3', 3, null, 'p3', 'Fornecedores da construção civil, moveleiros e mobiliário', 26500, null),
    ('p8', 8, null, 'p8', 'Fornecedores da construção civil, moveleiros e mobiliário', 29000, null),
    ('p12', 12, null, 'p12', 'Indústria moveleira, comércio de móveis e decoração', 27000, null),
    ('p13', 13, null, 'p13', 'Imobiliárias, construtoras e instituições financeiras', 45000, null),
    ('p14', 14, null, 'p14', 'Fornecedores da construção civil, moveleiros e mobiliário — Sinduscom', 26500, null),
    ('ext_01_14', null, int4range(1, 15), 'external', 'Indústria, comércio e serviços', 1900, 2100),
    ('ext_15_42', null, int4range(15, 43), 'external', 'Indústria, comércio e serviços', 1700, 2100),
    ('auto_43_50', null, int4range(43, 51), 'automobile', 'Salão do Automóvel', null, null),
    ('ext_51_57', null, int4range(51, 58), 'external', 'Indústria, comércio e serviços', 1700, 2100),
    ('auto_58_65', null, int4range(58, 66), 'automobile', 'Salão do Automóvel', null, null),
    ('ext_66_68', null, int4range(66, 69), 'external', 'Indústria, comércio e serviços', 1700, 2100)
  ) x;

  insert into public.commercial_discount_rules
  select target_edition, 1, x.* from (values
    ('cash_full', 1000, 'Pagamento total à vista', 'Parcela única; sobre o valor da locação'),
    ('installments_on_time', 1000, 'Parcelamento em cartão de crédito ou boleto',
      'Benefício condicionado ao pagamento de cada parcela até o vencimento; sobre a locação'),
    ('eligible_member', 1000, 'Associação regular ao Sinduscom, Assinmóveis ou Apea/SR',
      'Comprovar associação regular; sobre o valor da locação')
  ) x;

  insert into public.commercial_fee_rules
  select target_edition, 1, x.* from (values
    ('internal_cleaning', 'internal', 30000, 'Administração e limpeza por expositor e contrato de área interna'),
    ('external_cleaning', 'external', 55000, 'Administração e limpeza por expositor e contrato de área externa'),
    ('external_ppci', 'external', 55000, 'PPCI por expositor e contrato de área externa; cobrança distinta da limpeza'),
    ('provisional_license', 'any', 36000,
      'Somente quando faltar alvará válido ou o município não constar na lista da política')
  ) x;

  create temporary table commercial_import_groups (
    pavilion_number integer, group_key text primary key, source_name text, source_sha256 text,
    printed_codes int4multirange, matched_codes text[], total_m2 numeric, validation_state text, evidence jsonb
  ) on commit drop;

  -- Keep the source lines and expand inclusive ranges as sets. Multiranges
  -- canonicalize overlaps before the division by cardinality.
  insert into commercial_import_groups
  select 12, 'p12-' || x.key, 'Tabela de módulos P12 (01_59_56.jpg)',
    '6b2aa81a30be6d926e52736fa5a284c306287f7c3225b45459e73be573ee2c2d',
    x.modules, null, x.m2, 'confirmed', jsonb_build_object('column', 'M²', 'line', x.key)
  from (values
    ('1–11', '{[1,12)}'::int4multirange, 44),
    ('12–22', '{[12,23)}', 44),
    ('23–36', '{[23,37)}', 56),
    ('37–51 e 106–120', '{[37,52),[106,121)}', 90),
    ('52–57 e 100–105', '{[52,58),[100,106)}', 36),
    ('58–64 e 93–99', '{[58,65),[93,100)}', 42),
    ('65–72', '{[65,73)}', 24),
    ('85–92', '{[85,93)}', 24),
    ('73–84', '{[73,85)}', 36),
    ('121–137 e 188–204', '{[121,138),[188,205)}', 102),
    ('138–149 e 176–187', '{[138,150),[176,188)}', 72),
    ('150–153 e 172–175', '{[150,154),[172,176)}', 24),
    ('154–171', '{[154,172)}', 54),
    ('205–216', '{[205,217)}', 48),
    ('217–222', '{[217,223)}', 24),
    ('223–232', '{[223,233)}', 40),
    ('233–241', '{[233,242)}', 36),
    ('242–254', '{[242,255)}', 52)
  ) x(key, modules, m2);

  insert into commercial_import_groups
  select 13, 'p13-' || x.key, 'Tabela de módulos P13 (01_59_59.jpg)',
    '1cb183c69df623aa4945c8134b14865e517c90b1abe7c1005830cb0e7ee61ccd',
    x.modules, null, x.m2, 'confirmed', jsonb_build_object('column', 'M²', 'line', x.key)
  from (values
    ('1–4', '{[1,5)}'::int4multirange, 16), ('5–8', '{[5,9)}', 16), ('9', '{[9,10)}', 4),
    ('10–14', '{[10,15)}', 20), ('15–18', '{[15,19)}', 16), ('19–29', '{[19,30)}', 44),
    ('30–35', '{[30,36)}', 36), ('38–40', '{[38,41)}', 18), ('41–44', '{[41,45)}', 24),
    ('45–51', '{[45,52)}', 42), ('52–55', '{[52,56)}', 16), ('56–62', '{[56,63)}', 28),
    ('63–66', '{[63,67)}', 16), ('67–70', '{[67,71)}', 16), ('71–74', '{[71,75)}', 16),
    ('75–80', '{[75,81)}', 24)
  ) x(key, modules, m2);

  insert into commercial_import_groups values (
    13, 'p13-34–37-pending', 'Tabela de módulos P13 (01_59_59.jpg)',
    '1cb183c69df623aa4945c8134b14865e517c90b1abe7c1005830cb0e7ee61ccd',
    '{[34,38)}', array['36','37'], 12, 'pending',
    jsonb_build_object('line', '34 a 37', 'overlap', array[34,35], 'overlaps_with', '30 a 35',
      'proposed_modules', array[36,37], 'hypothesis_m2_each', 6,
      'explanation', 'A planta mostra 30–35 agrupado e 36 e 37 separados. A hipótese 36–37 aguarda confirmação documental.')
  );

  insert into commercial_import_groups
  select 8, 'p8-' || x.code, 'Tabela de módulos P8 (02_00_02.jpg)',
    'fb82c994333e07769830f16e87a149b9c50b1aafce3f1c6705258d9b23d174f7',
    int4multirange(int4range(x.module, x.module + 1)), array[x.code], x.m2, 'confirmed',
    jsonb_build_object('column', 'M²', 'reference_label', x.evidence, 'plan_code', x.code)
  from (values
    (1, '01', 93.15, 'Calena'), (2, '03', 61.40, 'Estilo Persianas'),
    (3, '04', 49.00, 'Esquadritec'), (4, '05', 58.15, 'RBF Acabamentos'),
    (5, '06', 87.00, 'TKM/K3'), (6, '07', 46.00, 'Casa da Pintura')
  ) x(module, code, m2, evidence);

  insert into commercial_import_groups values (
    8, 'p8-08-pending', 'Tabela de módulos P8 (02_00_02.jpg)',
    'fb82c994333e07769830f16e87a149b9c50b1aafce3f1c6705258d9b23d174f7',
    '{}', array['08'], null, 'pending', jsonb_build_object('explanation', 'O código 08 da planta não consta na nova tabela.')
  );

  for pavilion, expected_count, expected_revision, expected_source, total_area in values
    (8, 7, 1, '63e3762f7d20b34359f451da1cac63ad7e03327496695106dff4b9c11e239767', 937.32::numeric),
    (12, 254, 1, 'f933d506774daf59c7cdd2749bea6eafd3784de10f2a99a814abf76e2db96c37', 1650),
    (13, 80, 2, '5d33bd55d353021ba18f6e3cc6114544723f8ed292b149e0aab628625187ef67', 850.50)
  loop
    select * into strict plan from public.pavilion_plan_revisions
    where edition_id = target_edition and pavilion_number = pavilion and is_current for update;
    if plan.revision <> expected_revision or plan.source_sha256 <> expected_source
      or (plan.total_area_m2 is not null and plan.total_area_m2 <> total_area) then
      raise exception 'A revisão atual do Pavilhão % precisa de nova conciliação documental.', pavilion;
    end if;
    if (select count(*) from public.pavilion_environment_revisions v
      join public.pavilion_environments e on e.edition_id = v.edition_id and e.id = v.environment_id
      where v.revision_id = plan.id and v.edition_id = target_edition
        and e.pavilion_number = pavilion and e.kind = 'commercial') <> expected_count then
      raise exception 'O Pavilhão % deve ter % lotes comerciais na revisão fonte.', pavilion, expected_count;
    end if;

    for input_group in
      select i.*,
        array(select m from unnest(i.printed_codes) as r, lateral generate_series(lower(r), upper(r)-1) m order by m) as modules
      from commercial_import_groups i where i.pavilion_number = pavilion
      order by i.group_key
    loop
      insert into public.commercial_area_groups(
        edition_id, policy_version, group_key, source_name, source_sha256, pavilion_number,
        source_revision_id, document_codes, matched_codes, total_m2, validation_state, evidence
      ) values (
        target_edition, 1, input_group.group_key, input_group.source_name, input_group.source_sha256,
        pavilion, plan.id, input_group.modules,
        coalesce(input_group.matched_codes, array(
          select case when pavilion = 13 then lpad(m::text, 2, '0') else m::text end
          from unnest(input_group.modules) as m
        )),
        input_group.total_m2, input_group.validation_state, input_group.evidence
      ) returning * into g;

      if g.individual_m2 <> round(g.individual_m2, 2) then
        raise exception 'A precisão do grupo % excede a precisão cadastral.', g.group_key;
      end if;
      for match_row in
        select m.code, m.position, e.id as environment_id, s.id as space_id,
          s.area_m2 as stock_area, v.declared_area_m2 as plan_area
        from unnest(g.matched_codes) with ordinality as m(code, position)
        left join public.pavilion_environments e on e.edition_id = target_edition
          and e.id = 'indumoveis:pavilion:' || pavilion || ':environment:' || m.code
          and e.pavilion_number = pavilion and e.code = m.code and e.kind = 'commercial'
        left join public.pavilion_environment_revisions v on v.edition_id = e.edition_id
          and v.environment_id = e.id and v.revision_id = plan.id
        left join public.spaces s on s.edition_id = e.edition_id and s.id = e.space_id and not s.is_demo
          and v.environment_id is not null
      loop
        if match_row.space_id is null then
          raise exception 'Módulo % não tem identidade comercial válida no Pavilhão %.', match_row.code, pavilion;
        end if;
        if g.validation_state = 'confirmed' and (
          (match_row.stock_area is not null and match_row.stock_area <> g.individual_m2)
          or (match_row.plan_area is not null and match_row.plan_area <> g.individual_m2)
        ) then
          raise exception 'Área prévia divergente para o módulo % do Pavilhão %. Conciliação necessária.', match_row.code, pavilion;
        end if;
        insert into public.commercial_area_assignments(
          edition_id, policy_version, group_key, environment_id, space_id, source_code, lot_code,
          previous_space_m2, previous_plan_m2
        ) values (
          target_edition, 1, g.group_key, match_row.environment_id, match_row.space_id,
          case when g.validation_state = 'pending' then coalesce(g.evidence->>'line', match_row.code)
            else g.document_codes[match_row.position]::text end, match_row.code,
          match_row.stock_area, match_row.plan_area
        );
      end loop;
    end loop;

    if (select count(*) from public.commercial_area_assignments a
      join public.commercial_area_groups cg using (edition_id, policy_version, group_key)
      where a.edition_id = target_edition and a.policy_version = 1 and cg.pavilion_number = pavilion) <> expected_count then
      raise exception 'Atribuições incompletas no Pavilhão %.', pavilion;
    end if;

    insert into public.pavilion_plan_revisions(
      edition_id, floor_plan_id, pavilion_number, stable_id, revision, source_name, source_sha256,
      payload_sha256, coordinate_system, bounds, source_document, total_area_m2, is_current
    ) values (
      target_edition, plan.floor_plan_id, pavilion, plan.stable_id, plan.revision + 1,
      plan.source_name, plan.source_sha256,
      encode(extensions.digest(plan.payload_sha256 || coalesce((
        select string_agg(a.lot_code || '=' || case when cg.validation_state = 'confirmed' then cg.individual_m2::text
          else coalesce(a.previous_plan_m2::text, 'pending') end, ',' order by a.lot_code)
        from public.commercial_area_assignments a
        join public.commercial_area_groups cg using (edition_id, policy_version, group_key)
        where a.edition_id = target_edition and a.policy_version = 1 and cg.pavilion_number = pavilion
      ), '') || '|total=' || total_area::text, 'sha256'), 'hex'),
      plan.coordinate_system, plan.bounds, plan.source_document || jsonb_build_object(
        'areaPolicyVersion', 1, 'previousRevision', plan.revision
      ), total_area, false
    ) returning id into successor;

    insert into public.pavilion_environment_revisions(
      edition_id, revision_id, environment_id, name, declared_area_m2, function_label, label, display_order
    )
    select v.edition_id, successor, v.environment_id, v.name,
      case when cg.validation_state = 'confirmed' then cg.individual_m2
        else coalesce(v.declared_area_m2, nullif(greatest(a.previous_space_m2, 0), 0)) end,
      v.function_label, v.label, v.display_order
    from public.pavilion_environment_revisions v
    left join public.commercial_area_assignments a on a.edition_id = v.edition_id
      and a.policy_version = 1 and a.environment_id = v.environment_id
    left join public.commercial_area_groups cg on cg.edition_id = a.edition_id
      and cg.policy_version = a.policy_version and cg.group_key = a.group_key
    where v.edition_id = target_edition and v.revision_id = plan.id;

    insert into public.pavilion_environment_parts(id, edition_id, revision_id, environment_id, kind, path, polygon)
    select id, edition_id, successor, environment_id, kind, path, polygon
    from public.pavilion_environment_parts where edition_id = target_edition and revision_id = plan.id;

    insert into public.pavilion_architecture_elements(id, edition_id, revision_id, kind, path, label, label_at, stroke_width, display_order)
    select id, edition_id, successor, kind, path, label, label_at, stroke_width, display_order
    from public.pavilion_architecture_elements where edition_id = target_edition and revision_id = plan.id;

    update public.spaces s set area_m2 = cg.individual_m2
    from public.commercial_area_assignments a
    join public.commercial_area_groups cg using (edition_id, policy_version, group_key)
    where s.edition_id = target_edition and s.id = a.space_id and a.edition_id = s.edition_id
      and a.policy_version = 1 and cg.pavilion_number = pavilion and cg.validation_state = 'confirmed'
      and s.area_m2 is distinct from cg.individual_m2;

    update public.pavilion_plan_revisions set is_current = false where id = plan.id and edition_id = target_edition;
    update public.pavilion_plan_revisions set is_current = true where id = successor and edition_id = target_edition;
  end loop;

  if (select sum(area_m2) from public.commercial_inventory_v where edition_id = target_edition and pavilion_number = 12) <> 848
    or (select sum(gross_cents) from public.commercial_inventory_v where edition_id = target_edition and pavilion_number = 12) <> 22896000
    or (select count(*) from public.commercial_inventory_v where edition_id = target_edition and pavilion_number = 12 and gross_cents is not null) <> 254
    or (select sum(area_m2) from public.commercial_inventory_v where edition_id = target_edition and pavilion_number = 8 and not area_pending) <> 394.70
    or (select sum(gross_cents) from public.commercial_inventory_v where edition_id = target_edition and pavilion_number = 8) <> 11446300
    or (select count(*) from public.commercial_inventory_v where edition_id = target_edition and pavilion_number = 8 and gross_cents is not null) <> 6
    or (select sum(area_m2) from public.commercial_inventory_v where edition_id = target_edition and pavilion_number = 13 and not area_pending) <> 352
    or (select sum(gross_cents) from public.commercial_inventory_v where edition_id = target_edition and pavilion_number = 13) <> 15840000
    or (select count(*) from public.commercial_inventory_v where edition_id = target_edition and pavilion_number = 13 and gross_cents is not null) <> 78
  then
    raise exception 'Totais da política de áreas divergentes dos documentos.';
  end if;
end $seed$;

commit;
