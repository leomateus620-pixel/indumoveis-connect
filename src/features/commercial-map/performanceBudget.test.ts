import { describe, it, expect } from "vitest";
import { isSoftwareRasterizer, ResolutionBudget } from "./performanceBudget";
describe("measured resolution budget", () => {
  it("recognizes explicit software backends without classifying unavailable or hardware metadata as software", () => {
    for (const renderer of [
      "ANGLE (Google, Vulkan SwiftShader Device, SwiftShader driver)",
      "llvmpipe (LLVM 15)",
      "softpipe",
      "Software Rasterizer",
    ])
      expect(isSoftwareRasterizer(renderer)).toBe(true);
    for (const renderer of [
      null,
      undefined,
      "",
      "ANGLE (Apple, Apple M5, Metal)",
      "Mesa Intel UHD",
      "Adreno 610",
      "Apple GPU",
    ])
      expect(isSoftwareRasterizer(renderer)).toBe(false);
    const software = new ResolutionBudget({ software: true });
    expect(software.atMinimum).toBe(false);
    for (let time = 0; time < 30000; time += 3000) software.observe(90, time);
    expect(software.atMinimum).toBe(true);
    software.reset();
    expect(software.scale).toBe(1);
    expect(software.atMinimum).toBe(false);
  });
  it("ignores single spikes, bounds pressure and recovers slowly without oscillation", () => {
    const budget = new ResolutionBudget();
    expect(budget.observe(90, 0)).toBe(false);
    expect(budget.observe(16, 1000)).toBe(false);
    budget.observe(55, 2000);
    expect(budget.observe(55, 3000)).toBe(true);
    expect(budget.scale).toBe(0.9);
    for (let t = 4000; t < 8000; t += 1000) budget.observe(70, t);
    expect(budget.scale).toBe(0.9);
    for (let t = 9000; t < 60000; t += 3000) budget.observe(70, t);
    expect(budget.scale).toBe(0.65);
    for (let t = 60000; t < 180000; t += 3000) budget.observe(16, t);
    expect(budget.scale).toBeLessThanOrEqual(1);
    expect(budget.scale).toBeGreaterThan(0.65);
    budget.reset();
    expect(budget.scale).toBe(1);
  });

  it("starts software below full fill cost and responds to a severe completed frame window", () => {
    const software = new ResolutionBudget({ software: true });
    const gpu = new ResolutionBudget();
    expect(software.scale).toBe(0.5);
    expect(gpu.scale).toBe(1);
    expect(software.observe(83.4, 5000)).toBe(true);
    expect(software.scale).toBeGreaterThanOrEqual(0.4);
    expect(software.scale).toBeLessThan(0.5);
    expect(software.scale ** 2).toBeLessThan(0.25);
    expect(gpu.observe(83.4, 5000)).toBe(false);
    // Dwell protects against multiple changes from adjacent/overlapping windows.
    const after = software.scale;
    for (const t of [5200, 5500, 6000, 6999]) expect(software.observe(83.4, t)).toBe(false);
    expect(software.scale).toBe(after);
    expect(software.observe(83.4, 7000)).toBe(false);
    expect(software.atMinimum).toBe(true);
    const moderate = new ResolutionBudget({ software: true });
    expect(moderate.observe(45, 0)).toBe(false);
    expect(moderate.observe(45, 1000)).toBe(true);
    const reduced = moderate.scale;
    expect(reduced).toBeGreaterThan(0.4);
    expect(moderate.observe(45, 2000)).toBe(false);
    expect(moderate.scale).toBe(reduced);
    expect(moderate.observe(45, 3000)).toBe(true);
  });

  it("uses measured pressure to reach a 30fps raster workload without overshoot or oscillation", () => {
    const budget = new ResolutionBudget({ software: true });
    const samples: number[] = [];
    // Model only: 12ms fixed submission plus 100ms of full-resolution raster.
    // This proves controller response, not measured device performance.
    for (let now = 0; now < 40000; now += 2000) {
      const interval = 12 + 100 * budget.scale ** 2;
      samples.push(budget.scale);
      budget.observe(interval, now);
    }
    expect(12 + 100 * budget.scale ** 2).toBeLessThanOrEqual(34);
    expect(budget.scale).toBeGreaterThanOrEqual(0.4);
    expect(samples.every((scale, i) => !i || scale <= samples[i - 1])).toBe(true);
    const settled = budget.scale;
    for (let now = 40000; now < 80000; now += 2000) budget.observe(30 + Math.sin(now), now);
    expect(budget.scale).toBe(settled);
  });

  it("holds a bounded minimum under CPU pressure and recovers only after sustained spare capacity", () => {
    const budget = new ResolutionBudget({ software: true });
    for (let now = 0; now < 20000; now += 2000) budget.observe(90, now);
    expect(budget.scale).toBe(0.4);
    const low = budget.scale;
    for (let now = 20000; now < 28000; now += 2000) {
      budget.observe(16, now);
      budget.observe(38, now + 1000);
    }
    expect(budget.scale).toBe(low);
    const changes: number[] = [];
    for (let now = 28000; now < 500000; now += 2000) {
      const before = budget.scale;
      if (budget.observe(16, now)) changes.push(budget.scale - before);
    }
    expect(budget.scale).toBe(0.75);
    expect(changes.every((step) => step > 0 && step <= 0.025001)).toBe(true);
    expect(budget.scale).toBeLessThanOrEqual(1);
  });

  it("resets software to unscaled manual/GPU mode and opts back into Automatic explicitly", () => {
    const budget = new ResolutionBudget({ software: true });
    budget.observe(90, 0);
    budget.reset();
    expect(budget.scale).toBe(1);
    expect(budget.observe(90, 1)).toBe(false);
    expect(budget.observe(90, 2)).toBe(true);
    expect(budget.scale).toBe(0.9);
    budget.reset({ software: true });
    expect(budget.scale).toBe(0.5);
    expect(budget.observe(90, 3)).toBe(true);
    expect(budget.scale).toBe(0.4);
  });

  it("ignores invalid samples without changing software scale or counters", () => {
    const budget = new ResolutionBudget({ software: true });
    for (const [p95, now] of [
      [NaN, 0],
      [Infinity, 0],
      [-1, 0],
      [0, 0],
      [90, NaN],
    ])
      expect(budget.observe(p95, now)).toBe(false);
    expect(budget.scale).toBe(0.5);
    expect(budget.observe(38, 1000)).toBe(false);
    expect(budget.observe(38, 3000)).toBe(true);
  });
});
