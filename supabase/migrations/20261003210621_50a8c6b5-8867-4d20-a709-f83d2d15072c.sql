
revoke execute on function public.ensure_profile, public.save_deal, public.transition_deal, public.create_contract_from_deal, public.save_contract_body, public.set_contract_status, public.generate_installments, public.register_payment, public.create_inspection, public.can_read, public.can_write, public.has_role, public.has_any_role, public.audit_trigger from public, anon;
revoke execute on function public.audit_trigger from authenticated;

-- storage policies for private documents bucket
create policy "docs read" on storage.objects for select to authenticated using (bucket_id = 'documents' and public.can_read('documentos'));
create policy "docs insert" on storage.objects for insert to authenticated with check (bucket_id = 'documents' and (public.can_write('documentos') or public.can_write('vistorias') or public.can_write('contratos') or public.can_write('financeiro') or public.can_write('mapa')));
create policy "docs delete" on storage.objects for delete to authenticated using (bucket_id = 'documents' and public.can_write('documentos'));
-- documents rows may be inserted by modules that attach files
drop policy "insert documents" on public.documents;
create policy "insert documents" on public.documents for insert to authenticated with check (public.can_write('documentos') or public.can_write('vistorias') or public.can_write('contratos') or public.can_write('financeiro') or public.can_write('mapa'));
drop policy "insert document_links" on public.document_links;
create policy "insert document_links" on public.document_links for insert to authenticated with check (public.can_write('documentos') or public.can_write('vistorias') or public.can_write('contratos') or public.can_write('financeiro') or public.can_write('mapa'));
