import type { Point } from "./data/territory";

/** Photo 9 proves a raised circular planter and a mature tree on P1's public
 * frontage. Its centre and dimensions below are a local visual approximation
 * inside the registered A2 circulation envelope, not a surveyed tree position.
 * The old FENASOJA courtyard recipe confirms the element's identity; its
 * relative position disagrees with the new photograph and is not transferred.
 */
export const P1_PHOTO_PLANTER = {
  id: "photo:p1-front-planter",
  center: [61.25, 59.5] as Point,
  radius: 0.55,
  upperRadius: 0.465,
  soilRadius: 0.39,
  bottom: -0.16,
  baseTop: 0.105,
  rimTop: 0.235,
  soilTop: 0.14,
  sourcePhotograph: "Imagem do ChatGPT 3 de nov. de 2026, 01_02_03.jpg",
  sourceReference: "pavilionCourtyard.ts / pavilion-1-sidewalk-tree (identity only)",
  condition: "Photographed element; estimated local centre, radius and levels in drawing units",
} as const;

/** Appended to the existing vegetation inventory by the renderer. It must use
 * that model's existing instances, atlas, LOD, raycast exclusion and disposal;
 * this module does not construct another tree renderer or another texture.
 */
export const P1_PHOTO_TREE = {
  id: "photo:p1-front-tree",
  world: P1_PHOTO_PLANTER.center,
  scale: 1.05,
} as const;

/** Presentation obstruction: subtract it once from the unified road surface
 * and from traversal validation. The A2 white region is too coarse to encode
 * this photographed island and currently contains its entire disk.
 */
export const P1_PHOTO_PLANTER_FOOTPRINT: Point[] = Array.from({ length: 64 }, (_, i) => {
  const angle = (i / 64) * Math.PI * 2;
  return [
    P1_PHOTO_PLANTER.center[0] + Math.cos(angle) * P1_PHOTO_PLANTER.radius,
    P1_PHOTO_PLANTER.center[1] + Math.sin(angle) * P1_PHOTO_PLANTER.radius,
  ];
});

/** The same semantic obstruction applies to both vehicle and pedestrian
 * traversal. Boundary contact is allowed; passing through its interior is not.
 */
export function photoPlanterContains([x, z]: Point): boolean {
  return (
    Math.hypot(x - P1_PHOTO_PLANTER.center[0], z - P1_PHOTO_PLANTER.center[1]) <
    P1_PHOTO_PLANTER.radius
  );
}

export const PHOTO_P1_COURTYARD = {
  ...P1_PHOTO_PLANTER,
  polygon: P1_PHOTO_PLANTER_FOOTPRINT,
} as const;
