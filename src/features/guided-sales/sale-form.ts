import type { CommercialLot } from "@/lib/commercial";
import { fileExt, validateDocFile } from "@/lib/documents";
import { errMsg } from "@/lib/format";

export const paymentMethods = {
  pix: "Pix",
  boleto: "Boleto",
  cartao: "Cartão",
  transferencia: "Transferência",
  dinheiro: "Dinheiro",
  outro: "Outro",
} as const;
export const discountLabels = {
  cash_full: "Pagamento à vista",
  installments_on_time: "Pontualidade",
  eligible_member: "Associação elegível",
} as const;
export const feeNames = {
  internal_cleaning: "Administração e limpeza interna",
  external_cleaning: "Administração e limpeza externa",
  external_ppci: "PPCI externo",
  provisional_license: "Alvará provisório",
} as const;

export type PriceField = { amount: string; reason: string };
export type PriceFields = Record<string, PriceField>;

export function readPositiveCents(value: string): number | null {
  const normalized = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(normalized)) return null;
  const [whole, decimal = ""] = normalized.replaceAll(".", "").split(",");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 999_999_999_999 ? cents : null;
}

export function agreedPrices(lots: readonly CommercialLot[], fields: PriceFields) {
  const overrides: Record<string, { amountCents: number; reason: string }> = {};
  let agreedCents = 0;
  for (const lot of lots) {
    const field = fields[lot.id];
    if (!field && lot.grossCents != null) {
      agreedCents += lot.grossCents;
      continue;
    }
    const amountCents = readPositiveCents(field?.amount ?? "");
    const reason = field?.reason.trim() ?? "";
    if (!amountCents || !reason) {
      return {
        overrides,
        agreedCents: null,
        issue: `Informe o valor positivo e o motivo para o lote ${lot.code}.`,
      };
    }
    overrides[lot.id] = { amountCents, reason };
    agreedCents += amountCents;
  }
  return { overrides, agreedCents, issue: null };
}

export function civilToday(timezone = "America/Sao_Paulo") {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts();
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function isUncertainSaleError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error ? String(error.code ?? "") : "";
  return (
    code === "" ||
    ["500", "502", "503", "504", "PGRST000", "PGRST001", "PGRST002"].includes(code) ||
    /^08/.test(code)
  );
}

export function validSaleFile(file: File | null) {
  return !!file && !validateDocFile(file) && fileExt(file.name) === "pdf";
}

export function saleError(error: unknown) {
  const message = errMsg(error);
  if (/lote.*não está mais disponível|espaço já vinculado/i.test(message))
    return `${message} Volte ao mapa para revisar os lotes selecionados.`;
  if (/quote|cota[çc][ãa]o|cotados|fingerprint|TOTAL_MISMATCH/i.test(message))
    return "Os valores ou as condições mudaram. Volte para Pagamento e gere uma nova revisão.";
  if (
    /tax_id|cpf.*cadastrad|cnpj.*cadastrad|documento.*cadastrad|companies_document/i.test(message)
  )
    return "Já existe um cadastro com este CPF ou CNPJ. Procure a empresa na lista de cadastros.";
  return message;
}
