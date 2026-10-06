drop policy if exists "docs insert" on storage.objects;
drop policy if exists "docs delete pending" on storage.objects;
create policy "docs insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and exists (select 1 from public.documents d where d.storage_path = storage.objects.name and d.status = 'pendente' and d.uploaded_by = auth.uid()));
create policy "docs delete pending" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and exists (select 1 from public.documents d where d.storage_path = storage.objects.name and d.status = 'pendente' and d.uploaded_by = auth.uid()));