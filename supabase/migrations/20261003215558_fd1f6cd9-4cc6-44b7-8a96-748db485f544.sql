create or replace function public.provision_initial_admin(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Somente provisionamento administrativo autorizado';
  end if;
  if p_user_id is null then raise exception 'Selecione uma conta existente'; end if;
  perform pg_advisory_xact_lock(4242);
  if exists (select 1 from public.user_roles where role = 'admin') then
    raise exception 'O administrador inicial já foi provisionado';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Conta não encontrada';
  end if;
  insert into public.user_roles(user_id, role) values (p_user_id, 'admin');
end $$;
revoke all on function public.provision_initial_admin(uuid) from public, anon, authenticated;
grant execute on function public.provision_initial_admin(uuid) to service_role;