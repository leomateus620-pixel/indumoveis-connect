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
}, 90000);
const checkpoint = (name) => {
  step = name;
  console.log(name);
};
const timeout = (promise, ms = 8000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out at ${step}`)), ms)),
  ]);
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
  const pan = await drag("left");
  checkpoint("primary completed");
  assert(difference(original.target, pan.target) > 0.5, "primary pans the target");
  assert(
    difference(orbitVector(original), orbitVector(pan)) < 0.002,
    "primary preserves orbit vector",
  );
  findings.push({ name: "primary-pan", before: original, after: pan });
  const orbit = await drag("right");
  assert(difference(pan.target, orbit.target) < 0.002, "secondary preserves target");
  assert(Math.abs(orbit.polar - pan.polar) > 0.01, "secondary inclines");
  findings.push({ name: "secondary-orbit", before: pan, after: orbit });
  const shifted = await drag("left", ["Shift"]);
  assert(difference(orbit.target, shifted.target) < 0.002, "Shift primary preserves target");
  assert(Math.abs(shifted.azimuth - orbit.azimuth) > 0.01, "Shift primary orbits");
  findings.push({ name: "shift-primary-orbit", before: orbit, after: shifted });
  await chooseView(page, "perspective");
  await page.evaluate(() => window.__indumoveisMap.setReferencePose([78, 120, 135], [95, 55]));
  const wheelBefore = await settled(page),
    wheelBox = await page.locator("canvas").first().boundingBox();
  const x = wheelBox.width * 0.56,
    y = wheelBox.height * 0.46;
  await page.mouse.move(wheelBox.x + x, wheelBox.y + y);
  await page.mouse.wheel(0, 100);
  const wheelAfter = await settled(page);
  assert(
    Math.abs(wheelAfter.distance / wheelBefore.distance - Math.exp(0.15)) < 0.002,
    "single wheel owner applies one normalized zoom",
  );
  assert(
    difference(groundAt(wheelBefore, x, y, wheelBox), groundAt(wheelAfter, x, y, wheelBox)) < 0.02,
    "wheel preserves cursor ground anchor",
  );
  findings.push({ name: "cursor-wheel-single-owner", before: wheelBefore, after: wheelAfter });
  const returnPose = await chooseView(page, "top");
  const selectedA = await choose(page, "Lote 01"),
    selectedB = await choose(page, "Pavilhão 12");
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
  await page.mouse.down({ button: "right" });
  await page.mouse.move(
    movingBox.x + movingBox.width * 0.8 + 40,
    movingBox.y + movingBox.height * 0.5 + 20,
    { steps: 4 },
  );
  await page.mouse.up({ button: "right" });
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
    const returnPose = await snapshot(page);
    await choose(page, "Lote 01");
    await choose(page, "Pavilhão 12");
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
