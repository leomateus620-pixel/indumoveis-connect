import { Box3, MathUtils, PerspectiveCamera, Vector3 } from "three";
import { expect, it } from "vitest";
import { framePavilion1Bounds, pavilion1ViewDirection } from "./pavilion1Framing";

const pavilion = new Box3(new Vector3(38, -2, 77), new Vector3(1021, 27, 489));
it.each([
  [1168, 906],
  [390, 766],
  [320, 622],
])(
  "keeps the entire cutaway in the usable %i × %i viewport and fits its long axis",
  (width, height) => {
    const side = width * 0.03,
      top = 65,
      bottom = 85;
    const camera = new PerspectiveCamera(38, width / height, 0.5, 12000);
    const tan = Math.tan(MathUtils.degToRad(camera.fov / 2));
    const direction = pavilion1ViewDirection(width, height);
    const frame = framePavilion1Bounds(
      pavilion,
      direction,
      (tan * (width - 2 * side)) / height,
      (tan * (height - top - bottom)) / height,
    );
    camera.setViewOffset(width, height, 0, (bottom - top) / 2, width, height);
    camera.position.copy(frame.position);
    camera.lookAt(frame.target);
    camera.updateMatrixWorld();
    const xs = [],
      ys = [];
    for (const x of [pavilion.min.x, pavilion.max.x])
      for (const y of [pavilion.min.y, pavilion.max.y])
        for (const z of [pavilion.min.z, pavilion.max.z]) {
          const ndc = new Vector3(x, y, z).project(camera);
          xs.push(((1 + ndc.x) * width) / 2);
          ys.push(((1 - ndc.y) * height) / 2);
        }
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(side - 0.01);
    expect(Math.max(...xs)).toBeLessThanOrEqual(width - side + 0.01);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(top - 0.01);
    expect(Math.max(...ys)).toBeLessThanOrEqual(height - bottom + 0.01);
    if (width > height) expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(width * 0.92);
    else expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan((height - bottom - top) * 0.82);
  },
);
