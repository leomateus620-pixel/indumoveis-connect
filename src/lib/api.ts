/* eslint-disable @typescript-eslint/no-explicit-any */
// Camada única de acesso a dados. Todas as telas usam estas consultas/mutações.
// Autorização efetiva: RLS + funções transacionais no banco (can_read/can_write).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "./format";
import { mimeFor, validateDocFile } from "./documents";

const db = supabase as any;

async function run<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

export const qk = {
  me: (userId: string | undefined) => ["db", "me", userId],
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

export function useMe(userId?: string) {
  return useQuery({
    queryKey: qk.me(userId),
    enabled: true,
    retry: 1,
    queryFn: async (): Promise<Me | null> => {
      const { data: u, error: authError } = await supabase.auth.getUser();
      if (authError || !u.user || (userId && u.user.id !== userId))
        throw new Error("Não foi possível confirmar a sessão.");
      await run(db.rpc("ensure_profile"));
      const roles = (
        await run<any[]>(db.from("user_roles").select("role").eq("user_id", u.user.id))
      ).map((r) => r.role as string);
      const rp = roles.length
        ? await run<any[]>(db.from("role_permissions").select("*").in("role", roles))
        : [];
      const perms: Me["perms"] = {};
      const admin = roles.includes("admin");
      for (const m of [
        "dashboard",
        "mapa",
        "comercial",
        "empresas",
        "contratos",
        "vistorias",
        "financeiro",
        "agenda",
        "documentos",
        "admin",
      ]) {
        const rows = rp.filter((r) => r.module === m);
        perms[m] = {
          read: admin || rows.some((r) => r.can_read || r.can_write),
          write: admin || rows.some((r) => r.can_write),
        };
      }
      const prof = await run<any>(
        db.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
      );
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
  id: string;
  name: string;
  year: number;
  starts_on: string;
  ends_on: string;
  venue: string | null;
  is_active: boolean;
  reservation_hold_days: number | null;
  reservation_expiry_action: string | null;
  contract_template: string | null;
  timezone: string;
};
export function useEdition() {
  return useQuery({
    queryKey: qk.edition,
    queryFn: async () => {
      const rows = await run<Edition[]>(
        db
          .from("editions")
          .select("*")
          .order("is_active", { ascending: false })
          .order("year", { ascending: false })
          .limit(1),
      );
      return rows[0] ?? null;
    },
  });
}
export function useEditionId() {
  return useEdition().data?.id;
}

// ---------- Leitura genérica ----------
function useList<T = any>(
  name: string,
  fn: () => PromiseLike<{ data: any; error: any }>,
  deps: unknown[] = [],
  enabled = true,
) {
  return useQuery<T[]>({
    queryKey: qk.list(name, ...deps),
    queryFn: () => run(fn()) as Promise<T[]>,
    enabled,
  });
}
function useOne<T = any>(
  name: string,
  id: string | undefined,
  fn: () => PromiseLike<{ data: any; error: any }>,
) {
  return useQuery<T | null>({
    queryKey: qk.list(name, id),
    queryFn: () => run(fn()) as Promise<T | null>,
    enabled: !!id,
  });
}

export const useCompanies = () =>
  useList("companies", () =>
    db.from("companies").select("*, contacts(id,name,email,phone,is_primary)").order("trade_name"),
  );
export const useCompany = (id?: string) =>
  useOne("company", id, () =>
    db
      .from("companies")
      .select("*, contacts(*), company_participations(*, editions(name))")
      .eq("id", id)
      .maybeSingle(),
  );

export const useSpaces = () => {
  const ed = useEditionId();
  return useList(
    "spaces",
    () => db.from("space_status_v").select("*").eq("edition_id", ed).order("code"),
    [ed],
    !!ed,
  );
};

// O mapa territorial não precisa de preços, compradores, contratos ou notas.
// A view continua sendo a única fonte de situação; sem leitura Comercial a
// security_invoker view não consegue confirmar as negociações protegidas por RLS.
export type MapCommercialSpace = {
  id: string;
  edition_id: string;
  sector: string | null;
  commercial_status: string | null;
};
export function useMapCommercialSpaces(enabled = true) {
  const editionId = useEditionId();
  const map = useCan("mapa");
  const commercial = useCan("comercial");
  const permitted = map.read && commercial.read;
  return useQuery<MapCommercialSpace[]>({
    queryKey: qk.list("spaces", "commercial-map", editionId, permitted),
    enabled: enabled && !!editionId && permitted,
    retry: 1,
    queryFn: ({ signal }) =>
      run<MapCommercialSpace[]>(
        db
          .from("space_status_v")
          .select("id, edition_id, sector, commercial_status")
          .eq("edition_id", editionId)
          .abortSignal(signal),
      ),
  });
}

export type MapDealSpaces = {
  id: string;
  edition_id: string;
  deal_spaces: { space_id: string }[];
};
export function useMapDealSpaces(dealId?: string, enabled = true) {
  const editionId = useEditionId();
  const map = useCan("mapa");
  const commercial = useCan("comercial");
  const permitted = map.read && commercial.read;
  return useQuery<MapDealSpaces | null>({
    queryKey: qk.list("deal", "commercial-map", editionId, dealId, permitted),
    enabled: enabled && !!editionId && !!dealId && permitted,
    retry: 1,
    queryFn: ({ signal }) =>
      run<MapDealSpaces | null>(
        db
          .from("deals")
          .select("id, edition_id, deal_spaces(space_id)")
          .eq("edition_id", editionId)
          .eq("id", dealId)
          .abortSignal(signal)
          .maybeSingle(),
      ),
  });
}

export const useFloorPlans = () => {
  const ed = useEditionId();
  return useList(
    "floor_plans",
    () => db.from("floor_plans").select("*").eq("edition_id", ed).order("created_at"),
    [ed],
    !!ed,
  );
};

const DEAL_SELECT =
  "*, companies(id, trade_name, legal_name), deal_spaces(space_id, price_cents, spaces(id, code, area_m2, sector))";
export const useDeals = () => {
  const ed = useEditionId();
  return useList(
    "deals",
    () =>
      db
        .from("deals")
        .select(DEAL_SELECT)
        .eq("edition_id", ed)
        .order("updated_at", { ascending: false }),
    [ed],
    !!ed,
  );
};
export const useDeal = (id?: string) =>
  useOne("deal", id, () =>
    db
      .from("deals")
      .select(DEAL_SELECT + ", deal_events(*)")
      .eq("id", id)
      .maybeSingle(),
  );

const CONTRACT_SELECT =
  "*, companies(id, trade_name, legal_name, tax_id), contract_spaces(space_id, spaces(id, code, area_m2)), deals(id, status, conditions, company_id, total_cents, deal_spaces(space_id, price_cents))";
export const useContracts = () => {
  const ed = useEditionId();
  return useList(
    "contracts",
    () =>
      db
        .from("contracts")
        .select(CONTRACT_SELECT)
        .eq("edition_id", ed)
        .order("created_at", { ascending: false }),
    [ed],
    !!ed,
  );
};
export const useContract = (id?: string) =>
  useOne("contract", id, () =>
    db
      .from("contracts")
      .select(CONTRACT_SELECT + ", contract_versions(id, version, created_at, created_by)")
      .eq("id", id)
      .maybeSingle(),
  );

export const useInstallments = (enabled = true) => {
  const ed = useEditionId();
  return useList(
    "installments",
    () =>
      db
        .from("installments")
        .select("*, payments(*), contracts(id, number, status, company_id, companies(trade_name))")
        .eq("edition_id", ed)
        .order("due_date"),
    [ed],
    !!ed && enabled,
  );
};

export const useInspections = (enabled = true) => {
  const ed = useEditionId();
  return useList(
    "inspections",
    () =>
      db
        .from("inspections")
        .select("*, spaces(id, code), companies(id, trade_name), contracts(id, number)")
        .eq("edition_id", ed)
        .order("scheduled_for", { ascending: true }),
    [ed],
    !!ed && enabled,
  );
};
export const useInspection = (id?: string) =>
  useOne("inspection", id, () =>
    db
      .from("inspections")
      .select(
        "*, spaces(id, code, area_m2, sector), companies(id, trade_name), contracts(id, number), inspection_items(*)",
      )
      .eq("id", id)
      .maybeSingle(),
  );

export const useActivities = () => {
  const ed = useEditionId();
  return useList(
    "activities",
    () =>
      db
        .from("activities")
        .select(
          "*, activity_categories(id,name), activity_assignees(profile_id,is_primary,profiles(id,full_name,email)), activity_commissions(commission_id,commissions(id,name,is_coordinating)), activity_versions(id,version,created_at,actor)",
        )
        .eq("edition_id", ed)
        .order("start_at", { ascending: true, nullsFirst: false }),
    [ed],
    !!ed,
  );
};

export const useActivityCategories = () => {
  const ed = useEditionId();
  return useList(
    "activity_categories",
    () => db.from("activity_categories").select("*").eq("edition_id", ed).order("name"),
    [ed],
    !!ed,
  );
};

export const useCommissions = () => {
  const ed = useEditionId();
  return useList(
    "commissions",
    () => db.from("commissions").select("*").eq("edition_id", ed).order("name"),
    [ed],
    !!ed,
  );
};

export function useAgendaPeople() {
  return useQuery<any[]>({
    queryKey: qk.list("agenda_people"),
    queryFn: async () => {
      const roles = await run<any[]>(db.from("user_roles").select("user_id,role"));
      const ids = [...new Set(roles.map((row) => row.user_id))];
      if (!ids.length) return [];
      const profiles = await run<any[]>(
        db.from("profiles").select("id,full_name,email").in("id", ids),
      );
      return profiles
        .map((profile) => ({
          ...profile,
          roles: roles.filter((row) => row.user_id === profile.id).map((row) => row.role),
        }))
        .sort((a, b) =>
          (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "", "pt-BR"),
        );
    },
  });
}

export const saveActivity = (args: Record<string, unknown>) =>
  api.rpc<string>("save_activity", args);
export const setActivityStatus = (
  id: string,
  status: "aberta" | "concluida" | "cancelada",
  version: number,
) =>
  api.rpc<number>("set_activity_status", {
    p_activity_id: id,
    p_status: status,
    p_expected_version: version,
  });

// ---------- Documentos ----------
export type DocSearch = {
  scope: "edition" | "general" | "all";
  editionId?: string | null;
  q?: string;
  category?: string;
  collection?: "all" | "recent" | "unlinked";
  linkType?: string;
  uploader?: string;
  from?: string;
  to?: string;
  sort?: "recent" | "name" | "category";
  limit?: number;
  offset?: number;
  entityType?: string;
  entityId?: string;
};
export type DocSearchResult = {
  rows: any[];
  total: number;
  facets: { all: number; recent: number; unlinked: number; categories: Record<string, number> };
};
function searchDocs(p: DocSearch) {
  return run<DocSearchResult>(
    db.rpc("search_documents", {
      p_scope: p.scope,
      p_edition_id: p.editionId ?? null,
      p_q: p.q || null,
      p_category: p.category || null,
      p_collection: p.collection || "all",
      p_link_type: p.linkType || null,
      p_uploader: p.uploader || null,
      p_from: p.from || null,
      p_to: p.to || null,
      p_sort: p.sort || "recent",
      p_limit: p.limit ?? 25,
      p_offset: p.offset ?? 0,
      p_entity_type: p.entityType ?? null,
      p_entity_id: p.entityId ?? null,
    }),
  );
}
export const useDocumentSearch = (p: DocSearch, enabled = true) =>
  useQuery({
    queryKey: qk.list("documents", p),
    queryFn: () => searchDocs(p),
    enabled: enabled && (p.scope !== "edition" || !!p.editionId),
    placeholderData: (prev) => prev,
  });
/** Anexos de um registro: somente a versão vigente de cada documento (mesma regra da central). */
export const useEntityDocuments = (type: string, id?: string) =>
  useQuery({
    queryKey: qk.list("documents", "entity", type, id),
    enabled: !!id,
    queryFn: async () =>
      (await searchDocs({ scope: "all", entityType: type, entityId: id, limit: 100 })).rows,
  });
/** Versão vigente de uma cadeia (para seleção fora da página atual). */
export const useCurrentDocument = (rootId?: string) =>
  useQuery({
    queryKey: qk.list("documents", "current", rootId),
    enabled: !!rootId,
    queryFn: async () => {
      const rows = await run<any[]>(
        db
          .from("documents")
          .select("*, document_links(*)")
          .eq("root_id", rootId)
          .eq("is_current", true)
          .eq("status", "ativo")
          .limit(1),
      );
      return rows[0] ?? null;
    },
  });
export const useDocumentLinks = (rootId?: string) =>
  useQuery({
    queryKey: qk.list("documents", "links", rootId),
    enabled: !!rootId,
    queryFn: async () => {
      const links = await run<any[]>(
        db.from("document_links").select("*").eq("document_id", rootId),
      );
      const labels = await Promise.all(
        links.map((l) =>
          run<string | null>(
            db.rpc("doc_entity_label", { _type: l.entity_type, _id: l.entity_id }),
          ).catch(() => null),
        ),
      );
      return links.map((l, i) => ({ type: l.entity_type, id: l.entity_id, label: labels[i] }));
    },
  });
export const useDocumentVersions = (rootId?: string) =>
  useQuery({
    queryKey: qk.list("documents", "versions", rootId),
    enabled: !!rootId,
    queryFn: () =>
      run<any[]>(
        db
          .from("documents")
          .select("*")
          .eq("root_id", rootId)
          .eq("status", "ativo")
          .order("version", { ascending: false }),
      ),
  });
export const updateDocumentMeta = (v: {
  rootId: string;
  title: string;
  description: string;
  category: string;
}) =>
  api.rpc("update_document_meta", {
    p_root_id: v.rootId,
    p_title: v.title,
    p_description: v.description,
    p_category: v.category,
  });
export const linkDocument = (docId: string, type: string, id: string) =>
  api.rpc("link_document", { p_doc_id: docId, p_type: type, p_entity_id: id });
export const unlinkDocument = (docId: string, type: string, id: string) =>
  api.rpc("unlink_document", { p_doc_id: docId, p_type: type, p_entity_id: id });

export const useProfiles = () =>
  useList("profiles", () => db.from("profiles").select("*").order("full_name"));
export const useUserRoles = () => useList("user_roles", () => db.from("user_roles").select("*"));
export const usePermissions = () =>
  useList("role_permissions", () => db.from("role_permissions").select("*"));
export const useTemplates = () =>
  useList("checklist_templates", () =>
    db.from("checklist_templates").select("*").order("created_at"),
  );
export const useAudit = () =>
  useList("audit", () =>
    db.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200),
  );

// ---------- Mutação padronizada ----------
// Após gravação confirmada, invalida todas as consultas do banco: dashboard, mapa e detalhes
// refletem a mesma informação persistida.
export function useDbMutation<V, R = unknown>(
  fn: (v: V) => Promise<R>,
  opts?: { success?: string; onSuccess?: (r: R, v: V) => void },
) {
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
  update: (table: string, id: string, patch: any) =>
    run<any>(db.from(table).update(patch).eq("id", id).select().single()),
  remove: (table: string, id: string) => run(db.from(table).delete().eq("id", id)),
  rpc: <T = any>(name: string, args: Record<string, unknown>) => run<T>(db.rpc(name, args)),
  raw: db,
};

// ---------- Arquivos ----------
// Envio em duas fases: o banco reserva o registro pendente e define o caminho; o arquivo é
// enviado ao armazenamento; só então o banco confere o objeto e ativa o documento.
// Em falha antes da ativação, o envio é compensado (objeto e registro pendente próprios).
type Reserved = { id: string; storage_path: string; status: string; version?: number };

function putObject(path: string, file: File, token: string, onProgress?: (p: number) => void) {
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const url = `${base}/storage/v1/object/documents/${path.split("/").map(encodeURIComponent).join("/")}`;
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("apikey", key);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", mimeFor(file.name));
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      // 409/400 "Duplicate" = objeto já enviado numa tentativa anterior do mesmo envio.
      if (xhr.status < 300 || /Duplicate|already exists/i.test(xhr.responseText)) resolve();
      else {
        let msg = `Falha no envio (${xhr.status})`;
        try {
          msg = JSON.parse(xhr.responseText).message || msg;
        } catch {
          /* resposta não-JSON */
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Conexão interrompida durante o envio."));
    xhr.onabort = () => reject(new Error("Envio cancelado."));
    xhr.send(file);
  });
}

async function completeUpload(r: Reserved, file: File, onProgress?: (p: number) => void) {
  if (r.status === "ativo") return r;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente.");
  try {
    await putObject(r.storage_path, file, token, onProgress);
  } catch (e) {
    await compensate(r);
    throw e;
  }
  try {
    await api.rpc("finalize_document_upload", { p_id: r.id });
  } catch {
    // Uma nova tentativa de finalização antes de compensar (falha de rede transitória).
    try {
      await api.rpc("finalize_document_upload", { p_id: r.id });
    } catch (e2) {
      await compensate(r);
      throw e2;
    }
  }
  return { ...r, status: "ativo" };
}

async function compensate(r: Reserved) {
  await supabase.storage
    .from("documents")
    .remove([r.storage_path])
    .catch(() => {});
  await api.rpc("cancel_document_upload", { p_id: r.id }).catch(() => {});
}

export async function uploadDocument(args: {
  file: File;
  category: string;
  editionId?: string | null;
  links: { type: string; id: string }[];
  title?: string;
  description?: string;
  idempotencyKey?: string;
  onProgress?: (p: number) => void;
}) {
  const v = validateDocFile(args.file);
  if (v) throw new Error(v);
  const r = await api.rpc<Reserved>("begin_document_upload", {
    p_edition_id: args.editionId ?? null,
    p_name: args.file.name,
    p_title: args.title ?? null,
    p_description: args.description ?? null,
    p_category: args.category,
    p_mime: mimeFor(args.file.name),
    p_size: args.file.size,
    p_links: args.links,
    p_idempotency_key: args.idempotencyKey ?? crypto.randomUUID(),
  });
  return completeUpload(r, args.file, args.onProgress);
}

export async function uploadDocumentVersion(args: {
  rootId: string;
  expectedVersion: number;
  file: File;
  idempotencyKey?: string;
  onProgress?: (p: number) => void;
}) {
  const v = validateDocFile(args.file);
  if (v) throw new Error(v);
  const r = await api.rpc<Reserved>("begin_document_version", {
    p_root_id: args.rootId,
    p_expected_version: args.expectedVersion,
    p_name: args.file.name,
    p_mime: mimeFor(args.file.name),
    p_size: args.file.size,
    p_idempotency_key: args.idempotencyKey ?? crypto.randomUUID(),
  });
  return completeUpload(r, args.file, args.onProgress);
}

/** URL temporária gerada sob demanda; nunca persistida. */
export async function signedUrl(path: string, seconds = 300, download?: string) {
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(path, seconds, download ? { download } : undefined);
  if (error) throw error;
  return data.signedUrl;
}
