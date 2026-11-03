import { MOUSE, TOUCH } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

/** Stable controls in every preset. No device inference or UI mode changes
 * the primary orbit / secondary pan contract. OrbitControls already maps a
 * modified ROTATE gesture to pan, including Shift + primary button. */
export function configureMapInput(controls: OrbitControls) {
  controls.mouseButtons.LEFT = MOUSE.ROTATE;
  controls.mouseButtons.MIDDLE = MOUSE.DOLLY;
  controls.mouseButtons.RIGHT = MOUSE.PAN;
  controls.touches.ONE = TOUCH.PAN;
  controls.touches.TWO = TOUCH.DOLLY_ROTATE;
  controls.enableRotate = true;
}

/** OrbitControls swaps PAN/ROTATE when a modifier is held. Keep secondary
 * pan consistent even while Shift/Ctrl is still held from another gesture. */
export function prepareSecondaryPan(
  controls: OrbitControls,
  event: Pick<PointerEvent, "ctrlKey" | "metaKey" | "shiftKey">,
) {
  controls.mouseButtons.RIGHT =
    event.ctrlKey || event.metaKey || event.shiftKey ? MOUSE.ROTATE : MOUSE.PAN;
}
