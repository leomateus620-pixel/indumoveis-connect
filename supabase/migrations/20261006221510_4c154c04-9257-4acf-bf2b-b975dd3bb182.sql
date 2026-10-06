with recursive ch as (
  select id, id as root, array[id] path from public.documents where previous_id is null
  union all
  select d.id, ch.root, ch.path || d.id from public.documents d join ch on d.previous_id = ch.id where not d.id = any(ch.path)
), bad_roots as (
  select ch.root from ch join public.documents d on d.previous_id is not null
    and d.previous_id in (select previous_id from public.documents where previous_id is not null group by 1 having count(*) > 1)
    and ch.id = d.id
)
update public.documents d set root_id = ch.root
from ch where ch.id = d.id and d.root_id is distinct from ch.root and ch.root not in (select root from bad_roots);

update public.documents d set is_current = (d.status = 'ativo' and not exists (
  select 1 from public.documents s where s.previous_id = d.id and s.status = 'ativo'))
where d.root_id is not null
  and d.root_id not in (select root_id from public.documents where previous_id is not null group by root_id, previous_id having count(*) > 1);

insert into public.document_links(document_id, entity_type, entity_id)
select d.root_id, l.entity_type, l.entity_id from public.document_links l join public.documents d on d.id = l.document_id
where d.root_id is not null and d.root_id <> d.id
on conflict do nothing;

create unique index if not exists documents_one_current_uq on public.documents(root_id) where is_current;

create or replace function public.validate_document_chain() returns trigger
language plpgsql set search_path = public as $$
declare p record;
begin
  if new.previous_id is null then
    if new.root_id is distinct from new.id then raise exception 'Versão inicial deve ser a própria raiz'; end if;
  else
    select id, root_id into p from documents where id = new.previous_id;
    if p.id is null then raise exception 'Versão anterior não encontrada'; end if;
    if new.root_id is distinct from coalesce(p.root_id, p.id) then raise exception 'Versão vinculada a outra cadeia'; end if;
  end if;
  return new;
end $$;
drop trigger if exists validate_document_chain_before_write on public.documents;
create trigger validate_document_chain_before_write before insert or update of root_id, previous_id on public.documents
for each row execute function public.validate_document_chain();
revoke execute on function public.validate_document_chain from public, anon, authenticated;