import { describe, expect, it } from "vitest";
import { buildPhotoHallFacade } from "./photoHallFacades";
import type { PhotoBuilder } from "./photoArchitectureKit";

type Call = { method: string; args: unknown[] };

function recordHall(pavilion: 8 | 13 | 12) {
  const calls: Call[] = [];
  const builder = { w: 12, h: 3.8, rise: 1.2, depth: 20 } as unknown as PhotoBuilder;
  for (const method of [
    "box",
    "beam",
    "quad",
    "window",
    "gate",
    "wall",
    "truss",
    "pitchedCanopy",
    "horizontalLouvers",
    "gablePanel",
  ])
    Object.assign(builder, {
      [method]: (...args: unknown[]) => calls.push({ method, args }),
    });
  Object.assign(builder, { detail: (build: () => void) => build() });
  buildPhotoHallFacade(builder, pavilion);
  return { calls, builder };
}

describe("photographic pavilion facades", () => {
  it.each([8, 13, 12] as const)(
    "P%s leaves real wall openings for its gates and windows",
    (pavilion) => {
      const { calls, builder } = recordHall(pavilion);
      const walls = calls.filter((call) => call.method === "wall");
      const openings = calls.filter((call) => call.method === "window" || call.method === "gate");
      expect(openings.length).toBeGreaterThan(0);
      for (const opening of openings) {
        const [x0, x1, y0, y1] = opening.args as number[];
        expect(x0).toBeGreaterThanOrEqual(0);
        expect(x1).toBeLessThanOrEqual(builder.w);
        expect(x1).toBeGreaterThan(x0);
        expect(y1).toBeGreaterThan(y0);
        for (const wall of walls) {
          const [a, b, bottom, top] = wall.args as number[];
          const width = Math.max(0, Math.min(x1, b) - Math.max(x0, a));
          const height = Math.max(0, Math.min(y1, top) - Math.max(y0, bottom));
          expect(width * height).toBeLessThan(1e-8);
        }
      }
    },
  );

  it("keeps P13's louver fronton distinct from P8's high glazing", () => {
    const p13 = recordHall(13).calls;
    const p8 = recordHall(8).calls;
    expect(p13.some((call) => call.method === "window")).toBe(false);
    expect(p13.some((call) => call.method === "horizontalLouvers")).toBe(true);
    expect(p8.filter((call) => call.method === "window")).toHaveLength(3);
    expect(p8.some((call) => call.method === "pitchedCanopy")).toBe(true);
    expect(p13.some((call) => call.method === "pitchedCanopy")).toBe(true);
  });

  it("gives P12 tall glazing and a braced eave, preserving its longitudinal identity", () => {
    const { calls, builder } = recordHall(12);
    const windows = calls.filter((call) => call.method === "window");
    const glassWidth = windows.reduce(
      (sum, call) => sum + Number(call.args[1]) - Number(call.args[0]),
      0,
    );
    expect(glassWidth / builder.w).toBeGreaterThan(0.65);
    for (const window of windows) {
      expect(Number(window.args[3]) - Number(window.args[2])).toBeGreaterThan(builder.h * 0.4);
    }
    expect(calls.filter((call) => call.method === "gate")).toHaveLength(1);
    expect(calls.some((call) => call.method === "pitchedCanopy")).toBe(false);
    expect(calls.filter((call) => call.method === "beam").length).toBeGreaterThanOrEqual(10);
  });
});
