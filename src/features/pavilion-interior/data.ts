import plan from "./plan.generated.json";

/** Native PDF drawing coordinates: points, x right / y down; never metres. */
export type InteriorPoint = [number, number];
export type InteriorEnvironmentKind = "commercial" | "support" | "hall" | "circulation";

export interface InteriorGeometryPart {
  /** Stable within an environment/revision; external parts never own stock. */
  id: string;
  kind: "interior" | "external";
  path: string;
  /** Closed ring with repeated first point; retained for exact hit tests. */
  polygon: InteriorPoint[];
}

export interface InteriorEnvironment {
  id: string;
  code: string;
  name: string;
  kind: InteriorEnvironmentKind;
  /** Declared documentary area, independent of drawing units and polygon area. */
  declaredAreaM2: number | null;
  functionLabel?: string;
  label: InteriorPoint;
  parts: InteriorGeometryPart[];
}

export interface InteriorArchitecturalElement {
  id: string;
  kind: "wall" | "door" | "access" | "guide";
  path: string;
  strokeWidth?: number;
  label?: string;
  labelAt?: InteriorPoint;
}

export interface PavilionInteriorPlan {
  id: string;
  revision: number;
  pavilionNumber: number;
  /** Declared total of the pavilion, including circulation. */
  totalAreaM2?: number | null;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  source: {
    revisionName: string;
    document: string;
    page: number;
    sha256: string;
    pageWidth: number;
    pageHeight: number;
    coordinateSystem: string;
  };
  environments: InteriorEnvironment[];
  architecture: InteriorArchitecturalElement[];
}

/** Source-derived revision; API persists and returns this exact plan contract. */
export const PAVILION_1_PLAN = plan as PavilionInteriorPlan;

export const NUMBERED_INTERIOR_CODES = Array.from({ length: 15 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);

export function isInteriorEnvironmentCode(value: unknown): value is string {
  return typeof value === "string" && PAVILION_1_PLAN.environments.some((e) => e.code === value);
}

export function environmentHasExternalPart(environment: InteriorEnvironment): boolean {
  return environment.parts.some((part) => part.kind === "external");
}

export type PavilionPlan = PavilionInteriorPlan;
