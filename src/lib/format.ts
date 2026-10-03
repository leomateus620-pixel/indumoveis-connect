export const brl = (cents: number | null | undefined) =>
  cents == null
    ? "—"
    : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const toCents = (value: string) => {
  const n = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

export const centsToInput = (cents: number | null | undefined) =>
  cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");

export const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const date = d.length === 10 ? new Date(d + "T12:00:00") : new Date(d);
  return date.toLocaleDateString("pt-BR");
};
export const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export const area = (m2: number | null | undefined) =>
  m2 == null ? "—" : `${Number(m2).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;

export const today = () => new Date().toISOString().slice(0, 10);

type Tone = "neutral" | "info" | "warn" | "ok" | "danger" | "brand";
export const DEAL_STATUS: Record<string, { label: string; tone: Tone }> = {
  proposta: { label: "Proposta", tone: "neutral" },
  negociacao: { label: "Em negociação", tone: "info" },
  reservada: { label: "Reservada", tone: "warn" },
  contratada: { label: "Contratada", tone: "ok" },
  perdida: { label: "Perdida", tone: "danger" },
  cancelada: { label: "Cancelada", tone: "danger" },
};
export const DEAL_TRANSITIONS: Record<string, string[]> = {
  proposta: ["negociacao", "perdida", "cancelada"],
  negociacao: ["proposta", "reservada", "perdida", "cancelada"],
  reservada: ["negociacao", "contratada", "cancelada"],
  contratada: ["cancelada"],
  perdida: [],
  cancelada: [],
};
export const SPACE_STATUS: Record<string, { label: string; tone: Tone }> = {
  disponivel: { label: "Disponível", tone: "ok" },
  em_negociacao: { label: "Em negociação", tone: "info" },
  reservado: { label: "Reservado", tone: "warn" },
  vendido: { label: "Vendido", tone: "brand" },
  bloqueado: { label: "Bloqueado", tone: "neutral" },
};
export const CONTRACT_STATUS: Record<string, { label: string; tone: Tone }> = {
  elaboracao: { label: "Em elaboração", tone: "neutral" },
  emitido: { label: "Emitido", tone: "info" },
  assinado: { label: "Assinatura registrada", tone: "ok" },
  cancelado: { label: "Cancelado", tone: "danger" },
};
export const CONTRACT_TRANSITIONS: Record<string, string[]> = {
  elaboracao: ["emitido", "cancelado"],
  emitido: ["elaboracao", "assinado", "cancelado"],
  assinado: ["cancelado"],
  cancelado: [],
};
export const INSPECTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  agendada: { label: "Agendada", tone: "neutral" },
  em_andamento: { label: "Em andamento", tone: "info" },
  concluida: { label: "Concluída", tone: "ok" },
};
export const ACTIVITY_STATUS: Record<string, { label: string; tone: Tone }> = {
  aberta: { label: "Aberta", tone: "info" },
  concluida: { label: "Concluída", tone: "ok" },
  cancelada: { label: "Cancelada", tone: "neutral" },
};
export const ROLE_LABEL: Record<string, string> = {
  admin: "Administração",
  comercial: "Comercial",
  financeiro: "Financeiro",
  operacao: "Operação / Vistorias",
  consulta: "Consulta",
};
export const MODULES: { key: string; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "mapa", label: "Mapa Comercial" },
  { key: "comercial", label: "Comercialização" },
  { key: "empresas", label: "Empresas / Expositores" },
  { key: "contratos", label: "Contratos" },
  { key: "vistorias", label: "Vistorias" },
  { key: "financeiro", label: "Financeiro Operacional" },
  { key: "agenda", label: "Agenda / Atividades" },
  { key: "documentos", label: "Documentos" },
  { key: "admin", label: "Administração" },
];
export const DOC_CATEGORIES: Record<string, string> = {
  geral: "Geral",
  contrato: "Contrato",
  comprovante: "Comprovante",
  foto_vistoria: "Foto de vistoria",
  cadastro: "Cadastro da empresa",
  planta: "Planta",
};

export function errMsg(e: unknown) {
  if (!e) return "Erro desconhecido";
  if (typeof e === "object" && e && "message" in e) return String((e as { message: string }).message);
  return String(e);
}
