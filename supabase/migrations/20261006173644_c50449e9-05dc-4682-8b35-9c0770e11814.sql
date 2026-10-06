revoke execute on function public.refresh_contract_from_deal(uuid, integer) from public, anon;
revoke execute on function public.save_contract_body(uuid, text, integer) from public, anon;
grant execute on function public.refresh_contract_from_deal(uuid, integer) to authenticated;
grant execute on function public.save_contract_body(uuid, text, integer) to authenticated;
revoke execute on function public.deal_snapshot(uuid) from authenticated;