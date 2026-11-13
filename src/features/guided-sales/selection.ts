import type { CommercialLot, CommercialSegmentKey } from "@/lib/commercial";
import { SPACE_STATUS } from "@/lib/format";

const segments: Record<CommercialSegmentKey, string> = {
  p1: "Pavilhão 1",
  p3: "Pavilhão 3",
  p8: "Pavilhão 8",
  p12: "Pavilhão 12",
  p13: "Pavilhão 13",
  p14: "Pavilhão 14",
  external: "Área externa",
  automobile: "Salão do Automóvel",
};

export function saleSegmentLabel(segment: CommercialSegmentKey) {
  return segments[segment];
}

export function saleLotProblem(lot: CommercialLot): string | null {
  if (lot.status !== "disponivel")
    return `Lote ${lot.code}: ${SPACE_STATUS[lot.status]?.label ?? "indisponível"}.`;
  if (
    lot.areaM2 == null ||
    lot.areaM2 <= 0 ||
    lot.areaPending ||
    lot.pricingState === "area_pending"
  )
    return `O lote ${lot.code} aguarda confirmação de metragem.`;
  if (lot.cornerState === "pending" || lot.pricingState === "corner_pending")
    return `O lote ${lot.code} aguarda a classificação de esquina.`;
  if (
    !(lot.pricingState === "priced" && (lot.grossCents ?? 0) > 0) &&
    !(lot.pricingState === "no_tariff" && ["p1", "automobile"].includes(lot.segmentKey))
  )
    return `O lote ${lot.code} aguarda um valor de tabela.`;
  return null;
}

export function saleSelectionTotals(lots: readonly CommercialLot[]) {
  return {
    areaM2: lots.reduce((total, lot) => total + (lot.areaM2 ?? 0), 0),
    pricedCount: lots.filter((lot) => lot.grossCents != null).length,
    tableCents: lots.reduce((total, lot) => total + (lot.grossCents ?? 0), 0),
  };
}
