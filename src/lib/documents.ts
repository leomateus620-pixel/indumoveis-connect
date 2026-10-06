// Regras puras da central documental (espelham as validações do banco — exibição/pré-checagem).
export const DOC_MAX_BYTES = 25 * 1024 * 1024;
export const DOC_ALLOWED_EXT = [
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "docx",
  "xlsx",
  "pptx",
  "dwg",
  "zip",
  "txt",
  "csv",
] as const;
export const DOC_ACCEPT = DOC_ALLOWED_EXT.map((e) => "." + e).join(",");

/** Rótulos dos tipos de vínculo aceitos por documentos (inclui Agenda). */
export const DOC_LINK_LABEL: Record<string, string> = {
  company: "Empresa",
  deal: "Negociação",
  contract: "Contrato",
  inspection: "Vistoria",
  space: "Espaço",
  installment: "Parcela",
  activity: "Atividade",
};

/** Módulo cuja leitura é exigida para cada tipo de vínculo (mesma tabela do banco). */
export const DOC_LINK_MODULE: Record<string, string> = {
  company: "empresas",
  deal: "comercial",
  contract: "contratos",
  inspection: "vistorias",
  space: "mapa",
  installment: "financeiro",
  activity: "agenda",
};

export function fileExt(name: string) {
  const m = /\.([^.]+)$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export function validateDocFile(file: { name: string; size: number }): string | null {
  if (!file.name.trim()) return "Arquivo sem nome.";
  if (file.size <= 0) return "Arquivo vazio.";
  if (file.size > DOC_MAX_BYTES) return "Arquivo acima de 25 MB.";
  if (!(DOC_ALLOWED_EXT as readonly string[]).includes(fileExt(file.name)))
    return "Formato não permitido. Aceitos: PDF, JPG, PNG, WEBP, DOCX, XLSX, PPTX, DWG, ZIP, TXT, CSV.";
  return null;
}

export type DocKind = "pdf" | "image" | "sheet" | "doc" | "slides" | "cad" | "archive" | "text" | "other";
export function docKind(name: string, mime?: string | null): DocKind {
  const e = fileExt(name);
  if (e === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "webp"].includes(e)) return "image";
  if (["xlsx", "csv"].includes(e)) return "sheet";
  if (e === "docx") return "doc";
  if (e === "pptx") return "slides";
  if (e === "dwg") return "cad";
  if (e === "zip") return "archive";
  if (e === "txt") return "text";
  if (mime?.startsWith("image/")) return "image";
  return "other";
}

/** Prévia segura: só PDF e imagens raster são renderizados; nada de HTML/SVG. */
export function previewMode(name: string, mime?: string | null): "pdf" | "image" | "none" {
  const k = docKind(name, mime);
  return k === "pdf" ? "pdf" : k === "image" ? "image" : "none";
}

export function fmtBytes(n?: number | null) {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Versão vigente de uma cadeia: a ativa marcada como atual (ou a de maior número). */
export function currentVersion<T extends { version: number; is_current?: boolean; status?: string }>(
  rows: T[],
): T | undefined {
  const active = rows.filter((r) => (r.status ?? "ativo") === "ativo");
  return (
    active.find((r) => r.is_current) ?? [...active].sort((a, b) => b.version - a.version)[0]
  );
}

/** Um documento só pode ser lido por quem lê Documentos e TODAS as origens vinculadas. */
export function canReadDocument(
  perms: Record<string, { read: boolean }>,
  linkTypes: string[],
) {
  if (!perms.documentos?.read) return false;
  return linkTypes.every((t) => !!perms[DOC_LINK_MODULE[t]]?.read);
}
