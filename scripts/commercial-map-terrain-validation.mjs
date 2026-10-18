/** Focused terrain/navigation browser laboratory. Local intercepted fixtures only.
 * Build before and after from the same source revision boundary, then:
 * MAP_BASE_URL=http://127.0.0.1:4174 MAP_TERRAIN_PHASE=before node scripts/commercial-map-terrain-validation.mjs
 * MAP_BASE_URL=http://127.0.0.1:4175 MAP_TERRAIN_PHASE=after MAP_TERRAIN_REFERENCE=artifacts.local/commercial-map-terrain/before/terrain-validation.json node scripts/commercial-map-terrain-validation.mjs
 * Defaults to software SwiftShader on this host. This is not physical-phone validation.
 */
import assert from "node:assert/strict";
import { createRequire, stripTypeScriptTypes } from "node:module";
import { access, readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const require = createRequire(import.meta.url);
const bundle = path.join(
  os.homedir(),
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "node",
  "node_modules",
  "playwright",
);
let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
} catch {
  playwright = require(bundle);
}

const baseURL = process.env.MAP_BASE_URL ?? "http://127.0.0.1:3000";
const phase = process.env.MAP_TERRAIN_PHASE ?? "after";
const mode = "terrain";
const artifactDir = path.resolve(
  process.env.MAP_ARTIFACT_DIR ?? `artifacts.local/commercial-map-terrain/${phase}`,
);
const env = await readFile(".env", "utf8");
const backendURL = env.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
assert(backendURL, "A Supabase origin is required to intercept local browser fixtures.");
const backend = new URL(backendURL);
const userId = "11111111-1111-4111-8111-111111111111";
const editionId = "22222222-2222-4222-8222-222222222222";
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "map-lab@example.invalid",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const expiry = Math.floor(Date.now() / 1000) + 24 * 3600;
const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: expiry, role: "authenticated" })).toString("base64url")}.local-lab-fixture`;
const session = {
  access_token: token,
  refresh_token: "local-fixture",
  expires_at: expiry,
  expires_in: 86400,
  token_type: "bearer",
  user,
};
const report = {
  generatedAt: new Date().toISOString(),
  baseURL,
  conditions: {
    os: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0]?.model,
    logicalCores: os.cpus().length,
    systemMemoryGiB: Math.round(os.totalmem() / 2 ** 30),
    renderer:
      process.env.MAP_BROWSER_GPU === "hardware"
        ? "host GPU requested; inspect renderer evidence"
        : "Chromium software ANGLE/SwiftShader",
    authAndData:
      "Local intercepted fixtures, active edition, zero persisted commercial spaces. No production session or database mutation.",
    physicalDevices:
      "Automated local host browser; no physical Android/iPhone or manual touch/trackpad validation",
    rendererAssets: [],
    usabilityParticipants: "None; scripted objective journeys only",
  },
  mode,
  layouts: [],
  checks: [],
  openings: [],
  errors: [],
  consoleErrors: [],
  unexpectedRequests: [],
};
await mkdir(artifactDir, { recursive: true });
let executablePath = process.env.MAP_CHROMIUM_EXECUTABLE;
if (!executablePath && os.platform() === "win32") {
  try {
    await access(playwright.chromium.executablePath());
  } catch {
    const cache = path.join(os.homedir(), "AppData", "Local", "ms-playwright");
    const versions = (await readdir(cache))
      .filter((name) => /^chromium_headless_shell-\d+$/.test(name))
      .sort((a, b) => Number(b.split("-").at(-1)) - Number(a.split("-").at(-1)));
    if (versions[0])
      executablePath = path.join(
        cache,
        versions[0],
        "chrome-headless-shell-win64",
        "chrome-headless-shell.exe",
      );
  }
}
const browser = await playwright.chromium.launch({
  headless: true,
  executablePath:
    executablePath ??
    (os.platform() === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined),
  args:
    process.env.MAP_BROWSER_GPU === "hardware"
      ? os.platform() === "win32"
        ? ["--enable-gpu", "--use-angle=d3d11"]
        : ["--enable-gpu"]
      : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const liveContexts = new Set();
report.conditions.browser = browser.version();

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

async function newContext({
  viewport = { width: 1366, height: 768 },
  noWebGL = false,
  chunkFailure = false,
  apiFailure = false,
  reducedMotion = false,
  fontDelayMs = 0,
} = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
    isMobile: viewport.width < 600,
    hasTouch: viewport.width < 900,
  });
  liveContexts.add(context);
  context.on("close", () => liveContexts.delete(context));
  context.on("page", (page) => {
    page.on("pageerror", (error) => report.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      report.consoleErrors.push({ url: page.url(), text: message.text() });
      if (
        /hydration|hydrating|did not match|server rendered HTML|Minified React error #(?:418|423|425)/i.test(
          message.text(),
        )
      )
        report.errors.push(message.text());
    });
  });
  await context.addInitScript(
    ({ storageKey, fixtureSession, noWebGL, appOrigin }) => {
      // addInitScript also runs in opaque about:blank documents before navigation.
      // Seed only the intended application origin, never unrelated child frames.
      if (location.origin !== appOrigin) return;
      localStorage.setItem(storageKey, JSON.stringify(fixtureSession));
      localStorage.setItem("sidebar-compact", "1");
      const original = HTMLCanvasElement.prototype.getContext;
      const contexts = new WeakMap();
      let creates = 0;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        if (noWebGL && String(args[0]).startsWith("webgl")) return null;
        const result = original.apply(this, args);
        if (result && String(args[0]).startsWith("webgl") && !contexts.has(this)) {
          contexts.set(this, result);
          creates++;
        }
        return result;
      };
      window.__MAP_LAB__ = {
        contexts: () => ({
          created: creates,
          active: [...document.querySelectorAll("canvas")].filter(
            (canvas) => contexts.has(canvas) && !contexts.get(canvas).isContextLost(),
          ).length,
        }),
        rendererInfo: () => {
          const canvas = [...document.querySelectorAll("canvas")].find((canvas) =>
            contexts.has(canvas),
          );
          const gl = canvas ? contexts.get(canvas) : null;
          if (!gl) return null;
          const extension = gl.getExtension("WEBGL_debug_renderer_info");
          return {
            vendor: gl.getParameter(gl.VENDOR),
            renderer: gl.getParameter(gl.RENDERER),
            version: gl.getParameter(gl.VERSION),
            unmaskedVendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
            unmaskedRenderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
          };
        },
        loseContext: () => {
          const canvas = [...document.querySelectorAll("canvas")].find((canvas) =>
            contexts.has(canvas),
          );
          contexts.get(canvas)?.getExtension("WEBGL_lose_context")?.loseContext();
        },
      };
    },
    {
      storageKey: `sb-${backend.hostname.split(".")[0]}-auth-token`,
      fixtureSession: session,
      noWebGL,
      appOrigin: new URL(baseURL).origin,
    },
  );
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      url.origin === new URL(baseURL).origin &&
      /\/MapRenderer-[^/]+\.js$/.test(url.pathname) &&
      !report.conditions.rendererAssets.includes(url.pathname)
    )
      report.conditions.rendererAssets.push(url.pathname);
    if (url.origin === backend.origin) {
      const headers = {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
      };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (url.pathname === "/auth/v1/user")
        return route.fulfill({ status: 200, headers, body: JSON.stringify(user) });
      if (url.pathname === "/rest/v1/rpc/ensure_profile" && request.method() === "POST")
        return route.fulfill({ status: 200, headers, body: "null" });
      if (url.pathname === "/rest/v1/rpc/search_documents" && request.method() === "POST")
        return route.fulfill({ status: 200, headers, body: "[]" });
      assert.equal(request.method(), "GET", `Blocked backend mutation: ${url.pathname}`);
      const table = url.pathname.split("/").at(-1);
      const payloads = {
        user_roles: [{ user_id: userId, role: "admin" }],
        role_permissions: [],
        profiles: { id: userId, full_name: "Validação local" },
        editions: [
          {
            id: editionId,
            name: "Indumóveis 2027",
            year: 2027,
            starts_on: "2027-05-14",
            ends_on: "2027-05-23",
            is_active: true,
            timezone: "America/Sao_Paulo",
          },
        ],
        space_status_v: [],
        deals: null,
        installments: [],
        payments: [],
        contracts: [],
      };
      if (!(table in payloads)) report.unexpectedRequests.push(url.pathname);
      if (apiFailure && table === "space_status_v")
        return route.fulfill({
          status: 503,
          headers,
          body: JSON.stringify({ message: "Local laboratory unavailable fixture" }),
        });
      return route.fulfill({ status: 200, headers, body: JSON.stringify(payloads[table] ?? []) });
    }
    if (chunkFailure && /\/MapRenderer(?:-|\.|\/)/.test(url.pathname)) return route.abort("failed");
    if (fontDelayMs && url.hostname === "fonts.googleapis.com") {
      await new Promise((resolve) => setTimeout(resolve, fontDelayMs));
      return route.fulfill({
        status: 200,
        contentType: "text/css",
        body: "/* Delayed external font stylesheet laboratory fixture. */",
      });
    }
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname))
      return route.abort("blockedbyclient");
    return route.continue();
  });
  return context;
}

const reference = process.env.MAP_TERRAIN_REFERENCE
  ? JSON.parse(await readFile(process.env.MAP_TERRAIN_REFERENCE, "utf8"))
  : null;
if (process.env.MAP_TERRAIN_OPENINGS_APPEND === "1") {
  const previous = JSON.parse(
    await readFile(path.join(artifactDir, "terrain-validation.json"), "utf8"),
  );
  report.previousSeriesStartedAt = previous.generatedAt;
  report.openings = previous.openings;
  report.checks = previous.checks;
  report.errors = previous.errors;
  report.consoleErrors = previous.consoleErrors;
}
report.phase = phase;
report.captures = [];
report.benchmarks = [];
report.conditions.note =
  "Same local host, browser executable, CSS viewport/DPR, scripted gestures and intercepted local data before/after. Submitted frames, not input-to-photon. No physical mobile device.";

async function diagnostic(page) {
  return page.evaluate(() => {
    const d = window.__indumoveisMap;
    if (!d) return null;
    const data = { ...d };
    if (d.navigation) {
      const { protectedRegions, ...envelope } = d.navigation;
      data.navigation = { ...envelope, protectedRegionCount: protectedRegions?.length };
    }
    if (typeof d.transforms === "function") data.commercialTransforms = d.transforms();
    return JSON.parse(JSON.stringify(data));
  });
}
async function idle(page) {
  await page.waitForTimeout(75);
  await page.waitForFunction(() => window.__indumoveisMap?.cameraState === "idle", null, {
    timeout: 10000,
  });
  return diagnostic(page);
}
async function open(page, query = "") {
  const start = performance.now();
  await page.goto(`${baseURL}/mapa?mapDiagnostics=1${query ? `&${query}` : ""}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: "Mapa Comercial", exact: true }).waitFor();
  await page.locator(".im-map-svg,canvas").first().waitFor({ state: "visible" });
  const usefulMs = performance.now() - start;
  await page.locator('.im-map-stage[data-representation="ready"]').waitFor({ timeout: 20000 });
  await idle(page);
  return { usefulMs, ready3DMs: performance.now() - start };
}
async function auxiliary(page, name) {
  const direct = page.getByRole("button", { name, exact: true });
  if (!(await direct.isVisible()))
    await page.getByRole("button", { name: "Mais ações do mapa", exact: true }).click();
  await direct.click();
}
async function profile(page, tier) {
  await auxiliary(page, "Opções de visualização");
  await page.getByRole("combobox", { name: "Qualidade gráfica", exact: true }).selectOption(tier);
  await page.getByRole("button", { name: "Fechar menu", exact: true }).click();
  await page.waitForFunction((tier) => window.__indumoveisMap?.tier === tier, tier);
  await idle(page);
}
async function view(page, label) {
  const select = page.getByRole("combobox", { name: "Vista do mapa", exact: true });
  if (await select.isVisible()) await select.selectOption({ label });
  else await page.getByRole("button", { name: label, exact: true }).click();
  return idle(page);
}
async function gesture(page, label) {
  const select = page.getByRole("combobox", { name: "Gesto de navegação", exact: true });
  if (await select.isVisible()) await select.selectOption({ label });
  else await page.getByRole("button", { name: `${label} mapa`, exact: true }).click();
}
async function drag(page, dx, dy, { button = "left", steps = 18 } = {}) {
  const rect = await page.locator("canvas").boundingBox();
  const x = rect.x + rect.width * 0.45,
    y = rect.y + rect.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down({ button });
  await page.mouse.move(x + dx, y + dy, { steps });
  await page.mouse.up({ button });
  return idle(page);
}
async function select(page, query, name) {
  await page.getByRole("button", { name: "Buscar lote, pavilhão ou via", exact: true }).click();
  await page.getByRole("textbox", { name: "Lote, pavilhão ou via", exact: true }).fill(query);
  await page
    .locator(".im-map-result")
    .filter({ has: page.getByText(name, { exact: true }) })
    .first()
    .click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
  await idle(page);
}
async function closeDetail(page) {
  await page.getByRole("button", { name: "Fechar ficha", exact: true }).click();
  await page.locator(".im-map-detail").waitFor({ state: "detached" });
  await idle(page);
}
async function capture(page, name, requested) {
  if (phase.startsWith("after"))
    await page.waitForFunction(() => window.__indumoveisMap?.environmentReadyAt > 0, null, {
      timeout: 12000,
    });
  if (requested) {
    await page.evaluate(
      ({ position, target }) => window.__indumoveisMap.setReferencePose(position, target),
      requested,
    );
    await idle(page);
  }
  await page.mouse.move(1278, 758);
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(250);
  const actual = await diagnostic(page);
  const pose = {
    position: actual.position,
    target: actual.target,
    distance: actual.distance,
    polar: actual.polar,
    azimuth: actual.azimuth,
  };
  const canvas = await page.locator("canvas").boundingBox();
  await page.locator("canvas").screenshot({ path: path.join(artifactDir, `${name}.png`) });
  const samePose =
    !requested ||
    (Math.hypot(...pose.position.map((n, i) => n - requested.position[i])) < 0.02 &&
      Math.hypot(...pose.target.map((n, i) => n - requested.target[i])) < 0.02);
  const result = {
    name,
    pose,
    requested,
    samePose,
    canvas,
    drawCalls: actual.drawCalls,
    triangles: actual.triangles,
    textureBytes: actual.textureBytes,
    terrain: actual.terrain,
  };
  report.captures.push(result);
  return result;
}
async function navigateModule(page, href) {
  await page
    .locator('[role="dialog"][data-state="closed"]')
    .first()
    .waitFor({ state: "detached", timeout: 1500 });
  const visible = page.locator(`a[href="${href}"]:visible`).first();
  if (!(await visible.count()))
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await visible.click();
}

async function check(name, action) {
  const existingContexts = new Set(liveContexts);
  try {
    const detail = await action();
    report.checks.push({ name, passed: true, detail });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.stack ?? String(error) });
    console.log(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
    report.failedScenes ??= [];
    for (const context of liveContexts)
      if (!existingContexts.has(context)) {
        for (const page of context.pages()) {
          try {
            report.failedScenes.push({
              check: name,
              url: page.url(),
              diagnostic: await diagnostic(page),
              contexts: await page.evaluate(() => window.__MAP_LAB__?.contexts()),
              canvasCount: await page.locator("canvas").count(),
              stage: await page.locator(".im-map-stage").getAttribute("data-representation"),
              text: await page.locator(".im-map-workspace").innerText(),
            });
            await page.screenshot({
              path: path.join(artifactDir, `failed-${name.replace(/[^a-z0-9]+/gi, "-")}.png`),
            });
          } catch {
            /* Preserve the original failure if the page/context already closed. */
          }
        }
        await context.close();
      }
  }
  await writeFile(
    path.join(artifactDir, "terrain-validation.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
function poseFor(target, distance, polar, azimuth = 0.68) {
  return {
    target,
    position: [
      target[0] + Math.sin(polar) * Math.sin(azimuth) * distance,
      Math.cos(polar) * distance,
      target[1] + Math.sin(polar) * Math.cos(azimuth) * distance,
    ],
  };
}
function invariant(before, after) {
  assert.equal(after.instance, before.instance, "Navigation recreated the renderer");
  if (phase === "after") {
    assert(
      Array.isArray(before.commercialTransforms) && before.commercialTransforms.length > 0,
      "Commercial transform diagnostic missing",
    );
    assert.deepEqual(
      after.commercialTransforms,
      before.commercialTransforms,
      "Commercial geometry moved during navigation",
    );
    const n = after.navigation;
    assert(
      n && after.distance >= n.minDistance - 0.02 && after.distance <= n.maxDistance + 0.02,
      "Camera escaped distance bounds",
    );
    assert(
      after.polar >= n.minPolarAngle - 0.0001 && after.polar <= n.maxPolarAngle + 0.0001,
      "Camera escaped inclination bounds",
    );
    assert(after.position[1] >= n.cameraClearance - 0.02, "Camera intersects roof clearance");
    assert(
      after.target[0] >= n.targetBounds.minX - 0.02 &&
        after.target[0] <= n.targetBounds.maxX + 0.02 &&
        after.target[1] >= n.targetBounds.minY - 0.02 &&
        after.target[1] <= n.targetBounds.maxY + 0.02,
      "Target escaped navigation region",
    );
  }
}
async function benchmark(page, tier) {
  await profile(page, tier);
  if (phase.startsWith("after"))
    await page.waitForFunction(() => window.__indumoveisMap?.environmentReadyAt > 0, null, {
      timeout: 12000,
    });
  const paired = reference?.benchmarks.find((b) => b.tier === tier)?.startPose;
  const requested = paired ?? poseFor([95.5, 55], 230, 0.84);
  await page.evaluate(
    ({ position, target }) => window.__indumoveisMap.setReferencePose(position, target),
    requested,
  );
  const startPose = await idle(page);
  await page.evaluate(() => window.__indumoveisMap.resetSamples());
  await gesture(page, "Girar");
  const rect = await page.locator("canvas").boundingBox();
  const start = performance.now(),
    peaks = { drawCalls: 0, triangles: 0, textures: 0, textureBytes: 0 };
  let rounds = 0;
  while (performance.now() - start < Number(process.env.MAP_TERRAIN_BENCH_MS ?? 30000)) {
    const x = rect.x + rect.width * 0.42,
      y = rect.y + rect.height * 0.46;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (rounds % 2 ? -90 : 90), y + (rounds % 2 ? -12 : 12), { steps: 24 });
    await page.mouse.up();
    await page.mouse.wheel(0, rounds % 2 ? -60 : 60);
    const sample = await diagnostic(page);
    for (const field of Object.keys(peaks)) peaks[field] = Math.max(peaks[field], sample[field]);
    rounds++;
  }
  const d = await idle(page),
    intervals = d.frameIntervals;
  const result = {
    tier,
    startPose: { position: startPose.position, target: startPose.target },
    durationMs: performance.now() - start,
    rounds,
    samples: intervals.length,
    p50Ms: percentile(intervals, 0.5),
    p95Ms: percentile(intervals, 0.95),
    p99Ms: percentile(intervals, 0.99),
    stallsAbove200Ms: intervals.filter((x) => x > 200).length,
    peaks,
    rendererInfo: await page.evaluate(() => window.__MAP_LAB__.rendererInfo()),
  };
  report.benchmarks.push(result);
  console.log(
    `BENCH ${tier} p50=${result.p50Ms}ms p95=${result.p95Ms}ms draws=${peaks.drawCalls} textures=${peaks.textureBytes}B`,
  );
  return result;
}

async function lightingEvidence() {
  const source = await readFile("src/features/commercial-map/data/territory.ts", "utf8");
  const { ENTITIES } = await import(
    `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
  );
  for (const scenario of [
    { name: "daylight-normal", query: "" },
    { name: "daylight-sky-failure", query: "mapSky=fail" },
    { name: "daylight-environment-failure", query: "mapEnvironment=fail" },
    { name: "daylight-all-maps-off", query: "mapTerrainMaps=off&mapSurfaceMaps=off" },
  ]) {
    await check(scenario.name, async () => {
      const context = await newContext({ viewport: { width: 1280, height: 760 } });
      const page = await context.newPage();
      await open(page, scenario.query);
      await profile(page, "balanced");
      await page.waitForTimeout(800);
      await page.addStyleTag({
        content:
          ".im-map-workspace{position:fixed!important;inset:0 auto auto 0!important;width:1200px!important;height:656px!important}",
      });
      await page.evaluate(() => {
        const header = document.querySelector(".im-map-header").getBoundingClientRect();
        document
          .querySelector(".im-map-workspace")
          .style.setProperty("height", `${header.height + 600}px`, "important");
      });
      const d = await idle(page);
      await capture(page, scenario.name, poseFor([95.5, 55], 230, 1.1));
      if (!scenario.query) {
        const terrainBase = reference?.checks.find(
          (c) => c.name === "orbit pan zoom preserve commercial transforms",
        )?.detail.far;
        const horizonPose = terrainBase?.navigation
          ? poseFor(
              [95.5, 55],
              terrainBase.navigation.maxDistance,
              terrainBase.navigation.maxPolarAngle,
            )
          : poseFor([95.5, 55], Math.min(350, d.navigation?.maxDistance ?? 350), 1.1);
        await capture(page, "daylight-horizon", horizonPose);
        if (d.navigation)
          await capture(
            page,
            "daylight-horizon-allowed",
            poseFor(
              [95.5, 55],
              Math.min(250, d.navigation.maxDistance),
              d.navigation.maxPolarAngle,
            ),
          );
        if (phase.startsWith("after")) {
          const beforeTilt = await idle(page);
          await gesture(page, "Girar");
          const tilted = await drag(page, 0, -500);
          invariant(beforeTilt, tilted);
          assert(
            Math.abs(tilted.polar - tilted.navigation.maxPolarAngle) < 0.001,
            "Tilt gesture failed to reach stable inclination limit",
          );
          await capture(page, "daylight-max-inclination-gesture");
          const top = await drag(page, 0, 650);
          invariant(beforeTilt, top);
          assert(
            Math.abs(top.polar - top.navigation.minPolarAngle) < 0.001,
            "Tilt gesture failed to reach stable top limit",
          );
        }
        for (const number of [1, 8]) {
          const entity = ENTITIES.find((e) => e.id === `indumoveis:pavilion:${number}`);
          for (const [side, azimuth] of [
            ["a", 0.68],
            ["b", 2.2],
          ]) {
            await capture(
              page,
              `daylight-roof-P${number}-${side}`,
              poseFor(entity.anchor, number === 1 ? 49 : 38, 0.86, azimuth),
            );
          }
        }
      }
      if (!scenario.query) {
        for (const tier of ["light", "balanced", "detailed"]) {
          await profile(page, tier);
          await capture(page, `daylight-profile-${tier}`, poseFor([95.5, 55], 230, 0.84));
        }
      }
      await select(page, "70", "Lote 70");
      const selected = await idle(page);
      assert.equal(selected.lastSelectedId, "indumoveis:external:lot:70");
      if (scenario.query === "mapEnvironment=fail") assert.equal(d.environmentBytes, 0);
      await context.close();
      return { query: scenario.query, diagnostic: d, selected: selected.lastSelectedId };
    });
  }
}

async function preparationInteraction() {
  const context = await newContext();
  const page = await context.newPage();
  await page.goto(`${baseURL}/mapa?mapDiagnostics=1`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Mapa Comercial", exact: true }).waitFor();
  await page.locator(".im-map-svg,canvas").first().waitFor({ state: "visible" });
  const representationAtInput = await page
    .locator(".im-map-stage")
    .getAttribute("data-representation");
  const inputStarted = performance.now();
  await page.getByRole("button", { name: "Buscar lote, pavilhão ou via", exact: true }).click();
  await page.getByRole("textbox", { name: "Lote, pavilhão ou via", exact: true }).fill("70");
  await page
    .locator(".im-map-result")
    .filter({ has: page.getByText("Lote 70", { exact: true }) })
    .first()
    .click();
  await page.getByRole("heading", { name: "Lote 70", exact: true }).waitFor();
  const searchAutomationToDOMMs = performance.now() - inputStarted;
  const representationAtSelection = await page
    .locator(".im-map-stage")
    .getAttribute("data-representation");
  await page.locator('.im-map-stage[data-representation="ready"]').waitFor({ timeout: 20000 });
  await page.waitForFunction(
    () => window.__indumoveisMap?.lastSelectedId === "indumoveis:external:lot:70",
    null,
    { timeout: 4000 },
  );
  const selected = await idle(page);
  await page.screenshot({ path: path.join(artifactDir, "preparation-selection-handoff.png") });
  await context.close();
  return {
    representationAtInput,
    representationAtSelection,
    searchAutomationToDOMMs,
    selected,
    note: "Real first visible representation, no injected loading delay. Representation at each input boundary is recorded; elapsed automation includes several UI commands and is not input-to-photon latency.",
  };
}

async function earlyGestureAndIdle() {
  const context = await newContext();
  const page = await context.newPage();
  await page.goto(`${baseURL}/mapa?mapDiagnostics=1`, { waitUntil: "domcontentloaded" });
  await page.locator('.im-map-stage[data-representation="ready"]').waitFor({ timeout: 20000 });
  const beforeGesture = await diagnostic(page);
  const rect = await page.locator("canvas").boundingBox();
  const x = rect.x + rect.width * 0.45,
    y = rect.y + rect.height * 0.45;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 100, y + 30, { steps: 16 });
  await page.waitForTimeout(650);
  const heldGesture = await diagnostic(page);
  assert.equal(
    heldGesture.daylight.environmentPreparations,
    beforeGesture.daylight.environmentPreparations,
    "Optional environment preparation ran while an early pointer was held",
  );
  await page.mouse.up();
  await idle(page);
  await page.waitForFunction(() => window.__indumoveisMap?.environmentReadyAt > 0, null, {
    timeout: 12000,
  });
  await profile(page, "light");
  await page.waitForTimeout(550);
  const beforeIdle = await idle(page);
  await page.waitForTimeout(350);
  const afterIdle = await diagnostic(page);
  assert.equal(
    afterIdle.frames,
    beforeIdle.frames,
    "Static light sky/terrain introduced a continuous render loop",
  );
  for (const preset of ["Superior", "Oblíqua", "3D"]) await view(page, preset);
  await gesture(page, "Girar");
  await drag(page, 220, 25);
  const afterNavigation = await idle(page);
  assert.deepEqual(
    afterNavigation.daylight.sunDirection,
    beforeIdle.daylight.sunDirection,
    "Sun direction followed camera navigation",
  );
  assert.equal(
    afterNavigation.daylight.environmentPreparations,
    beforeIdle.daylight.environmentPreparations,
    "Navigation rebuilt the reflection environment",
  );
  invariant(beforeIdle, afterNavigation);
  await context.close();
  return {
    beforeGesture,
    heldGesture,
    beforeIdle,
    afterIdle,
    afterNavigation,
    note: "3D readiness is observed immediately; actual optional readiness at that boundary is recorded rather than assumed. Frame counter remains stable for 350ms after settling in Leve.",
  };
}

async function hardwareSmoke() {
  const context = await newContext();
  const page = await context.newPage();
  const timing = await open(page);
  await profile(page, "light");
  await page.waitForFunction(() => window.__indumoveisMap?.environmentReadyAt > 0, null, {
    timeout: 12000,
  });
  const initial = await idle(page);
  await gesture(page, "Girar");
  const orbited = await drag(page, 210, -25);
  invariant(initial, orbited);
  await gesture(page, "Mover");
  const panned = await drag(page, 110, 45);
  invariant(initial, panned);
  await page.mouse.wheel(0, -220);
  const zoomed = await idle(page);
  invariant(initial, zoomed);
  await select(page, "70", "Lote 70");
  await closeDetail(page);
  for (const preset of ["Superior", "Oblíqua", "3D"]) await view(page, preset);
  await page.getByRole("button", { name: "Reenquadrar parque", exact: true }).click();
  await idle(page);
  await page.getByRole("button", { name: "Tela cheia", exact: true }).click();
  await page.getByRole("button", { name: "Sair da tela cheia", exact: true }).waitFor();
  await idle(page);
  await page.screenshot({ path: path.join(artifactDir, "hardware-fullscreen.png") });
  await page.getByRole("button", { name: "Sair da tela cheia", exact: true }).click();
  const reentries = [];
  for (let iteration = 1; iteration <= 3; iteration++) {
    await navigateModule(page, "/financeiro");
    await page.locator("canvas").waitFor({ state: "detached" });
    assert.equal((await page.evaluate(() => window.__MAP_LAB__.contexts())).active, 0);
    const started = performance.now();
    await navigateModule(page, "/mapa");
    await page.locator(".im-map-svg,canvas").first().waitFor({ state: "visible" });
    const usefulMs = performance.now() - started;
    await page.locator('.im-map-stage[data-representation="ready"]').waitFor({ timeout: 20000 });
    const ready3DMs = performance.now() - started;
    await profile(page, "light");
    await page.waitForFunction(() => window.__indumoveisMap?.environmentReadyAt > 0, null, {
      timeout: 12000,
    });
    const d = await idle(page);
    reentries.push({
      iteration,
      usefulMs,
      ready3DMs,
      textures: d.textures,
      geometries: d.geometries,
      textureBytes: d.textureBytes,
      contexts: await page.evaluate(() => window.__MAP_LAB__.contexts()),
    });
  }
  assert(reentries.every((r) => r.contexts.active === 1));
  assert(
    reentries.every(
      (r) =>
        r.textureBytes === reentries[0].textureBytes &&
        r.geometries === reentries[0].geometries &&
        r.textures === reentries[0].textures,
    ),
  );
  const rendererInfo = await page.evaluate(() => window.__MAP_LAB__.rendererInfo());
  const final = await idle(page);
  await page.screenshot({ path: path.join(artifactDir, "hardware-final.png") });
  await context.close();
  report.conditions.actualGL = rendererInfo;
  return {
    timing,
    initial,
    orbited,
    panned,
    zoomed,
    reentries,
    final,
    rendererInfo,
    note: "Scripted desktop browser on the available Mac GPU when confirmed by unmaskedRenderer. Mouse/touch are automation; no physical phone, thermal or manual device testing.",
  };
}

async function openingSeries() {
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    const existing = report.openings.filter((row) => row.viewport.width === viewport.width).length;
    for (
      let iteration = existing;
      iteration < Number(process.env.MAP_TERRAIN_OPENING_ITERATIONS ?? 3);
      iteration++
    ) {
      await check(`cold/warm ${viewport.width} sample ${iteration + 1}`, async () => {
        const context = await newContext({ viewport });
        const page = await context.newPage();
        const coldStarted = performance.now();
        const cold = await open(page);
        await profile(page, "balanced");
        await page.waitForFunction(() => window.__indumoveisMap?.environmentBytes > 0, null, {
          timeout: 12000,
        });
        const coldEnvReadyMs = performance.now() - coldStarted;
        const coldDiagnostic = await idle(page);
        await navigateModule(page, "/financeiro");
        await page.locator("canvas").waitFor({ state: "detached" });
        const warmStarted = performance.now();
        await navigateModule(page, "/mapa");
        await page.locator(".im-map-svg,canvas").first().waitFor({ state: "visible" });
        const warmUsefulMs = performance.now() - warmStarted;
        await page
          .locator('.im-map-stage[data-representation="ready"]')
          .waitFor({ timeout: 20000 });
        const warmReady3DMs = performance.now() - warmStarted;
        await profile(page, "balanced");
        await page.waitForFunction(() => window.__indumoveisMap?.environmentBytes > 0, null, {
          timeout: 12000,
        });
        const warmEnvReadyMs = performance.now() - warmStarted;
        const warmDiagnostic = await idle(page);
        const row = {
          viewport,
          iteration: iteration + 1,
          cold: {
            ...cold,
            environmentReadyMs: coldEnvReadyMs,
            essentialProgramsPreparationMs: coldDiagnostic.essentialProgramsPreparationMs,
            terrainPreparationMs: coldDiagnostic.terrainPreparationMs,
            skyPreparationMs: coldDiagnostic.skyPreparationMs,
            environmentPrepareMs: coldDiagnostic.environmentPrepareMs,
            environmentBytes: coldDiagnostic.environmentBytes,
            textureBytes: coldDiagnostic.textureBytes,
            drawCalls: coldDiagnostic.drawCalls,
          },
          warm: {
            usefulMs: warmUsefulMs,
            ready3DMs: warmReady3DMs,
            environmentReadyMs: warmEnvReadyMs,
            essentialProgramsPreparationMs: warmDiagnostic.essentialProgramsPreparationMs,
            terrainPreparationMs: warmDiagnostic.terrainPreparationMs,
            skyPreparationMs: warmDiagnostic.skyPreparationMs,
            environmentPrepareMs: warmDiagnostic.environmentPrepareMs,
            environmentBytes: warmDiagnostic.environmentBytes,
            textureBytes: warmDiagnostic.textureBytes,
            drawCalls: warmDiagnostic.drawCalls,
          },
          rendererInfo: await page.evaluate(() => window.__MAP_LAB__.rendererInfo()),
        };
        report.openings.push(row);
        await context.close();
        return row;
      });
    }
  }
}

try {
  if (process.env.MAP_TERRAIN_OPENINGS_ONLY === "1") {
    await openingSeries();
  } else if (process.env.MAP_TERRAIN_HARDWARE_SMOKE === "1") {
    await check(
      "available desktop GPU gestures selection fullscreen three warm reentries",
      hardwareSmoke,
    );
    await check("early gesture optional preparation light idle stable sun", earlyGestureAndIdle);
  } else if (process.env.MAP_TERRAIN_LIGHTING_ONLY === "1") {
    await lightingEvidence();
  } else if (process.env.MAP_TERRAIN_BENCH_ONLY === "1") {
    const context = await newContext({ viewport: { width: 1280, height: 760 } });
    const page = await context.newPage();
    await open(page);
    await profile(page, "light");
    await page.addStyleTag({
      content:
        ".im-map-workspace{position:fixed!important;inset:0 auto auto 0!important;width:1200px!important;height:656px!important}",
    });
    await page.evaluate(() => {
      const header = document.querySelector(".im-map-header").getBoundingClientRect();
      document
        .querySelector(".im-map-workspace")
        .style.setProperty("height", `${header.height + 600}px`, "important");
    });
    await idle(page);
    for (const tier of ["light", "balanced"]) {
      for (let repetition = 1; repetition <= 3; repetition++) {
        await check(`matched navigation ${tier} repetition ${repetition}`, async () => ({
          ...(await benchmark(page, tier)),
          repetition,
        }));
      }
    }
    await context.close();
  } else {
    const territorySource = await readFile("src/features/commercial-map/data/territory.ts", "utf8");
    const { ENTITIES } = await import(
      `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(territorySource)).toString("base64")}`
    );
    const lot70 = ENTITIES.find((e) => e.id === "indumoveis:external:lot:70");
    for (const viewport of [
      { width: 1366, height: 768 },
      { width: 390, height: 844 },
    ]) {
      const context = await newContext({ viewport });
      const page = await context.newPage();
      await check(`opening ${viewport.width}x${viewport.height}`, async () => {
        const timing = await open(page);
        await profile(page, "light");
        const d = await idle(page);
        await page.screenshot({ path: path.join(artifactDir, `entry-${viewport.width}.png`) });
        assert(d.position[1] > 0 && d.polar < Math.PI / 2);
        const result = { viewport, ...timing, diagnostic: d };
        report.openings.push(result);
        return result;
      });
      await context.close();
    }
    const context = await newContext({ viewport: { width: 1280, height: 760 } });
    const page = await context.newPage();
    await open(page);
    await profile(page, "light");
    await page.addStyleTag({
      content:
        ".im-map-workspace{position:fixed!important;inset:0 auto auto 0!important;width:1200px!important;height:656px!important}",
    });
    await page.evaluate(() => {
      const header = document.querySelector(".im-map-header").getBoundingClientRect();
      document
        .querySelector(".im-map-workspace")
        .style.setProperty("height", `${header.height + 600}px`, "important");
    });
    await idle(page);
    await check("paired five camera evidence", async () => {
      const desired = [
        { name: "overview", ...poseFor([95.5, 55], 230, 0.84) },
        { name: "low-oblique", ...poseFor([95.5, 55], 230, 1.1) },
        { name: "perimeter", ...poseFor([24, 80], 42, 0.95) },
        { name: "near", ...poseFor(lot70.anchor, 18, 0.65) },
        { name: "far", ...poseFor([95.5, 55], 250, 0.84) },
      ];
      for (const requested of desired) {
        const pair = reference?.captures.find((row) => row.name === requested.name)?.pose;
        const result = await capture(page, requested.name, pair ?? requested);
        assert(result.samePose, `${requested.name}: paired camera pose was changed/clamped`);
        assert(
          Math.abs(result.canvas.width - 1200) < 1 && Math.abs(result.canvas.height - 600) < 1,
        );
      }
      return report.captures;
    });
    await check("orbit pan zoom preserve commercial transforms", async () => {
      await view(page, "3D");
      await page.getByRole("button", { name: "Reenquadrar parque", exact: true }).click();
      const before = await idle(page),
        samples = [];
      await gesture(page, "Girar");
      for (let i = 0; i < 8; i++) {
        const d = await drag(page, 220, i % 2 ? -35 : 35);
        invariant(before, d);
        samples.push(d);
      }
      await gesture(page, "Mover");
      for (const [dx, dy] of [
        [650, 0],
        [-650, 0],
        [0, 350],
        [0, -350],
      ]) {
        const d = await drag(page, dx, dy);
        invariant(before, d);
        samples.push(d);
      }
      for (let i = 0; i < 18; i++)
        await page.getByRole("button", { name: "Aproximar", exact: true }).click();
      const near = await idle(page);
      invariant(before, near);
      await capture(page, "actual-minimum");
      for (let i = 0; i < 36; i++)
        await page.getByRole("button", { name: "Afastar", exact: true }).click();
      const far = await idle(page);
      invariant(before, far);
      await capture(page, "actual-maximum");
      await page.getByRole("button", { name: "Afastar", exact: true }).click();
      const repeatedFar = await idle(page);
      assert(
        Math.abs(repeatedFar.distance - far.distance) < 0.02,
        "Repeated zoom-out never reaches a stable bound",
      );
      assert(near.position[1] > 0 && samples.every((d) => d.position[1] > 0));
      return { before, near, far, repeatedFar, samples };
    });
    await check("peripheral search click hover and presets", async () => {
      const selected = [];
      for (const [query, name] of [
        ["70", "Lote 70"],
        ["01", "Lote 01"],
        ["Pavilhão 14", "Pavilhão 14 · SINDUSCOM"],
      ]) {
        await select(page, query, name);
        const d = await idle(page);
        assert(d.lastSelectedId);
        selected.push(d);
        for (const label of ["Superior", "Oblíqua", "3D"]) {
          await view(page, label);
          assert.equal((await diagnostic(page)).lastSelectedId, d.lastSelectedId);
        }
        await closeDetail(page);
      }
      await page.getByRole("button", { name: "Reenquadrar parque", exact: true }).click();
      await idle(page);
      const point = await page.evaluate(() =>
        window.__indumoveisMap.project("indumoveis:external:lot:70", 0),
      );
      const canvas = await page.locator("canvas").boundingBox();
      await page.mouse.move(canvas.x + point.x, canvas.y + point.y);
      assert.equal(await page.locator("canvas").evaluate((c) => c.style.cursor), "pointer");
      await page.mouse.click(canvas.x + point.x, canvas.y + point.y);
      await page.getByRole("heading", { name: "Lote 70", exact: true }).waitFor();
      if (phase === "after") {
        const picked = await page.evaluate(
          ({ x, y }) => window.__indumoveisMap.pickAt(x, y),
          point,
        );
        assert.equal(picked, "indumoveis:external:lot:70");
        const terrainOnly = await page.evaluate(() => window.__indumoveisMap.pickAt(8, 8));
        assert.equal(terrainOnly, null, "External terrain intercepted commercial picking");
      }
      await closeDetail(page);
      return { selected, clicked: await diagnostic(page) };
    });
    for (const tier of ["light", "balanced"])
      await check(
        `${Number(process.env.MAP_TERRAIN_BENCH_MS ?? 30000) / 1000}s matched navigation ${tier}`,
        () => benchmark(page, tier),
      );
    await context.close();
    await check("maps unavailable retains usable terrain", async () => {
      const context = await newContext();
      const page = await context.newPage();
      await open(page, "mapSurfaceMaps=off&mapTerrainMaps=off");
      await profile(page, "light");
      await page.screenshot({ path: path.join(artifactDir, "maps-unavailable.png") });
      const d = await idle(page);
      await select(page, "70", "Lote 70");
      if (phase === "after") assert(d.terrain, "Missing terrain diagnostic in fallback");
      await context.close();
      return d;
    });
    await check("vertical orientation fullscreen reentry resource plateau", async () => {
      const context = await newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await open(page);
      await profile(page, "light");
      await select(page, "70", "Lote 70");
      const before = await idle(page);
      const cdp = await context.newCDPSession(page);
      const canvas = await page.locator("canvas").boundingBox();
      const touchX = canvas.x + canvas.width * 0.5;
      const touchY = canvas.y + canvas.height * 0.25;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: touchX - 30, y: touchY, id: 1 },
          { x: touchX + 30, y: touchY, id: 2 },
        ],
      });
      for (let step = 1; step <= 8; step++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { x: touchX - 30 - step * 6, y: touchY + step * 2, id: 1 },
            { x: touchX + 30 + step * 6, y: touchY + step * 2, id: 2 },
          ],
        });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      const pinched = await idle(page);
      invariant(before, pinched);
      assert.equal(
        pinched.lastSelectedId,
        before.lastSelectedId,
        "Synthetic pinch changed commercial selection",
      );
      await page.setViewportSize({ width: 844, height: 390 });
      const landscape = await idle(page);
      assert.equal(before.instance, landscape.instance);
      assert.equal(landscape.lastSelectedId, before.lastSelectedId);
      await page.getByRole("button", { name: "Tela cheia", exact: true }).click();
      await page.getByRole("button", { name: "Sair da tela cheia", exact: true }).waitFor();
      await page.screenshot({ path: path.join(artifactDir, "mobile-fullscreen.png") });
      const fullscreen = await idle(page);
      assert.equal(fullscreen.instance, before.instance);
      await page.getByRole("button", { name: "Sair da tela cheia", exact: true }).click();
      await closeDetail(page);
      const rows = [];
      for (let i = 0; i < 4; i++) {
        await navigateModule(page, "/financeiro");
        await page.locator("canvas").waitFor({ state: "detached" });
        assert.equal((await page.evaluate(() => window.__MAP_LAB__.contexts())).active, 0);
        await navigateModule(page, "/mapa");
        await page
          .locator('.im-map-stage[data-representation="ready"]')
          .waitFor({ timeout: 20000 });
        await profile(page, "light");
        await page.waitForTimeout(850);
        const d = await idle(page);
        assert.equal((await page.evaluate(() => window.__MAP_LAB__.contexts())).active, 1);
        rows.push({
          textures: d.textures,
          geometries: d.geometries,
          programs: d.programs,
          textureBytes: d.textureBytes,
          contexts: await page.evaluate(() => window.__MAP_LAB__.contexts()),
        });
      }
      assert(
        rows
          .slice(1)
          .every(
            (d) =>
              d.textures === rows[0].textures &&
              d.geometries === rows[0].geometries &&
              d.textureBytes === rows[0].textureBytes,
          ),
        "Resource totals grow across reopenings",
      );
      await context.close();
      return {
        before,
        pinched,
        landscape,
        fullscreen,
        rows,
        note: "SPA navigation checks live-context detachment and identical resident resource totals after reopening; not a heap-leak proof.",
      };
    });
    if (phase.startsWith("after")) {
      await check(
        "first visible map search preserves selection at 3D handoff",
        preparationInteraction,
      );
      await check("early gesture optional preparation light idle stable sun", earlyGestureAndIdle);
    }
  }
} catch (error) {
  report.errors.push(error.stack ?? String(error));
  process.exitCode = 1;
} finally {
  if (report.errors.length) process.exitCode = 1;
  report.summary = {
    passed: report.checks.filter((c) => c.passed).length,
    failed: report.checks.filter((c) => !c.passed).length,
  };
  await browser.close();
  await writeFile(
    path.join(artifactDir, "terrain-validation.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({ artifactDir, summary: report.summary, errors: report.errors.length }),
  );
}
