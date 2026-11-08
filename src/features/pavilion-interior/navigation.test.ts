import { describe, expect, it } from "vitest";
import { boundCamera, fitPlan, validateInteriorSearch, zoomPlan } from "./navigation";
import { PAVILION_1_PLAN } from "./data";

const bounds = PAVILION_1_PLAN.bounds;
const viewport = { width: 1100, height: 720 };
const project = (
  point: { x: number; y: number },
  camera: { x: number; y: number; scale: number },
) => ({
  x: point.x * camera.scale + camera.x,
  y: point.y * camera.scale + camera.y,
});

describe("2D pavilion navigation", () => {
  it.each([
    { width: 1440, height: 800 },
    { width: 780, height: 600 },
    { width: 326, height: 650 },
  ])("fits the entire plan and access markers into a %j viewport", (size) => {
    const camera = fitPlan(bounds, size, 20);
    const topLeft = project({ x: bounds.minX, y: bounds.minY }, camera);
    const bottomRight = project({ x: bounds.maxX, y: bounds.maxY }, camera);
    expect(topLeft.x).toBeGreaterThanOrEqual(19.99);
    expect(topLeft.y).toBeGreaterThanOrEqual(19.99);
    expect(bottomRight.x).toBeLessThanOrEqual(size.width - 19.99);
    expect(bottomRight.y).toBeLessThanOrEqual(size.height - 19.99);
  });

  it("keeps the drawing point under the cursor fixed while zooming", () => {
    const camera = fitPlan(bounds, viewport);
    const cursor = { x: 760, y: 278 };
    const drawingPoint = {
      x: (cursor.x - camera.x) / camera.scale,
      y: (cursor.y - camera.y) / camera.scale,
    };
    const zoomed = zoomPlan(camera, 2.4, cursor, bounds, viewport);
    const after = project(drawingPoint, zoomed);
    expect(zoomed.scale).toBeGreaterThan(camera.scale);
    expect(after.x).toBeCloseTo(cursor.x, 8);
    expect(after.y).toBeCloseTo(cursor.y, 8);
    const restored = zoomPlan(zoomed, 1 / 2.4, cursor, bounds, viewport);
    expect(restored.scale).toBeCloseTo(camera.scale, 8);
    expect(restored.x).toBeCloseTo(camera.x, 8);
    expect(restored.y).toBeCloseTo(camera.y, 8);
  });

  it.each([-1e10, 1e10])("keeps part of the plan reachable after a large pan %s", (offset) => {
    const fitted = fitPlan(bounds, viewport);
    const camera = boundCamera({ x: offset, y: offset, scale: fitted.scale * 3 }, bounds, viewport);
    const topLeft = project({ x: bounds.minX, y: bounds.minY }, camera);
    const bottomRight = project({ x: bounds.maxX, y: bounds.maxY }, camera);
    expect(topLeft.x).toBeLessThan(viewport.width);
    expect(topLeft.y).toBeLessThan(viewport.height);
    expect(bottomRight.x).toBeGreaterThan(0);
    expect(bottomRight.y).toBeGreaterThan(0);
  });

  it("keeps the plan reachable in the free strip beside an open left mobile panel", () => {
    const size = { width: 390, height: 650, left: 304 };
    const fitted = fitPlan(bounds, size);
    for (const x of [-1e8, 1e8]) {
      const camera = boundCamera({ x, y: fitted.y, scale: fitted.scale * 2 }, bounds, size);
      const left = bounds.minX * camera.scale + camera.x;
      const right = bounds.maxX * camera.scale + camera.x;
      expect(left).toBeLessThan(size.width);
      expect(right).toBeGreaterThan(size.left);
    }
  });

  it("bounds both zoom extremes and stays finite on a very small viewport", () => {
    const fitted = fitPlan(bounds, viewport);
    const far = zoomPlan(fitted, 1e-12, { x: 100, y: 100 }, bounds, viewport);
    const near = zoomPlan(fitted, 1e12, { x: 100, y: 100 }, bounds, viewport);
    expect(far.scale).toBeGreaterThan(0);
    expect(far.scale).toBeLessThan(fitted.scale);
    expect(near.scale).toBeGreaterThan(fitted.scale);
    expect(near.scale).toBeLessThan(100 * fitted.scale);
    expect(Object.values(fitPlan(bounds, { width: 1, height: 1 })).every(Number.isFinite)).toBe(
      true,
    );
  });

  it("admits only supported environment URL codes and discards movement parameters", () => {
    for (const code of ["01", "09", "14", "15", "salon"])
      expect(validateInteriorSearch({ espaco: code })).toEqual({ espaco: code });
    for (const value of [
      "1",
      "9",
      "00",
      "16",
      "salao",
      "14<script>",
      0,
      16,
      1.5,
      NaN,
      Infinity,
      ["09"],
      null,
    ])
      expect(validateInteriorSearch({ espaco: value }).espaco).toBeUndefined();
    // TanStack's JSON search parser turns valid numeric strings such as "12"
    // into numbers on direct entry/reload; the UI must retain the two-digit code.
    expect(validateInteriorSearch({ espaco: 12 })).toEqual({ espaco: "12" });
    expect(validateInteriorSearch({ espaco: 9 })).toEqual({ espaco: "09" });
    expect(
      validateInteriorSearch({ espaco: "09", zoom: 12, x: 99, y: 56, pavilhao: "14" }),
    ).toEqual({ espaco: "09" });
  });
});
