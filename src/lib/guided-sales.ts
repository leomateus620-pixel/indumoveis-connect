import type { CommercialSegmentKey } from "./commercial";

export type GuidedSaleOverrides = Record<string, { amountCents: number; reason: string }>;
export type GuidedSalePayment = {
  method: "pix" | "boleto" | "cartao" | "transferencia" | "dinheiro" | "outro";
  mode: "a_vista" | "parcelado";
  installmentCount: number;
  firstDueOn: string;
  intervalMonths: number;
  note?: string;
  discountModality?: "cash_full" | "installments_on_time" | "eligible_member";
  discountEvidence?: string;
  feeKeys?: string[];
  feeEvidence?: string;
};
export type GuidedSaleCompanyInput = {
  legal_name: string;
  trade_name: string;
  tax_id: string;
  email?: string;
  phone?: string;
  representative_name?: string;
  city?: string;
  state?: string;
};
export type GuidedSaleCompany = {
  id: string;
  legal_name: string;
  trade_name: string;
  tax_id: string | null;
};
export type GuidedSaleQuoteInput = {
  editionId: string;
  spaceIds: string[];
  agreedOverrides?: GuidedSaleOverrides;
  payment?: GuidedSalePayment | null;
};
export type GuidedSaleScheduleItem = { number: number; dueOn: string; amountCents: number };
export type GuidedSaleQuote = {
  editionId: string;
  segmentKey: CommercialSegmentKey;
  lots: {
    id: string;
    code: string;
    areaM2: number;
    tariffCents: number | null;
    grossCents: number | null;
    agreedCents: number | null;
    priceReason: string | null;
  }[];
  areaM2: number;
  grossCents: number | null;
  totalCents: number | null;
  schedule: GuidedSaleScheduleItem[];
  policy: {
    version: number;
    firstDueOn: string;
    lastDueOn: string;
    maxInstallments: number;
    today: string;
  };
  quoteFingerprint: string;
};
export type SaveGuidedSaleInput = GuidedSaleQuoteInput & {
  quoteFingerprint: string;
  companyId?: string | null;
  company?: GuidedSaleCompanyInput | null;
  idempotencyKey: string;
  signatureNote?: string | null;
  attachmentId?: string | null;
};
export type CompleteGuidedSaleInput = {
  dealId: string;
  signatureNote: string;
  attachmentId?: string | null;
  payment?: GuidedSalePayment | null;
};
export type GuidedSaleResult = {
  dealId: string;
  contractId: string;
  companyId: string;
  status: "reservada" | "contratada";
};
export class GuidedSaleAttachmentRetry extends Error {
  constructor() {
    super("Não foi possível confirmar o preparo do PDF. Tente novamente com o mesmo arquivo.");
    this.name = "GuidedSaleAttachmentRetry";
  }
}

export type GuidedSaleAttachment = {
  id: string;
  name: string;
  storagePath: string;
  createdAt: string;
};
export type GuidedSaleView = Omit<GuidedSaleResult, "status"> & {
  editionId: string;
  status: "reservada" | "contratada" | "cancelada" | "perdida" | "negociacao" | "proposta";
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  quote: GuidedSaleQuote;
  payment: GuidedSalePayment;
  schedule: GuidedSaleScheduleItem[];
  signature: { signedBy: string; signedAt: string; note: string; documentId: string } | null;
  attachments: GuidedSaleAttachment[];
  company?: { id: string; legalName: string; tradeName: string; taxId: string | null };
};
