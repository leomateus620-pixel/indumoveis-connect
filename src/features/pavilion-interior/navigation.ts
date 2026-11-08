export type PlanBounds = { minX: number; minY: number; maxX: number; maxY: number };
export type PlanCamera = { x: number; y: number; scale: number };
export type Viewport = { width: number; height: number; left?: number };
export function fitPlan(b: PlanBounds, v: Viewport, padding = 36): PlanCamera {
  const scale = Math.max(
    0.01,
    Math.min(
      Math.max(1, v.width - padding * 2) / (b.maxX - b.minX),
      Math.max(1, v.height - padding * 2) / (b.maxY - b.minY),
    ),
  );
  return {
    scale,
    x: (v.width - (b.minX + b.maxX) * scale) / 2,
    y: (v.height - (b.minY + b.maxY) * scale) / 2,
  };
}
export function boundCamera(c: PlanCamera, b: PlanBounds, v: Viewport): PlanCamera {
  const min = fitPlan(b, v).scale * 0.65;
  const scale = Math.max(min, Math.min(fitPlan(b, v).scale * 12, c.scale));
  // Keep a meaningful part of the drawing reachable at every zoom level.
  const visibleX = Math.min((v.width - (v.left ?? 0)) * 0.4, (b.maxX - b.minX) * scale * 0.5);
  const visibleY = Math.min(v.height * 0.4, (b.maxY - b.minY) * scale * 0.5);
  return {
    scale,
    x: Math.max(
      (v.left ?? 0) + visibleX - b.maxX * scale,
      Math.min(v.width - visibleX - b.minX * scale, c.x),
    ),
    y: Math.max(visibleY - b.maxY * scale, Math.min(v.height - visibleY - b.minY * scale, c.y)),
  };
}
export function zoomPlan(
  c: PlanCamera,
  factor: number,
  anchor: { x: number; y: number },
  b: PlanBounds,
  v: Viewport,
): PlanCamera {
  const scale = boundCamera({ ...c, scale: c.scale * factor }, b, v).scale;
  const ratio = scale / c.scale;
  return boundCamera(
    { scale, x: anchor.x - (anchor.x - c.x) * ratio, y: anchor.y - (anchor.y - c.y) * ratio },
    b,
    v,
  );
}
export function validateInteriorSearch(s: Record<string, unknown>): { espaco?: string } {
  const value =
    typeof s.espaco === "number" && Number.isInteger(s.espaco)
      ? String(s.espaco).padStart(2, "0")
      : s.espaco;
  return {
    espaco: typeof value === "string" && /^(0[1-9]|1[0-5]|salon)$/.test(value) ? value : undefined,
  };
}
