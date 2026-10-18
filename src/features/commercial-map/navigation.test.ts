import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ENTITIES, MAP_BOUNDS } from "./data/territory";
import { architectureVisualHeight } from "./architecture";
import {
  createNavigationEnvelope,
  constrainNavigationPose,
  framingDistance,
  framingBoxDistance,
  readableLabelSize,
  shouldUseLightFallback,
  initialQuality,
  isClick,
  minimumNavigationDistance,
  nextAdaptiveQuality,
  resolvePixelRatio,
  smoothStep,
  smallestSelectableSpan,
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

const selectableSpan = smallestSelectableSpan(
  ENTITIES.filter((entity) => entity.kind === "lot" || entity.kind === "pavilion").map(
    (entity) => entity.polygon,
  ),
);
const highestRoof = Math.max(...ENTITIES.map(architectureVisualHeight));
const envelopeFor = (width: number, height: number) =>
  createNavigationEnvelope({
    bounds: MAP_BOUNDS,
    smallestSelectableSpan: selectableSpan,
    maxStructureHeight: highestRoof,
    width,
    height,
    insets: { right: 0, bottom: 0 },
    protectedPolygons: ENTITIES.map((entity) => entity.polygon),
  });

describe("commercial navigation envelope", () => {
  it("derives a useful close inspection from actual schematic lots while clearing all roofs", () => {
    const envelope = envelopeFor(1280, 720);
    const span = Math.min(
      ...ENTITIES.filter((entity) => entity.kind === "lot").map((entity) => {
        const xs = entity.polygon.map(([x]) => x),
          ys = entity.polygon.map(([, y]) => y);
        return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      }),
    );
    expect(selectableSpan).toBeCloseTo(span);
    const closest = constrainNavigationPose(
      { position: [95, 0, 55.01], target: [95, 0, 55] },
      envelope,
    );
    expect(closest.position[1]).toBeGreaterThan(highestRoof);
    const visibleHeight = 2 * envelope.minDistance * Math.tan((38 * Math.PI) / 360);
    expect(visibleHeight / selectableSpan).toBeLessThan(4);
    // Schema metadata is not a metre coordinate system. Area changes cannot
    // feed camera limits, unlike an actual change to authored geometry.
    expect(
      smallestSelectableSpan([
        [
          [0, 0],
          [4, 0],
          [4, 9],
          [0, 9],
        ],
      ]),
    ).toBe(4);
  });

  it("projects all commercial corners inside each preset at the global far distance", () => {
    const box = { width: 183, depth: 96, height: highestRoof };
    for (const [width, height] of [
      [1440, 800],
      [390, 844],
      [844, 390],
    ]) {
      const envelope = envelopeFor(width, height);
      for (const view of ["top", "front", "perspective"] as const) {
        const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, envelope.farPlane);
        camera.position
          .fromArray(viewDirection(view))
          .normalize()
          .multiplyScalar(envelope.maxDistance);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        for (const x of [-box.width / 2, box.width / 2])
          for (const y of [0, box.height])
            for (const z of [-box.depth / 2, box.depth / 2]) {
              const projected = new THREE.Vector3(x, y, z).project(camera);
              expect(Math.abs(projected.x)).toBeLessThan(1);
              expect(Math.abs(projected.y)).toBeLessThan(1);
            }
      }
      expect(envelopeFor(width, height).maxDistance).toBe(envelope.maxDistance);
    }
    expect(envelopeFor(390, 844).maxDistance).toBeGreaterThan(envelopeFor(1440, 800).maxDistance);
  });

  it("covers every rendered ground ray across portrait, wide, orbit and inclination extrema, with sky at low views", () => {
    const raycaster = new THREE.Raycaster();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.15);
    const hit = new THREE.Vector3();
    let visibleGroundRays = 0,
      skyRays = 0,
      atmosphericRays = 0;
    for (const [width, height] of [
      [1440, 800],
      [390, 844],
      [2560, 700],
    ]) {
      const envelope = envelopeFor(width, height);
      const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, envelope.farPlane);
      for (const tx of [envelope.targetBounds.minX, envelope.targetBounds.maxX])
        for (const tz of [envelope.targetBounds.minY, envelope.targetBounds.maxY])
          for (const distance of [envelope.minDistance, envelope.maxDistance])
            for (const polar of [envelope.minPolarAngle, 0.6, envelope.maxPolarAngle])
              for (let azimuth = 0; azimuth < Math.PI * 2; azimuth += Math.PI / 6) {
                camera.position
                  .setFromSpherical(new THREE.Spherical(distance, polar, azimuth))
                  .add(new THREE.Vector3(tx, 0, tz));
                camera.lookAt(tx, 0, tz);
                camera.updateMatrixWorld();
                for (const x of [-1, 0, 1])
                  for (const y of [-1, -0.5, 0, 0.5, 0.75, 1]) {
                    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
                    if (!raycaster.ray.intersectPlane(ground, hit)) {
                      skyRays++;
                      expect(raycaster.ray.direction.y).toBeGreaterThanOrEqual(0);
                      continue;
                    }
                    // Far clipping uses camera-space forward depth, rather
                    // than Euclidean corner-ray length. Ground beyond it is
                    // already the terminal horizon colour of the atmosphere.
                    if (-hit.clone().applyMatrix4(camera.matrixWorldInverse).z > camera.far) {
                      atmosphericRays++;
                      expect(
                        Math.hypot(
                          hit.x - envelope.horizonFade.center[0],
                          hit.z - envelope.horizonFade.center[1],
                        ),
                      ).toBeGreaterThan(envelope.horizonFade.end);
                      continue;
                    }
                    visibleGroundRays++;
                    expect(hit.x).toBeGreaterThan(envelope.terrainBounds.minX);
                    expect(hit.x).toBeLessThan(envelope.terrainBounds.maxX);
                    expect(hit.z).toBeGreaterThan(envelope.terrainBounds.minY);
                    expect(hit.z).toBeLessThan(envelope.terrainBounds.maxY);
                  }
              }
    }
    expect(visibleGroundRays).toBeGreaterThan(0);
    expect(skyRays).toBeGreaterThan(0);
    expect(atmosphericRays).toBeGreaterThan(0);
  });

  it("retains close lot inspection while lower views move outward only enough to clear roofs", () => {
    const envelope = envelopeFor(1440, 800);
    const target: [number, number, number] = [95, 0, 55];
    const oblique = new THREE.Vector3()
      .setFromSpherical(new THREE.Spherical(envelope.minDistance, Math.PI * 0.36, 0))
      .add(new THREE.Vector3(...target));
    const low = new THREE.Vector3()
      .setFromSpherical(new THREE.Spherical(envelope.minDistance, envelope.maxPolarAngle, 0))
      .add(new THREE.Vector3(...target));
    const closePose = constrainNavigationPose({ target, position: oblique.toArray() }, envelope);
    const lowPose = constrainNavigationPose({ target, position: low.toArray() }, envelope);
    expect(
      new THREE.Vector3(...closePose.position).distanceTo(new THREE.Vector3(...target)),
    ).toBeCloseTo(envelope.minDistance);
    expect(
      new THREE.Vector3(...lowPose.position).distanceTo(new THREE.Vector3(...target)),
    ).toBeGreaterThan(envelope.minDistance);
    expect(lowPose.position[1]).toBeCloseTo(closePose.position[1]);
    expect(lowPose.position[1]).toBeGreaterThan(highestRoof);
    const lowDistance = new THREE.Vector3(...lowPose.position).distanceTo(
      new THREE.Vector3(...target),
    );
    expect(minimumNavigationDistance(envelope, envelope.maxPolarAngle)).toBeCloseTo(lowDistance);
    // The shared command/OrbitControls floor stops the requested scale before
    // zoom-to-cursor can translate a target at the forbidden closer radius.
    expect(
      Math.max(minimumNavigationDistance(envelope, envelope.maxPolarAngle), lowDistance / 1.1) /
        lowDistance,
    ).toBeCloseTo(1);
    // Haze starts beyond the ground projection of any permitted camera and
    // remains outside the commercial envelope even when its target is panned.
    const diagonal = Math.hypot(
      MAP_BOUNDS.maxX - MAP_BOUNDS.minX,
      MAP_BOUNDS.maxY - MAP_BOUNDS.minY,
    );
    expect(envelope.horizonFade.start).toBeGreaterThan(envelope.maxDistance + diagonal / 2 + 12);
    expect(envelope.horizonFade.end).toBeLessThan(envelope.farPlane - envelope.maxDistance);
  });

  it("blocks only forbidden pan components and keeps orbit offset stable", () => {
    const envelope = envelopeFor(1440, 800);
    // No silhouette clamp is needed for this independent box-wall invariant.
    const boxEnvelope = { ...envelope, protectedRegions: [] };
    const target: [number, number, number] = [envelope.targetBounds.maxX + 50, 0, 60];
    const offset = new THREE.Vector3(0, 50, 30);
    const position = offset
      .clone()
      .add(new THREE.Vector3(...target))
      .toArray() as [number, number, number];
    const corrected = constrainNavigationPose({ position, target }, boxEnvelope);
    expect(corrected.target[0]).toBe(envelope.targetBounds.maxX);
    expect(corrected.target[2]).toBe(target[2]);
    expect(
      new THREE.Vector3(...corrected.position)
        .sub(new THREE.Vector3(...corrected.target))
        .distanceTo(offset),
    ).toBeLessThan(1e-10);
    const continued = constrainNavigationPose(
      {
        target: [corrected.target[0] + 5, 0, corrected.target[2] + 3],
        position: [corrected.position[0] + 5, corrected.position[1], corrected.position[2] + 3],
      },
      boxEnvelope,
    );
    expect(continued.target[0]).toBe(corrected.target[0]);
    expect(continued.target[2]).toBe(corrected.target[2] + 3);
  });

  it("keeps a real nonrectangular commercial surface on screen even in empty envelope corners", () => {
    const envelope = envelopeFor(390, 844);
    const corner = [MAP_BOUNDS.minX - 200, 0, MAP_BOUNDS.maxY + 200] as const;
    const corrected = constrainNavigationPose(
      { target: corner, position: [corner[0], 1, corner[2] + 0.001] },
      envelope,
    );
    const camera = new THREE.PerspectiveCamera(38, 390 / 844, 0.1, envelope.farPlane);
    camera.position.fromArray(corrected.position);
    camera.lookAt(new THREE.Vector3(...corrected.target));
    camera.updateMatrixWorld();
    // This checks actual source geometry projection, rather than reproducing
    // the implementation's nearest-edge calculation or configured constants.
    let nearestScreenPoint = Infinity;
    for (const entity of ENTITIES)
      for (let edge = 0; edge < entity.polygon.length; edge++) {
        const a = entity.polygon[edge],
          b = entity.polygon[(edge + 1) % entity.polygon.length];
        for (let step = 0; step <= 20; step++) {
          const t = step / 20;
          const projected = new THREE.Vector3(
            a[0] + (b[0] - a[0]) * t,
            0,
            a[1] + (b[1] - a[1]) * t,
          ).project(camera);
          if (projected.z < 1)
            nearestScreenPoint = Math.min(
              nearestScreenPoint,
              Math.max(Math.abs(projected.x), Math.abs(projected.y)),
            );
        }
      }
    expect(nearestScreenPoint).toBeLessThan(0.5);
  });

  it("constrains every intermediate transition sample and never mutates source geometry", () => {
    const before = JSON.stringify(ENTITIES);
    const envelope = envelopeFor(1280, 720);
    for (let step = 0; step <= 100; step++) {
      const t = step / 100;
      const pose = constrainNavigationPose(
        {
          target: [-200 + t * 700, -100, 400 - t * 800],
          position: [-400 + t * 1500, -250 + t * 800, 1_500 - t * 3_000],
        },
        envelope,
      );
      const distance = new THREE.Vector3(...pose.position).distanceTo(
        new THREE.Vector3(...pose.target),
      );
      expect(distance).toBeGreaterThanOrEqual(envelope.minDistance - 1e-8);
      expect(distance).toBeLessThanOrEqual(envelope.maxDistance + 1e-8);
      expect(pose.position[1]).toBeGreaterThan(highestRoof);
      expect(pose.target[1]).toBe(0);
      const again = constrainNavigationPose(pose, envelope);
      expect(
        new THREE.Vector3(...again.position).distanceTo(new THREE.Vector3(...pose.position)),
      ).toBeLessThan(1e-8);
      expect(
        new THREE.Vector3(...again.target).distanceTo(new THREE.Vector3(...pose.target)),
      ).toBeLessThan(1e-8);
    }
    expect(JSON.stringify(ENTITIES)).toBe(before);
  });
});
