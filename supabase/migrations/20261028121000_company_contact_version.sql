-- Contatos fazem parte da edição atômica do cadastro. Alterações isoladas devem
-- invalidar também o timestamp usado por um formulário de empresa já aberto.
-- clock_timestamp (em vez de now) distingue duas mudanças na mesma transação.
create or replace function public.touch_company_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin
  NEW.updated_at:=greatest(clock_timestamp(),OLD.updated_at+interval '1 microsecond');
  return NEW;
end $$;
drop trigger if exists t_companies on public.companies;
create trigger t_companies before update on public.companies
for each row execute function public.touch_company_updated_at();

create or replace function public.touch_company_after_contact_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_company_ids uuid[]; v_company_id uuid;
begin
  if not (public.can_write('empresas') or coalesce(auth.role()='service_role',false) or
    (auth.uid() is null and session_user in ('postgres','supabase_admin'))) then
    raise exception 'Sem permissão para alterar contatos da empresa.';
  end if;
  if TG_OP='INSERT' then v_company_ids:=array[NEW.company_id];
  elsif TG_OP='DELETE' then v_company_ids:=array[OLD.company_id];
  else v_company_ids:=array[OLD.company_id,NEW.company_id]; end if;
  -- Bloqueia ambos os pais em ordem estável antes de atualizar um contato transferido.
  perform c.id from public.companies c where c.id=any(v_company_ids) order by c.id for update;
  for v_company_id in select distinct u.company_id from unnest(v_company_ids) as u(company_id)
    where u.company_id is not null order by u.company_id loop
    update public.companies set updated_at=clock_timestamp() where id=v_company_id;
  end loop;
  return coalesce(NEW,OLD);
end $$;
drop trigger if exists contacts_touch_company on public.contacts;
create trigger contacts_touch_company after insert or update or delete on public.contacts
for each row execute function public.touch_company_after_contact_change();

revoke all on function public.touch_company_updated_at(),public.touch_company_after_contact_change()
from public,anon,authenticated,service_role;
