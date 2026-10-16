import type { MapEntity, Point } from "./data/territory";

export const STREET_LABEL = {
  /** Fixed local font height, independent of camera distance and selection. */
  baseTextHeight: 0.78,
  maxTextPixels: 13,
  appearPixels: 10,
  disappearPixels: 8,
  corridorMargin: 0.32,
  haloPixels: 0.65,
} as const;

export type ProjectedPoint = { x: number; y: number };

/** Project the measured glyph + halo rectangle, not the transparent atlas cell.
 * The perpendicular height remains finite at grazing angles and works for a
 * longitudinal label at every screen rotation. No inverse-cosine correction. */
export function projectedTextMetrics(corners: readonly ProjectedPoint[]) {
  if (corners.length !== 4 || corners.some((p) => !Number.isFinite(p.x + p.y)))
    return { width: 0, height: 0 };
  const distance = (a: ProjectedPoint, b: ProjectedPoint) => Math.hypot(a.x - b.x, a.y - b.y);
  const width = (distance(corners[0], corners[1]) + distance(corners[2], corners[3])) / 2;
  const dx = corners[1].x - corners[0].x + corners[2].x - corners[3].x;
  const dy = corners[1].y - corners[0].y + corners[2].y - corners[3].y;
  const longitudinalLength = Math.hypot(dx, dy);
  const thickness = (a: ProjectedPoint, b: ProjectedPoint) =>
    longitudinalLength > 0 ? Math.abs((b.x - a.x) * dy - (b.y - a.y) * dx) / longitudinalLength : 0;
  // Cap the nearer end too: an area/average-width height can underestimate a
  // glyph band whose ends have different perspective depth.
  return {
    width,
    height: Math.max(thickness(corners[0], corners[3]), thickness(corners[1], corners[2])),
  };
}

export type StreetLabelInput = {
  naturalTextHeightPx: number;
  naturalTextWidthPx: number;
  worldTextWidth: number;
  worldTextHeight: number;
  corridorLength: number;
  corridorWidth: number;
  wasVisible: boolean;
  /** Selection changes priority only. It never enlarges a street name. */
  selected?: boolean;
};

/** Also used after the final perspective reprojection: a cap can shrink a
 * foreshortened word farther than the initial linear screen estimate. */
export function streetLabelVisible(textHeightPx: number, wasVisible: boolean) {
  return (
    Number.isFinite(textHeightPx) &&
    (wasVisible
      ? textHeightPx > STREET_LABEL.disappearPixels
      : textHeightPx >= STREET_LABEL.appearPixels)
  );
}

/** Streets can only shrink from the authored world size. Building and lot
 * readability is a separate policy and must not call this function. */
export function streetLabelPresentation(input: StreetLabelInput) {
  const values = [
    input.naturalTextHeightPx,
    input.naturalTextWidthPx,
    input.worldTextWidth,
    input.worldTextHeight,
    input.corridorLength,
    input.corridorWidth,
  ];
  if (values.some((value) => !Number.isFinite(value) || value <= 0))
    return { scale: 0, visible: false, opacity: 0, textHeightPx: 0, textWidthPx: 0 };
  const scale = Math.max(
    0,
    Math.min(
      1,
      STREET_LABEL.maxTextPixels / input.naturalTextHeightPx,
      input.corridorLength / input.worldTextWidth,
      input.corridorWidth / input.worldTextHeight,
    ),
  );
  const textHeightPx = input.naturalTextHeightPx * scale;
  const textWidthPx = input.naturalTextWidthPx * scale;
  const visible = streetLabelVisible(textHeightPx, input.wasVisible);
  const opacity = visible
    ? Math.min(
        1,
        (textHeightPx - STREET_LABEL.disappearPixels) /
          (STREET_LABEL.appearPixels - STREET_LABEL.disappearPixels),
      )
    : 0;
  return { scale, visible, opacity, textHeightPx, textWidthPx };
}

export function isWalkway(entity: Pick<MapEntity, "id">) {
  return /arvoredo|east-walk/.test(entity.id);
}

function bounds(polygon: readonly Point[]) {
  return {
    minX: Math.min(...polygon.map((p) => p[0])),
    maxX: Math.max(...polygon.map((p) => p[0])),
    minY: Math.min(...polygon.map((p) => p[1])),
    maxY: Math.max(...polygon.map((p) => p[1])),
  };
}

function axisSpan(polygon: readonly Point[], anchor: Point, vertical: boolean) {
  const axis = vertical ? 1 : 0;
  const cross = vertical ? 0 : 1;
  const intersections: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (
      (a[cross] <= anchor[cross] && b[cross] > anchor[cross]) ||
      (b[cross] <= anchor[cross] && a[cross] > anchor[cross])
    ) {
      const t = (anchor[cross] - a[cross]) / (b[cross] - a[cross]);
      intersections.push(a[axis] + (b[axis] - a[axis]) * t);
    }
  }
  intersections.sort((a, b) => a - b);
  for (let i = 0; i + 1 < intersections.length; i += 2)
    if (anchor[axis] >= intersections[i] && anchor[axis] <= intersections[i + 1])
      return [intersections[i], intersections[i + 1]] as const;
  return [anchor[axis], anchor[axis]] as const;
}

/** Presentation envelope around the approved anchor, with explicit setbacks
 * from polygon borders and perpendicular road junctions. It changes no source
 * geometry and makes no assumption that the bent Brasília road is a rectangle. */
export function streetLabelCorridor(entity: MapEntity, roads: readonly MapEntity[] = []) {
  const b = bounds(entity.polygon);
  const vertical = b.maxY - b.minY > (b.maxX - b.minX) * 2.5;
  const axis = vertical ? 1 : 0;
  const cross = vertical ? 0 : 1;
  let [start, end] = axisSpan(entity.polygon, entity.anchor, vertical);
  const [crossStart, crossEnd] = axisSpan(entity.polygon, entity.anchor, !vertical);
  for (const other of roads) {
    if (other.id === entity.id || other.kind !== "road") continue;
    // A walkway touching a carriageway's side is a different surface, not a
    // junction extending across the street's text corridor.
    if (isWalkway(other) !== isWalkway(entity)) continue;
    const ob = bounds(other.polygon);
    const otherVertical = ob.maxY - ob.minY > (ob.maxX - ob.minX) * 2.5;
    if (otherVertical === vertical) continue;
    const otherCrossStart = cross === 0 ? ob.minX : ob.minY;
    const otherCrossEnd = cross === 0 ? ob.maxX : ob.maxY;
    // Source lines may have a sub-pixel gap at an otherwise visible junction.
    if (otherCrossEnd < crossStart - 0.03 || otherCrossStart > crossEnd + 0.03) continue;
    const otherStart = axis === 0 ? ob.minX : ob.minY;
    const otherEnd = axis === 0 ? ob.maxX : ob.maxY;
    if (otherEnd < entity.anchor[axis]) start = Math.max(start, otherEnd);
    else if (otherStart > entity.anchor[axis]) end = Math.min(end, otherStart);
    else return { vertical, length: 0, width: 0 };
  }
  const margin = STREET_LABEL.corridorMargin;
  const length = Math.max(
    0,
    2 * Math.min(entity.anchor[axis] - start, end - entity.anchor[axis]) - 2 * margin,
  );
  // The authored label axis stays stable even on the slightly tapered/skewed
  // source roads. Intersect their polygon at both ends as well as the anchor.
  const halfWidths = [-0.5, 0, 0.5].map((offset) => {
    const sample: Point = [...entity.anchor];
    sample[axis] += length * offset;
    const [low, high] = axisSpan(entity.polygon, sample, !vertical);
    return Math.min(entity.anchor[cross] - low, high - entity.anchor[cross]);
  });
  return {
    vertical,
    length,
    width: Math.max(0, 2 * Math.min(...halfWidths) - 2 * margin),
  };
}
