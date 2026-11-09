import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Restricted } from "@/components/app/ui";
import { useCan, useEditionId, useMapCommercialSpaces, useMapDealSpaces } from "@/lib/api";
import { CommercialMapWorkspace } from "@/features/commercial-map/CommercialMapWorkspace";
import { ENTITIES } from "@/features/commercial-map/data/territory";
import { resolveMapCommercialLinks } from "@/features/commercial-map/commercial";
import { readParkReturn } from "@/features/pavilion-interior/parkReturn";
import { interiorPavilionNumber } from "@/features/pavilion-interior/presentation";
import {
  parkPavilionNumber,
  pavilionDestination,
  type ParkPavilionSearch,
} from "@/features/pavilion-interior/connections";

export const Route = createFileRoute("/_authenticated/_app/mapa")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { status?: string; space?: string; deal?: string; pavilhao?: ParkPavilionSearch } => {
    const pavilion = parkPavilionNumber(s.pavilhao);
    return {
      status: typeof s.status === "string" ? s.status : undefined,
      space: typeof s.space === "string" ? s.space : undefined,
      deal: typeof s.deal === "string" ? s.deal : undefined,
      pavilhao: pavilion ? (String(pavilion) as ParkPavilionSearch) : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Mapa Comercial — Sistema Indumóveis" },
      { name: "description", content: "Explore os lotes externos e pavilhões da Indumóveis." },
    ],
  }),
  component: MapaPage,
});

function MapaPage() {
  const can = useCan("mapa");
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/mapa" });
  const editionId = useEditionId();
  const spaces = useMapCommercialSpaces(can.read);
  const deal = useMapDealSpaces(search.deal, can.read);
  const resolution = useMemo(
    () =>
      resolveMapCommercialLinks({
        editionId,
        spaces: spaces.isError ? [] : (spaces.data ?? []),
        deal: deal.isError ? null : deal.data,
        search,
        geometryIds: ENTITIES.filter((e) => e.kind === "lot").map((e) => e.id),
      }),
    [editionId, spaces.data, spaces.isError, deal.data, deal.isError, search],
  );
  if (!can.read) return <Restricted />;
  if (!editionId) return <p role="status">Carregando mapa…</p>;
  const pavilionNumber = parkPavilionNumber(search.pavilhao);
  const savedPavilion = interiorPavilionNumber(pavilionNumber);
  const saved = !pavilionNumber || savedPavilion ? readParkReturn(editionId, savedPavilion) : null;
  const restorePark =
    !!savedPavilion ||
    (!!saved &&
      ["space", "status", "deal"].every(
        (key) =>
          saved.search?.[key as "space" | "status" | "deal"] ===
          search[key as "space" | "status" | "deal"],
      ));
  return (
    <CommercialMapWorkspace
      key={`${editionId}:${pavilionNumber ?? "park"}`}
      editionId={editionId}
      restorePark={restorePark}
      initialPavilionNumber={pavilionNumber}
      parkSearch={search}
      onOpenInterior={async (pavilion) => {
        await navigate({
          to: ".",
          search: (current) => ({ ...current, pavilhao: String(pavilion) as ParkPavilionSearch }),
          replace: true,
        });
        await navigate(pavilionDestination(pavilion));
      }}
      statuses={resolution.statuses}
      highlightedIds={resolution.filteredGeometryIds ?? resolution.highlightedGeometryIds}
      externalSelection={resolution.selectedGeometryId}
      notice={resolution.warning}
      commercialState={
        spaces.isError
          ? "unavailable"
          : spaces.isLoading
            ? "loading"
            : spaces.data
              ? "confirmed"
              : "unavailable"
      }
      onCloseExternal={() => {
        if (search.space)
          void navigate({ to: ".", search: (p) => ({ ...p, space: undefined }), replace: true });
      }}
    />
  );
}
