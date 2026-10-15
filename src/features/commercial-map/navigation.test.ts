import { describe, expect, it } from "vitest";
import {
  framingDistance,
  framingBoxDistance,
  readableLabelSize,
  shouldUseLightFallback,
  initialQuality,
  isClick,
  nextAdaptiveQuality,
  resolvePixelRatio,
  smoothStep,
  viewDirection,
} from "./navigation";

describe("map navigation decisions", () => {
  it("caps the drawing buffer by actual container pixels, including ultrawide layouts", () => {
    for (const [width, height] of [
      [360, 800],
      [1920, 1080],
      [4000, 2000],
    ]) {
      expect(
        width * height * resolvePixelRatio(width, height, 4, "light") ** 2,
      ).toBeLessThanOrEqual(1_000_001);
    }
  });
  it("frames within the region left by a real panel", () => {
    const clear = framingDistance(10, 900, 600, { right: 0, bottom: 0 });
    expect(framingDistance(10, 900, 600, { right: 360, bottom: 0 })).toBeGreaterThan(clear);
    expect(framingDistance(10, 900, 600, { right: 0, bottom: 200 })).toBeGreaterThan(clear);
  });
  it("fits a wide planar overview without the excess margins of a sphere", () => {
    const box = { width: 184, depth: 96, height: 4.1 };
    const clear = { right: 0, bottom: 0 };
    const fit = framingBoxDistance(box, 1294, 665, clear, "perspective");
    const sphere = framingDistance(Math.hypot(box.width, box.depth) / 2, 1294, 665, clear);
    expect(fit).toBeLessThan(sphere * 0.85);
    expect(
      framingBoxDistance(box, 1294, 665, { right: 700, bottom: 0 }, "perspective"),
    ).toBeGreaterThan(fit);
    expect(framingBoxDistance(box, 360, 665, clear, "top")).toBeGreaterThan(100);
  });
  it("distinguishes CSS-pixel drag thresholds for mouse and touch", () => {
    expect(isClick({ x: 0, y: 0, touch: false }, 7, 0)).toBe(false);
    expect(isClick({ x: 0, y: 0, touch: true }, 7, 0)).toBe(true);
    expect(isClick({ x: 0, y: 0, touch: true }, 11, 0)).toBe(false);
  });
  it("keeps unknown capabilities conservative and uses sustained hysteresis", () => {
    expect(initialQuality(undefined, 16)).toBe("light");
    expect(nextAdaptiveQuality("balanced", 1, 0)).toBe("balanced");
    expect(nextAdaptiveQuality("balanced", 2, 0)).toBe("light");
    expect(nextAdaptiveQuality("light", 0, 7)).toBe("light");
    expect(nextAdaptiveQuality("light", 0, 8)).toBe("balanced");
  });
  it("uses 2D only after sustained measured slowness in the automatic light profile", () => {
    expect(shouldUseLightFallback(true, "light", 2)).toBe(false);
    expect(shouldUseLightFallback(true, "light", 3)).toBe(true);
    expect(shouldUseLightFallback(true, "balanced", 10)).toBe(false);
    expect(shouldUseLightFallback(false, "light", 100)).toBe(false);
  });
  it("preserves the sheet orientation and uses bounded animation easing", () => {
    expect(viewDirection("top")[2]).toBeGreaterThan(0);
    expect(smoothStep(-1)).toBe(0);
    expect(smoothStep(2)).toBe(1);
    expect(smoothStep(0.5)).toBe(0.5);
  });
  it("keeps world labels readable with a bounded scale and leaves hidden distant lot numbers small", () => {
    const size = readableLabelSize(7, 0.4, 0.8, 19 / 40, 12);
    expect((size / 0.4) * 0.8 * (19 / 40)).toBeCloseTo(12);
    expect(readableLabelSize(7, 100, 0.01, 19 / 40, 12)).toBe(17.5);
    expect(readableLabelSize(1.8, 100, 0.01, 22 / 40, 0)).toBe(1.8);
  });
});
