create or replace function public.ensure_profile()
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); em text; nm text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select email, coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name')
    into em, nm from auth.users where id = uid;
  if em is null then raise exception 'authenticated user not found'; end if;
  insert into public.profiles(id, email, full_name)
    values (uid, em, nm) on conflict (id) do nothing;
  return json_build_object('roles', (select coalesce(json_agg(role), '[]'::json)
    from public.user_roles where user_id = uid));
end $$;

create or replace function public.protect_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin' or new.user_id <> old.user_id) then
    perform pg_advisory_xact_lock(4242);
    if (select count(*) from public.user_roles where role = 'admin') <= 1 then
      raise exception 'Não é possível remover o último administrador';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger protect_last_admin_before_change
  before update or delete on public.user_roles
  for each row execute function public.protect_last_admin();
revoke execute on function public.protect_last_admin() from public, anon, authenticated;