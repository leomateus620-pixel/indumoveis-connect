import type { MapLightingMode } from "./types";

const KEY = "indumoveis:map-lighting";

export function readLightingPreference(): MapLightingMode {
  try {
    if (window.localStorage.getItem(KEY) === "warm") return "warm";
  } catch {
    // A denied storage read leaves the authored daytime profile active.
  }
  return "natural";
}

export function writeLightingPreference(value: MapLightingMode) {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // The selected mode remains active for this session.
  }
}
