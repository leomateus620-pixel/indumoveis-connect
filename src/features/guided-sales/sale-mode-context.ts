import { createContext, useContext } from "react";
import type { CommercialLot } from "@/lib/commercial";

export type SaleModeContextValue = {
  canUse: boolean;
  active: boolean;
  selectedIds: ReadonlySet<string>;
  toggleMode(): void;
  toggleLot(lot: CommercialLot): boolean;
  resumeSale(dealId: string): void;
};

export const SaleModeContext = createContext<SaleModeContextValue | null>(null);

export function useCommercialSaleMode() {
  return useContext(SaleModeContext);
}
