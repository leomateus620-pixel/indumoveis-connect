-- Compatibilidade durante o rollout: o frontend publicado ainda grava apenas
-- cadastro global via INSERT/UPDATE. Participações e ocupações continuam exclusivas
-- das RPCs atômicas, sem criação implícita de participação na edição ativa.
create or replace function public.guard_legacy_company_identity()
returns trigger language plpgsql security invoker set search_path=public as $$
declare v_info jsonb; v_identity text;
begin
  -- Chamadas das RPCs SECURITY DEFINER já validam identidade e concorrência.
  -- O importador administrativo também preserva documentos desconhecidos para revisão.
  -- current_user é o papel efetivo controlado pelo PostgreSQL, não um valor do payload.
  if current_user<>'authenticated' then return NEW; end if;
  if not public.can_write('empresas') then raise exception 'Sem permissão para alterar empresas.' using errcode='42501'; end if;
  NEW.legal_name:=nullif(trim(NEW.legal_name),'');
  NEW.trade_name:=nullif(trim(NEW.trade_name),'');
  if NEW.legal_name is null or length(NEW.legal_name)<2 or length(NEW.legal_name)>200 then
    raise exception 'Informe uma razão social válida (2 a 200 caracteres).';
  end if;
  if NEW.trade_name is null or length(NEW.trade_name)>120 then
    raise exception 'Informe um nome fantasia válido (até 120 caracteres).';
  end if;
  if TG_OP='INSERT' then NEW.created_by:=auth.uid(); end if;
  if TG_OP='INSERT' or NEW.tax_id is distinct from OLD.tax_id then
    v_info:=public.company_document_info(NEW.tax_id); v_identity:=v_info->>'identity';
    if (v_info->>'status')='invalid_characters' then raise exception 'Documento contém caracteres inválidos.'; end if;
    if v_identity is not null and (v_info->>'normalized') is null then
      raise exception 'Informe um CPF ou CNPJ com dígitos verificadores válidos.';
    end if;
    if v_identity is not null then
      perform pg_advisory_xact_lock(hashtextextended('company-document:'||v_identity,0));
      if exists(select 1 from public.companies c where c.id<>NEW.id and
        public.company_document_info(c.tax_id)->>'identity'=v_identity) then
        raise exception 'Já existe uma empresa com este documento. Reutilize o cadastro existente.' using errcode='23505';
      end if;
    end if;
    NEW.tax_id:=v_identity; NEW.tax_id_type:=v_info->>'type';
  end if;
  return NEW;
end $$;
drop trigger if exists company_legacy_identity_guard on public.companies;
create trigger company_legacy_identity_guard before insert or update on public.companies
for each row execute function public.guard_legacy_company_identity();
revoke all on function public.guard_legacy_company_identity() from public,anon,authenticated,service_role;

-- Colunas suficientes para o CompanyDialog publicado; autoria é forçada no trigger.
-- Não concede id, is_demo, updated_at, campos de participação, DELETE ou escrita de ocupações.
grant insert(legal_name,trade_name,tax_id,email,phone,website,city,state,segment,notes,created_by)
  on public.companies to authenticated;
grant update(legal_name,trade_name,tax_id,email,phone,website,city,state,segment,notes)
  on public.companies to authenticated;
