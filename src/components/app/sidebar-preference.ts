const KEY = "sidebar-compact";

export function readCompactPreference() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeCompactPreference(compact: boolean) {
  try {
    localStorage.setItem(KEY, compact ? "1" : "0");
  } catch {
    /* armazenamento indisponível: preferência vale só para a sessão atual */
  }
}
