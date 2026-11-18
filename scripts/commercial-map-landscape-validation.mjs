// Run once per local production build. Authentication and inventory use the repository fixtures.
import assert from "node:assert/strict";
import path from "node:path";
import { writeFile } from "node:fs/promises";

const phase = process.env.MAP_LANDSCAPE_PHASE ?? "after";
const task = process.env.MAP_LANDSCAPE_TASK ?? "metrics";
process.env.MAP_ARTIFACT_DIR ??= `artifacts.local/map-landscape/${phase}`;
const { browser, newContext, report, baseURL, artifactDir } =
  await import("./commercial-map-browser-fixtures.mjs");
assert(["before", "after"].includes(phase));
assert(["metrics", "visual", "video", "controls", "startup"].includes(task));
const controls = {
  "21-10-16": { position: [213.505, 28.056, -31.264], target: [95.36, 56.327] },
  "21-10-21": { position: [173.649, 28.41, 178.779], target: [95.409, 53.527] },
  "21-10-27": { position: [-24.601, 28.843, 136.053], target: [97.36, 55.141] },
  superior: { position: [93, 590, 15.4], target: [93, 13.5] },
  borda: { position: [147, 8.2, 50], target: [147, 93] },
};
// Rows are the scene X and Z axes expressed in geographic east/north (urbanReference.ts).
const axes = [
  [-0.4878298036, 0.8729387623],
  [0.8729387623, 0.4878298036],
];
const sectors = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
const segments = [1, 3, 8, 12, 13, 14].map((n) => ({
  key: `p${n}`,
  pavilionNumber: n,
  total: n === 14 ? 0 : 1,
  sold: 0,
  soldPercent: n === 14 ? null : 0,
}));
const output = { phase, conditions: report.conditions, entries: [] };
const pause = (page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
const fresh = async (page, old = null) => {
  await page.waitForFunction(
    ({ phase, old }) => {
      const d = window.__indumoveisMap;
      return (
        d?.active &&
        d.instance !== old &&
        d.readyAt &&
        d.realism.ready &&
        (phase === "before" || d.landscape?.finalAt)
      );
    },
    { phase, old },
    { timeout: 90000 },
  );
  const failures = await page.evaluate(() => window.__indumoveisMap.optionalFailures);
  assert.deepEqual(failures, []);
  await pause(page);
};
const readPose = (page) =>
  page.evaluate(() => {
    const { position, target, distance, polar, azimuth, buffer, tier } = window.__indumoveisMap;
    return {
      position,
      target,
      distance,
      tiltDownDegrees: 90 - (polar * 180) / Math.PI,
      bearingAboutSceneZ: (azimuth * 180) / Math.PI,
      verticalFovDegrees: 38,
      buffer,
      tier,
    };
  });
async function setPose(page, pose) {
  await page.evaluate(
    ({ position, target }) => window.__indumoveisMap.setReferencePose(position, target),
    pose,
  );
  await pause(page);
  return readPose(page);
}
async function setLighting(page, value) {
  const button = (name) => page.getByRole("button", { name, exact: true });
  if (!(await button("Opções de visualização").isVisible()))
    await button("Mais ações do mapa").click();
  await button("Opções de visualização").click();
  await page.getByRole("combobox", { name: "Iluminação" }).selectOption(value);
  await page.keyboard.press("Escape");
  await page.mouse.move(0, 0);
  await pause(page);
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForFunction(
    (expected) => window.__indumoveisMap.daylight.mix === expected,
    value === "warm" ? 1 : 0,
  );
}
async function opening(page) {
  return page.evaluate(() => {
    const d = window.__indumoveisMap;
    // Both builds have a deferred neighborhood and vegetation pass after environmentReadyAt.
    const last = window.__landscapeFrames.at(-1)[1];
    const local = performance
      .getEntriesByType("resource")
      .filter((r) => new URL(r.name).origin === location.origin && r.startTime <= last);
    const loadTasks = window.__landscapeLongTasks.filter((t) => t.startTime <= last);
    const gaps = window.__landscapeFrames.filter(([a]) => a <= last).map(([a, b]) => b - a);
    return {
      usefulFrameMs: performance.getEntriesByName("indumoveis-map:first-valid-draw").at(-1)
        ?.startTime,
      compactMs: d.landscape?.compactAt ?? null,
      finalMs: d.landscape?.finalAt ?? null,
      environmentReadyMs: d.environmentReadyAt,
      fullSceneMs: last,
      maxLoadMainTaskMs: Math.max(0, ...loadTasks.map((t) => t.duration)),
      maxLoadRafGapMs: Math.max(0, ...gaps),
      appResourceBytes: local.reduce((n, r) => n + r.encodedBodySize, 0),
      landscapeResources: local
        .filter((r) => /landscape|santa-rosa/.test(r.name))
        .map((r) => ({
          path: new URL(r.name).pathname,
          encodedBodyBytes: r.encodedBodySize,
          transferBytes: r.transferSize,
        })),
      textureBytes: d.textureBytes,
      landscape: d.landscape ?? null,
      shadows: d.realism.shadows.updates,
      renderer: window.__MAP_LAB__.rendererInfo(),
      contexts: window.__MAP_LAB__.contexts(),
    };
  });
}
async function orbit(page, movie = false) {
  const target = [98, 55],
    radius = movie ? 45 : 126,
    height = movie ? 8.7 : 24.6;
  const initial = await setPose(page, {
    position: [target[0], height, target[1] + radius],
    target,
  });
  const result = await page.evaluate(
    async ({ target, radius, height, movie }) => {
      const d = window.__indumoveisMap,
        samples = [];
      const revolution = movie ? 14000 : 60000,
        ascent = movie ? 3500 : 0,
        hold = movie ? 550 : 0;
      let lastFrame = 0,
        previous = 0,
        frameCount = 0;
      const started = performance.now();
      await new Promise((resolve) => {
        function move(now) {
          if (d.frames > lastFrame) {
            if (previous) {
              samples.push(now - previous);
              frameCount++;
            }
            previous = now;
            lastFrame = d.frames;
          }
          const time = now - started - hold;
          const turn = Math.max(0, Math.min(1, time / revolution)) * Math.PI * 2;
          let blend = ascent ? Math.max(0, Math.min(1, (time - revolution - hold) / ascent)) : 0;
          blend = blend * blend * (3 - 2 * blend);
          const x = target[0] + (93 - target[0]) * blend,
            z = target[1] + (13.5 - target[1]) * blend;
          const sweep = movie ? Math.sin(turn / 2) ** 2 : 0;
          const r = (radius + 65 * sweep) * (1 - blend) + 1.9 * blend;
          const y = (height + 13 * sweep) * (1 - blend) + 590 * blend;
          d.setReferencePose([x + r * Math.sin(turn), y, z + r * Math.cos(turn)], [x, z]);
          if (time < revolution + ascent + 2 * hold) requestAnimationFrame(move);
          else requestAnimationFrame(resolve);
        }
        requestAnimationFrame(move);
      });
      const sorted = samples.toSorted((a, b) => a - b);
      return {
        durationMs: performance.now() - started,
        framesSampled: frameCount,
        p95FrameMs: sorted[Math.ceil(sorted.length * 0.95) - 1],
        maxFrameMs: sorted.at(-1),
        over50Ms: samples.filter((v) => v > 50).length,
      };
    },
    { target, radius, height, movie },
  );
  const final = await readPose(page);
  if (!movie) assert(Math.hypot(...final.position.map((v, i) => v - initial.position[i])) < 0.01);
  return { initial, final, ...result };
}
async function interior(page) {
  const old = await page.evaluate(() => window.__indumoveisMap.instance);
  await page.getByRole("button", { name: "Buscar lote, pavilhão, via ou estrutura" }).click();
  await page.getByRole("textbox", { name: "Lote, pavilhão, via ou estrutura" }).fill("Pavilhão 12");
  await page.locator(".im-map-result").first().click();
  const exteriorRequests = [];
  const track = (request) => {
    if (new URL(request.url()).pathname.startsWith("/landscape/"))
      exteriorRequests.push(request.url());
  };
  page.on("request", track);
  await page.locator(".im-map-interior-action").click();
  await page.waitForURL("**/mapa/pavilhoes/12/interior**");
  await page.waitForFunction(() => window.__MAP_LAB__.contexts().active === 0);
  await page.waitForLoadState("networkidle");
  page.off("request", track);
  assert.deepEqual(exteriorRequests, []);
  const beforeReturn = await page.evaluate(() => performance.now());
  await page.goBack();
  await fresh(page, old);
  return page.evaluate(
    (start) => ({
      elapsedMs: performance.now() - start,
      exteriorRequestsDuringInterior: 0,
      activeContexts: window.__MAP_LAB__.contexts().active,
      lighting: window.__indumoveisMap.daylight.mode,
      profile: window.__indumoveisMap.tier,
      textureBytes: window.__indumoveisMap.textureBytes,
      landscape: window.__indumoveisMap.landscape ?? null,
    }),
    beforeReturn,
  );
}
async function checkExterior(page) {
  const button = (name) => page.getByRole("button", { name, exact: true });
  await setPose(page, controls.superior);
  // With this near-vertical pose the lower-right corner lies outside the park perimeter.
  const box = await page.locator(".im-map-stage").boundingBox();
  const x = box.width * 0.95,
    y = box.height * 0.95;
  assert.equal(await page.evaluate(([x, y]) => window.__indumoveisMap.pickAt(x, y), [x, y]), null);
  const before = await readPose(page);
  await page.mouse.click(box.x + x, box.y + y);
  await pause(page);
  assert.deepEqual(await readPose(page), before);
  assert.equal(await page.locator(".im-map-detail").count(), 0);
  const tried = { position: [10098, 24.6, 10181], target: [10098, 10055] };
  const bounded = await setPose(page, tried);
  const footprint = await page.evaluate(() => {
    const d = window.__indumoveisMap;
    const regions = d.navigation.navigationRegions;
    const { polygon } = regions.reduce((a, b) =>
      b.bounds.maxX - b.bounds.minX > a.bounds.maxX - a.bounds.minX ? b : a,
    );
    return polygon;
  });
  // A far-away target projects to an actual boundary segment. Its orbit remains intact.
  const edgeDistance = Math.min(
    ...footprint.map((a, i) => {
      const b = footprint[(i + 1) % footprint.length],
        dx = b[0] - a[0],
        dz = b[1] - a[1];
      const [x, z] = bounded.target;
      const t = Math.min(
        1,
        Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)),
      );
      return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
    }),
  );
  assert(edgeDistance < 0.001);
  assert(Math.abs(bounded.position[2] - bounded.target[1] - 126) < 0.001);
  const rotate = button("Girar à direita");
  const start = await readPose(page);
  await rotate.focus();
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press("Enter");
    await pause(page);
  }
  const end = await readPose(page);
  assert(Math.hypot(...end.position.map((x, i) => x - start.position[i])) < 0.01);
  await button("Opções de visualização").click();
  await button("Enquadrar parque completo").click();
  await page.keyboard.press("Escape");
  await pause(page);
  return {
    exteriorClickCss: [x, y],
    outsideClickPose: before,
    clamped: bounded,
    distanceToParkEdge: edgeDistance,
    keyboardRotation: { start, end },
    overview: await readPose(page),
  };
}
async function exercise(layout, viewport, quality) {
  const context = await newContext({
    viewport,
    reducedMotion: true,
    commercialOverview: { segments },
  });
  try {
    const page = await context.newPage();
    await page.addInitScript(
      ({ quality, mode, origin }) => {
        if (location.origin !== origin) return;
        localStorage.setItem("indumoveis:map-quality", quality);
        localStorage.setItem("indumoveis:map-lighting", mode);
        window.__landscapeLongTasks = [];
        window.__landscapeFrames = [];
        new PerformanceObserver((list) =>
          window.__landscapeLongTasks.push(
            ...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })),
          ),
        ).observe({ type: "longtask", buffered: true });
        let prev;
        function tick(now) {
          if (prev !== undefined) window.__landscapeFrames.push([prev, now]);
          prev = now;
          if (
            !window.__indumoveisMap?.realism.ready ||
            (!window.__indumoveisMap?.landscape?.finalAt && window.__indumoveisMap?.landscape)
          )
            requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      },
      { quality, mode: "natural", origin: new URL(baseURL).origin },
    );
    await page.goto(`${baseURL}/mapa?mapDiagnostics=1`, { waitUntil: "domcontentloaded" });
    await fresh(page);
    const entry = { layout, viewport, quality, opening: await opening(page) };
    output.entries.push(entry);
    if (task === "startup") return;
    if (task === "metrics") {
      entry.orbit = await orbit(page);
      const loaded = () =>
        page.evaluate(() => {
          const d = window.__indumoveisMap;
          return {
            instance: d.instance,
            textures: d.textures,
            textureBytes: d.textureBytes,
            landscapeBytes: d.landscape?.downloadBytes ?? 0,
            localImageRequests: performance
              .getEntriesByType("resource")
              .filter((r) => r.name.includes("/landscape/")).length,
          };
        });
      const beforeLighting = await readPose(page);
      const resources = await loaded();
      await setLighting(page, "warm");
      assert.deepEqual(await readPose(page), beforeLighting);
      assert.deepEqual(await loaded(), resources);
      entry.lightingSwitch = { pose: beforeLighting, resources };
      entry.reentry = await interior(page);
      assert.equal(entry.reentry.activeContexts, 1);
      assert.equal(entry.reentry.lighting, "warm");
    } else if (task === "controls") {
      entry.controls = await checkExterior(page);
    } else if (task === "video") {
      await setPose(page, { position: [98, 8.7, 100], target: [98, 55] });
      await page.screencast.start({
        path: path.join(artifactDir, "orbita.webm"),
        size: viewport,
      });
      entry.orbit = await orbit(page, true);
      await page.screencast.stop();
    } else {
      const stage = page.locator(".im-map-stage"),
        original = await stage.boundingBox();
      const desired = { width: 1468, height: 860 };
      await page.setViewportSize({
        width: viewport.width + desired.width - Math.round(original.width),
        height: viewport.height + desired.height - Math.round(original.height),
      });
      await pause(page);
      await setLighting(page, "warm");
      await page.mouse.move(0, 0);
      entry.poses = {};
      for (const [name, pose] of Object.entries(controls)) {
        entry.poses[name] = await setPose(page, pose);
        await stage.screenshot({ path: path.join(artifactDir, `${name}.png`) });
      }
      if (phase === "after") {
        await setLighting(page, "natural");
        entry.poses.natural = await setPose(page, controls["21-10-21"]);
        await stage.screenshot({ path: path.join(artifactDir, "natural.png") });
        let northPixels;
        for (const [index, name] of [...sectors, "N"].entries()) {
          const a = ((index % sectors.length) * Math.PI) / 4,
            dx = axes[0][0] * Math.sin(a) + axes[0][1] * Math.cos(a),
            dz = axes[1][0] * Math.sin(a) + axes[1][1] * Math.cos(a);
          const eye = [95, 11, 28],
            target = [eye[0] + dx * 57, eye[2] + dz * 57];
          entry.poses[name] = await setPose(page, { position: eye, target });
          const pixels = await stage.screenshot({
            path: path.join(artifactDir, `setor-${name}.png`),
          });
          if (index === 0) northPixels = pixels;
          if (name === "S") {
            const step = 3.5;
            const movedEye = [eye[0] - dz * step, eye[1], eye[2] + dx * step];
            const movedTarget = [target[0] - dz * step, target[1] + dx * step];
            entry.poses["S-travelling"] = await setPose(page, {
              position: movedEye,
              target: movedTarget,
            });
            await stage.screenshot({ path: path.join(artifactDir, "setor-S-travelling.png") });
          }
          if (index === 8) {
            // Read back the two displayed screenshots. Minor antialiasing variation may
            // move a channel by one even when a landmark stays on the same pixel.
            entry.northReturn = await page.evaluate(
              async (images) => {
                const canvas = document.createElement("canvas"),
                  ctx = canvas.getContext("2d");
                const channels = [];
                for (const image of images) {
                  const bitmap = await createImageBitmap(await (await fetch(image)).blob());
                  canvas.width = bitmap.width;
                  canvas.height = bitmap.height;
                  ctx.drawImage(bitmap, 0, 0);
                  bitmap.close();
                  channels.push(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
                }
                let sum = 0,
                  changed = 0;
                for (let n = 0; n < channels[0].length; n += 4) {
                  let max = 0;
                  for (let c = 0; c < 3; c++) {
                    const diff = Math.abs(channels[0][n + c] - channels[1][n + c]);
                    sum += diff;
                    max = Math.max(max, diff);
                  }
                  if (max > 8) changed++;
                }
                const area = canvas.width * canvas.height;
                return {
                  meanChannelDifference: sum / (area * 3),
                  fractionChangedOver8: changed / area,
                };
              },
              [northPixels, pixels].map(
                (data) => "data:image/png;base64," + data.toString("base64"),
              ),
            );
            assert(
              entry.northReturn.meanChannelDifference < 1 &&
                entry.northReturn.fractionChangedOver8 < 0.015,
              "The north view changed after one full orbit",
            );
          }
        }
      }
    }
    console.log(layout, quality, entry.opening.usefulFrameMs, entry.orbit?.p95FrameMs);
  } finally {
    await context.close();
  }
}
try {
  for (let i = 0; i < (task === "startup" ? 3 : 1); i++) {
    if (!["metrics", "startup"].includes(task) || process.env.MAP_LAYOUT !== "mobile")
      await exercise("desktop", { width: 1366, height: 768 }, "detailed");
    if (["metrics", "startup"].includes(task) && process.env.MAP_LAYOUT !== "desktop")
      await exercise("mobile", { width: 390, height: 844 }, "light");
  }
  assert.deepEqual(report.errors, []);
} finally {
  output.errors = report.errors;
  await writeFile(
    path.join(
      artifactDir,
      `${task}${process.env.MAP_LAYOUT ? "-" + process.env.MAP_LAYOUT : ""}.json`,
    ),
    JSON.stringify(output, null, 2) + "\n",
  );
  await browser.close();
}
