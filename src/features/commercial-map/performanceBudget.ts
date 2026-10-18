/** Submitted active-frame intervals, not a GPU timer or input latency. Changes
 * internal resolution only after sustained pressure; never exceeds the profile
 * pixel cap or changes commercial geometry. Idle time is not sampled. */
export const SOFTWARE_RESOLUTION = {
  initialScale: 0.5,
  minimumScale: 0.4,
  recoveryCeiling: 0.75,
  targetFrameMs: 1000 / 30,
  pressureFrameMs: 34,
  emergencyFrameMs: 50,
  recoveryFrameMs: 20,
  dwellMs: 2000,
  minimumDrop: 0.04,
  maximumDrop: 0.12,
  recoveryStep: 0.025,
} as const;

export type ResolutionBudgetOptions = { software?: boolean };

/** Optional driver metadata; absence never implies a software backend. */
export function isSoftwareRasterizer(name: unknown) {
  return (
    typeof name === "string" &&
    /swiftshader|llvmpipe|softpipe|software rasterizer|software renderer/i.test(name)
  );
}

export class ResolutionBudget {
  scale: number;
  private software: boolean;
  private changedAt = -Infinity;
  private slow = 0;
  private fast = 0;
  constructor(options: ResolutionBudgetOptions = {}) {
    this.software = options.software === true;
    this.scale = this.software ? SOFTWARE_RESOLUTION.initialScale : 1;
  }
  get atMinimum() {
    return this.scale <= (this.software ? SOFTWARE_RESOLUTION.minimumScale : 0.65) + 0.0001;
  }
  observe(p95: number, now: number) {
    if (!Number.isFinite(p95) || p95 <= 0 || !Number.isFinite(now)) return false;
    if (this.software) return this.observeSoftware(p95, now);
    // Preserve the existing GPU policy; software calibration is opt-in only.
    this.slow = p95 > 40 ? this.slow + 1 : 0;
    this.fast = p95 < 23 ? this.fast + 1 : 0;
    if (now - this.changedAt < 6000) return false;
    const next =
      this.slow >= 2
        ? Math.max(0.65, this.scale - 0.1)
        : this.fast >= 8
          ? Math.min(1, this.scale + 0.05)
          : this.scale;
    if (Math.abs(next - this.scale) < 0.001) return false;
    this.scale = Math.round(next * 100) / 100;
    this.changedAt = now;
    this.slow = this.fast = 0;
    return true;
  }
  private observeSoftware(p95: number, now: number) {
    const policy = SOFTWARE_RESOLUTION;
    this.slow = p95 > policy.pressureFrameMs ? this.slow + 1 : 0;
    this.fast = p95 < policy.recoveryFrameMs ? this.fast + 1 : 0;
    if (now - this.changedAt < policy.dwellMs) return false;
    let next = this.scale;
    // One window already contains 60 active frames. Severe pressure therefore
    // need not wait for a second multi-second window before reducing fill cost.
    if (p95 > policy.emergencyFrameMs || this.slow >= 2) {
      // Raster work broadly follows pixel area: scale * sqrt(target / time).
      // Clamp the response because submission/geometry costs do not scale with
      // pixels. The 3% margin aims below the 30fps deadline, not on its edge.
      const predicted = this.scale * Math.sqrt(policy.targetFrameMs / p95) * 0.97;
      next = Math.max(
        policy.minimumScale,
        this.scale - policy.maximumDrop,
        Math.min(this.scale - policy.minimumDrop, predicted),
      );
    } else if (this.fast >= 8) {
      next = Math.min(policy.recoveryCeiling, this.scale + policy.recoveryStep);
    }
    next = Math.round(next * 1000) / 1000;
    if (Math.abs(next - this.scale) < 0.001) return false;
    this.scale = next;
    this.changedAt = now;
    this.slow = this.fast = 0;
    return true;
  }
  /** A manual/profile reset restores full profile resolution. Re-entering
   * Automatic software rendering must explicitly pass { software: true }. */
  reset(options: ResolutionBudgetOptions = {}) {
    this.software = options.software === true;
    this.scale = this.software ? SOFTWARE_RESOLUTION.initialScale : 1;
    this.slow = this.fast = 0;
    this.changedAt = -Infinity;
  }
}
