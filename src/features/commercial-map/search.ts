import type { MapEntity } from "./data/territory";
import type { PermanentParkLandmark } from "./permanentParkLayout";

export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Contextual destinations are not selectable commercial entities. */
export function searchLandmarks(
  landmarks: readonly PermanentParkLandmark[],
  query: string,
  location = "",
) {
  const text = normalizeSearch(query);
  if (location) return [];
  const numeric = /^\d+$/.test(text) ? Number(text) : null;
  return landmarks.filter((landmark) =>
    numeric === null
      ? normalizeSearch(landmark.name).includes(text)
      : (landmark.name.match(/\d+/g) ?? []).some((number) => Number(number) === numeric),
  );
}

export function searchEntities(entities: MapEntity[], query: string, location = "") {
  const text = normalizeSearch(query);
  const numeric = /^\d+$/.test(text) ? Number(text) : null;
  return entities.filter((entity) => {
    if (location && entity.location !== location) return false;
    if (!text) return entity.kind === "pavilion" || entity.kind === "lot";
    if (numeric !== null)
      return entity.numbers
        ? entity.numbers.includes(numeric)
        : (entity.label.match(/\d+/g) ?? []).some((number) => Number(number) === numeric);
    return normalizeSearch(`${entity.label} ${entity.location}`).includes(text);
  });
}
