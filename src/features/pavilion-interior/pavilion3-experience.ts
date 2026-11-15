import type { InteriorEnvironment, PavilionPlan } from "./data";
import type { PlanBounds } from "./navigation";

export type Pavilion3ViewRequest =
  { kind: "overview" } | { kind: "focus"; bounds: PlanBounds } | { kind: "tour"; stop: number };
export type Pavilion3ViewControls = { zoom: (factor: number) => void; rotate: () => void };

/** Display groups only. Every item retains its own persisted environment and commercial ID. */
export function pavilion3Sectors(plan: PavilionPlan) {
  return [...new Set(plan.environments.map((lot) => lot.functionLabel))].map((name, index) => {
    const lots = plan.environments.filter((lot) => lot.functionLabel === name);
    return {
      key: String.fromCharCode(65 + index),
      name: name ?? "Lotes",
      lots,
      bounds: lotBounds(lots),
    };
  });
}

export function lotBounds(lots: readonly InteriorEnvironment[]): PlanBounds {
  const points = lots.flatMap((lot) => lot.parts.flatMap((part) => part.polygon));
  return {
    minX: Math.min(...points.map(([x]) => x)),
    minY: Math.min(...points.map(([, y]) => y)),
    maxX: Math.max(...points.map(([x]) => x)),
    maxY: Math.max(...points.map(([, y]) => y)),
  };
}

/** Presentation camera positions in drawing units, not surveyed heights or metric architecture. */
export const PAVILION_3_TOUR = [
  { name: "Entrada", target: [256, 650], offset: [0, 140, 240] },
  { name: "Corredor oeste", target: [176, 420], offset: [45, 105, 190] },
  { name: "Ilha central", target: [290, 420], offset: [180, 170, 150] },
  { name: "Corredor leste", target: [403, 380], offset: [-45, 105, 190] },
  { name: "Passagem ao P13", target: [487, 448], offset: [-180, 130, 110] },
] as const;
