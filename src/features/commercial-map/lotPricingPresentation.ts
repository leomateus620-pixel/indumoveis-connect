import type { CommercialLot } from "@/lib/commercial";

export function lotPricingNote(lot: CommercialLot): string | undefined {
  if (lot.pricingState === "area_pending") return "Área em validação";
  if (lot.pricingState === "corner_pending") return "Classificação de esquina em validação";
  if (lot.pricingState === "no_tariff") return "Tarifa não definida";
  return undefined;
}
