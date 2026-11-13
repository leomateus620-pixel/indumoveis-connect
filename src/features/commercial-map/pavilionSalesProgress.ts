import type { MapInsets, PavilionProjection } from "./types";

export const PAVILION_MARKER = {
  diameter: 48,
  gap: 7,
  lift: 8,
} as const;
const maxScaleLag = 0.035;

/** Keep the screen anchor unchanged and suppress any overlap with higher-priority roofs. */
export function placePavilionMarkers(
  projections: readonly PavilionProjection[],
  viewport: { width: number; height: number },
  insets: MapInsets,
  visiblePavilions: ReadonlySet<number>,
  selectedPavilion?: number,
) {
  const ordered = projections
    .filter((point) => visiblePavilions.has(point.pavilionNumber))
    .sort(
      (a, b) =>
        Number(b.pavilionNumber === selectedPavilion) -
          Number(a.pavilionNumber === selectedPavilion) ||
        a.distance - b.distance ||
        a.pavilionNumber - b.pavilionNumber,
    );
  const occupied: { x: number; y: number; radius: number }[] = [];
  const placed = new Map<number, PavilionProjection>();
  for (const point of ordered) {
    const { x } = point;
    // Budget for the transient scale lag as well as the target size.
    const radius = (PAVILION_MARKER.diameter * (point.scale + maxScaleLag)) / 2;
    const y = point.y - PAVILION_MARKER.lift - radius;
    const freeRight = viewport.width - insets.right;
    const freeBottom = viewport.height - insets.bottom;
    if (x - radius < 10 || x + radius > freeRight - 10 || y - radius < 12) continue;
    if (point.y > freeBottom || y + radius > freeBottom - 10) continue;
    if (
      occupied.some(
        (other) =>
          Math.hypot(x - other.x, y - other.y) < radius + other.radius + PAVILION_MARKER.gap,
      )
    )
      continue;
    occupied.push({ x, y, radius });
    placed.set(point.pavilionNumber, point);
  }
  return placed;
}

export function pavilionMarkerScale(distance: number, width: number) {
  if (width <= 580) return 0.87;
  return Math.max(0.92, Math.min(1.07, 1.1 - distance / 1300));
}

type PavilionScaleMotion = { value: number; velocity: number };

/** Closed-form critically damped spring. The marker never lags the roof in X/Y. */
export function stepPavilionMarkerScale(
  current: PavilionScaleMotion,
  target: number,
  seconds: number,
): PavilionScaleMotion {
  const frequency = 20;
  const error = current.value - target;
  const decay = Math.exp(-frequency * seconds);
  const slope = current.velocity + frequency * error;
  const offset = (error + slope * seconds) * decay;
  const velocity = (current.velocity - frequency * slope * seconds) * decay;
  const reachedTarget = error * offset <= 0;
  const settled = Math.abs(offset) <= 0.0005 && Math.abs(velocity) <= 0.01;
  if (reachedTarget || settled) {
    return { value: target, velocity: 0 };
  }
  if (Math.abs(offset) > maxScaleLag) {
    return { value: target + Math.sign(offset) * maxScaleLag, velocity: 0 };
  }
  return { value: target + offset, velocity };
}
