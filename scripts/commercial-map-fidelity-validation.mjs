/** Paired browser evidence for the territorial/architectural fidelity stage.
 * Local intercepted fixtures only: no production login, no database writes.
 *
 *   PLAYWRIGHT_MODULE=/path/to/playwright-core MAP_CHROMIUM_EXECUTABLE=/usr/local/bin/google-chrome \
 *   MAP_BROWSER_GPU=software MAP_BASE_URL=http://127.0.0.1:3000 MAP_FIDELITY_PHASE=before \
 *   node scripts/commercial-map-fidelity-validation.mjs
 *
 * MAP_FIDELITY_ONLY=name1,name2 restricts the captured poses; MAP_FIDELITY_SKIP_BENCH=1
 * skips the navigation sampling. The recorded renderer string states whether the
 * host exposed a GPU or the Chromium software rasterizer. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const phase = process.env.MAP_FIDELITY_PHASE ?? "after";
process.env.MAP_ARTIFACT_DIR ??= `artifacts.local/commercial-map-fidelity/${phase}`;
const { browser, newContext, report, baseURL, artifactDir } =
  await import("./commercial-map-browser-fixtures.mjs");

/** World drawing units: x right, z down the sheet. Equivalent before/after. */
export const FIDELITY_POSES = [
  { name: "overview-top", position: [96, 300, 78], target: [96, 76] },
  { name: "overview-oblique-avenue", position: [62, 120, 268], target: [70, 84] },
  { name: "overview-oblique-park", position: [118, 96, -92], target: [98, 66] },
  { name: "avenue-roundabout", position: [-78, 34, 150], target: [-18, 100] },
  { name: "avenue-length", position: [-30, 16, 112], target: [60, 97] },
  { name: "avenue-gate", position: [166, 26, 128], target: [141, 93] },
  { name: "gate-close", position: [150, 7.5, 104], target: [142, 92] },
  { name: "administrative-east", position: [158, 9, 74], target: [139, 81] },
  { name: "administrative-mural", position: [127, 8, 55], target: [138, 76] },
  { name: "administrative-top", position: [139, 46, 86], target: [139, 80] },
  { name: "event-centre-front", position: [140, 13, 36], target: [160, 36] },
  { name: "event-centre-oblique", position: [132, 30, 8], target: [160, 36] },
  { name: "event-centre-top", position: [161, 62, 40], target: [161, 36] },
  { name: "lots-oblique", position: [96, 44, 96], target: [96, 46] },
  { name: "lots-close", position: [90, 16, 66], target: [90, 52] },
  { name: "lots-grazing", position: [70, 5.5, 74], target: [92, 52] },
  { name: "residential-oblique", position: [52, 58, 196], target: [58, 124] },
  { name: "residential-wedge", position: [-58, 44, 168], target: [-20, 116] },
  { name: "internal-streets", position: [120, 20, 22], target: [100, 46] },
  { name: "livestock-pavilions", position: [52, 44, 34], target: [52, -30] },
  { name: "stage", position: [136, 12, 46], target: [157, 54] },
  { name: "arena", position: [178, 44, 62], target: [228, 5] },
];

const only = process.env.MAP_FIDELITY_ONLY?.split(",").filter(Boolean);
// MAP_FIDELITY_EXTRA="name:x,y,z:tx,tz;..." adds ad-hoc inspection poses.
const extra = (process.env.MAP_FIDELITY_EXTRA ?? "")
  .split(";")
  .filter(Boolean)
  .map((entry) => {
    const [name, position, target] = entry.split(":");
    return {
      name,
      position: position.split(",").map(Number),
      target: target.split(",").map(Number),
    };
  });
const poses = [
  ...(only ? FIDELITY_POSES.filter((pose) => only.includes(pose.name)) : FIDELITY_POSES),
  ...extra,
];
const quality = process.env.MAP_FIDELITY_QUALITY ?? "detailed";
const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
};
const summary = (values) => ({
  samples: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  max: values.length ? Math.max(...values) : null,
});

async function openMap(context, mapQuality) {
  const page = await context.newPage();
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("indumoveis:map-quality", value);
    } catch {
      /* storage is optional */
    }
    window.__FIDELITY_LONG_TASKS__ = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          window.__FIDELITY_LONG_TASKS__.push({ start: entry.startTime, duration: entry.duration });
      }).observe({ type: "longtask", buffered: true });
    } catch {
      /* longtask is optional */
    }
  }, mapQuality);
  const started = Date.now();
  await page.goto(`${baseURL}/mapa?mapDiagnostics=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__indumoveisMap?.readyAt !== undefined, null, {
    timeout: 180_000,
  });
  const usableMs = Date.now() - started;
  await page.waitForFunction(() => window.__indumoveisMap?.realism?.ready === true, null, {
    timeout: 240_000,
  });
  const completeMs = Date.now() - started;
  await page.waitForTimeout(1500);
  return { page, usableMs, completeMs };
}

async function settle(page) {
  // Two idle frames after the last scheduled draw; software frames can be slow.
  await page.waitForFunction(
    () =>
      window.__indumoveisMap.cameraState !== "transition" &&
      window.__indumoveisMap.activeLoops === 0,
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(350);
}

async function capture(page, layout, captures) {
  for (const pose of poses) {
    await page.evaluate(
      ({ position, target }) => window.__indumoveisMap.setReferencePose(position, target),
      pose,
    );
    await settle(page);
    const state = await page.evaluate(() => {
      const d = window.__indumoveisMap;
      return {
        position: [...d.position],
        target: [...d.target],
        drawCalls: d.drawCalls,
        triangles: d.triangles,
        dpr: d.dpr,
        buffer: [...d.buffer],
        tier: d.tier,
        lotLabels: d.lotLabels
          .filter((label) => label.visible)
          .map((label) => ({
            id: label.id,
            textHeightPx: label.textHeightPx,
            rect: label.rect,
            axis: label.axis,
            facing: label.facing,
          })),
      };
    });
    const file = `${layout}-${pose.name}.png`;
    const canvas = page.locator('canvas[data-map-canvas="indumoveis"]');
    await canvas.screenshot({ path: path.join(artifactDir, file) });
    captures.push({ layout, name: pose.name, file, requested: pose, ...state });
  }
}

/** Full camera orbit over the lot blocks in 10 degree steps. A lot number
 * must keep one world baseline; only its reading side may reverse. Renderers
 * that predate the fixed baseline do not report an axis and are skipped. */
async function lotLabelOrbit(page) {
  const steps = 36,
    target = [96, 46],
    radius = 52,
    height = 40;
  const seen = new Map();
  for (let step = 0; step <= steps; step++) {
    const angle = (step / steps) * Math.PI * 2;
    await page.evaluate(
      ({ position, target }) => window.__indumoveisMap.setReferencePose(position, target),
      {
        position: [
          target[0] + Math.sin(angle) * radius,
          height,
          target[1] + Math.cos(angle) * radius,
        ],
        target,
      },
    );
    await settle(page);
    const labels = await page.evaluate(() =>
      window.__indumoveisMap.lotLabels.map((label) => ({
        id: label.id,
        visible: label.visible,
        axis: label.axis,
        facing: label.facing,
      })),
    );
    if (!labels.length || !labels[0].axis) return null;
    for (const label of labels) {
      const entry = seen.get(label.id) ?? { baselines: new Set(), facings: [], visible: 0 };
      entry.baselines.add(label.axis.map((value) => value.toFixed(6)).join(","));
      entry.facings.push(label.facing);
      if (label.visible) entry.visible++;
      seen.set(label.id, entry);
    }
  }
  const entries = [...seen.values()];
  const flips = entries.map(
    (entry) => entry.facings.filter((value, i) => i > 0 && value !== entry.facings[i - 1]).length,
  );
  return {
    steps,
    stepDegrees: 360 / steps,
    lots: entries.length,
    maxBaselinesPerLot: Math.max(...entries.map((entry) => entry.baselines.size)),
    maxOrientationsPerLot: Math.max(
      ...entries.map((entry) => entry.baselines.size * new Set(entry.facings).size),
    ),
    maxFlipsPerLot: Math.max(...flips),
    minFlipsPerLot: Math.min(...flips),
    lotsVisibleInEveryStep: entries.filter((entry) => entry.visible === steps + 1).length,
  };
}

async function benchmark(page) {
  const d = () => page.evaluate(() => window.__indumoveisMap);
  const box = await page.locator('canvas[data-map-canvas="indumoveis"]').boundingBox();
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  const sample = async (label, gesture) => {
    await page.evaluate(() => window.__indumoveisMap.resetSamples());
    await gesture();
    await page.waitForTimeout(250);
    const snapshot = await d();
    return {
      label,
      frameIntervalMs: summary(snapshot.frameIntervals),
      renderDurationMs: summary(snapshot.renderDurations),
      drawCalls: snapshot.drawCalls,
      triangles: snapshot.triangles,
      dpr: snapshot.dpr,
      buffer: snapshot.buffer,
      adaptiveResolution: snapshot.realism.adaptiveResolution,
    };
  };
  const results = [];
  await page.evaluate(() => window.__indumoveisMap.setReferencePose([62, 120, 268], [70, 84]));
  await settle(page);
  results.push(
    await sample("pan-overview", async () => {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let i = 1; i <= 50; i++) await page.mouse.move(cx - i * 5, cy + Math.sin(i / 6) * 30);
      await page.mouse.up();
    }),
  );
  results.push(
    await sample("orbit-overview", async () => {
      await page.mouse.move(cx, cy);
      await page.mouse.down({ button: "right" });
      for (let i = 1; i <= 50; i++) await page.mouse.move(cx + i * 6, cy - i);
      await page.mouse.up({ button: "right" });
    }),
  );
  results.push(
    await sample("wheel-approach-building", async () => {
      await page.mouse.move(cx, cy);
      for (let i = 0; i < 14; i++) {
        await page.mouse.wheel(0, -240);
        await page.waitForTimeout(90);
      }
    }),
  );
  await settle(page);
  // Recovery of sharpness: buffer size after the camera has been idle.
  await page.waitForTimeout(3000);
  const idle = await d();
  // Selection response: pointer click on a lot centre until the next draw.
  await page.evaluate(() => window.__indumoveisMap.setReferencePose([96, 44, 96], [96, 46]));
  await settle(page);
  const lot = await page.evaluate(() =>
    window.__indumoveisMap.project("indumoveis:external:lot:20", 0),
  );
  let selectionMs = null;
  if (lot) {
    const before = await page.evaluate(() => performance.now());
    await page.mouse.click(box.x + lot.x, box.y + lot.y);
    await page.waitForFunction(
      () => window.__indumoveisMap.lastSelectedId === "indumoveis:external:lot:20",
      null,
      { timeout: 10_000 },
    );
    selectionMs = await page.evaluate(
      (start) => window.__indumoveisMap.selectionDrawAt - start,
      before,
    );
  }
  return {
    gestures: results,
    idleAfterInteraction: {
      dpr: idle.dpr,
      buffer: idle.buffer,
      adaptiveResolution: idle.realism.adaptiveResolution,
      tier: idle.tier,
    },
    selectionResponseMs: selectionMs,
  };
}

const output = {
  generatedAt: new Date().toISOString(),
  phase,
  baseURL,
  host: {
    os: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0]?.model,
    logicalCores: os.cpus().length,
    memoryGiB: Math.round(os.totalmem() / 2 ** 30),
    browser: browser.version(),
    gpuRequest: process.env.MAP_BROWSER_GPU,
  },
  captureQuality: quality,
  layouts: [],
  captures: [],
};
await mkdir(artifactDir, { recursive: true });

for (const layout of [
  { name: "desktop", viewport: { width: 1366, height: 768 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
]) {
  if (process.env.MAP_FIDELITY_LAYOUT && process.env.MAP_FIDELITY_LAYOUT !== layout.name) continue;
  // Visual captures use an explicit profile so before/after share one material path.
  const context = await newContext({ viewport: layout.viewport });
  const { page, usableMs, completeMs } = await openMap(context, quality);
  const info = await page.evaluate(() => {
    const d = window.__indumoveisMap;
    return {
      renderer: window.__MAP_LAB__.rendererInfo(),
      tier: d.tier,
      textureBytes: d.textureBytes,
      geometries: d.geometries,
      textures: d.textures,
      programs: d.programs,
      softwareRasterizer: d.realism.softwareRasterizer,
      optionalFailures: d.optionalFailures,
      readyAtMs: d.readyAt,
      pbr: d.realism.pbr,
      longTasks: window.__FIDELITY_LONG_TASKS__,
    };
  });
  const entry = { layout: layout.name, viewport: layout.viewport, usableMs, completeMs, ...info };
  await capture(page, layout.name, output.captures);
  entry.lotLabelOrbit = await lotLabelOrbit(page);
  await context.close();
  if (!process.env.MAP_FIDELITY_SKIP_BENCH) {
    // Navigation is sampled with the product's automatic profile.
    const autoContext = await newContext({ viewport: layout.viewport });
    const auto = await openMap(autoContext, "auto");
    entry.automatic = {
      usableMs: auto.usableMs,
      completeMs: auto.completeMs,
      ...(await auto.page.evaluate(() => {
        const d = window.__indumoveisMap;
        return {
          tier: d.tier,
          textureBytes: d.textureBytes,
          geometries: d.geometries,
          textures: d.textures,
          programs: d.programs,
          drawCalls: d.drawCalls,
          triangles: d.triangles,
          longTasks: window.__FIDELITY_LONG_TASKS__,
        };
      })),
      navigation: await benchmark(auto.page),
    };
    await autoContext.close();
  }
  output.layouts.push(entry);
}
output.errors = report.errors;
output.consoleErrors = report.consoleErrors;
output.unexpectedRequests = report.unexpectedRequests;
await writeFile(path.join(artifactDir, "fidelity.json"), `${JSON.stringify(output, null, 2)}\n`);
await browser.close();
console.log(
  JSON.stringify(
    {
      artifactDir,
      captures: output.captures.length,
      errors: output.errors.length,
      layouts: output.layouts.map((layout) => ({
        layout: layout.layout,
        usableMs: layout.usableMs,
        completeMs: layout.completeMs,
        renderer: layout.renderer?.unmaskedRenderer,
        navigation: layout.automatic?.navigation?.gestures?.map((g) => ({
          label: g.label,
          p50: g.frameIntervalMs.p50,
          p95: g.frameIntervalMs.p95,
        })),
      })),
    },
    null,
    2,
  ),
);
