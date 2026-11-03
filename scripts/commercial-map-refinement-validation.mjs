/** Paired production-build study. Intercepted read-only lab data, host GPU.
 * MAP_BASE_URL=http://127.0.0.1:4231 MAP_REALISM_PHASE=before
 * MAP_ARTIFACT_DIR=artifacts.local/map-refinement/before node scripts/commercial-map-refinement-validation.mjs
 * Repeat with the new build and phase=after. No production writes. */
import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import {
  browser,
  newContext,
  report,
  baseURL,
  artifactDir,
} from "./commercial-map-browser-fixtures.mjs";

const phase = process.env.MAP_REALISM_PHASE ?? "after";
const before = process.env.MAP_REFINEMENT_REFERENCE
  ? JSON.parse(await readFile(process.env.MAP_REFINEMENT_REFERENCE, "utf8"))
  : null;
const percentile = (values, q) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1];
const difference = (a, b) => Math.hypot(...a.map((n, i) => n - b[i]));
const snapshot = (page) =>
  page.evaluate(() => {
    const d = window.__indumoveisMap;
    return {
      position: d.position,
      target: d.target,
      distance: d.distance,
      polar: d.polar,
      azimuth: d.azimuth,
      drawCalls: d.drawCalls,
      triangles: d.triangles,
      geometries: d.geometries,
      textures: d.textures,
      programs: d.programs,
      textureBytes: d.textureBytes,
      dpr: d.dpr,
      buffer: d.buffer,
      cameraState: d.cameraState,
      frameIntervals: d.frameIntervals,
      renderDurations: d.renderDurations,
      contextLosses: d.contextLosses,
      optionalFailures: d.optionalFailures,
      labels: d.labels,
      lotLabels: d.lotLabels,
      contexts: window.__MAP_LAB__.contexts(),
    };
  });
const idle = async (page) => {
  await page.waitForFunction(() => window.__indumoveisMap?.cameraState === "idle");
  await page.waitForTimeout(280);
};
const poses = {
  overview: { position: [110, 142, 186], target: [106, 43] },
  superior: { position: [110, 440, 0], target: [110, -4] },
  lots: { position: [103, 55, 107], target: [106, 43] },
  "lots-close": { position: [92, 15, 58], target: [94, 42] },
  "p1-rear": { position: [22.8847, 13, 61.0987], target: [47.8847, 61.0987] },
  "p14-rear": { position: [27.147, 13, 79.4933], target: [52.147, 79.4933] },
  "avenue-rear": { position: [106, 38, 134], target: [103, 83] },
  "p3-front": { position: [123.3874, 13, 45.4818], target: [123.3874, 78.4818] },
};
report.study = {
  phase,
  baseCommit: "980d1dc69c392c9a7737a00f53d0765a8e3080a4",
  captures: [],
  zoom: [],
  cycles: [],
};
const context = await newContext({ viewport: { width: 1600, height: 1000 } });
try {
  await context.addInitScript((origin) => {
    if (location.origin === origin) localStorage.setItem("indumoveis:map-quality", "light");
  }, new URL(baseURL).origin);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const started = performance.now();
  await page.goto(`${baseURL}/mapa?mapDiagnostics=1`, { waitUntil: "domcontentloaded" });
  await page.locator('.im-map-stage[data-representation="ready"]').waitFor();
  report.study.openingMs = performance.now() - started;
  await page.waitForFunction(
    () => window.__indumoveisMap?.realism?.ready && window.__indumoveisMap?.environmentReadyAt > 0,
    null,
    { timeout: 60000 },
  );
  await page
    .locator(".im-map-stage")
    .evaluate((el) => Object.assign(el.style, { flex: "none", width: "1520px", height: "880px" }));
  await idle(page);
  report.study.renderer = await page.evaluate(() => window.__MAP_LAB__.rendererInfo());
  report.conditions.fixedCanvasCSS = [1520, 880];
  report.conditions.profile = "light; DPR1; identical buffer/preset/camera; no automatic quality";
  await page.screenshot({ path: path.join(artifactDir, "startup-workspace.png") });
  report.study.startup = await snapshot(page);
  for (const [name, requested] of Object.entries(poses)) {
    const pose = before?.study.captures.find((c) => c.name === name)?.pose ?? requested;
    await page.evaluate(
      ({ position, target }) => window.__indumoveisMap.setReferencePose(position, target),
      pose,
    );
    await page.mouse.move(1599, 999);
    await idle(page);
    const actual = await snapshot(page);
    const samePose =
      difference(pose.position, actual.position) < 0.02 &&
      difference(pose.target, actual.target) < 0.02;
    // Store actual constrained baseline, then demand exact pairing after changes.
    if (before) assert(samePose, `${name}: paired camera drift`);
    await page.locator("canvas").screenshot({ path: path.join(artifactDir, `${name}.png`) });
    report.study.captures.push({
      name,
      requested,
      samePose,
      pose: { position: actual.position, target: actual.target },
      ...actual,
    });
    console.log(`capture ${phase} ${name}`);
  }
  if (phase === "after") {
    const source = JSON.parse(
      await readFile("artifacts.local/map-refinement/source/territory.json", "utf8"),
    );
    const lots = source.ENTITIES.filter((e) => e.kind === "lot");
    const overview = report.study.captures.find((c) => c.name === "overview");
    const visible = overview.lotLabels.filter((l) => l.visible);
    assert(visible.length >= 40, "commercial overview must identify numbered envelopes");
    for (const capture of report.study.captures) {
      const labels = (capture.lotLabels ?? []).filter((l) => l.visible);
      for (let i = 0; i < labels.length; i++)
        for (let j = i + 1; j < labels.length; j++) {
          const a = labels[i].rect,
            b = labels[j].rect;
          assert(
            Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2,
            `${capture.name}: label collision ${labels[i].id}/${labels[j].id}`,
          );
        }
    }
    await page.evaluate(
      ({ position, target }) => window.__indumoveisMap.setReferencePose(position, target),
      poses.lots,
    );
    await idle(page);
    const pose = await snapshot(page);
    const camera = new THREE.PerspectiveCamera(38, 1520 / 880, 0.1, 10000);
    camera.position.fromArray(pose.position);
    camera.lookAt(pose.target[0], 0, pose.target[1]);
    camera.updateMatrixWorld();
    const probes = lots
      .flatMap((lot) =>
        lot.polygon.slice(0, 3).map((vertex) => {
          const point = new THREE.Vector3(
            lot.anchor[0] * 0.55 + vertex[0] * 0.45,
            0.05,
            lot.anchor[1] * 0.55 + vertex[1] * 0.45,
          ).project(camera);
          return { id: lot.id, x: (point.x + 1) * 760, y: (1 - point.y) * 440 };
        }),
      )
      .filter((p) => p.x > 0 && p.x < 1520 && p.y > 0 && p.y < 880);
    const hits = await page.evaluate(
      (probes) => probes.map((p) => ({ ...p, hit: window.__indumoveisMap.pickAt(p.x, p.y) })),
      probes,
    );
    assert(hits.length >= 120, "not enough whole-polygon probes");
    assert(
      hits.every((p) => p.id === p.hit),
      "whole-polygon picking mismatch",
    );
    report.study.lotCoverage = {
      overviewVisible: visible.length,
      wholePolygonProbes: hits.length,
      successfulProbes: hits.filter((p) => p.id === p.hit).length,
      nonoverlappingLabels: true,
    };
  }
  const basePose = before?.study.captures[0].pose ?? poses.overview;
  await page.evaluate(
    ({ position, target }) => window.__indumoveisMap.setReferencePose(position, target),
    basePose,
  );
  await idle(page);
  const box = await page.locator("canvas").boundingBox();
  const orbitButton = phase === "before" ? "right" : "left";
  await page.evaluate(() => window.__indumoveisMap.resetSamples());
  const benchStart = performance.now();
  while (performance.now() - benchStart < Number(process.env.MAP_REFINEMENT_BENCH_MS ?? 15000)) {
    for (const direction of [1, -1]) {
      await page.mouse.move(box.x + box.width * 0.48, box.y + box.height * 0.53);
      await page.mouse.down({ button: orbitButton });
      await page.mouse.move(
        box.x + box.width * 0.48 + 60 * direction,
        box.y + box.height * 0.53 + 12 * direction,
        { steps: 18 },
      );
      await page.mouse.up({ button: orbitButton });
    }
  }
  const metrics = await snapshot(page);
  assert(metrics.frameIntervals.length > 60, "insufficient active frame sample");
  report.study.navigation = {
    ...metrics,
    frameIntervals: undefined,
    renderDurations: undefined,
    durationMs: performance.now() - benchStart,
    frames: metrics.frameIntervals.length,
    medianMs: percentile(metrics.frameIntervals, 0.5),
    p95Ms: percentile(metrics.frameIntervals, 0.95),
    over200Ms: metrics.frameIntervals.filter((v) => v > 200).length,
    submissionP95Ms: percentile(metrics.renderDurations, 0.95),
  };
  for (const [name, requested] of [
    ["park", basePose],
    ["lot", poses["lots-close"]],
  ]) {
    for (const sign of [-1, 1]) {
      await page.evaluate(
        ({ position, target }) => window.__indumoveisMap.setReferencePose(position, target),
        requested,
      );
      await idle(page);
      const initial = await snapshot(page);
      await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.58);
      const start = performance.now();
      await page.mouse.wheel(0, sign * 100);
      await page.waitForTimeout(32);
      const first = await snapshot(page);
      await page.waitForTimeout(250);
      const final = await snapshot(page);
      report.study.zoom.push({
        name,
        sign,
        initial: initial.distance,
        at32ms: first.distance,
        final: final.distance,
        firstRatio: first.distance / initial.distance,
        finalRatio: final.distance / initial.distance,
        settledMs: performance.now() - start,
        cameraState: final.cameraState,
      });
    }
  }
  // Warm the same LOD route in three cycles; GPU allocations must stay stable.
  for (let i = 0; i < 3; i++) {
    for (const pose of [poses.superior, poses["lots-close"], basePose]) {
      await page.evaluate(
        ({ position, target }) => window.__indumoveisMap.setReferencePose(position, target),
        pose,
      );
      await idle(page);
    }
    const d = await snapshot(page);
    report.study.cycles.push({
      geometries: d.geometries,
      textures: d.textures,
      textureBytes: d.textureBytes,
      contexts: d.contexts,
    });
  }
  assert(
    report.study.cycles.every((c) => c.contexts.active === 1),
    "multiple contexts",
  );
  assert(
    report.study.cycles.every(
      (c) =>
        c.geometries === report.study.cycles[0].geometries &&
        c.textures === report.study.cycles[0].textures,
    ),
    "GPU resources grew",
  );
  if (phase === "after") {
    const fallback = await newContext({ viewport: { width: 320, height: 740 }, noWebGL: true });
    try {
      const lightPage = await fallback.newPage();
      await lightPage.goto(`${baseURL}/mapa?mapDiagnostics=1`, { waitUntil: "domcontentloaded" });
      await lightPage.locator('.im-map-stage[data-representation="2d"]').waitFor();
      assert(await lightPage.locator(".im-map-svg").isVisible());
      await lightPage
        .getByRole("button", { name: "Buscar lote, pavilhão, via ou estrutura", exact: true })
        .click();
      await lightPage
        .getByRole("textbox", { name: "Lote, pavilhão, via ou estrutura", exact: true })
        .fill("Lote 01");
      await lightPage.keyboard.press("ArrowDown");
      assert(
        await lightPage
          .locator(".im-map-result")
          .first()
          .evaluate((el) => el === document.activeElement),
      );
      await lightPage.keyboard.press("Enter");
      await lightPage.getByRole("heading", { name: "Lote 01", exact: true }).waitFor();
      await lightPage.keyboard.press("Escape");
      await lightPage.locator(".im-map-detail").waitFor({ state: "detached" });
      const headerFits = await lightPage
        .locator(".im-map-header")
        .evaluate((el) => el.scrollWidth <= el.clientWidth);
      assert(headerFits, "320px header overflow");
      await lightPage.screenshot({ path: path.join(artifactDir, "fallback-320-keyboard.png") });
      report.study.fallback = {
        width: 320,
        independentSVG: true,
        keyboardSearchSelectClose: true,
        headerFits,
      };
    } finally {
      await fallback.close();
    }
  }
  assert.equal(report.errors.length, 0, "application/shader errors");
  report.study.passed = true;
} finally {
  await writeFile(
    path.join(artifactDir, "refinement.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await context.close();
  await browser.close();
}
console.log(
  JSON.stringify(
    {
      passed: report.study.passed,
      navigation: report.study.navigation,
      zoom: report.study.zoom,
      errors: report.errors,
    },
    null,
    2,
  ),
);
