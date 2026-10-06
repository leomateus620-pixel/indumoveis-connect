grant execute on function public.activity_snapshot(uuid) to authenticated;
alter function public.activity_snapshot(uuid) security invoker;