import type { MapEntity } from "./data/territory";

export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
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
