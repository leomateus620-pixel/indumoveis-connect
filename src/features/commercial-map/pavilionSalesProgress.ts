import type { MapInsets, PavilionProjection } from "./types";

export const PAVILION_MARKER = {
  width: 72,
  height: 38,
  gap: 10,
  lift: 10,
  maxShift: 7,
} as const;

/** Place selected, then nearest roofs first; allow a short lift for neighbours. */
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
  const occupied: { left: number; right: number; top: number; bottom: number }[] = [];
  const placed = new Map<number, PavilionProjection>();
  for (const point of ordered) {
    const halfWidth = (PAVILION_MARKER.width * point.scale) / 2;
    const height = PAVILION_MARKER.height * point.scale;
    const left = point.x - halfWidth;
    const right = point.x + halfWidth;
    if (left < 10 || right > viewport.width - insets.right - 10) continue;
    if (point.y > viewport.height - insets.bottom) continue;
    for (const lift of [PAVILION_MARKER.lift, PAVILION_MARKER.lift + 13]) {
      const bottom = point.y - lift;
      const top = bottom - height;
      if (top < 12 || bottom > viewport.height - insets.bottom - 10) continue;
      if (
        occupied.some(
          (item) =>
            left < item.right + PAVILION_MARKER.gap &&
            right > item.left - PAVILION_MARKER.gap &&
            top < item.bottom + PAVILION_MARKER.gap &&
            bottom > item.top - PAVILION_MARKER.gap,
        )
      )
        continue;
      occupied.push({ left, right, top, bottom });
      placed.set(point.pavilionNumber, { ...point, y: bottom });
      break;
    }
  }
  return placed;
}

export function pavilionMarkerScale(distance: number, width: number) {
  if (width <= 580) return 0.87;
  return Math.max(0.92, Math.min(1.07, 1.1 - distance / 1300));
}
