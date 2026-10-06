grant insert, update on public.activity_categories to authenticated;
grant insert, update on public.commissions to authenticated;
grant insert, update, delete on public.activity_assignees to authenticated;
grant insert, update, delete on public.activity_commissions to authenticated;
grant insert on public.activity_versions to authenticated;

create policy "write activity categories" on public.activity_categories for all to authenticated using (public.can_write('agenda')) with check (public.can_write('agenda'));
create policy "write commissions" on public.commissions for all to authenticated using (public.can_write('agenda')) with check (public.can_write('agenda'));
create policy "write activity assignees" on public.activity_assignees for all to authenticated using (public.can_write('agenda')) with check (public.can_write('agenda'));
create policy "write activity commissions" on public.activity_commissions for all to authenticated using (public.can_write('agenda')) with check (public.can_write('agenda'));
create policy "insert activity versions" on public.activity_versions for insert to authenticated with check (public.can_write('agenda'));

alter function public.save_activity(uuid,uuid,text,text,text,uuid,timestamp without time zone,timestamp without time zone,boolean,text,uuid,uuid[],uuid[],text,uuid,integer,text) security invoker;
alter function public.set_activity_status(uuid,activity_status,integer) security invoker;
alter function public.save_activity_category(uuid,uuid,text,boolean) security invoker;
alter function public.save_commission(uuid,uuid,text,boolean,boolean) security invoker;