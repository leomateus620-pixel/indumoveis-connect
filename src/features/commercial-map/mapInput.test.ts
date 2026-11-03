import { afterEach, describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { configureMapInput, prepareSecondaryOrbit } from "./mapInput";

function pointer(
  type: string,
  x: number,
  y: number,
  options: { button?: number; shiftKey?: boolean; touch?: boolean; id?: number } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: x,
    clientY: y,
    button: options.button ?? 0,
    shiftKey: options.shiftKey,
  });
  Object.defineProperties(event, {
    pointerId: { value: options.id ?? 1 },
    pointerType: { value: options.touch ? "touch" : "mouse" },
    pageX: { value: x },
    pageY: { value: y },
  });
  return event;
}
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
function scene() {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  Object.defineProperties(canvas, { clientWidth: { value: 1000 }, clientHeight: { value: 600 } });
  canvas.setPointerCapture = () => {};
  canvas.releasePointerCapture = () => {};
  const camera = new PerspectiveCamera(38, 1000 / 600, 0.1, 1000);
  camera.position.set(0, 20, 25);
  const controls = new OrbitControls(camera, canvas);
  configureMapInput(controls);
  controls.enableDamping = false;
  controls.update();
  canvas.addEventListener("pointerdown", (event) => prepareSecondaryOrbit(controls, event), true);
  cleanups.push(() => {
    controls.dispose();
    canvas.remove();
  });
  return { canvas, camera, controls };
}
function drag(canvas: HTMLCanvasElement, options: { button?: number; shiftKey?: boolean } = {}) {
  canvas.dispatchEvent(pointer("pointerdown", 300, 250, options));
  canvas.dispatchEvent(pointer("pointermove", 380, 310, options));
  canvas.dispatchEvent(pointer("pointerup", 380, 310, options));
}
describe("stable actual OrbitControls gestures", () => {
  it("moves camera and target together for primary drag, preserving the orbit vector", () => {
    const { canvas, camera, controls } = scene();
    const before = camera.position.clone().sub(controls.target);
    drag(canvas);
    expect(controls.target.length()).toBeGreaterThan(1);
    expect(camera.position.clone().sub(controls.target).distanceTo(before)).toBeLessThan(1e-8);
  });
  it.each([{ button: 2 }, { button: 0, shiftKey: true }, { button: 2, shiftKey: true }])(
    "orbits and inclines with %j while preserving the target",
    (options) => {
      const { canvas, camera, controls } = scene();
      const before = camera.position.clone(),
        polar = controls.getPolarAngle();
      drag(canvas, options);
      expect(controls.target.distanceTo(new Vector3())).toBeLessThan(1e-8);
      expect(camera.position.distanceTo(before)).toBeGreaterThan(1);
      expect(Math.abs(controls.getPolarAngle() - polar)).toBeGreaterThan(0.01);
      expect(camera.position.length()).toBeCloseTo(before.length(), 6);
    },
  );
  it("pans with one touch, then permits simultaneous pinch and two-finger inclination", () => {
    const { canvas, camera, controls } = scene();
    canvas.dispatchEvent(pointer("pointerdown", 300, 250, { touch: true, id: 1 }));
    canvas.dispatchEvent(pointer("pointermove", 330, 270, { touch: true, id: 1 }));
    expect(controls.target.length()).toBeGreaterThan(0.1);
    canvas.dispatchEvent(pointer("pointerdown", 450, 270, { touch: true, id: 2 }));
    const distance = camera.position.distanceTo(controls.target),
      polar = controls.getPolarAngle();
    canvas.dispatchEvent(pointer("pointermove", 500, 310, { touch: true, id: 2 }));
    expect(Math.abs(camera.position.distanceTo(controls.target) - distance)).toBeGreaterThan(0.1);
    expect(Math.abs(controls.getPolarAngle() - polar)).toBeGreaterThan(0.01);
    canvas.dispatchEvent(pointer("pointerup", 330, 270, { touch: true, id: 1 }));
    canvas.dispatchEvent(pointer("pointerup", 500, 310, { touch: true, id: 2 }));
  });
});
