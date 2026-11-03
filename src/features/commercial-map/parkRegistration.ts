import type { Point } from "./data/territory";
import {
  PARK_REFERENCE_BLOCKS,
  PARK_REFERENCE_REVISION,
  type ParkSourcePoint,
  type ParkSourcePolygon,
} from "./parkReference";

export interface ParkRegistrationControl {
  id: string;
  source: ParkSourcePoint;
  target: ParkSourcePoint;
  role: "fit" | "holdout";
}
const cornerControls = (
  id: string,
  source: readonly [number, number, number, number],
  target: readonly [number, number, number, number],
): ParkRegistrationControl[] => {
  const [x0, z0, x1, z1] = source,
    [u0, v0, u1, v1] = target;
  return [
    { id: `${id}:NW`, source: [x0, z0], target: [u0, v0], role: "fit" },
    { id: `${id}:NE`, source: [x1, z0], target: [u1, v0], role: "fit" },
    { id: `${id}:SE`, source: [x1, z1], target: [u1, v1], role: "fit" },
    { id: `${id}:SW`, source: [x0, z1], target: [u0, v1], role: "fit" },
  ];
};
export const PARK_CODE_REGISTRATION_CONTROLS: readonly ParkRegistrationControl[] = [
  ...cornerControls("I", [2830, 3495, 3440, 3715], [71.01831, 47.59919, 112.45099, 64.4229]),
  ...cornerControls("D", [3484, 3495, 3935, 3715], [115.11096, 47.59919, 147.37663, 64.42976]),
  ...cornerControls("J", [2830, 3182, 3440, 3435], [71.05433, 26.03559, 112.61273, 44.66278]),
  ...cornerControls("E", [3484, 3182, 3935, 3437], [115.11096, 26.03505, 146.89349, 44.62806]),
  // The top commercial strip is only part of physical L/F. Never fit its
  // bounding box against those entire physical blocks to hide a bad match.
  { id: "L:south-west", source: [2830, 3105], target: [71.05433, 22.94372], role: "holdout" },
  { id: "L:south-east", source: [3440, 3105], target: [112.61273, 22.94372], role: "holdout" },
  { id: "F:south-west", source: [3484, 3105], target: [115.11096, 22.91555], role: "holdout" },
];

/** Primary physical frame: A2 /Rotate270 normalized to1684x1191 points.
 * Controls are extrema extracted from original vector fills. */
export const PARK_REGISTRATION_CONTROLS: readonly ParkRegistrationControl[] = [
  ...cornerControls(
    "I",
    [758.11, 733.98, 919.33, 800.82],
    [71.01831, 47.59919, 112.45099, 64.4229],
  ),
  ...cornerControls(
    "D",
    [928.15, 735.42, 1054.24, 801.9],
    [115.11096, 47.59919, 147.37663, 64.42976],
  ),
  ...cornerControls(
    "J",
    [758.77, 651.66, 920.8, 725.13],
    [71.05433, 26.03559, 112.61273, 44.66278],
  ),
  ...cornerControls(
    "E",
    [929.77, 652.38, 1053.13, 726.15],
    [115.11096, 26.03505, 146.89349, 44.62806],
  ),
  { id: "L:south-west", source: [760.54, 638.13], target: [71.05433, 22.94372], role: "holdout" },
  { id: "L:south-east", source: [922.27, 638.13], target: [112.61273, 22.94372], role: "holdout" },
  { id: "F:south-west", source: [931.84, 638.46], target: [115.11096, 22.91555], role: "holdout" },
];
export const PARK_A2_REGISTRATION = {
  a: 0.257668300220901,
  b: -0.0011291766255112634,
  tx: -125.20955046775917,
  tz: -140.983233679288,
  scale: 0.2576707743974469,
  rotationDegrees: -0.25108498313103755,
  fitRms: 0.28302793844626967,
  fitMaximum: 0.49968407057658126,
  attachmentSha256: "895a6d7a60d411ac3152403e2b5319eb8637bd38d0749f89509bd5dafb5b23b6",
  normalizedPage: [1684, 1191],
  originalPageRotation: 270,
} as const;
/** Common graphic conversion only. It does not certify peripheral code
 * approximations: use direct A2 outlines where available. */
export const PARK_CODE_TO_A2_REGISTRATION = {
  a2ToCode: [
    [3.747940110929301, -0.011658574438931304],
    [0.017889574843818864, 3.5810164710240695],
    [-21.224037285683938, 859.1511194637108],
  ],
  inverseLinear: [
    0.266809082003922, -0.0013328899992897255, 0.0008686398313705894, 0.2792459818306161,
  ],
  forwardFitRmsCodePoints: 11.893551619838144,
  forwardFitMaximumCodePoints: 18.764777915023455,
  northHoldoutResidualCodePoints: [32.24779026721815, 29.352424930935477, 29.652442366895592],
  condition:
    "Reference-code drawing approximations converted to primary A2; peripheral footprints require direct A2 verification",
} as const;

/** Primary A2 physical similarity, plus one common graphic conversion for
 * approximate reference-code coordinates. No sector offsets or lot rewrites.
 * linear uses column convention [m00,m01,m10,m11]. scale=sqrt(abs(det)) is
 * for approximate heights/widths from code only, not physical A2 dimensions. */
export const PARK_REGISTRATION = {
  revision: "2026-11-02-a2-physical-block-registration.2",
  referenceRevision: PARK_REFERENCE_REVISION,
  origin: "Primary A2 normalized1684x1191; code frame converted by one common affine",
  target: "Indumóveis drawing: one world unit = ten source PDF points",
  primaryFrame: "a2-normalized",
  linear: [
    0.06874922349124313, -0.000028125465047346815, -0.0000774536300195168, 0.07195434255004303,
  ],
  a: 0.07035178302064307,
  b: -0.000024664082486084992,
  tx: -123.72625036023834,
  tz: -202.80453151016422,
  scale: 0.07033351262889555,
  rotationDegrees: PARK_A2_REGISTRATION.rotationDegrees,
  fitRms: PARK_A2_REGISTRATION.fitRms,
  fitMaximum: PARK_A2_REGISTRATION.fitMaximum,
  previousCodeOnlyFitRms: 0.8179866312885694,
  previousCodeOnlyFitMaximum: 1.0812886971941147,
  /** A diagnostic affine fit improved RMS only to 0.642 and distorted scales;
   * it is not used to transform physical blocks. */
  diagnosticAffineRms: 0.6419718989114415,
  measureCondition:
    "A2 primary physical drawing; separate code graphic conversion; no topographic accuracy claim",
  // Half the narrowest protected central street (~2.47/2) is the maximum
  // acceptable edge discrepancy. Values beyond it remain explicit issues.
  edgeReviewTolerance: 1.2,
} as const;

export function registerA2Point([x, z]: ParkSourcePoint): Point {
  const { a, b, tx, tz } = PARK_A2_REGISTRATION;
  return [a * x - b * z + tx, b * x + a * z + tz];
}
export const registerA2Polygon = (polygon: ParkSourcePolygon): Point[] =>
  polygon.map(registerA2Point);
export function registerA2Direction([x, z]: ParkSourcePoint): Point {
  const { a, b } = PARK_A2_REGISTRATION,
    u = a * x - b * z,
    v = b * x + a * z,
    n = Math.hypot(u, v) || 1;
  return [u / n, v / n];
}
export function referenceCodePointToA2([x, z]: ParkSourcePoint): Point {
  const u = x + 21.224037285683938,
    v = z - 859.1511194637108;
  const [m00, m01, m10, m11] = PARK_CODE_TO_A2_REGISTRATION.inverseLinear;
  return [m00 * u + m01 * v, m10 * u + m11 * v];
}
export function registerParkPoint(point: ParkSourcePoint): Point {
  return registerA2Point(referenceCodePointToA2(point));
}
export function registerParkDirection([x, z]: ParkSourcePoint): Point {
  const [m00, m01, m10, m11] = PARK_REGISTRATION.linear;
  const u = m00 * x + m01 * z,
    v = m10 * x + m11 * z,
    n = Math.hypot(u, v) || 1;
  return [u / n, v / n];
}
export function registerParkPolygon(polygon: ParkSourcePolygon): Point[] {
  return polygon.map(registerParkPoint);
}
export function parkRegistrationResidual(control: ParkRegistrationControl): number {
  const p = registerA2Point(control.source);
  return Math.hypot(p[0] - control.target[0], p[1] - control.target[1]);
}
export const PARK_REGISTRATION_RESIDUALS = PARK_REGISTRATION_CONTROLS.map((control) => ({
  ...control,
  sourceFrame: "a2-normalized",
  registered: registerA2Point(control.source),
  residual: parkRegistrationResidual(control),
  withinTolerance: parkRegistrationResidual(control) <= PARK_REGISTRATION.edgeReviewTolerance,
}));

/** Review table: physical block → source envelope → Indumóveis subset → streets.
 * Working physical codes are for evidence only, never commercial UI labels. */
export const PARK_BLOCK_CORRESPONDENCE = PARK_REFERENCE_BLOCKS.map((block) => ({
  physicalBlock: block.id,
  referenceRevision: PARK_REFERENCE_REVISION,
  referenceEnvelope: block.a2Polygon ?? block.sourcePolygon,
  referenceFrame: block.a2Polygon ? "a2-normalized" : "reference-code-converted-to-a2",
  indumoveisNumbers: block.indumoveisNumbers,
  coverage: block.coverage,
  boundaryRoads: block.neighborRoads,
  registeredEnvelope: block.a2Polygon
    ? registerA2Polygon(block.a2Polygon)
    : registerParkPolygon(block.sourcePolygon),
  note: block.note,
}));
