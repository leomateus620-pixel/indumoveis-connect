import daylightPalette from "./daylightPalette.json";

const [sunX, sunY, sunZ] = daylightPalette.sunDirection;

/** Clear daytime lighting in world coordinates. Hex values are authored in sRGB. */
export const PARK_DAYLIGHT = {
  sunDirection: [sunX, sunY, sunZ] as const,
  sunlight: { color: daylightPalette.sunColor, intensity: 3.12 },
  hemisphere: { sky: "#d2e5ff", ground: "#a3a68c", intensity: 0.94 },
  fill: { color: "#dceaff", intensity: 0.19, position: [80, 60, -110] },
  exposure: 1.04,
} as const;

/** Presentation colours shared by the lazy scene, SVG and operating controls.
 * Hex sRGB values are intentional: no graphics consumer receives CSS OKLCH.
 * This module must remain independent of Three.js and the commercial API. */
export const VISUAL_THEME = {
  background: "#f1f2ed",
  ground: "#dce2d7",
  road: "#394651",
  walk: "#e3e1d7",
  landscape: "#83ad70",
  lot: "#e4e8e2",
  lotEdge: "#536a59",
  plum: "#623c50",
  red: "#a83b40",
  wall: "#f1f0e7",
  concrete: "#c4cbc8",
  roof: "#b8bcb8",
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

/** Authored sRGB colours for the 3D ground and material finishes. */
export const PARK_SURFACE_COLORS = {
  grass: "#83a969",
  grassCool: "#759a61",
  grassOpen: "#8dae6c",
  grassDry: "#98ad72",
  distantGrass: "#a2b29b",
  grassBladeRoot: "#6c8b55",
  grassBladeTip: "#98b26b",
  asphalt: "#737673",
  concrete: "#a5a59e",
  brick: "#ae6249",
  paintedMasonry: "#e7e3d8",
  whitePaint: "#f3f1e6",
  architecturalFrame: "#40504a",
} as const;

export const PARK_VEGETATION = {
  crowns: [
    { interior: "#355630", canopy: "#557c3e", tips: "#80a457" },
    { interior: "#435b32", canopy: "#687f42", tips: "#8da65a" },
    { interior: "#304f35", canopy: "#477645", tips: "#77a05b" },
  ],
  bark: "#817159",
  barkTint: "#d5c7ad",
  shadow: "#394b3d",
} as const;

export const PARK_SHADOWS = {
  color: "#374753",
  opacity: 0.16,
  solar: { bias: -0.00011, normalBias: 0.025, radius: 1.5, intensity: 0.72 },
} as const;

/** Commercial colours only apply to a confirmed persisted association. */
export const COMMERCIAL_STATUS_COLORS: Record<string, string> = {
  disponivel: "#b8d6c5",
  em_negociacao: "#b9ccdf",
  reservado: "#e2c69e",
  vendido: "#9b7c91",
  bloqueado: "#b6b2b5",
  indisponivel: "#b6b2b5",
};

export const SALES_MAP_COLORS = {
  selected: "#197a74",
  selectedEdge: "#075451",
  sold: "#583b51",
  check: "#fffdf9",
} as const;
