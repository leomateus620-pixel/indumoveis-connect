import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Restricted } from "@/components/app/ui";
import { useCan, useEditionId, useMapCommercialSpaces, useMapDealSpaces } from "@/lib/api";
import { CommercialMapWorkspace } from "@/features/commercial-map/CommercialMapWorkspace";
import { ENTITIES } from "@/features/commercial-map/data/territory";
import { resolveMapCommercialLinks } from "@/features/commercial-map/commercial";
import { readParkReturn } from "@/features/pavilion-interior/parkReturn";

export const Route = createFileRoute("/_authenticated/_app/mapa")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { status?: string; space?: string; deal?: string; pavilhao?: "1" } => ({
    status: typeof s.status === "string" ? s.status : undefined,
    space: typeof s.space === "string" ? s.space : undefined,
    deal: typeof s.deal === "string" ? s.deal : undefined,
    pavilhao: s.pavilhao === "1" || s.pavilhao === 1 ? "1" : undefined,
  }),
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
  const saved = readParkReturn(editionId);
  const restorePark =
    search.pavilhao === "1" ||
    (!!saved &&
      ["space", "status", "deal"].every(
        (key) =>
          saved.search?.[key as "space" | "status" | "deal"] ===
          search[key as "space" | "status" | "deal"],
      ));
  return (
    <CommercialMapWorkspace
      key={editionId}
      editionId={editionId}
      restorePark={restorePark}
      initialPavilion={search.pavilhao === "1"}
      parkSearch={search}
      onOpenInterior={() => void navigate({ to: "/mapa/pavilhoes/1/interior" })}
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
