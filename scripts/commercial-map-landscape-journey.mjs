// Browser acceptance for the four exterior views. Run against one frozen production build at a time.
import assert from "node:assert/strict";
import path from "node:path";
import {
  browser,
  baseURL,
  artifactDir,
  newContext,
  report,
} from "./commercial-map-browser-fixtures.mjs";

const poses = {
  avenida: { position: [137, 10, 90], target: [80, 85] },
  pavilhoes: { position: [212, 32, 69], target: [77, 65] },
  arena: { position: [-292, 112, -42], target: [66, 23] },
  divisa: { position: [-46, 215, 95], target: [-46, 94] },
};
const route = ["avenida", "pavilhoes", "divisa", "arena", "divisa", "pavilhoes", "avenida"];
async function traverse(page) {
  return page.evaluate(
    async ({ poses, route }) => {
      const d = window.__indumoveisMap;
      const keys = route.map((name) => {
        const {
          position: [x, y, z],
          target,
        } = poses[name];
        return {
          target,
          y,
          radius: Math.hypot(x - target[0], z - target[1]),
          angle: Math.atan2(x - target[0], z - target[1]),
        };
      });
      const frames = [],
        buffers = new Set(),
        levels = new Set();
      let previousTime,
        previousFrame = d.frames;
      await new Promise((resolve) => {
        let start;
        function tick(now) {
          start ??= now;
          if (d.frames !== previousFrame) {
            if (previousTime !== undefined) frames.push(now - previousTime);
            previousTime = now;
            previousFrame = d.frames;
            buffers.add(d.buffer.join("×"));
            levels.add(d.landscape.level);
          }
          const progress = Math.min(keys.length - 1, (now - start) / 1900);
          const index = Math.min(keys.length - 2, Math.floor(progress));
          const a = keys[index],
            b = keys[index + 1],
            t = progress - index;
          const ease = t * t * (3 - 2 * t),
            lerp = (x, y) => x + (y - x) * ease;
          const target = a.target.map((v, i) => lerp(v, b.target[i]));
          const radius = lerp(a.radius, b.radius);
          const angle =
            a.angle + ease * Math.atan2(Math.sin(b.angle - a.angle), Math.cos(b.angle - a.angle));
          d.setReferencePose(
            [
              target[0] + Math.sin(angle) * radius,
              lerp(a.y, b.y),
              target[1] + Math.cos(angle) * radius,
            ],
            target,
          );
          if (progress < keys.length - 1) requestAnimationFrame(tick);
          else requestAnimationFrame(() => requestAnimationFrame(resolve));
        }
        requestAnimationFrame(tick);
      });
      frames.sort((a, b) => a - b);
      return {
        frames: frames.length,
        p95FrameMs: frames[Math.ceil(0.95 * frames.length) - 1],
        buffers: [...buffers],
        levels: [...levels],
        returnedPosition: [...d.position],
      };
    },
    { poses, route },
  );
}

export async function journey({ segments, setPose }) {
  const entries = [];
  for (const [profile, viewport] of [
    ["detailed", { width: 1536, height: 1010 }],
    ["light", { width: 390, height: 844 }],
  ]) {
    const context = await newContext({
      viewport,
      reducedMotion: true,
      commercialOverview: { segments },
      nativeHttpCache: true,
    });
    try {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setBlockedURLs", {
        urls: ["*://fonts.googleapis.com/*", "*://fonts.gstatic.com/*"],
      });
      await page.addInitScript(
        ({ profile, origin }) => {
          if (location.origin !== origin) return;
          localStorage.setItem("indumoveis:map-quality", profile);
          localStorage.setItem("indumoveis:map-lighting", "warm");
          performance.setResourceTimingBufferSize(1200);
        },
        { profile, origin: new URL(baseURL).origin },
      );
      for (const cache of ["cold", "warm"]) {
        await page.goto(baseURL + "/mapa?mapDiagnostics=1", { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__indumoveisMap?.readyAt);
        const stage = page.locator(".im-map-stage"),
          box = await stage.boundingBox();
        // A real orbit input while the deferred world is arriving.
        const beforeInput = await page.evaluate(() => ({
          level: window.__indumoveisMap.landscape.level,
          azimuth: window.__indumoveisMap.azimuth,
        }));
        const x = box.x + box.width * 0.53,
          y = box.y + box.height * 0.48;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 36, y, { steps: 6 });
        await page.mouse.up();
        await page.waitForFunction(
          (a) => Math.abs(window.__indumoveisMap.azimuth - a) > 0.001,
          beforeInput.azimuth,
        );
        await page.waitForFunction(
          () => window.__indumoveisMap?.landscape.finalAt && window.__indumoveisMap.realism.ready,
          null,
          { timeout: 60000 },
        );
        const entry = await page.evaluate(() => {
          const d = window.__indumoveisMap;
          const assets = performance
            .getEntriesByType("resource")
            .filter((r) => new URL(r.name).origin === location.origin);
          const files = assets.filter((r) => /\/landscape\/|landscape-mask/.test(r.name));
          return {
            buffer: [...d.buffer],
            tier: d.tier,
            level: d.landscape.level,
            usefulFrameMs: d.readyAt,
            compactMs: d.landscape.compactAt,
            finalMs: d.landscape.finalAt,
            transferBytes: assets.reduce((s, r) => s + r.transferSize, 0),
            landscapeTransferBytes: files.reduce((s, r) => s + r.transferSize, 0),
            landscapeFiles: files.map((r) => ({
              file: r.name.split("/").pop(),
              transfer: r.transferSize,
            })),
            peakLandscapeTextureBytes: d.landscape.peakTextureBytes,
            estimatedPeakSceneTextureBytes:
              d.textureBytes - d.landscape.textureBytes + d.landscape.peakTextureBytes,
            featureBytes: d.landscape.featureBufferBytes,
            renderer: window.__MAP_LAB__.rendererInfo().unmaskedRenderer,
            failures: d.optionalFailures,
          };
        });
        assert.equal(entry.level, profile === "light" ? "compact" : "detail");
        assert.deepEqual(entry.failures, []);
        if (cache === "warm")
          assert.equal(
            entry.landscapeTransferBytes,
            0,
            "Serve the frozen build with MAP_HTTP_CACHE=1",
          );
        Object.assign(entry, { profile, cache, beforeInput });
        if (profile === "detailed" && cache === "cold") {
          entry.poses = {};
          for (const [name, pose] of Object.entries(poses)) {
            entry.poses[name] = await setPose(page, pose);
            await stage.screenshot({ path: path.join(artifactDir, name + ".png") });
          }
        }
        const start = await setPose(page, poses.avenida);
        entry.orbit = await traverse(page);
        assert(
          Math.hypot(...entry.orbit.returnedPosition.map((v, i) => v - start.position[i])) < 0.01,
        );
        assert.equal(entry.orbit.buffers.length, 1);
        assert.equal(entry.orbit.levels.length, 1);
        entries.push(entry);
        console.log(profile, cache, entry.finalMs, entry.orbit.p95FrameMs, entry.transferBytes);
        if (profile === "detailed" && cache === "warm") {
          // Capture separately to keep video encoding out of both timing passes.
          await page.screencast.start({
            path: path.join(artifactDir, "percurso.webm"),
            size: viewport,
          });
          await traverse(page);
          await page.screencast.stop();
        }
        await page.goto("about:blank");
      }
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(report.errors, []);
  Object.assign(report.conditions, {
    httpCache:
      "Contexto novo no frio. Segunda navegação no mesmo contexto e cache HTTP nativo no quente. Ativos estáticos max-age=3600, fontes remotas bloqueadas.",
    browser: browser.version(),
  });
  return entries;
}

// Calibrate selection at the balanced tier's 1200 px boundary. The extra CPU
// time is an induced diagnostic and is excluded from the visitor's frame timings.
export async function pressure(phase) {
  const viewport = { width: 1390, height: 816 };
  const context = await newContext({ viewport, reducedMotion: true });
  try {
    const page = await context.newPage();
    await page.goto(baseURL + "/mapa?mapDiagnostics=1");
    await page.waitForFunction(() => window.__indumoveisMap?.landscape.finalAt);
    const result = await page.evaluate(async () => {
      const d = window.__indumoveisMap;
      const changes = [];
      function record() {
        const state =
          d.buffer.join("×") + " " + d.landscape.level + "/" + d.landscape.requested + " " + d.tier;
        if (state !== changes.at(-1)?.state)
          changes.push({ state, atMs: Math.round(performance.now()) });
      }
      record();
      let frame = 0;
      await new Promise((resolve) => {
        function tick() {
          d.setReferencePose([140, 18, 90 + Math.sin(frame / 65) * 8], [80, 85]);
          const stop = performance.now() + 41;
          while (performance.now() < stop) {
            /* induced frame pressure */
          }
          record();
          if (++frame < 153) requestAnimationFrame(tick);
          else resolve();
        }
        requestAnimationFrame(tick);
      });
      const statesDuringOrbit = changes.length;
      await new Promise((resolve) => setTimeout(resolve, 1550));
      record();
      return { changes, statesDuringOrbit, finalLevel: d.landscape.level };
    });
    if (phase === "after") {
      assert.equal(result.statesDuringOrbit, 1);
      assert.equal(result.finalLevel, "detail");
    }
    return result;
  } finally {
    await context.close();
  }
}
