import type { MapInsets, MapView } from "./types";
import { MOTION } from "./motion";
import { pointInPolygon, polygonBounds, type Bounds } from "./geometry";
import type { Point } from "./data/territory";

/** All distances use the authored drawing units (10 PDF points), never metres.
 * Camera/target constraints use finite authored regions, never ambient ground. */
export const NAVIGATION = {
  fovDegrees: 38,
  minPolarAngle: 0.003,
  maxPolarAngle: Math.PI * 0.44,
  // The useful close inspection remains the approved 25.2° elevation. Lower
  // views can reveal the sky, while per-pose roof clearance moves them outward.
  inspectionPolarAngle: Math.PI * 0.36,
  maximumFitMultiplier: 1.35,
  minimumSelectableSpans: 1.4,
  roofClearanceSpans: 0.12,
  targetMarginFraction: 0.08,
  commercialWitnessNdc: 0.4,
  terrainSafetyFraction: 0.06,
  horizonFadeStartDistances: 1.4,
  horizonFadeEndDistances: 3,
} as const;

export type NavigationPose = {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
};

type NavigationRegion = { polygon: readonly Point[]; bounds: Bounds };

export type NavigationEnvelope = {
  /** Source commercial extent; context never changes inventory or protection. */
  commercialBounds: Bounds;
  /** Finite commercial + explicitly supplied presentation context extent. */
  viewBounds: Bounds;
  viewCenter: Point;
  minDistance: number;
  maxDistance: number;
  fitDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  cameraClearance: number;
  targetBounds: Bounds;
  terrainBounds: Bounds;
  groundReach: number;
  farPlane: number;
  horizonFade: { center: Point; start: number; end: number };
  groundTangent: number;
  protectedRegions: readonly NavigationRegion[];
  /** Visibility witnesses only; these regions do not enable commercial picking
   * or become part of the protected terrain/implantation perimeter. */
  navigationRegions: readonly NavigationRegion[];
};

/** Smallest short side of a real selectable polygon, not its declared m² area. */
export function smallestSelectableSpan(
  polygons: readonly (readonly (readonly [number, number])[])[],
) {
  let smallest = Infinity;
  for (const polygon of polygons) {
    if (!polygon.length) continue;
    const xs = polygon.map(([x]) => x),
      ys = polygon.map(([, y]) => y);
    const span = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    if (span > 0) smallest = Math.min(smallest, span);
  }
  if (!Number.isFinite(smallest)) throw new Error("Navigation requires selectable geometry");
  return smallest;
}

/** Recompute only for viewport/inset or authored-context changes. Fits commercial
 * geometry plus optional finite context landmarks; ambient ground and textures
 * never affect zoom. Context shares drawing units, without implying GIS scale.
 * Selectable size and roof clearance remain derived from commercial geometry. */
export function createNavigationEnvelope({
  bounds,
  smallestSelectableSpan: smallestSpan,
  maxStructureHeight,
  width,
  height,
  insets,
  protectedPolygons = [],
  explorationPolygons = [],
  fov = NAVIGATION.fovDegrees,
}: {
  bounds: Bounds;
  smallestSelectableSpan: number;
  maxStructureHeight: number;
  width: number;
  height: number;
  insets: MapInsets;
  protectedPolygons?: readonly (readonly Point[])[];
  /** Explicit roads/parcels/landmarks that may be explored, not a terrain box.
   * Empty or non-finite polygons are ignored rather than unbounding the camera. */
  explorationPolygons?: readonly (readonly Point[])[];
  fov?: number;
}): NavigationEnvelope {
  const commercialBounds = { ...bounds };
  const protectedRegions = protectedPolygons.map((polygon) => ({
    polygon,
    bounds: polygonBounds(polygon),
  }));
  const explorationRegions = explorationPolygons
    .filter(
      (polygon) => polygon.length >= 3 && polygon.every((point) => point.every(Number.isFinite)),
    )
    .map((polygon) => ({ polygon, bounds: polygonBounds(polygon) }));
  const navigationRegions = [...protectedRegions, ...explorationRegions];
  const viewBounds = explorationRegions.reduce<Bounds>(
    (combined, region) => ({
      minX: Math.min(combined.minX, region.bounds.minX),
      minY: Math.min(combined.minY, region.bounds.minY),
      maxX: Math.max(combined.maxX, region.bounds.maxX),
      maxY: Math.max(combined.maxY, region.bounds.maxY),
    }),
    { ...commercialBounds },
  );
  const viewCenter: Point = [
    (viewBounds.minX + viewBounds.maxX) / 2,
    (viewBounds.minY + viewBounds.maxY) / 2,
  ];
  const box = {
    width: viewBounds.maxX - viewBounds.minX,
    depth: viewBounds.maxY - viewBounds.minY,
    height: maxStructureHeight,
  };
  const diagonal = Math.hypot(box.width, box.depth);
  const halfFov = (fov * Math.PI) / 360;
  const maxPolarAngle = NAVIGATION.maxPolarAngle;
  // The short side of the smallest lot determines useful inspection detail.
  // Lower inclinations apply a second per-pose radius floor below, retaining
  // this close range for the ordinary overhead and oblique inspection views.
  const cameraClearance = maxStructureHeight + smallestSpan * NAVIGATION.roofClearanceSpans;
  const minDistance = Math.max(
    smallestSpan * NAVIGATION.minimumSelectableSpans,
    cameraClearance / Math.cos(NAVIGATION.inspectionPolarAngle),
  );
  // Explicit context often forms an L around the park. Its empty AABB corners
  // must not force an excessively distant overview. Source-only callers retain
  // the previous box fit exactly; roofs remain conservatively included at every
  // actual navigation vertex, including the lower contextual landmarks.
  const fittingPoints: [number, number, number][] = explorationRegions.length
    ? navigationRegions.flatMap(({ polygon }) =>
        polygon.flatMap(([x, z]): [number, number, number][] => [
          [x, 0, z],
          [x, maxStructureHeight, z],
        ]),
      )
    : [];
  const fitDistance = Math.max(
    ...(["perspective", "top", "front"] as const).map((view) =>
      fittingPoints.length
        ? framingPointsDistance(fittingPoints, viewCenter, width, height, insets, view, fov)
        : framingBoxDistance(box, width, height, insets, view, fov),
    ),
  );
  const maxDistance = Math.max(
    cameraClearance / Math.cos(maxPolarAngle),
    fitDistance * NAVIGATION.maximumFitMultiplier,
  );
  const margin = Math.min(box.width, box.depth) * NAVIGATION.targetMarginFraction;
  const targetBounds = {
    minX: viewBounds.minX - margin,
    minY: viewBounds.minY - margin,
    maxX: viewBounds.maxX + margin,
    maxY: viewBounds.maxY + margin,
  };
  const tanVertical = Math.tan(halfFov);
  const tanHorizontal = (tanVertical * Math.max(1, width)) / Math.max(1, height);
  const horizonFade = {
    center: viewCenter,
    start: maxDistance * NAVIGATION.horizonFadeStartDistances + diagonal,
    end: maxDistance * NAVIGATION.horizonFadeEndDistances + diagonal * 2,
  };
  const farPlane = Math.max(diagonal * 8, horizonFade.end + maxDistance * 2);
  // At the lowest view some rays cross the horizon; their mathematical ground
  // intersection is unbounded. Bound the actually rendered far-clip frustum
  // instead: its longest corner ray plus every possible camera/target offset.
  // The world-anchored distant material reaches the sky's horizon colour well
  // before this clip, preserving a continuous horizon without a giant board.
  const groundReach = maxDistance + farPlane * Math.hypot(1, tanVertical, tanHorizontal);
  const reach = groundReach * (1 + NAVIGATION.terrainSafetyFraction) + diagonal * 0.1;
  const terrainBounds = {
    minX: targetBounds.minX - reach,
    minY: targetBounds.minY - reach,
    maxX: targetBounds.maxX + reach,
    maxY: targetBounds.maxY + reach,
  };
  return {
    commercialBounds,
    viewBounds,
    viewCenter,
    minDistance,
    maxDistance,
    fitDistance,
    minPolarAngle: NAVIGATION.minPolarAngle,
    maxPolarAngle,
    cameraClearance,
    targetBounds,
    terrainBounds,
    groundReach,
    farPlane,
    horizonFade,
    groundTangent: Math.min(tanHorizontal, tanVertical),
    protectedRegions,
    navigationRegions,
  };
}

/** Use the same roof-safe floor before wheel/pinch anchor scaling and in the
 * controls, so an already blocked zoom cannot continue drifting its target. */
export function minimumNavigationDistance(envelope: NavigationEnvelope, polar: number) {
  const boundedPolar = Math.max(envelope.minPolarAngle, Math.min(envelope.maxPolarAngle, polar));
  return Math.max(envelope.minDistance, envelope.cameraClearance / Math.cos(boundedPolar));
}

/** Shared by manual gestures, commands, restore/resize, and each animation
 * sample. A blocked pan component translates both target and camera equally,
 * keeping the valid tangent motion, orbit angle and distance intact. */
export function constrainNavigationPose(
  pose: NavigationPose,
  envelope: NavigationEnvelope,
): NavigationPose {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const delta = pose.position.map((value, axis) => value - pose.target[axis]);
  const originalDistance = Math.hypot(...delta);
  const polar = clamp(
    originalDistance ? Math.acos(clamp(delta[1] / originalDistance, -1, 1)) : 0,
    envelope.minPolarAngle,
    envelope.maxPolarAngle,
  );
  const distance = clamp(
    originalDistance,
    minimumNavigationDistance(envelope, polar),
    envelope.maxDistance,
  );
  const azimuth = Math.atan2(delta[0], delta[2]);
  const target: [number, number, number] = [
    clamp(pose.target[0], envelope.targetBounds.minX, envelope.targetBounds.maxX),
    0,
    clamp(pose.target[2], envelope.targetBounds.minY, envelope.targetBounds.maxY),
  ];
  // A target box alone permits a close camera to show only a concave corner's
  // ambient ground. Keep one commercial or explicit context surface in the central 40%
  // of screen width/height. The conservative perspective bound also accounts
  // for the ground witness being closer to the camera than the orbit target.
  const point: Point = [target[0], target[2]];
  let nearest: Point | undefined,
    nearestDistanceSq = Infinity;
  for (const region of envelope.navigationRegions) {
    const { bounds, polygon } = region;
    const boxDistanceSq =
      Math.max(bounds.minX - point[0], 0, point[0] - bounds.maxX) ** 2 +
      Math.max(bounds.minY - point[1], 0, point[1] - bounds.maxY) ** 2;
    if (boxDistanceSq > nearestDistanceSq) continue;
    if (!boxDistanceSq && pointInPolygon(point, polygon)) {
      nearestDistanceSq = 0;
      break;
    }
    for (let edge = 0; edge < polygon.length; edge++) {
      const a = polygon[edge],
        b = polygon[(edge + 1) % polygon.length];
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        lengthSq = dx * dx + dy * dy;
      const t = lengthSq
        ? clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq, 0, 1)
        : 0;
      const x = a[0] + dx * t,
        y = a[1] + dy * t;
      const distanceSq = (point[0] - x) ** 2 + (point[1] - y) ** 2;
      if (distanceSq < nearestDistanceSq) {
        nearestDistanceSq = distanceSq;
        nearest = [x, y];
      }
    }
  }
  const tangent = envelope.groundTangent * NAVIGATION.commercialWitnessNdc;
  const allowedMargin = (distance * tangent) / (1 + tangent);
  if (nearest && nearestDistanceSq > allowedMargin ** 2) {
    const ratio = allowedMargin / Math.sqrt(nearestDistanceSq);
    target[0] = nearest[0] + (point[0] - nearest[0]) * ratio;
    target[2] = nearest[1] + (point[1] - nearest[1]) * ratio;
  }
  return {
    target,
    position: [
      target[0] + distance * Math.sin(polar) * Math.sin(azimuth),
      target[1] + distance * Math.cos(polar),
      target[2] + distance * Math.sin(polar) * Math.cos(azimuth),
    ],
  };
}

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
  if (view === "top") return [0, 1, 0.055];
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
  const freeHeight = Math.max(height * 0.25, height - insets.bottom - 24);
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
  direction?: readonly [number, number, number],
) {
  const raw = direction ?? viewDirection(view),
    length = Math.hypot(...raw);
  const [dx, dy, dz] = raw.map((value) => value / length);
  const rightLength = Math.hypot(dx, dz);
  const rx = dz / rightLength,
    rz = -dx / rightLength;
  const ux = dy * rz,
    uy = dz * rx - dx * rz,
    uz = -dy * rx;
  const freeWidth = Math.max(viewportWidth * 0.25, viewportWidth - insets.right - 32);
  const freeHeight = Math.max(viewportHeight * 0.25, viewportHeight - insets.bottom - 24);
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

/** Exact perspective fit of authored world vertices relative to a ground-level
 * center, in drawing units. Useful for a sparse/L-shaped context: absent AABB
 * corners add no fictitious content. Includes the same free-panel margins and
 * conservative padding as the established box fit, including a live direction. */
export function framingPointsDistance(
  points: readonly (readonly [number, number, number])[],
  center: Point,
  viewportWidth: number,
  viewportHeight: number,
  insets: MapInsets,
  view: MapView,
  fov = 38,
  direction?: readonly [number, number, number],
) {
  const raw = direction && Math.hypot(...direction) > 0 ? direction : viewDirection(view);
  const length = Math.hypot(...raw);
  const [dx, dy, dz] = raw.map((value) => value / length);
  const rightLength = Math.hypot(dx, dz);
  const rx = rightLength ? dz / rightLength : 1,
    rz = rightLength ? -dx / rightLength : 0;
  const ux = dy * rz,
    uy = dz * rx - dx * rz,
    uz = -dy * rx;
  const freeWidth = Math.max(viewportWidth * 0.25, viewportWidth - insets.right - 32);
  const freeHeight = Math.max(viewportHeight * 0.25, viewportHeight - insets.bottom - 24);
  const tanVertical = Math.tan((fov * Math.PI) / 360);
  const tanHorizontalFree = (tanVertical * freeWidth) / Math.max(viewportHeight, 1);
  const tanVerticalFree = (tanVertical * freeHeight) / Math.max(viewportHeight, 1);
  let distance = 1;
  for (const point of points) {
    const x = point[0] - center[0],
      y = point[1],
      z = point[2] - center[1];
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

/** Building/lot labels may grow within their finite local envelope. Streets
 * use streetLabelPresentation instead: their authored world size never grows. */
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
