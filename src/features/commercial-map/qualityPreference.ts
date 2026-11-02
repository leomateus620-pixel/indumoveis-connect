import type { MapQuality } from "./types";

const KEY = "indumoveis:map-quality";

/** Storage is optional (private browsing and browser policies may deny it). */
export function readQualityPreference(): MapQuality {
  try {
    const value = window.localStorage.getItem(KEY);
    if (value === "auto" || value === "light" || value === "balanced" || value === "detailed")
      return value;
  } catch {
    // The automatic profile is safe when storage is unavailable.
  }
  return "auto";
}

export function writeQualityPreference(value: MapQuality) {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // The selected profile remains active for this session.
  }
}
