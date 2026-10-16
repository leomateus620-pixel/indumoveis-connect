/** Presentation colours shared by the lazy scene, SVG and operating controls.
 * Hex sRGB values are intentional: no graphics consumer receives CSS OKLCH.
 * This module must remain independent of Three.js and the commercial API. */
export const VISUAL_THEME = {
  background: "#f1f2ed",
  ground: "#dce2d7",
  road: "#414c58",
  walk: "#e3e1d7",
  landscape: "#a3b58e",
  lot: "#e4e8e2",
  lotEdge: "#7b877f",
  plum: "#623c50",
  red: "#a83b40",
  wall: "#f1f0e7",
  concrete: "#c4cbc8",
  roof: "#aebdc6",
  roofLight: "#d2dce0",
  support: "#d9ddd5",
  metal: "#778991",
  glass: "#526b72",
  warm: "#9a7c64",
  text: "#352e36",
  roadText: "#f4f1e8",
  roadHalo: "#303e49",
  foliage: ["#3f6546", "#657c4e", "#8da56c"],
} as const;

/** Commercial colours only apply to a confirmed persisted association. */
export const COMMERCIAL_STATUS_COLORS: Record<string, string> = {
  disponivel: "#b8d6c5",
  em_negociacao: "#b9ccdf",
  reservado: "#e2c69e",
  vendido: "#9b7c91",
  bloqueado: "#b6b2b5",
};
