import type { MapInsets, MapView } from "./types";
import { MOTION } from "./motion";

/** Sheet x increases right and sheet y increases down; world is (x, 0, y).
 * No north bearing is implied. These are local presentation coordinates. */
export const MOVEMENT = {
  focusNearMs: MOTION.focusNear,
  focusFarMs: MOTION.focusFar,
  viewMs: MOTION.view,
  zoomMs: 180,
  wheelMs: 120,
  mouseClickTolerance: MOTION.mouseDrag,
  touchClickTolerance: MOTION.touchDrag,
  qualityDwellMs: 12_000,
  qualitySettleMs: 650,
} as const;

export const QUALITY = {
  light: { dpr: 1, pixels: 1_000_000, trees: 0.6 },
  balanced: { dpr: 1.5, pixels: 2_000_000, trees: 0.85 },
  detailed: { dpr: 2, pixels: 3_000_000, trees: 1 },
} as const;

export type QualityTier = keyof typeof QUALITY;

export function resolvePixelRatio(
  width: number,
  height: number,
  deviceDpr: number,
  tier: QualityTier,
) {
  const preset = QUALITY[tier];
  return Math.min(
    Math.max(0.1, deviceDpr || 1),
    preset.dpr,
    Math.sqrt(preset.pixels / Math.max(1, width * height)),
  );
}

/** RAM/CPU are allocation hints, never a GPU benchmark. Unknown hints start light. */
export function initialQuality(memory?: number, cores?: number): QualityTier {
  return memory !== undefined && memory >= 8 && cores !== undefined && cores >= 8
    ? "balanced"
    : "light";
}

export function viewDirection(view: MapView): readonly [number, number, number] {
  if (view === "top") return [0, 1, 0.001];
  if (view === "front") return [0.05, 0.56, 0.827];
  return [-0.27, 0.82, 0.505];
}

/** Fits a world-space sphere into the genuinely free screen region. */
export function framingDistance(
  radius: number,
  width: number,
  height: number,
  insets: MapInsets,
  fov = 38,
) {
  const freeWidth = Math.max(width * 0.25, width - insets.right - 32);
  const freeHeight = Math.max(height * 0.25, height - insets.bottom - 52);
  const halfVertical = (fov * Math.PI) / 360;
  const halfHorizontal = Math.atan((Math.tan(halfVertical) * width) / Math.max(height, 1));
  const vertical = Math.atan((Math.tan(halfVertical) * freeHeight) / Math.max(height, 1));
  const horizontal = Math.atan((Math.tan(halfHorizontal) * freeWidth) / Math.max(width, 1));
  return (Math.max(1, radius) * 1.08) / Math.sin(Math.min(vertical, horizontal));
}

/** Exact perspective fit of the local bounding-box corners. A flat, wide park
 * must not be framed as a large sphere, which wastes most of a landscape view. */
export function framingBoxDistance(
  box: { width: number; depth: number; height: number },
  viewportWidth: number,
  viewportHeight: number,
  insets: MapInsets,
  view: MapView,
  fov = 38,
) {
  const raw = viewDirection(view),
    length = Math.hypot(...raw);
  const [dx, dy, dz] = raw.map((value) => value / length);
  const rightLength = Math.hypot(dx, dz);
  const rx = dz / rightLength,
    rz = -dx / rightLength;
  const ux = dy * rz,
    uy = dz * rx - dx * rz,
    uz = -dy * rx;
  const freeWidth = Math.max(viewportWidth * 0.25, viewportWidth - insets.right - 32);
  const freeHeight = Math.max(viewportHeight * 0.25, viewportHeight - insets.bottom - 52);
  const tanVertical = Math.tan((fov * Math.PI) / 360);
  const tanHorizontalFree = (tanVertical * freeWidth) / Math.max(viewportHeight, 1);
  const tanVerticalFree = (tanVertical * freeHeight) / Math.max(viewportHeight, 1);
  let distance = 1;
  for (const x of [-box.width / 2, box.width / 2])
    for (const y of [0, box.height])
      for (const z of [-box.depth / 2, box.depth / 2]) {
        const towardCamera = x * dx + y * dy + z * dz;
        distance = Math.max(
          distance,
          towardCamera + Math.abs(x * rx + z * rz) / tanHorizontalFree,
          towardCamera + Math.abs(x * ux + y * uy + z * uz) / tanVerticalFree,
        );
      }
  return distance * 1.06;
}

export function smoothStep(progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  return t * t * (3 - 2 * t);
}

/** World anchored labels may grow only within a finite local envelope. This
 * preserves a useful text size without camera-facing DOM labels or new textures. */
export function readableLabelSize(
  baseSize: number,
  worldUnitsPerPixel: number,
  projectedAxis: number,
  fontFraction: number,
  minimumTextPixels: number,
) {
  if (!minimumTextPixels) return baseSize;
  const desired =
    (minimumTextPixels * worldUnitsPerPixel) / Math.max(0.08, projectedAxis * fontFraction);
  return Math.max(baseSize * 0.12, Math.min(baseSize * 2.5, desired));
}

export function isClick(start: { x: number; y: number; touch: boolean }, x: number, y: number) {
  return (
    Math.hypot(x - start.x, y - start.y) <=
    (start.touch ? MOVEMENT.touchClickTolerance : MOVEMENT.mouseClickTolerance)
  );
}

export function nextAdaptiveQuality(
  tier: QualityTier,
  slowWindows: number,
  fastWindows: number,
): QualityTier {
  if (slowWindows >= 2) return tier === "detailed" ? "balanced" : "light";
  // Auto never upgrades beyond balanced merely because a display is large.
  if (fastWindows >= 8 && tier === "light") return "balanced";
  return tier;
}

export function shouldUseLightFallback(
  automatic: boolean,
  tier: QualityTier,
  consecutiveSlowWindows: number,
) {
  return automatic && tier === "light" && consecutiveSlowWindows >= 3;
}
