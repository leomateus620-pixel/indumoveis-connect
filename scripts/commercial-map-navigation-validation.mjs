import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  browser,
  newContext,
  report,
  baseURL,
  artifactDir,
} from "./commercial-map-browser-fixtures.mjs";

const findings = [];
let step = "starting";
const watchdog = setTimeout(async () => {
  await writeFile(
    path.join(artifactDir, "navigation-watchdog.json"),
    JSON.stringify({ step, findings, errors: report.errors }, null, 2),
  );
  console.error("Navigation watchdog", step);
  process.exit(1);
}, 180000);
const checkpoint = (name) => {
  step = name;
  console.log(name);
};
async function timeout(promise, ms = 8000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out at ${step}`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const difference = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
const orbitVector = (pose) => [
  pose.position[0] - pose.target[0],
  pose.position[1],
  pose.position[2] - pose.target[1],
];
const snapshot = (page) =>
  timeout(
    page.evaluate(() => {
      const d = window.__indumoveisMap;
      return (
        d && {
          position: d.position,
          target: d.target,
          polar: d.polar,
          azimuth: d.azimuth,
          distance: d.distance,
          cameraState: d.cameraState,
          selectedId: d.lastSelectedId,
          contexts: d.contextCount,
          draws: d.drawCalls,
          triangles: d.triangles,
          geometries: d.geometries,
          textures: d.textures,
          optionalFailures: d.optionalFailures,
        }
      );
    }),
  );
async function settled(page) {
  await page.waitForTimeout(600);
  return snapshot(page);
}
async function openMap(options = {}) {
  const context = await newContext(options);
  await context.addInitScript((origin) => {
    if (location.origin === origin) localStorage.setItem("indumoveis:map-quality", "light");
  }, new URL(baseURL).origin);
  const page = await context.newPage();
  page.on("crash", () => {
    report.errors.push(`Renderer process crashed at ${step}`);
    console.error("RENDERER CRASH", step);
  });
  page.setDefaultTimeout(15000);
  await page.goto(`${baseURL}/mapa?mapDiagnostics=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector(".im-map-stage")?.dataset.representation === "ready",
    null,
    { timeout: 25000 },
  );
  await page.waitForTimeout(800);
  return { context, page };
}
async function chooseView(page, view) {
  const select = page.getByRole("combobox", { name: "Vista do mapa", exact: true });
  if (await select.count()) await select.selectOption(view);
  else
    await page
      .getByRole("button", {
        name: view === "top" ? "Superior" : view === "front" ? "Oblíqua" : "3D",
        exact: true,
      })
      .click();
  return settled(page);
}
async function choose(page, query) {
  await page
    .getByRole("button", { name: "Buscar lote, pavilhão, via ou estrutura", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Lote, pavilhão, via ou estrutura", exact: true })
    .fill(query);
  await page.locator(".im-map-result").first().click();
  return settled(page);
}
function groundAt(pose, x, y, box) {
  const delta = orbitVector(pose),
    length = Math.hypot(...delta),
    backward = delta.map((v) => v / length);
  const flat = Math.hypot(backward[0], backward[2]),
    right = [backward[2] / flat, 0, -backward[0] / flat];
  const up = [
    backward[1] * right[2],
    backward[2] * right[0] - backward[0] * right[2],
    -backward[1] * right[0],
  ];
  const ndc = [(x / box.width) * 2 - 1, 1 - (y / box.height) * 2],
    tan = Math.tan((38 * Math.PI) / 360);
  const ray = backward.map(
    (v, i) => -v + (right[i] * ndc[0] * tan * box.width) / box.height + up[i] * ndc[1] * tan,
  );
  const distance = -pose.position[1] / ray[1];
  return [pose.position[0] + ray[0] * distance, pose.position[2] + ray[2] * distance];
}
try {
  console.log("open desktop production");
  const { context, page } = await openMap();
  const box = await page.locator("canvas").first().boundingBox(),
    original = await snapshot(page);
  checkpoint("desktop ready");
  await writeFile(
    path.join(artifactDir, "navigation-startup.json"),
    JSON.stringify(original, null, 2),
  );
  async function drag(button, keys = []) {
    checkpoint(`drag ${button} ${keys.join("+")}`);
    const x = box.x + box.width * 0.78,
      y = box.y + box.height * 0.5;
    for (const key of keys) await page.keyboard.down(key);
    await timeout(page.mouse.move(x, y));
    await timeout(page.mouse.down({ button }));
    await timeout(page.mouse.move(x + 65, y + 40, { steps: 9 }));
    await timeout(page.mouse.up({ button }));
    for (const key of keys) await page.keyboard.up(key);
    return settled(page);
  }
  assert.equal(await page.getByRole("region", { name: "Ajuda de navegação" }).count(), 0);
  const orbit = await drag("left");
  checkpoint("primary completed");
  assert(difference(original.target, orbit.target) < 0.002, "primary preserves target");
  assert(Math.abs(orbit.polar - original.polar) > 0.01, "primary inclines");
  assert.equal(orbit.selectedId, null, "primary drag never selects");
  findings.push({ name: "primary-orbit-help-closed", before: original, after: orbit });
  const pan = await drag("right");
  assert(difference(orbit.target, pan.target) > 0.5, "secondary pans the target");
  assert(
    difference(orbitVector(orbit), orbitVector(pan)) < 0.002,
    "secondary preserves orbit vector",
  );
  findings.push({ name: "secondary-pan", before: orbit, after: pan });
  const shifted = await drag("left", ["Shift"]);
  assert(difference(pan.target, shifted.target) > 0.5, "Shift primary pans");
  assert(
    difference(orbitVector(pan), orbitVector(shifted)) < 0.002,
    "Shift preserves orbit vector",
  );
  findings.push({ name: "shift-primary-pan", before: pan, after: shifted });
  const top = await chooseView(page, "top");
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8 + 55, box.y + box.height * 0.6 - 65, { steps: 9 });
  await page.mouse.up();
  const free = await settled(page);
  assert(Math.abs(top.polar - free.polar) > 0.02, "top preset permits primary orbit immediately");
  assert.equal(await page.getByText("Orientação livre", { exact: true }).count(), 1);
  findings.push({ name: "top-primary-orbit-help-closed", before: top, after: free });
  await chooseView(page, "perspective");
  await page.evaluate(() => window.__indumoveisMap.setReferencePose([78, 120, 135], [95, 55]));
  const wheelBefore = await settled(page),
    wheelBox = await page.locator("canvas").first().boundingBox();
  const x = wheelBox.width * 0.56,
    y = wheelBox.height * 0.46;
  await page.evaluate(() =>
    window.addEventListener(
      "wheel",
      (event) => {
        window.__DELIVERED_WHEEL__ = { x: event.clientX, y: event.clientY };
      },
      { capture: true, once: true },
    ),
  );
  await page.mouse.move(wheelBox.x + x, wheelBox.y + y);
  await page.mouse.wheel(0, 100);
  const wheelAfter = await settled(page);
  const delivered = await page.evaluate(() => window.__DELIVERED_WHEEL__);
  const deliveredX = delivered.x - wheelBox.x,
    deliveredY = delivered.y - wheelBox.y;
  assert(
    Math.abs(wheelAfter.distance / wheelBefore.distance - Math.exp(0.32)) < 0.002,
    "single wheel owner applies one normalized zoom",
  );
  assert(
    difference(
      groundAt(wheelBefore, deliveredX, deliveredY, wheelBox),
      groundAt(wheelAfter, deliveredX, deliveredY, wheelBox),
    ) < 0.02,
    "wheel preserves cursor ground anchor",
  );
  findings.push({
    name: "cursor-wheel-single-owner",
    before: wheelBefore,
    after: wheelAfter,
    delivered,
    anchorError: difference(
      groundAt(wheelBefore, deliveredX, deliveredY, wheelBox),
      groundAt(wheelAfter, deliveredX, deliveredY, wheelBox),
    ),
  });
  checkpoint("wheel units, high-rate precision stream and horizon");
  const wheelUnits = [];
  for (const [deltaMode, deltaY] of [
    [0, 100],
    [1, 6.25],
    [2, 100 / wheelBox.height],
  ]) {
    await page.evaluate(() => window.__indumoveisMap.setReferencePose([78, 120, 135], [95, 55]));
    const before = await settled(page);
    const immediate = await page.evaluate(
      ({ deltaMode, deltaY }) => {
        const canvas = document.querySelector("canvas"),
          b = canvas.getBoundingClientRect();
        canvas.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaMode,
            deltaY,
            clientX: b.x + b.width * 0.56,
            clientY: b.y + b.height * 0.46,
          }),
        );
        return performance.now();
      },
      { deltaMode, deltaY },
    );
    await page.waitForTimeout(32);
    const first = await snapshot(page);
    const after = await settled(page);
    assert(
      first.distance / before.distance > 1.08,
      "first wheel movement is immediately perceptible",
    );
    assert(
      Math.abs(after.distance / before.distance - Math.exp(0.32)) < 0.002,
      "equivalent units have equivalent final response",
    );
    wheelUnits.push({
      deltaMode,
      deltaY,
      first32ms: first,
      before,
      after,
      dispatchedAt: immediate,
    });
  }
  findings.push({ name: "wheel-equivalent-deltaModes-first-response", samples: wheelUnits });
  await page.evaluate(() => window.__indumoveisMap.setReferencePose([78, 120, 135], [95, 55]));
  const streamBefore = await settled(page);
  await page.evaluate(async () => {
    const canvas = document.querySelector("canvas"),
      b = canvas.getBoundingClientRect();
    for (let i = 0; i < 20; i++) {
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaY: -5,
          clientX: b.x + b.width * 0.56,
          clientY: b.y + b.height * 0.46,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
  });
  const streamEnd = await snapshot(page);
  assert(
    streamEnd.distance / streamBefore.distance < 0.83,
    "trackpad stream moves while input is active",
  );
  await page.waitForTimeout(120);
  const streamSettled = await snapshot(page);
  assert(Math.abs(streamSettled.distance / streamBefore.distance - Math.exp(-0.32)) < 0.003);
  await page.waitForTimeout(350);
  const streamLater = await snapshot(page);
  assert(
    difference(streamSettled.position, streamLater.position) < 0.002,
    "no accumulated inertial flight after stream",
  );
  findings.push({
    name: "precision-trackpad-stream-no-tail",
    before: streamBefore,
    end: streamEnd,
    settled: streamSettled,
    later: streamLater,
  });
  const reversals = [];
  for (const [firstDelta, reverseDelta] of [
    [-100, 5],
    [100, -5],
    [-20, 0.5],
    [20, -0.5],
  ]) {
    await page.evaluate(() => window.__indumoveisMap.setReferencePose([78, 120, 135], [95, 55]));
    await settled(page);
    const sample = await page.evaluate(
      async ({ firstDelta, reverseDelta }) => {
        const canvas = document.querySelector("canvas"),
          b = canvas.getBoundingClientRect();
        const send = (deltaY) =>
          canvas.dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              deltaY,
              clientX: b.x + b.width * 0.56,
              clientY: b.y + b.height * 0.46,
            }),
          );
        const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
        send(firstDelta);
        await frame();
        const beforeReversal = window.__indumoveisMap.distance;
        send(reverseDelta);
        await frame();
        return { beforeReversal, afterReversal: window.__indumoveisMap.distance };
      },
      { firstDelta, reverseDelta },
    );
    assert(
      Math.sign(sample.afterReversal - sample.beforeReversal) === Math.sign(reverseDelta),
      "small rapid reversal moves in the new direction immediately",
    );
    reversals.push({ firstDelta, reverseDelta, ...sample });
  }
  findings.push({ name: "rapid-wheel-and-trackpad-direction-reversal", samples: reversals });
  await page.evaluate(() => window.__indumoveisMap.setReferencePose([78, 120, 135], [95, 55]));
  await settled(page);
  const buttonReversal = await page.evaluate(async () => {
    const plus = document.querySelector('button[aria-label="Aproximar"]');
    const minus = document.querySelector('button[aria-label="Afastar"]');
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    plus.click();
    plus.click();
    await frame();
    const beforeReversal = window.__indumoveisMap.distance;
    minus.click();
    await frame();
    return { beforeReversal, afterReversal: window.__indumoveisMap.distance };
  });
  assert(
    buttonReversal.afterReversal > buttonReversal.beforeReversal,
    "zoom buttons reverse the visible motion immediately after repeated zoom-in",
  );
  findings.push({ name: "zoom-buttons-immediate-reversal", ...buttonReversal });
  await page.evaluate(() => window.__indumoveisMap.setReferencePose([95, 25, 165], [95, 55]));
  const horizonBefore = await settled(page);
  await page.mouse.move(wheelBox.x + wheelBox.width * 0.75, wheelBox.y + 2);
  await page.mouse.wheel(0, -100);
  const horizonAfter = await settled(page);
  assert(
    difference(horizonBefore.target, horizonAfter.target) < 0.002,
    "sky/horizon falls back to stable target dolly",
  );
  assert(horizonAfter.distance < horizonBefore.distance * 0.8, "horizon zoom remains responsive");
  findings.push({ name: "horizon-stable-target", before: horizonBefore, after: horizonAfter });
  const returnPose = await chooseView(page, "top");
  const selectedA = await choose(page, "Lote 01");
  await page.screenshot({ path: path.join(artifactDir, "desktop-selected-lot01.png") });
  const selectedB = await choose(page, "Pavilhão 12");
  const pavilionContext = await page.evaluate(() => {
    const d = window.__indumoveisMap,
      id = "indumoveis:pavilion:12";
    const canvas = document.querySelector("canvas").getBoundingClientRect();
    const panel = document.querySelector(".im-map-detail").getBoundingClientRect();
    const center = d.project(id, 0);
    let left = center.x,
      right = center.x;
    while (left > 0 && d.pickAt(left, center.y) === id) left -= 2;
    while (right < canvas.width && d.pickAt(right, center.y) === id) right += 2;
    const freeWidth = panel.left - canvas.left - 24;
    return { left, right, span: right - left, freeWidth, fraction: (right - left) / freeWidth };
  });
  assert(
    pavilionContext.fraction < 0.8,
    "pavilion focus retains surrounding context inside the free canvas",
  );
  await page.screenshot({ path: path.join(artifactDir, "desktop-selected-pavilion12.png") });
  assert(
    selectedA.selectedId && selectedB.selectedId && selectedA.selectedId !== selectedB.selectedId,
    "A/B have distinct selected owners",
  );
  await chooseView(page, "perspective");
  await page.keyboard.press("Escape");
  const restored = await settled(page);
  assert(
    difference(returnPose.position, restored.position) < 0.003 &&
      difference(returnPose.target, restored.target) < 0.003,
    "A-B-close restores original pose and preset",
  );
  findings.push({
    name: "A-B-Escape-return",
    before: returnPose,
    A: selectedA,
    B: selectedB,
    pavilionContext,
    after: restored,
  });
  await choose(page, "Lote 01");
  await page.getByRole("button", { name: "Fechar ficha", exact: true }).click();
  const buttonReturn = await settled(page);
  assert(
    difference(restored.position, buttonReturn.position) < 0.003,
    "close button restores original pose",
  );
  findings.push({ name: "close-button-return", after: buttonReturn });
  await choose(page, "Lote 01");
  const repeatBefore = await snapshot(page);
  await choose(page, "Lote 01");
  const repeatAfter = await snapshot(page);
  assert(
    difference(repeatBefore.position, repeatAfter.position) < 0.002,
    "same lot never starts another focus",
  );
  await page.mouse.move(wheelBox.x + wheelBox.width - 2, wheelBox.y - 4);
  await page.waitForTimeout(180);
  const leaveAfter = await snapshot(page);
  assert.equal(
    leaveAfter.selectedId,
    repeatAfter.selectedId,
    "leaving the lot preserves selected information",
  );
  assert(
    difference(repeatAfter.position, leaveAfter.position) < 0.002,
    "hover leave never moves camera",
  );
  findings.push({
    name: "repeat-selection-and-hover-leave",
    before: repeatBefore,
    after: leaveAfter,
  });
  await page.keyboard.press("Escape");
  await settled(page);
  await page
    .getByRole("button", { name: "Buscar lote, pavilhão, via ou estrutura", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Lote, pavilhão, via ou estrutura", exact: true })
    .fill("Lote 01");
  await page.locator(".im-map-result").first().click();
  await page.waitForTimeout(45);
  const movingBox = await page.locator("canvas").first().boundingBox();
  await page.mouse.move(movingBox.x + movingBox.width * 0.8, movingBox.y + movingBox.height * 0.5);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(
    movingBox.x + movingBox.width * 0.8 + 40,
    movingBox.y + movingBox.height * 0.5 + 20,
    { steps: 4 },
  );
  await page.mouse.up({ button: "left" });
  const interrupted = await settled(page);
  await page.waitForTimeout(700);
  const later = await snapshot(page);
  assert(
    difference(interrupted.position, later.position) < 0.002,
    "manual gesture cancels stale focus callbacks",
  );
  findings.push({ name: "manual-cancels-live-focus", after: interrupted, later });
  await page.keyboard.press("Escape");
  await settled(page);
  await page
    .getByRole("button", { name: "Buscar lote, pavilhão, via ou estrutura", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Lote, pavilhão, via ou estrutura", exact: true })
    .fill("Lote 01");
  await page.locator(".im-map-result").first().click();
  await page.waitForTimeout(35);
  await page.mouse.move(
    movingBox.x + movingBox.width * 0.65,
    movingBox.y + movingBox.height * 0.55,
  );
  await page.mouse.wheel(0, -60);
  await page.waitForTimeout(130);
  const wheelInterrupted = await snapshot(page);
  await page.waitForTimeout(700);
  const wheelLater = await snapshot(page);
  assert(
    difference(wheelInterrupted.position, wheelLater.position) < 0.002,
    "wheel immediately replaces focus without a later return flight",
  );
  assert.equal(
    wheelInterrupted.selectedId,
    wheelLater.selectedId,
    "wheel keeps selected information open",
  );
  findings.push({ name: "wheel-cancels-live-focus", after: wheelInterrupted, later: wheelLater });
  await page.keyboard.press("Escape");
  await settled(page);
  await page.screenshot({ path: path.join(artifactDir, "desktop-production-navigation.png") });
  await context.close();
  console.log("desktop passed");
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const { context, page } = await openMap({ viewport, reducedMotion: true });
    const before = await snapshot(page),
      box = await page.locator("canvas").first().boundingBox();
    const cdp = await context.newCDPSession(page),
      x = box.x + box.width * 0.5,
      y = box.y + box.height * 0.55;
    const touch = (type, points) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 1, radiusY: 1 })),
      });
    await touch("touchStart", [[x, y, 1]]);
    await touch("touchMove", [[x + 30, y + 20, 1]]);
    await touch("touchEnd", []);
    const one = await settled(page);
    assert(difference(before.target, one.target) > 0.2, "one touch pans");
    assert(difference(orbitVector(before), orbitVector(one)) < 0.01, "one touch does not orbit");
    await touch("touchStart", [
      [x - 35, y, 1],
      [x + 35, y, 2],
    ]);
    await touch("touchMove", [
      [x - 60, y + 20, 1],
      [x + 60, y + 40, 2],
    ]);
    await touch("touchEnd", []);
    const two = await settled(page);
    assert(Math.abs(two.distance - one.distance) > 0.2, "two fingers pinch");
    assert(Math.abs(two.polar - one.polar) > 0.005, "two fingers incline");
    assert(Math.abs(two.azimuth - one.azimuth) > 0.005, "two fingers rotate");
    assert.equal(two.selectedId, null, "pinch/two-finger gesture never opens a sheet");
    await page.evaluate(
      ({ position, target }) => window.__indumoveisMap.setReferencePose(position, target),
      before,
    );
    const returnPose = await settled(page);
    const tapPoint = await page.evaluate(() => {
      const d = window.__indumoveisMap,
        id = "indumoveis:external:lot:01";
      const p = d.project(id, 0);
      return p && d.pickAt(p.x, p.y) === id ? p : null;
    });
    assert(tapPoint, "a verified interior point of lot 01 is available for native touch");
    await touch("touchStart", [[box.x + tapPoint.x, box.y + tapPoint.y, 1]]);
    await touch("touchEnd", []);
    const nativeTap = await settled(page);
    assert.equal(
      nativeTap.selectedId,
      "indumoveis:external:lot:01",
      "native tap selects the whole lot surface",
    );
    assert(
      await page.getByRole("complementary", { name: "Detalhes da área" }).isVisible(),
      "native tap opens existing details",
    );
    await page.screenshot({
      path: path.join(artifactDir, `touch-selected-lot01-${viewport.width}x${viewport.height}.png`),
    });
    const pavilion = await choose(page, "Pavilhão 12");
    await page.screenshot({
      path: path.join(
        artifactDir,
        `touch-selected-pavilion12-${viewport.width}x${viewport.height}.png`,
      ),
    });
    await page.getByRole("button", { name: "Fechar ficha", exact: true }).click();
    const restored = await settled(page);
    assert(
      difference(returnPose.position, restored.position) < 0.01 &&
        difference(returnPose.target, restored.target) < 0.01,
      "mobile A-B-close restores original pose with panel",
    );
    findings.push({
      name: `touch-and-panel-${viewport.width}x${viewport.height}`,
      before,
      one,
      two,
      nativeTap,
      tapPoint,
      pavilion,
      restored,
    });
    await page.screenshot({
      path: path.join(artifactDir, `touch-production-${viewport.width}x${viewport.height}.png`),
    });
    await context.close();
    console.log("mobile passed", viewport.width, viewport.height);
  }
  await writeFile(
    path.join(artifactDir, "navigation-production.json"),
    JSON.stringify(
      {
        kind: "local production build with intercepted fixtures; simulated touch, not physical-device or performance certification",
        findings,
        errors: report.errors,
        consoleErrors: report.consoleErrors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks: findings.length, errors: report.errors }));
} catch (error) {
  console.error(error);
  await writeFile(
    path.join(artifactDir, "navigation-production-failure.json"),
    JSON.stringify(
      {
        error: String(error),
        findings,
        errors: report.errors,
        consoleErrors: report.consoleErrors,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  await timeout(browser.close(), 30000).catch(() => process.exit(1));
}
