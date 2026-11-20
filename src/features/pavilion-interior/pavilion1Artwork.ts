import { pointInPolygon } from "@/features/commercial-map/geometry";
import type { InteriorEnvironment, InteriorPoint, PavilionPlan } from "./data";

// The artwork and the interactive plan share the documentary PDF coordinate system.
export const PAVILION_1_ARTWORK = {
  revision: "mostra-arq-design-2-2026-11-15",
  image: "/map-assets/pavilion-1/arq-design-plan.webp",
  detailImage: "/map-assets/pavilion-1/arq-design-plan-detail.webp",
  model: "/map-assets/pavilion-1/arq-design.glb",
  x: 28,
  y: 66,
  width: 1052,
  height: 466,
} as const;

export const hasPavilion1Artwork = (plan: PavilionPlan) =>
  plan.pavilionNumber === 1 && plan.source.revisionName === PAVILION_1_ARTWORK.revision;

export function pavilion1RoomForHit(plan: PavilionPlan, position: InteriorPoint, owner?: string) {
  const room =
    plan.environments.find((item) => item.code === owner) ??
    plan.environments.find((item) =>
      item.parts.some((part) => pointInPolygon(position, part.polygon)),
    );
  return room?.kind === "circulation" ? undefined : room?.code;
}

export interface Pavilion1ModelControls {
  fit(): void;
  zoom(factor: number): void;
  rotate(angle: number): void;
  focus(environment?: InteriorEnvironment): void;
  highlight(codes: readonly string[], sale: boolean): void;
}
