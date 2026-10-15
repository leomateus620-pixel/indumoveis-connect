import type { MapCommercialSpace, MapDealSpaces } from "@/lib/api";

/** A reviewed cadastral association, never a conversion of code/UUID to lot number. */
export type MapSpaceAssociation = {
  editionId: string;
  sector: string | null;
  spaceId: string;
  geometryId: string;
};

// No persisted cadastral IDs were provided by the territorial sources. Add only
// reviewed edition + sector + UUID associations here; PDF labels are not IDs.
export const mapSpaceAssociations: readonly MapSpaceAssociation[] = [];

export const mapCommercialLabels: Record<string, string> = {
  disponivel: "Disponível",
  em_negociacao: "Em negociação",
  reservado: "Reservado",
  vendido: "Vendido",
  bloqueado: "Bloqueado",
};

export type MapLinkSearch = { space?: string; deal?: string; status?: string };
export type MapCommercialResolution = {
  selectedGeometryId?: string;
  highlightedGeometryIds: string[];
  filteredGeometryIds?: string[];
  statuses: Record<string, string>;
  warning?: string;
};

/** Resolve the current edition only; unassociated geometry has no commercial state. */
export function resolveMapCommercialLinks({
  editionId,
  spaces,
  associations = mapSpaceAssociations,
  geometryIds,
  search = {},
  deal,
}: {
  editionId?: string;
  spaces: readonly MapCommercialSpace[];
  associations?: readonly MapSpaceAssociation[];
  geometryIds: readonly string[];
  search?: MapLinkSearch;
  deal?: MapDealSpaces | null;
}): MapCommercialResolution {
  const result: MapCommercialResolution = { highlightedGeometryIds: [], statuses: {} };
  const allowedGeometries = new Set(geometryIds);
  const currentSpaces = new Map(
    spaces.filter((space) => space.edition_id === editionId).map((space) => [space.id, space]),
  );
  const candidates = associations.filter((association) => {
    const space = currentSpaces.get(association.spaceId);
    return (
      !!editionId &&
      association.editionId === editionId &&
      allowedGeometries.has(association.geometryId) &&
      !!space &&
      space.sector === association.sector
    );
  });
  const mappingsBySpace = new Map<string, Set<string>>();
  for (const association of candidates) {
    const mapped = mappingsBySpace.get(association.spaceId) ?? new Set<string>();
    mapped.add(association.geometryId);
    mappingsBySpace.set(association.spaceId, mapped);
  }
  // Ambiguous mappings must remain unconfirmed rather than pick an arbitrary lot.
  const mappings = candidates.filter(
    (association) => mappingsBySpace.get(association.spaceId)?.size === 1,
  );
  const statusByGeometry = new Map<string, (string | null)[]>();
  const geometryBySpace = new Map<string, string>();
  for (const association of mappings) {
    geometryBySpace.set(association.spaceId, association.geometryId);
    const statuses = statusByGeometry.get(association.geometryId) ?? [];
    statuses.push(currentSpaces.get(association.spaceId)?.commercial_status ?? null);
    statusByGeometry.set(association.geometryId, statuses);
  }
  for (const [id, statuses] of statusByGeometry) {
    const state = statuses[0];
    if (state && mapCommercialLabels[state] && statuses.every((status) => status === state)) {
      result.statuses[id] = state;
    }
  }

  if (search.space) {
    result.selectedGeometryId = geometryBySpace.get(search.space);
    if (!result.selectedGeometryId) {
      result.warning = "O espaço deste link ainda não possui associação territorial confirmada.";
    }
  }
  if (search.deal) {
    const currentDeal = deal?.id === search.deal && deal.edition_id === editionId ? deal : null;
    const linkedIds = currentDeal?.deal_spaces.map((link) => link.space_id) ?? [];
    result.highlightedGeometryIds = [
      ...new Set(linkedIds.map((id) => geometryBySpace.get(id)).filter((id): id is string => !!id)),
    ];
    if (!linkedIds.length || linkedIds.some((id) => !geometryBySpace.has(id))) {
      result.warning ??= "A negociação deste link não tem todos os espaços associados à planta.";
    }
  }
  if (search.status) {
    if (!mapCommercialLabels[search.status]) {
      result.warning ??= "A situação deste link não é reconhecida.";
    } else {
      const confirmed = Object.entries(result.statuses);
      if (confirmed.length) {
        result.filteredGeometryIds = confirmed
          .filter(([, status]) => status === search.status)
          .map(([id]) => id);
      }
      if (confirmed.length < geometryIds.length) {
        result.warning ??=
          "Filtro comercial limitado às associações confirmadas; demais áreas sem situação confirmada.";
      }
    }
  }
  return result;
}
