import type { MapEntity, Point } from "./data/territory";

/** World directions in the Indumóveis PDF/10 frame (x right, z down).
 * These are architectural fronts, independent of a roof ridge, polygon start
 * vertex or a camera pose. B1/B2 face the internal promenade; B3–B6 face the
 * lots across Argentina. No cadastral point is changed by this registry. */
const PAVILION_ORIENTATION: Record<
  string,
  { frontNormal: Point; ridgeDirection: Point; frontStreetId: string; entryFractions: number[] }
> = {
  "indumoveis:pavilion:1": {
    frontNormal: [1, 0],
    ridgeDirection: [1, 0],
    frontStreetId: "indumoveis:road:mercosul",
    entryFractions: [0.39],
  },
  "indumoveis:pavilion:14": {
    frontNormal: [1, 0],
    ridgeDirection: [1, 0],
    frontStreetId: "indumoveis:road:mercosul",
    entryFractions: [0.8825, 0.6075, 0.275],
  },
  "indumoveis:pavilion:12": {
    frontNormal: [0, -1],
    ridgeDirection: [1, 0],
    frontStreetId: "indumoveis:road:argentina",
    entryFractions: [0.37],
  },
  "indumoveis:pavilion:8": {
    frontNormal: [0, -1],
    ridgeDirection: [0, 1],
    frontStreetId: "indumoveis:road:argentina",
    entryFractions: [0.6375, 0.175],
  },
  "indumoveis:pavilion:13": {
    frontNormal: [0, -1],
    ridgeDirection: [0, 1],
    frontStreetId: "indumoveis:road:argentina",
    entryFractions: [0.68, 0.325],
  },
  "indumoveis:pavilion:3": {
    frontNormal: [0, -1],
    ridgeDirection: [0, 1],
    frontStreetId: "indumoveis:road:argentina",
    entryFractions: [0.355, 0.1935],
  },
};

export interface PavilionPresentation {
  frontNormal: Point;
  /** Direction of the long ridge, separate from the public facade normal. */
  ridgeDirection: Point;
  frontStreetId: string;
  frontEdge: [Point, Point];
  rearEdge: [Point, Point];
  mainEntries: Point[];
  serviceEntries: Point[];
  /** Entrance pattern is adapted from the reference family, not a survey. */
  estimatedEntries: boolean;
}

function edgeFacing(polygon: readonly Point[], direction: Point): [Point, Point] {
  const area = polygon.reduce((sum, a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  const sign = Math.sign(area);
  let best: [Point, Point] = [polygon[0], polygon[1]],
    score = -Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    const alignment = (sign * (dz * direction[0] - dx * direction[1])) / length;
    // A2 silhouettes include short orthogonal notch edges. A microscopic edge
    // with a numerically perfect normal must not replace the main facade.
    const candidateScore = alignment > 0.94 ? 1000 + length : alignment;
    if (candidateScore > score) {
      score = candidateScore;
      best = [a, b];
    }
  }
  const tangent: Point = [-direction[1], direction[0]];
  return (best[1][0] - best[0][0]) * tangent[0] + (best[1][1] - best[0][1]) * tangent[1] >= 0
    ? best
    : [best[1], best[0]];
}

function distanceToEdge(point: Point, [a, b]: [Point, Point]) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz)),
  );
  return Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dz * t);
}

export function getPavilionPresentation(entity: MapEntity): PavilionPresentation | null {
  const authored = PAVILION_ORIENTATION[entity.id];
  if (!authored) return null;
  const frontEdge = edgeFacing(entity.polygon, authored.frontNormal);
  const rearEdge = edgeFacing(entity.polygon, [-authored.frontNormal[0], -authored.frontNormal[1]]);
  const [a, b] = frontEdge;
  // Main presentation portals follow the photographed facade. Cadastral
  // access points (including Mostra's interior drawing) are retained in the
  // original entity; their old fractional position does not move a real pier.
  const mainEntries = authored.entryFractions.map((t): Point => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ]);
  return {
    frontNormal: [...authored.frontNormal],
    ridgeDirection: [...authored.ridgeDirection],
    frontStreetId: authored.frontStreetId,
    frontEdge: frontEdge.map((p): Point => [...p]) as [Point, Point],
    rearEdge: rearEdge.map((p): Point => [...p]) as [Point, Point],
    mainEntries,
    serviceEntries: (entity.accesses ?? [])
      .filter((p) => distanceToEdge(p, frontEdge) > 0.025)
      .map((p): Point => [...p]),
    estimatedEntries: true,
  };
}

/** Positive when a world edge faces the authored public facade. */
export function isPavilionFrontEdge(entity: MapEntity, a: Point, b: Point): boolean {
  const presentation = getPavilionPresentation(entity);
  if (!presentation) return false;
  const [p, q] = presentation.frontEdge;
  const onLine = (v: Point) =>
    Math.abs((q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0])) < 1e-5;
  return onLine(a) && onLine(b);
}
