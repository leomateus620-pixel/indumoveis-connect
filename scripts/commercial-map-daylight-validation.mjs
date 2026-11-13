/** Paired production-build laboratory. Reuse the same Chrome, host and fixtures.
 * MAP_BASE_URL=http://127.0.0.1:4190 MAP_DAYLIGHT_PHASE=before node scripts/commercial-map-daylight-validation.mjs
 * Repeat on the candidate build with phase=after. No production session or writes. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const phase = process.env.MAP_DAYLIGHT_PHASE ?? "after";
process.env.MAP_ARTIFACT_DIR ??= `artifacts.local/map-daylight/${phase}`;
const { browser, newContext, report, baseURL, artifactDir } =
  await import("./commercial-map-browser-fixtures.mjs");

const poses = {
  superior: { position: [96, 300, 78], target: [96, 76] },
  obliqua: { position: [62, 120, 268], target: [70, 84] },
  pavilhoes: { position: [98, 31, 145], target: [104, 92] },
  administrativo: { position: [158, 9, 74], target: [139, 81] },
  eventos: { position: [140, 13, 36], target: [160, 36] },
  lotes: { position: [90, 16, 66], target: [90, 52] },
  horizonte: { position: [67, 18, 191], target: [68, 99] },
  "horizonte-oposto": { position: [98, 16, -36], target: [96, 52] },
};
const layouts = {
  desktop: { width: 1366, height: 768 },
  mobile: { width: 390, height: 844 },
};
const qualities = (process.env.MAP_DAYLIGHT_QUALITIES ?? "auto,light,balanced,detailed").split(",");
const runs = Number(process.env.MAP_DAYLIGHT_RUNS ?? 2);
const canvasSelector = 'canvas[data-map-canvas="indumoveis"]';
const timeout = 45000;

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction) => sorted[Math.ceil(sorted.length * fraction) - 1] ?? null;
  return {
    n: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1) ?? null,
  };
}

async function visualReady(page) {
  await page.waitForFunction(() => window.__indumoveisMap?.realism?.ready, null, { timeout });
  await page.waitForFunction(() => window.__indumoveisMap?.activeLoops === 0, null, { timeout });
}

async function snapshot(page) {
  return page.evaluate(() => {
    const d = window.__indumoveisMap;
    return {
      position: [...d.position],
      target: [...d.target],
      tier: d.tier,
      buffer: d.buffer,
      dpr: d.dpr,
      drawCalls: d.drawCalls,
      triangles: d.triangles,
      textures: d.textures,
      geometries: d.geometries,
      textureBytesEstimate: d.textureBytes,
      environmentPeakBytesEstimate: d.environmentPeakBytes,
      skyPreparationMs: d.skyPreparationMs,
      pmremPreparationMs: d.environmentPrepareMs,
      shadowUpdates: d.realism.shadows.updates,
      scale: d.realism.adaptiveResolution,
      frames: d.frames,
      optionalFailures: d.optionalFailures,
      daylight: d.daylight,
      pbr: d.realism.pbr?.source,
    };
  });
}

async function pose(page, reference) {
  await page.evaluate(
    ({ position, target }) => window.__indumoveisMap.setReferencePose(position, target),
    reference,
  );
  await page.waitForFunction(() => window.__indumoveisMap.activeLoops === 0, null, { timeout });
}

async function measureNavigation(page) {
  const start = { position: [96, 73, 208], target: [96, 77] };
  await pose(page, start);
  const initial = await snapshot(page);
  const box = await page.locator(canvasSelector).boundingBox();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.55);
  await page.mouse.down({ button: "right" });
  const result = await page.evaluate(async ({ position, target }) => {
    const d = window.__indumoveisMap;
    d.resetSamples();
    const samples = [];
    await new Promise((resolve) => {
      const started = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - started) / 6500);
        const turn = t * Math.PI * 2;
        const radius = 92 + 39 * Math.cos(turn);
        d.setReferencePose(
          [
            position[0] + radius * Math.sin(turn),
            53 + 20 * Math.cos(turn),
            target[1] + radius * Math.cos(turn),
          ],
          [target[0] + 18 * Math.sin(turn), target[1] - 10 * Math.sin(turn)],
        );
        samples.push({
          drawCalls: d.drawCalls,
          textureCount: d.textures,
          scale: d.realism.adaptiveResolution,
          dpr: d.dpr,
        });
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    return { intervals: [...d.frameIntervals], submission: [...d.renderDurations], samples };
  }, start);
  await page.mouse.up({ button: "right" });
  const final = await snapshot(page);
  assert(result.intervals.length >= 20, "Navigation frame sample is incomplete");
  assert.equal(
    final.shadowUpdates,
    initial.shadowUpdates,
    "Camera movement rebuilt the static shadow map",
  );
  return {
    frameIntervalMs: distribution(result.intervals),
    cpuSubmissionMs: distribution(result.submission),
    intervals: result.intervals,
    drawCalls: distribution(result.samples.map((sample) => sample.drawCalls)),
    textures: distribution(result.samples.map((sample) => sample.textureCount)),
    minimumScale: Math.min(...result.samples.map((sample) => sample.scale)),
    minimumDpr: Math.min(...result.samples.map((sample) => sample.dpr)),
    initial,
    final,
  };
}

async function navigateModule(page, href) {
  const link = page.locator(`a[href="${href}"]:visible`).first();
  if (!(await link.count()))
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await link.click();
}

async function reenter(page) {
  const results = [];
  for (let index = 0; index < 3; index++) {
    await navigateModule(page, "/financeiro");
    await page.locator(canvasSelector).waitFor({ state: "detached", timeout });
    const closed = await page.evaluate(() => window.__MAP_LAB__.contexts());
    assert.equal(closed.active, 0);
    const started = await page.evaluate(() => performance.now());
    await navigateModule(page, "/mapa");
    await visualReady(page);
    const opened = await page.evaluate(() => window.__MAP_LAB__.contexts());
    assert.equal(opened.active, 1);
    results.push({
      closed,
      opened,
      elapsedMs: await page.evaluate((at) => performance.now() - at, started),
      ...(await snapshot(page)),
    });
  }
  assert.equal(new Set(results.map((result) => result.textureBytesEstimate)).size, 1);
  return results;
}

const output = { phase, conditions: report.conditions, entries: [] };
try {
  for (const [layout, viewport] of Object.entries(layouts)) {
    if (process.env.MAP_DAYLIGHT_LAYOUT && process.env.MAP_DAYLIGHT_LAYOUT !== layout) continue;
    for (const quality of qualities) {
      for (let run = 0; run < runs; run++) {
        const context = await newContext({ viewport, reducedMotion: true });
        try {
          const page = await context.newPage();
          await page.addInitScript((profile) => {
            localStorage.setItem("indumoveis:map-quality", profile);
            window.__mapDaylightTasks = [];
            new PerformanceObserver((list) => {
              for (const { startTime, duration } of list.getEntries())
                window.__mapDaylightTasks.push({ startTime, duration });
            }).observe({ type: "longtask", buffered: true });
          }, quality);
          await page.goto(`${baseURL}/mapa?mapDiagnostics=1`, { waitUntil: "domcontentloaded" });
          await visualReady(page);
          const entry = {
            layout,
            viewport,
            quality,
            run,
            opening: await page.evaluate(() => {
              const d = window.__indumoveisMap;
              const mark = (name) => performance.getEntriesByName(name).at(-1)?.startTime;
              return {
                controlsMs:
                  mark("indumoveis:2d-interactive") ?? mark("indumoveis-map:controls-ready"),
                usefulFrameMs: mark("indumoveis-map:first-valid-draw"),
                fullMs: performance.now(),
                longTasks: window.__mapDaylightTasks,
                renderer: window.__MAP_LAB__.rendererInfo(),
                surfacePath: d.realism.pbr,
              };
            }),
            defaultView: await snapshot(page),
            captures: [],
          };
          if (run === 0 && process.env.MAP_DAYLIGHT_SKIP_CAPTURES !== "1") {
            await page
              .locator(canvasSelector)
              .screenshot({ path: path.join(artifactDir, `${layout}-${quality}-geral.png`) });
            for (const [name, reference] of Object.entries(poses)) {
              if (layout === "mobile" && !["pavilhoes", "horizonte"].includes(name)) continue;
              await pose(page, reference);
              const file = `${layout}-${quality}-${name}.png`;
              await page.locator(canvasSelector).screenshot({ path: path.join(artifactDir, file) });
              entry.captures.push({ name, file, requested: reference, ...(await snapshot(page)) });
            }
          }
          if (process.env.MAP_DAYLIGHT_SKIP_BENCH !== "1")
            entry.navigation = await measureNavigation(page);
          if (
            layout === "desktop" &&
            quality === "auto" &&
            run === 0 &&
            process.env.MAP_DAYLIGHT_SKIP_REENTRY !== "1" &&
            process.env.MAP_DAYLIGHT_SKIP_BENCH !== "1"
          )
            entry.reentries = await reenter(page);
          output.entries.push(entry);
          console.log(
            JSON.stringify({
              layout,
              quality,
              run,
              openingMs: entry.opening.fullMs,
              renderer: entry.opening.renderer?.unmaskedRenderer,
              navigation: entry.navigation?.frameIntervalMs,
              failures: entry.defaultView.optionalFailures,
            }),
          );
        } finally {
          await context.close();
        }
      }
    }
  }
} finally {
  output.errors = report.errors;
  output.consoleErrors = report.consoleErrors;
  output.assetResponses = report.assetResponses;
  await writeFile(
    path.join(artifactDir, "daylight-validation.json"),
    `${JSON.stringify(output, null, 2)}\n`,
  );
  await browser.close();
}
assert.deepEqual(report.errors, []);
