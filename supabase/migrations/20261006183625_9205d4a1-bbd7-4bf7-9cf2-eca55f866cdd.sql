create or replace function public.save_activity(p_activity_id uuid,p_edition_id uuid,p_title text,p_description text,p_kind text,p_category_id uuid,p_start_local timestamp without time zone,p_end_local timestamp without time zone,p_all_day boolean,p_location text,p_primary_assignee uuid,p_assignee_ids uuid[],p_commission_ids uuid[],p_related_type text,p_related_id uuid,p_expected_version integer,p_idempotency_key text)
returns uuid language plpgsql security invoker set search_path to 'public' as $$
declare v_id uuid; v_version integer; v_timezone text; v_start timestamptz; v_end timestamptz; v_assignees uuid[] := coalesce(p_assignee_ids, array[]::uuid[]);
begin
  if not public.can_write('agenda') then raise exception 'Sem permissão'; end if;
  if p_edition_id is null then raise exception 'Edição não informada'; end if;
  select timezone into v_timezone from public.editions where id = p_edition_id;
  if v_timezone is null then raise exception 'Edição não encontrada'; end if;
  if coalesce(trim(p_title),'') = '' then raise exception 'Informe o título'; end if;
  if p_start_local is null and p_end_local is not null then raise exception 'Informe o início antes do fim'; end if;
  v_start := case when p_start_local is null then null else p_start_local at time zone v_timezone end;
  v_end := case when p_end_local is null then null else p_end_local at time zone v_timezone end;
  if v_end is not null and v_end < v_start then raise exception 'O fim não pode ser anterior ao início'; end if;
  if p_category_id is not null and not exists (select 1 from public.activity_categories where id=p_category_id and edition_id=p_edition_id) then raise exception 'Categoria inválida'; end if;
  if exists (select 1 from unnest(coalesce(p_commission_ids,array[]::uuid[])) x where not exists (select 1 from public.commissions c where c.id=x and c.edition_id=p_edition_id)) then raise exception 'Comissão inválida'; end if;
  if exists (select 1 from unnest(v_assignees || case when p_primary_assignee is null then array[]::uuid[] else array[p_primary_assignee] end) x where not exists (select 1 from public.profiles p join public.user_roles ur on ur.user_id=p.id where p.id=x)) then raise exception 'Responsável inválido'; end if;
  perform public.validate_activity_reference(p_edition_id,p_related_type,p_related_id);
  if p_activity_id is null then
    if p_idempotency_key is not null then select id into v_id from public.activities where edition_id=p_edition_id and idempotency_key=p_idempotency_key; end if;
    if v_id is not null then return v_id; end if;
    insert into public.activities(edition_id,title,description,kind,category_id,start_at,end_at,all_day,location,assignee_id,related_type,related_id,created_by,idempotency_key)
    values(p_edition_id,trim(p_title),nullif(trim(coalesce(p_description,'')),''),p_kind,p_category_id,v_start,v_end,coalesce(p_all_day,false),nullif(trim(coalesce(p_location,'')),''),p_primary_assignee,p_related_type,p_related_id,auth.uid(),p_idempotency_key)
    returning id,version into v_id,v_version;
  else
    select id,version into v_id,v_version from public.activities where id=p_activity_id and edition_id=p_edition_id for update;
    if v_id is null then raise exception 'Atividade não encontrada'; end if;
    if v_version <> p_expected_version then raise exception 'A atividade foi alterada por outra pessoa. Recarregue antes de salvar.'; end if;
    update public.activities set title=trim(p_title),description=nullif(trim(coalesce(p_description,'')),''),kind=p_kind,category_id=p_category_id,start_at=v_start,end_at=v_end,all_day=coalesce(p_all_day,false),location=nullif(trim(coalesce(p_location,'')),''),assignee_id=p_primary_assignee,related_type=p_related_type,related_id=p_related_id,version=version+1 where id=v_id returning version into v_version;
  end if;
  delete from public.activity_assignees where activity_id=v_id;
  insert into public.activity_assignees(activity_id,profile_id,is_primary) select v_id,x,(x=p_primary_assignee) from (select distinct unnest(v_assignees || case when p_primary_assignee is null then array[]::uuid[] else array[p_primary_assignee] end) x) s;
  delete from public.activity_commissions where activity_id=v_id;
  insert into public.activity_commissions(activity_id,commission_id) select v_id,x from (select distinct unnest(coalesce(p_commission_ids,array[]::uuid[])) x) s;
  insert into public.activity_versions(activity_id,version,snapshot,actor) values(v_id,v_version,public.activity_snapshot(v_id),auth.uid());
  return v_id;
end $$;