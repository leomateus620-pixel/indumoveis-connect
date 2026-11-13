import type { MapDealSpaces } from "@/lib/api";
import type { CommercialLot } from "@/lib/commercial";
import { SPACE_STATUS } from "@/lib/format";

export type MapLinkSearch = { space?: string; deal?: string; status?: string };

/** The lot RPC is scoped to the active edition. Its geometry IDs are approved
 * by a persisted association to the space UUID, independent of the lot code. */
export function resolvePersistedMapLots(
  editionId: string | undefined,
  lots: readonly CommercialLot[],
  geometryIds: readonly string[],
  search: MapLinkSearch,
  deal?: MapDealSpaces | null,
) {
  const allowed = new Set(geometryIds);
  const conflicting = new Set<string>();
  const candidates = new Map<string, CommercialLot>();
  for (const lot of editionId ? lots : []) {
    if (
      (lot.segmentKey !== "external" && lot.segmentKey !== "automobile") ||
      !lot.geometryId ||
      !allowed.has(lot.geometryId)
    )
      continue;
    const existing = candidates.get(lot.geometryId);
    if (existing && existing.id !== lot.id) conflicting.add(lot.geometryId);
    candidates.set(lot.geometryId, lot);
  }
  const lotsByGeometry = new Map<string, CommercialLot>();
  const geometryBySpace = new Map<string, string>();
  const statuses: Record<string, string> = {};
  for (const [geometryId, lot] of candidates) {
    if (conflicting.has(geometryId)) continue;
    lotsByGeometry.set(geometryId, lot);
    geometryBySpace.set(lot.id, geometryId);
    statuses[geometryId] = lot.status;
  }

  let warning: string | undefined;
  const selectedGeometryId = search.space ? geometryBySpace.get(search.space) : undefined;
  if (search.space && !selectedGeometryId)
    warning = "O espaço deste link ainda não possui associação territorial confirmada.";
  const highlightedGeometryIds: string[] = [];
  if (search.deal) {
    const links = deal?.id === search.deal && deal.edition_id === editionId ? deal.deal_spaces : [];
    for (const { space_id } of links) {
      const geometryId = geometryBySpace.get(space_id);
      if (geometryId && !highlightedGeometryIds.includes(geometryId))
        highlightedGeometryIds.push(geometryId);
    }
    if (!links.length || links.some((link) => !geometryBySpace.has(link.space_id)))
      warning ??= "A negociação deste link não tem todos os espaços associados à planta.";
  }
  let filteredGeometryIds: string[] | undefined;
  if (search.status) {
    if (!Object.hasOwn(SPACE_STATUS, search.status)) {
      warning ??= "A situação deste link não é reconhecida.";
    } else {
      if (lotsByGeometry.size)
        filteredGeometryIds = [...lotsByGeometry]
          .filter(([, lot]) => lot.status === search.status)
          .map(([geometryId]) => geometryId);
      if (lotsByGeometry.size < allowed.size)
        warning ??=
          "Filtro comercial limitado às associações confirmadas; demais áreas sem situação confirmada.";
    }
  }
  return {
    lotsByGeometry,
    statuses,
    selectedGeometryId,
    highlightedGeometryIds,
    filteredGeometryIds,
    warning,
  };
}
