-- Read-only checks for the prepared 2025 file. Execute as the import administrator.
-- These queries return aggregates and hashes, never documents or contact values.
-- Stage the complete payload before the preview, then apply and run verification.

-- 1. Preview reconciliation with the CURRENT company registry before apply.
with batch as (
  select id from public.company_import_batches
  where file_sha256 = '65c45671d2aa424d075f800681faf8981e059a392c59a5388005c34abc95ef4a'
), source as (
  select r.*, public.company_document_info(r.source_document_raw)->>'identity' as identity
  from public.company_import_rows r join batch b on b.id = r.batch_id
), matched as (
  select r.id, r.source_row, r.identity, r.prepared_data,
    count(c.id) as matching_companies,
    coalesce(jsonb_agg(to_jsonb(c)) filter (where c.id is not null), '[]'::jsonb) as companies
  from source r left join public.companies c
    on public.company_document_info(c.tax_id)->>'identity' = r.identity
  group by r.id, r.source_row, r.identity, r.prepared_data
)
select jsonb_build_object(
  'staged_rows', count(*),
  'source_document_groups', count(distinct identity),
  'groups_without_existing_company', count(distinct identity) filter (where matching_companies = 0),
  'groups_reusing_existing_company', count(distinct identity) filter (where matching_companies = 1),
  'groups_with_ambiguous_existing_match', count(distinct identity) filter (where matching_companies > 1),
  'source_rows_with_nonempty_current_field_conflicts', count(*) filter (
    where matching_companies = 1 and exists (
      select 1 from unnest(array['legal_name','trade_name','email','phone','city','state']) as field
      where nullif(trim(prepared_data->'snapshot'->>field), '') is not null
        and nullif(trim(companies->0->>field), '') is not null
        and lower(trim(prepared_data->'snapshot'->>field)) <> lower(trim(companies->0->>field))
    )
  )
) as preview
from matched;

-- 2. Persisted reconciliation. Expected assertions must all be true.
with report as (
  select public.company_import_reconciliation(id) as value
  from public.company_import_batches
  where file_sha256 = '65c45671d2aa424d075f800681faf8981e059a392c59a5388005c34abc95ef4a'
)
select value as persisted_counts,
  (value->>'staged_rows')::integer = 111 as staged_rows_ok,
  (value->>'applied_rows')::integer = 111 as applied_rows_ok,
  (value->>'blocked_rows')::integer = 0 as blocked_rows_ok,
  (value->>'source_documents')::integer = 107 as original_documents_ok,
  (value->>'companies')::integer = 107 as company_groups_ok,
  (value->>'participations')::integer = 107 as participations_ok,
  (value->>'occupations')::integer = 111 as occupations_ok,
  (value->>'module_identifiers')::integer = 632 as module_identifiers_ok,
  (value->>'area_total')::numeric = 9591.97 as area_total_ok,
  (value->>'missing_representative')::integer = 111 as missing_representative_ok,
  (value->>'missing_phone')::integer = 15 as missing_phone_ok,
  (value->>'missing_email')::integer = 91 as missing_email_ok
from report;

-- 3. Every persisted occupation must match its own source row exactly.
with batch as (
  select id from public.company_import_batches
  where file_sha256 = '65c45671d2aa424d075f800681faf8981e059a392c59a5388005c34abc95ef4a'
), persisted as (
  select r.source_row, r.prepared_data, o.*, p.snapshot_locked
  from public.company_import_rows r join batch b on b.id = r.batch_id
  left join public.company_participation_occupations o on o.source_import_row_id = r.id
  left join public.company_participations p on p.id = o.participation_id
)
select count(*) as source_rows,
  count(*) filter (where source_import_row_id is null) as missing_occupations,
  count(*) filter (where to_jsonb(module_codes) is distinct from prepared_data->'occupation'->'module_codes') as changed_module_lists,
  count(*) filter (where area_total is distinct from (prepared_data->'occupation'->>'area_total')::numeric) as changed_area_totals,
  count(*) filter (where area_label is distinct from prepared_data->'occupation'->>'area_label') as changed_area_labels,
  count(*) filter (where snapshot_locked is not true) as unlocked_participations,
  count(*) filter (where source_snapshot->>'representative_name' is not null) as invented_representatives,
  count(*) filter (where source_snapshot->>'street' is not null
    or source_snapshot->>'address_number' is not null
    or source_snapshot->>'neighborhood' is not null
    or source_snapshot->>'postal_code' is not null) as invented_street_addresses
from persisted;

-- 4. Four groups must retain two occupations; 103 groups retain one occupation.
with counts as (
  select o.participation_id, count(*) as occupation_count
  from public.company_participation_occupations o
  join public.company_import_rows r on r.id = o.source_import_row_id
  join public.company_import_batches b on b.id = r.batch_id
  where b.file_sha256 = '65c45671d2aa424d075f800681faf8981e059a392c59a5388005c34abc95ef4a'
  group by o.participation_id
)
select occupation_count, count(*) as company_groups
from counts group by occupation_count order by occupation_count;

-- 5. Run after apply, save the result privately, re-stage/re-apply the same payload,
--    then run again. All counts and hashes below must remain identical.
with batch as (
  select id, edition_id from public.company_import_batches
  where file_sha256 = '65c45671d2aa424d075f800681faf8981e059a392c59a5388005c34abc95ef4a'
), company_ids as (
  select distinct company_id from public.company_import_rows where batch_id in (select id from batch)
), participation_ids as (
  select distinct participation_id from public.company_import_rows where batch_id in (select id from batch)
)
select jsonb_build_object(
  'company_count', (select count(*) from public.companies),
  'contact_count', (select count(*) from public.contacts),
  'participation_count', (select count(*) from public.company_participations),
  'occupation_count', (select count(*) from public.company_participation_occupations),
  'companies_hash', (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text, '[]'))
    from public.companies c where c.id in (select company_id from company_ids)),
  'contacts_hash', (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text, '[]'))
    from public.contacts c where c.company_id in (select company_id from company_ids)),
  'participations_hash', (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text, '[]'))
    from public.company_participations p where p.id in (select participation_id from participation_ids)),
  'occupations_hash', (select md5(coalesce(jsonb_agg(to_jsonb(o) order by o.id)::text, '[]'))
    from public.company_participation_occupations o where o.participation_id in (select participation_id from participation_ids)),
  'historical_snapshot_hash', (select md5(coalesce(jsonb_agg(p.registration_snapshot order by p.id)::text, '[]'))
    from public.company_participations p where p.id in (select participation_id from participation_ids)),
  'historical_edition_is_inactive', (select bool_and(not e.is_active and e.is_historical) from public.editions e where e.id in (select edition_id from batch)),
  'active_edition_ids', (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from public.editions where is_active)
) as repeatability_evidence;

-- 6. Review metadata without disclosing the conflicting field values.
select r.source_row, r.status, r.failure,
  coalesce((select jsonb_agg(jsonb_build_object('field', issue->>'field', 'reason', issue->>'reason', 'resolution', issue->>'resolution'))
    from jsonb_array_elements(r.conflicts) issue), '[]'::jsonb) as conflict_fields
from public.company_import_rows r join public.company_import_batches b on b.id = r.batch_id
where b.file_sha256 = '65c45671d2aa424d075f800681faf8981e059a392c59a5388005c34abc95ef4a'
  and (r.status <> 'applied' or r.conflicts <> '[]'::jsonb)
order by r.source_row;
