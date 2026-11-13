import { createFileRoute } from "@tanstack/react-router";
import {
  commercialSegmentKeys,
  type CommercialLotStatus,
  type CommercialSegmentKey,
} from "@/lib/commercial";

export type CommercialDashboardSearch = {
  segmento?: CommercialSegmentKey;
  situacao?: CommercialLotStatus;
  lote?: string;
};

const lotStatuses = ["vendido", "reservado", "em_negociacao", "disponivel", "bloqueado"] as const;

export const Route = createFileRoute("/_authenticated/_app/dashboard-comercial")({
  validateSearch: (search: Record<string, unknown>): CommercialDashboardSearch => ({
    segmento: commercialSegmentKeys.find((key) => key === search.segmento),
    situacao: lotStatuses.find((status) => status === search.situacao),
    lote:
      typeof search.lote === "string" &&
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(search.lote)
        ? search.lote.toLowerCase()
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Dashboard Comercial — Sistema Indumóveis" },
      {
        name: "description",
        content: "Acompanhe vendas, disponibilidade e valores por segmento da edição.",
      },
    ],
  }),
});
