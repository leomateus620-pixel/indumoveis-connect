/* eslint-disable @typescript-eslint/no-explicit-any */
// Camada única de acesso a dados. Todas as telas usam estas consultas/mutações.
// Autorização efetiva: RLS + funções transacionais no banco (can_read/can_write).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "./format";

const db = supabase as any;

async function run<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

export const qk = {
  me: ["db", "me"],
  edition: ["db", "edition"],
  list: (name: string, ...args: unknown[]) => ["db", name, ...args],
};

// ---------- Sessão / perfil ----------
export type Me = {
  id: string;
  email: string | null;
  name: string | null;
  roles: string[];
  perms: Record<string, { read: boolean; write: boolean }>;
};

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async (): Promise<Me | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      await run(db.rpc("ensure_profile"));
      const roles = (await run<any[]>(db.from("user_roles").select("role").eq("user_id", u.user.id))).map(
        (r) => r.role as string,
      );
      const rp = await run<any[]>(db.from("role_permissions").select("*").in("role", roles.length ? roles : ["-"]));
      const perms: Me["perms"] = {};
      const admin = roles.includes("admin");
      for (const m of ["dashboard", "mapa", "comercial", "empresas", "contratos", "vistorias", "financeiro", "agenda", "documentos", "admin"]) {
        const rows = rp.filter((r) => r.module === m);
        perms[m] = {
          read: admin || rows.some((r) => r.can_read || r.can_write),
          write: admin || rows.some((r) => r.can_write),
        };
      }
      const prof = await run<any>(db.from("profiles").select("*").eq("id", u.user.id).maybeSingle());
      return {
        id: u.user.id,
        email: u.user.email ?? null,
        name: prof?.full_name ?? (u.user.user_metadata?.full_name as string) ?? null,
        roles,
        perms,
      };
    },
    staleTime: 60_000,
  });
}

export function useCan(module: string) {
  const { data } = useMe();
  return { read: !!data?.perms[module]?.read, write: !!data?.perms[module]?.write };
}

// ---------- Edição ----------
export type Edition = {
  id: string; name: string; year: number; starts_on: string; ends_on: string; venue: string | null;
  is_active: boolean; reservation_hold_days: number | null; reservation_expiry_action: string | null; contract_template: string | null;
};
export function useEdition() {
  return useQuery({
    queryKey: qk.edition,
    queryFn: async () => {
      const rows = await run<Edition[]>(db.from("editions").select("*").order("is_active", { ascending: false }).order("year", { ascending: false }).limit(1));
      return rows[0] ?? null;
    },
  });
}
export function useEditionId() {
  return useEdition().data?.id;
}

// ---------- Leitura genérica ----------
function useList<T = any>(name: string, fn: () => PromiseLike<{ data: any; error: any }>, deps: unknown[] = [], enabled = true) {
  return useQuery<T[]>({ queryKey: qk.list(name, ...deps), queryFn: () => run(fn()) as Promise<T[]>, enabled });
}
function useOne<T = any>(name: string, id: string | undefined, fn: () => PromiseLike<{ data: any; error: any }>) {
  return useQuery<T | null>({ queryKey: qk.list(name, id), queryFn: () => run(fn()) as Promise<T | null>, enabled: !!id });
}

export const useCompanies = () =>
  useList("companies", () => db.from("companies").select("*, contacts(id,name,email,phone,is_primary)").order("trade_name"));
export const useCompany = (id?: string) =>
  useOne("company", id, () => db.from("companies").select("*, contacts(*), company_participations(*, editions(name))").eq("id", id).maybeSingle());

export const useSpaces = () => {
  const ed = useEditionId();
  return useList("spaces", () => db.from("space_status_v").select("*").eq("edition_id", ed).order("code"), [ed], !!ed);
};
export const useFloorPlans = () => {
  const ed = useEditionId();
  return useList("floor_plans", () => db.from("floor_plans").select("*").eq("edition_id", ed).order("created_at"), [ed], !!ed);
};

const DEAL_SELECT = "*, companies(id, trade_name, legal_name), deal_spaces(space_id, price_cents, spaces(id, code, area_m2, sector))";
export const useDeals = () => {
  const ed = useEditionId();
  return useList("deals", () => db.from("deals").select(DEAL_SELECT).eq("edition_id", ed).order("updated_at", { ascending: false }), [ed], !!ed);
};
export const useDeal = (id?: string) =>
  useOne("deal", id, () => db.from("deals").select(DEAL_SELECT + ", deal_events(*)").eq("id", id).maybeSingle());

const CONTRACT_SELECT = "*, companies(id, trade_name, legal_name, tax_id), contract_spaces(space_id, spaces(id, code, area_m2)), deals(id, status, conditions)";
export const useContracts = () => {
  const ed = useEditionId();
  return useList("contracts", () => db.from("contracts").select(CONTRACT_SELECT).eq("edition_id", ed).order("created_at", { ascending: false }), [ed], !!ed);
};
export const useContract = (id?: string) =>
  useOne("contract", id, () => db.from("contracts").select(CONTRACT_SELECT + ", contract_versions(id, version, created_at, created_by)").eq("id", id).maybeSingle());

export const useInstallments = (enabled = true) => {
  const ed = useEditionId();
  return useList(
    "installments",
    () => db.from("installments").select("*, payments(*), contracts(id, number, company_id, companies(trade_name))").eq("edition_id", ed).order("due_date"),
    [ed],
    !!ed && enabled,
  );
};

export const useInspections = () => {
  const ed = useEditionId();
  return useList(
    "inspections",
    () => db.from("inspections").select("*, spaces(id, code), companies(id, trade_name), contracts(id, number)").eq("edition_id", ed).order("scheduled_for", { ascending: true }),
    [ed],
    !!ed,
  );
};
export const useInspection = (id?: string) =>
  useOne("inspection", id, () => db.from("inspections").select("*, spaces(id, code, area_m2, sector), companies(id, trade_name), contracts(id, number), inspection_items(*)").eq("id", id).maybeSingle());

export const useActivities = () => {
  const ed = useEditionId();
  return useList("activities", () => db.from("activities").select("*").eq("edition_id", ed).order("due_at", { ascending: true, nullsFirst: false }), [ed], !!ed);
};

export const useDocuments = () =>
  useList("documents", () => db.from("documents").select("*, document_links(*)").order("created_at", { ascending: false }));
export const useEntityDocuments = (type: string, id?: string) =>
  useQuery({
    queryKey: qk.list("entity_docs", type, id),
    enabled: !!id,
    queryFn: async () => {
      const links = await run<any[]>(db.from("document_links").select("document_id, documents(*)").eq("entity_type", type).eq("entity_id", id));
      return links.map((l) => l.documents).filter(Boolean);
    },
  });

export const useProfiles = () => useList("profiles", () => db.from("profiles").select("*").order("full_name"));
export const useUserRoles = () => useList("user_roles", () => db.from("user_roles").select("*"));
export const usePermissions = () => useList("role_permissions", () => db.from("role_permissions").select("*"));
export const useTemplates = () => useList("checklist_templates", () => db.from("checklist_templates").select("*").order("created_at"));
export const useAudit = () => useList("audit", () => db.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200));

// ---------- Mutação padronizada ----------
// Após gravação confirmada, invalida todas as consultas do banco: dashboard, mapa e detalhes
// refletem a mesma informação persistida.
export function useDbMutation<V, R = unknown>(fn: (v: V) => Promise<R>, opts?: { success?: string; onSuccess?: (r: R, v: V) => void }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      qc.invalidateQueries({ queryKey: ["db"] });
      if (opts?.success) toast.success(opts.success);
      opts?.onSuccess?.(r, v);
    },
    onError: (e) => toast.error("Não foi salvo: " + errMsg(e)),
  });
}

export const api = {
  insert: (table: string, row: any) => run<any>(db.from(table).insert(row).select().single()),
  update: (table: string, id: string, patch: any) => run<any>(db.from(table).update(patch).eq("id", id).select().single()),
  remove: (table: string, id: string) => run(db.from(table).delete().eq("id", id)),
  rpc: <T = any>(name: string, args: Record<string, unknown>) => run<T>(db.rpc(name, args)),
  raw: db,
};

// ---------- Arquivos ----------
export async function uploadDocument(args: {
  file: File; category: string; editionId?: string | null; links: { type: string; id: string }[]; previousId?: string; version?: number;
}) {
  const { data: u } = await supabase.auth.getUser();
  const path = `${args.editionId ?? "geral"}/${crypto.randomUUID()}-${args.file.name.replace(/[^\w.-]+/g, "_")}`;
  const up = await supabase.storage.from("documents").upload(path, args.file, { contentType: args.file.type });
  if (up.error) throw up.error;
  const doc = await api.insert("documents", {
    edition_id: args.editionId ?? null, name: args.file.name, category: args.category, storage_path: path,
    mime_type: args.file.type, size_bytes: args.file.size, uploaded_by: u.user?.id, previous_id: args.previousId ?? null, version: args.version ?? 1,
  });
  if (args.links.length) {
    await run(db.from("document_links").insert(args.links.map((l) => ({ document_id: doc.id, entity_type: l.type, entity_id: l.id }))));
  }
  return doc;
}

export async function signedUrl(path: string, seconds = 300) {
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}
