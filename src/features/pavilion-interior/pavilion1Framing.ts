import { Box3, MathUtils, Vector3 } from "three";

export function pavilion1ViewDirection(width: number, height: number, roomSize?: Vector3) {
  // In portrait, the long east–west axis runs up the screen. In landscape, look
  // across the exhibition from a lower angle so the cutaway reveals the finishes.
  const portrait = width < height * 0.85;
  const azimuth = MathUtils.degToRad(
    roomSize ? (portrait && roomSize.x > roomSize.z ? 66 : 31) : portrait ? 84 : 24,
  );
  const elevation = MathUtils.degToRad(roomSize ? 38 : portrait ? 69 : 35);
  return new Vector3(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  );
}

/** Fit the eight physical corners inside the usable perspective frustum, including furniture height. */
export function framePavilion1Bounds(
  bounds: Box3,
  direction: Vector3,
  slopeX: number,
  slopeY: number,
) {
  const center = bounds.getCenter(new Vector3());
  const right = new Vector3(0, 1, 0).cross(direction).normalize();
  const up = direction.clone().cross(right);
  let maxLeft = -Infinity,
    minRight = Infinity,
    maxBottom = -Infinity,
    minTop = Infinity;
  const corner = new Vector3();
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        corner.set(x, y, z).sub(center);
        const depth = corner.dot(direction);
        const horizontal = corner.dot(right);
        const vertical = corner.dot(up);
        // A near corner needs more space on screen than a far corner at the same lateral offset.
        maxLeft = Math.max(maxLeft, horizontal + depth * slopeX);
        minRight = Math.min(minRight, horizontal - depth * slopeX);
        maxBottom = Math.max(maxBottom, vertical + depth * slopeY);
        minTop = Math.min(minTop, vertical - depth * slopeY);
      }
  const distance = Math.max(
    (maxLeft - minRight) / (2 * slopeX),
    (maxBottom - minTop) / (2 * slopeY),
  );
  const target = center
    .addScaledVector(right, (maxLeft + minRight) / 2)
    .addScaledVector(up, (maxBottom + minTop) / 2);
  const position = target.clone().addScaledVector(direction, distance);
  // Keep orbiting around the exhibits at floor level after a perspective-centred fit.
  target.addScaledVector(direction, (bounds.min.y + 6 - target.y) / direction.y);
  return { target, position };
}
