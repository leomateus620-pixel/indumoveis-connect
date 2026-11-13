export const commercialSegmentKeys = [
  "p1",
  "p3",
  "p8",
  "p12",
  "p13",
  "p14",
  "external",
  "automobile",
] as const;

export type CommercialSegmentKey = (typeof commercialSegmentKeys)[number];
export type CommercialLotStatus =
  "vendido" | "reservado" | "em_negociacao" | "disponivel" | "bloqueado" | "indisponivel";

export type CommercialAggregate = {
  total: number;
  sold: number;
  reserved: number;
  negotiating: number;
  available: number;
  blocked: number;
  soldPercent: number | null;
  knownAreaM2: number | null;
  soldAreaM2: number | null;
  areaKnownCount: number;
  soldAreaKnownCount: number;
  soldAreaPercent: number | null;
  pricedCount?: number;
  grossCents?: number | null;
  availableGrossCents?: number | null;
  availablePricedCount?: number;
};

export type CommercialSegmentAggregate = CommercialAggregate & {
  key: CommercialSegmentKey;
  pavilionNumber: number | null;
  label: string;
  description: string;
};

export type CommercialOverview = {
  overall: CommercialAggregate;
  segments: CommercialSegmentAggregate[];
  financial: boolean;
  activity: boolean;
};

export type CommercialLot = {
  id: string;
  segmentKey: CommercialSegmentKey;
  code: string;
  environmentId: string | null;
  geometryId: string | null;
  areaM2: number | null;
  areaPending: boolean;
  status: CommercialLotStatus;
  pricingState: string;
  cornerState: string | null;
  tariffCents?: number | null;
  grossCents?: number | null;
  policyVersion?: number | null;
  policySource?: string | null;
  deal?: {
    id: string;
    status: string;
    companyName?: string | null;
    spacePriceCents?: number | null;
  } | null;
};

export type CommercialSalesEvent = { date: string; signed: number; cancelled: number };
export type CommercialFinancialTotals = {
  contractedCents: number | null;
  negotiatingCents: number | null;
  receivedCents: number | null;
  openCents: number | null;
  mixedDealsExcluded?: number;
};

export type CommercialDetails = {
  lots: CommercialLot[];
  events: CommercialSalesEvent[];
  totals: CommercialFinancialTotals | null;
};

const commercialPercent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function formatCommercialPercent(value: number | null) {
  if (value == null) return "—";
  if (value > 0 && value < 0.1) return "<0,1%";
  if (value < 100 && value > 99.9) return ">99,9%";
  return commercialPercent.format(value / 100);
}

export type ContractPricingTerms = {
  policy_version: number;
  installment_limit: number;
  first_due: string;
  last_due: string;
  today: string;
  scope: "internal" | "external" | "mixed" | "unknown";
  discount_rules?: {
    modality: string;
    basis_points: number;
    eligibility: string;
    application_condition: string;
  }[];
  fee_rules?: {
    fee_key: string;
    scope: string;
    amount_cents: number;
    application_condition: string;
  }[];
  recorded_terms?: {
    version: number;
    discount_modality: string | null;
    discount_evidence: string | null;
    fee_keys: string[];
    fee_evidence: string | null;
    mixed_treatment: string | null;
    matches_contract: boolean;
  } | null;
};
