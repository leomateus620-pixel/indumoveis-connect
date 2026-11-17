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
  pavilhoes: { position: [98, 31, 145], target: [104, 78] },
  sede: { position: [143, 8, 69], target: [157, 60.5] },
  arena: { position: [187, 21, 32], target: [228, 4] },
  campeira: { position: [49, 20, 16], target: [64, -30] },
  arvores: { position: [84, 7.2, 40], target: [79, 30] },
  acesso: { position: [165, 29, 128], target: [144, 93] },
  parque: { position: [70, 178, 265], target: [83, 24] },
  copa: { position: [68, 4.3, 63.5], target: [60.9, 59.2] },
  fachada: { position: [95, 8.5, 54], target: [107, 74] },
  pecuaria: { position: [45, 7.5, -8], target: [73, -30] },
  portao: { position: [136, 7, 100], target: [147, 94] },
  rotula: { position: [-23, 37, 139], target: [-48, 97] },
  acessoLeste: { position: [242, 52, 113], target: [287, 57] },
  arenaFrente: { position: [196, 5.8, 9], target: [228, 5] },
  administrativo: { position: [158, 9, 74], target: [139, 81] },
  eventos: { position: [126, 11, 48], target: [162, 36] },
  lotes: { position: [90, 16, 66], target: [90, 52] },
  horizonte: { position: [67, 18, 191], target: [68, 99] },
  "horizonte-oposto": { position: [98, 16, -36], target: [96, 52] },
};
const captureMode = process.env.MAP_DAYLIGHT_MODE ?? "natural";
const selectedPoses = process.env.MAP_DAYLIGHT_POSES?.split(",");
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

async function visualReady(page, previousInstance = null) {
  // The previous renderer deliberately keeps its diagnostic object available
  // after disposal. Test the identity, readiness and idle state in one poll.
  await page.waitForFunction(
    (previous) => {
      const d = window.__indumoveisMap;
      return (
        d?.active &&
        d.instance !== previous &&
        d.readyAt !== undefined &&
        d.realism?.ready &&
        d.realism.planting &&
        d.activeLoops === 0
      );
    },
    previousInstance,
    { timeout },
  );
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
  const duration = Number(process.env.MAP_DAYLIGHT_NAV_MS ?? 6500);
  const result = await page.evaluate(
    async ({ position, target, duration }) => {
      const d = window.__indumoveisMap;
      d.resetSamples();
      const samples = [];
      await new Promise((resolve) => {
        const started = performance.now();
        const step = (now) => {
          const elapsed = Math.min(duration, now - started);
          const turn = (elapsed / 6500) * Math.PI * 2;
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
            triangles: d.triangles,
            scale: d.realism.adaptiveResolution,
            dpr: d.dpr,
          });
          if (elapsed < duration) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      return { intervals: [...d.frameIntervals], submission: [...d.renderDurations], samples };
    },
    { ...start, duration },
  );
  await page.mouse.up({ button: "right" });
  const final = await snapshot(page);
  assert(result.intervals.length >= 20, "Navigation frame sample is incomplete");
  assert.equal(
    final.shadowUpdates,
    initial.shadowUpdates,
    "Camera movement rebuilt the static shadow map",
  );
  return {
    duration,
    framesOver50Ms: result.intervals.filter((ms) => ms > 50).length,
    frameIntervalMs: distribution(result.intervals),
    cpuSubmissionMs: distribution(result.submission),
    intervals: result.intervals,
    drawCalls: distribution(result.samples.map((sample) => sample.drawCalls)),
    textures: distribution(result.samples.map((sample) => sample.textureCount)),
    triangles: distribution(result.samples.map((sample) => sample.triangles)),
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

async function reenter(page, results) {
  for (let index = 0; index < 3; index++) {
    const previous = await page.evaluate(() => window.__indumoveisMap.instance);
    await navigateModule(page, "/financeiro");
    await page.locator(canvasSelector).waitFor({ state: "detached", timeout });
    const closed = await page.evaluate(() => window.__MAP_LAB__.contexts());
    assert.equal(closed.active, 0);
    const disposed = await page.evaluate(() => {
      const d = window.__indumoveisMap;
      return {
        instance: d.instance,
        active: d.active,
        scenePrepared: d.realism.ready,
        loops: d.activeLoops,
      };
    });
    assert.equal(disposed.instance, previous);
    assert.equal(disposed.active, false);
    const started = await page.evaluate(() => performance.now());
    await navigateModule(page, "/mapa");
    await visualReady(page, previous);
    const opened = await page.evaluate(() => window.__MAP_LAB__.contexts());
    assert.equal(opened.active, 1);
    results.push({
      closed,
      disposed,
      opened,
      elapsedMs: await page.evaluate((at) => performance.now() - at, started),
      ...(await snapshot(page)),
      resources: await page.evaluate(() => {
        const d = window.__indumoveisMap;
        return {
          instance: d.instance,
          pbr: d.realism.pbr,
          planting: Boolean(d.realism.planting),
          woodland: Boolean(d.realism.woodland),
          sky: d.daylight.skyBytes,
          shadow: d.realism.shadows.textureBytes,
          terrain: d.terrain?.textureBytes,
          environment: d.environmentBytes,
        };
      }),
    });
  }
  const bytes = results.map((result) => result.textureBytesEstimate);
  assert.equal(
    new Set(bytes).size,
    1,
    `Resident texture bytes differ across reentries: ${bytes.join(", ")}`,
  );
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
          await page.addInitScript(
            ({ profile, mode }) => {
              localStorage.setItem("indumoveis:map-quality", profile);
              localStorage.setItem("indumoveis:map-lighting", mode);
              window.__mapDaylightTasks = [];
              new PerformanceObserver((list) => {
                for (const { startTime, duration } of list.getEntries())
                  window.__mapDaylightTasks.push({ startTime, duration });
              }).observe({ type: "longtask", buffered: true });
            },
            { profile: quality, mode: captureMode },
          );
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
          output.entries.push(entry);
          if (phase === "after") {
            assert.equal(entry.defaultView.daylight.mode, captureMode);
            assert.deepEqual(entry.defaultView.optionalFailures, []);
          }
          if (run === 0 && process.env.MAP_DAYLIGHT_SKIP_CAPTURES !== "1") {
            await page
              .locator(canvasSelector)
              .screenshot({ path: path.join(artifactDir, `${layout}-${quality}-geral.png`) });
            for (const [name, reference] of Object.entries(poses)) {
              if (selectedPoses && !selectedPoses.includes(name)) continue;
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
          ) {
            entry.reentries = [];
            await reenter(page, entry.reentries);
          }
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
