/** Focused realism/browser laboratory. Baseline commit 930088e, prior terrain/daylight PR. Local intercepted fixtures only.
 * Build before and after from the same source revision boundary, then:
 * MAP_BASE_URL=http://127.0.0.1:4190 MAP_REALISM_PHASE=before node scripts/commercial-map-realism-validation.mjs
 * MAP_BASE_URL=http://127.0.0.1:4206 MAP_REALISM_PHASE=after MAP_REALISM_REFERENCE=artifacts.local/commercial-map-realism/before/realism-validation.json node scripts/commercial-map-realism-validation.mjs
 * Defaults to the host GPU; actual renderer identification is recorded. This is not physical-phone validation.
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

process.env.MAP_BROWSER_GPU ??= "hardware";
const baseURL = process.env.MAP_BASE_URL ?? "http://127.0.0.1:3000";
const phase = process.env.MAP_REALISM_PHASE ?? "after";
const mode = "realism";
const artifactDir = path.resolve(
  process.env.MAP_ARTIFACT_DIR ?? `artifacts.local/commercial-map-realism/${phase}`,
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
    optionalContextAssets: [],
    usabilityParticipants: "None; scripted objective journeys only",
    httpCache:
      "Disabled by Playwright request routing; warm means SPA/module reentry in the same document, not a cached HTTP load",
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
        /hydration|hydrating|did not match|server rendered HTML|Minified React error #(?:418|423|425)|THREE\.WebGLProgram|Shader Error|VALIDATE_STATUS|shader.*compile/i.test(
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
      const NativeWorker = window.Worker;
      const workers = new Set();
      const workerUrls = [];
      const workerEvents = [];
      let createdWorkers = 0,
        terminatedWorkers = 0;
      if (NativeWorker)
        window.Worker = class extends NativeWorker {
          constructor(url, options) {
            super(url, options);
            createdWorkers++;
            workers.add(this);
            workerUrls.push(String(url));
            workerEvents.push({ kind: "created", atMs: performance.now(), url: String(url) });
          }
          terminate() {
            if (workers.delete(this)) {
              terminatedWorkers++;
              workerEvents.push({ kind: "terminated", atMs: performance.now() });
            }
            return super.terminate();
          }
        };
      window.__MAP_LAB__ = {
        workers: () => ({
          created: createdWorkers,
          terminated: terminatedWorkers,
          active: workers.size,
          urls: [...workerUrls],
          events: [...workerEvents],
        }),
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
            gpuTimerQueryAvailable: Boolean(gl.getExtension("EXT_disjoint_timer_query_webgl2")),
            gpuMemoryMeasurement: "unavailable through WebGL; resource bytes are estimates",
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
  context.on("response", async (response) => {
    const url = response.url();
    if (
      /\.(?:ktx2|basis|wasm|png|jpe?g|webp)(?:\?|$)|(?:basis_transcoder|decoder|worker|urbanContext)[^/]*\.js/i.test(
        url,
      )
    ) {
      report.assetResponses ??= [];
      report.assetResponses.push({
        url,
        status: response.status(),
        contentType: response.headers()["content-type"],
        contentLength: response.headers()["content-length"],
      });
    }
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      url.origin === new URL(baseURL).origin &&
      /\/MapRenderer-[^/]+\.js$/.test(url.pathname) &&
      !report.conditions.rendererAssets.includes(url.pathname)
    )
      report.conditions.rendererAssets.push(url.pathname);
    if (
      url.origin === new URL(baseURL).origin &&
      /\/urbanContext-[^/]+\.js$/.test(url.pathname) &&
      !report.conditions.optionalContextAssets.includes(url.pathname)
    )
      report.conditions.optionalContextAssets.push(url.pathname);
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

const reference = process.env.MAP_REALISM_REFERENCE
  ? JSON.parse(await readFile(process.env.MAP_REALISM_REFERENCE, "utf8"))
  : null;
if (process.env.MAP_REALISM_OPENINGS_APPEND === "1") {
  const previous = JSON.parse(
    await readFile(path.join(artifactDir, "realism-validation.json"), "utf8"),
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
    const data = {
      ...d,
      decoderWorkers: window.__MAP_LAB__?.workers?.(),
      jsHeap: performance.memory
        ? {
            usedBytes: performance.memory.usedJSHeapSize,
            totalBytes: performance.memory.totalJSHeapSize,
            limitBytes: performance.memory.jsHeapSizeLimit,
            method: "browser performance.memory; may be coarsened; not GPU memory",
          }
        : null,
      bufferPixels: d.buffer?.[0] * d.buffer?.[1],
      adaptiveResolution: d.realism?.adaptiveResolution ?? 1,
    };
    if (d.navigation) {
      const { protectedRegions, navigationRegions, ...envelope } = d.navigation;
      const regions = navigationRegions ?? protectedRegions ?? [];
      data.navigation = {
        ...envelope,
        protectedRegionCount: protectedRegions?.length,
        navigationRegionCount: regions.length,
      };
      // Independent screen-space witness: some approved/context surface must
      // remain visible, even when the target is outside an irregular polygon.
      const point = d.target;
      let nearest,
        squared = Infinity;
      for (const { polygon } of regions) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const a = polygon[i],
            b = polygon[j];
          if (
            a[1] > point[1] !== b[1] > point[1] &&
            point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
          )
            inside = !inside;
          const dx = b[0] - a[0],
            dz = b[1] - a[1];
          const t = Math.max(
            0,
            Math.min(
              1,
              ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz || 1),
            ),
          );
          const candidate = [a[0] + t * dx, a[1] + t * dz];
          const distance = (candidate[0] - point[0]) ** 2 + (candidate[1] - point[1]) ** 2;
          if (distance < squared) {
            squared = distance;
            nearest = candidate;
          }
        }
        if (inside) {
          squared = 0;
          nearest = point;
          break;
        }
      }
      if (nearest && document.querySelector("canvas")) {
        const delta = [d.position[0] - point[0], d.position[1], d.position[2] - point[1]];
        const length = Math.hypot(...delta),
          backward = delta.map((v) => v / length);
        const flat = Math.hypot(backward[0], backward[2]);
        const right = [backward[2] / flat, 0, -backward[0] / flat];
        const up = [
          backward[1] * right[2],
          backward[2] * right[0] - backward[0] * right[2],
          -backward[1] * right[0],
        ];
        const relative = [nearest[0] - d.position[0], -d.position[1], nearest[1] - d.position[2]];
        const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
        const depth = -dot(relative, backward),
          rect = document.querySelector("canvas")?.getBoundingClientRect();
        const tangent = Math.tan((38 * Math.PI) / 360);
        data.navigationWitness = {
          point: nearest,
          distanceToTarget: Math.sqrt(squared),
          depth,
          ndc: [
            dot(relative, right) / (depth * tangent * (rect.width / rect.height)),
            dot(relative, up) / (depth * tangent),
          ],
        };
      }
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
  const ready3DMs = performance.now() - start;
  await idle(page);
  return { usefulMs, ready3DMs };
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
    await page.waitForFunction(
      () =>
        window.__indumoveisMap?.realism?.ready === true &&
        window.__indumoveisMap.environmentReadyAt > 0,
      null,
      {
        timeout: 12000,
      },
    );
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
    path.join(artifactDir, "realism-validation.json"),
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
  if (phase.startsWith("after")) {
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
    if (after.navigationWitness) {
      assert(
        after.navigationWitness.depth > 0 &&
          after.navigationWitness.ndc.every(
            (value) => Number.isFinite(value) && Math.abs(value) <= 1.001,
          ),
        "No useful commercial/context surface remains in the camera viewport",
      );
    }
  }
}
async function benchmark(page, tier) {
  await profile(page, tier);
  if (phase.startsWith("after"))
    await page.waitForFunction(
      () =>
        window.__indumoveisMap?.realism?.ready === true &&
        window.__indumoveisMap.environmentReadyAt > 0,
      null,
      {
        timeout: 12000,
      },
    );
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
    peaks = { drawCalls: 0, triangles: 0, textures: 0, textureBytes: 0, dpr: 0, bufferPixels: 0 };
  let minimumAdaptiveResolution = 1;
  let rounds = 0;
  while (performance.now() - start < Number(process.env.MAP_REALISM_BENCH_MS ?? 30000)) {
    const x = rect.x + rect.width * 0.42,
      y = rect.y + rect.height * 0.46;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (rounds % 2 ? -90 : 90), y + (rounds % 2 ? -12 : 12), { steps: 24 });
    await page.mouse.up();
    await page.mouse.wheel(0, rounds % 2 ? -60 : 60);
    const sample = await diagnostic(page);
    for (const field of Object.keys(peaks)) peaks[field] = Math.max(peaks[field], sample[field]);
    minimumAdaptiveResolution = Math.min(minimumAdaptiveResolution, sample.adaptiveResolution);
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
    minimumAdaptiveResolution,
    finalRealism: d.realism,
    jsHeap: d.jsHeap,
    submittedFrameIntervalsMs: intervals,
    cpuSubmissionDurationsMs: d.renderDurations,
    cpuSubmissionP50Ms: percentile(d.renderDurations, 0.5),
    cpuSubmissionP95Ms: percentile(d.renderDurations, 0.95),
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
              d.navigation.viewCenter ?? [95.5, 55],
              d.navigation.maxDistance,
              d.navigation.maxPolarAngle,
            ),
          );
        if (phase.startsWith("after")) {
          for (const [name, azimuth] of [
            ["east", 2.2],
            ["west", 4.3],
          ])
            await capture(
              page,
              `daylight-horizon-allowed-${name}`,
              poseFor(
                d.navigation.viewCenter ?? [95.5, 55],
                d.navigation.maxDistance,
                d.navigation.maxPolarAngle,
                azimuth,
              ),
            );
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
      let detailedShadow;
      if (phase.startsWith("after") && !scenario.query) {
        await profile(page, "detailed");
        await page.waitForTimeout(400);
        const before = await idle(page);
        await capture(page, "realism-detailed-roof-shadows", poseFor([92, 82], 60, 0.94, 0.68));
        await gesture(page, "Girar");
        await drag(page, 180, -15);
        const after = await idle(page);
        assert.equal(
          after.realism.shadows.updates,
          before.realism.shadows.updates,
          "Camera orbit rebuilt static sun shadow maps",
        );
        await capture(page, "realism-detailed-shadows-after-orbit");
        detailedShadow = { before, after };
      }
      await select(page, "70", "Lote 70");
      const selected = await idle(page);
      assert.equal(selected.lastSelectedId, "indumoveis:external:lot:70");
      if (scenario.query === "mapEnvironment=fail") assert.equal(d.environmentBytes, 0);
      await context.close();
      return {
        query: scenario.query,
        diagnostic: d,
        selected: selected.lastSelectedId,
        detailedShadow,
      };
    });
  }
}

async function automaticStress() {
  assert.equal(
    process.env.MAP_BROWSER_GPU,
    "software",
    "Software stress requires MAP_BROWSER_GPU=software",
  );
  const context = await newContext();
  const failedOptionalModules = [];
  if (process.env.MAP_REALISM_STRESS_CONTEXT_404 === "1")
    await context.route("**/urbanContext-*.js", async (route) => {
      failedOptionalModules.push(route.request().url());
      await route.fulfill({
        status: 404,
        contentType: "text/plain",
        body: "Isolated software diagnostic: optional context omitted",
      });
    });
  const page = await context.newPage();
  const opening = await open(page);
  await page.waitForFunction(() => window.__indumoveisMap?.environmentReadyAt > 0, null, {
    timeout: 30000,
  });
  if (phase.startsWith("after"))
    await page.waitForFunction(
      () =>
        window.__indumoveisMap?.realism?.ready === true &&
        window.__indumoveisMap.environmentReadyAt > 0,
      null,
      { timeout: 30000 },
    );
  await auxiliary(page, "Opções de visualização");
  await page.getByRole("combobox", { name: "Qualidade gráfica", exact: true }).selectOption("auto");
  await page.getByRole("button", { name: "Fechar menu", exact: true }).click();
  await idle(page);
  await gesture(page, "Girar");
  const before = await diagnostic(page),
    samples = [];
  const rendererInfoAtStart = await page.evaluate(() => window.__MAP_LAB__.rendererInfo());
  const began = performance.now();
  const rect = await page.locator("canvas").boundingBox();
  let round = 0;
  while (performance.now() - began < 20000) {
    const representation = await page.locator(".im-map-stage").getAttribute("data-representation");
    const d = await diagnostic(page);
    samples.push({
      elapsedMs: performance.now() - began,
      representation,
      instance: d.instance,
      tier: d.tier,
      adaptiveResolution: d.realism?.adaptiveResolution ?? 1,
      dpr: d.dpr,
      buffer: d.buffer,
      distance: d.distance,
      frameP95Last60Ms: percentile(d.frameIntervals.slice(-60), 0.95),
      cpuSubmissionP95Last60Ms: percentile(d.renderDurations.slice(-60), 0.95),
      recentFrameSamples: Math.min(60, d.frameIntervals.length),
      active: d.active,
      failureReason: d.failureReason,
    });
    if (representation !== "ready") break;
    const x = rect.x + rect.width * 0.42,
      y = rect.y + rect.height * 0.45;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (round % 2 ? -80 : 80), y + (round % 2 ? -14 : 14), { steps: 20 });
    await page.mouse.up();
    await page.mouse.wheel(0, round % 2 ? -70 : 70);
    round++;
  }
  await page.waitForTimeout(1500);
  const representation = await page.locator(".im-map-stage").getAttribute("data-representation");
  const after = await diagnostic(page);
  await page.screenshot({ path: path.join(artifactDir, "automatic-software-after-settle.png") });
  const rendererInfoAtEnd = await page.evaluate(() => window.__MAP_LAB__.rendererInfo());
  const rendererInfo = rendererInfoAtEnd ?? rendererInfoAtStart;
  assert.match(
    rendererInfo.unmaskedRenderer,
    /SwiftShader/i,
    "Software stress did not use actual SwiftShader",
  );
  if (representation === "ready") {
    invariant(before, after);
    assert.equal(after.instance, before.instance, "Adaptive resolution recreated the Canvas");
    assert(
      samples.every((sample) => sample.representation === "ready"),
      "A non-ready segment cannot be claimed as sustained 3D",
    );
    assert(
      performance.now() - began >= 20000 && round > 0,
      "Sustained 3D stress did not complete its duration",
    );
  } else {
    await page.getByRole("button", { name: "Buscar lote, pavilhão ou via", exact: true }).click();
    await page.getByRole("textbox", { name: "Lote, pavilhão ou via", exact: true }).fill("70");
    await page
      .locator(".im-map-result")
      .filter({ has: page.getByText("Lote 70", { exact: true }) })
      .first()
      .click();
    await page.getByRole("heading", { name: "Lote 70", exact: true }).waitFor();
  }
  await context.close();
  return {
    opening,
    before,
    after,
    samples,
    representation,
    outcome: representation === "ready" ? "sustained-3D" : "automatic-2D-fallback-with-selection",
    rendererInfo,
    rendererInfoSource: rendererInfoAtEnd
      ? "final active 3D context"
      : "initial 3D context before automatic fallback",
    fallbackSelectionHeading: representation === "ready" ? null : "Lote 70",
    diagnosticIsolation:
      process.env.MAP_REALISM_STRESS_CONTEXT_404 === "1"
        ? {
            failedOptionalModules,
            note: "Diagnostic only: omits urban/woodland/lot-grass factories and leaves initial Lambert foundations/lot floors rather than successful PBR progression; cannot certify the full scene.",
          }
        : null,
    durationMs: performance.now() - began,
    rounds: round,
    note: "Real software rendering with automatic quality and scripted gestures; 1500ms settled segment is an observed recovery period, not an assertion that the policy must restore full resolution while idle. No emulated phone GPU or synthetic RAF intervals.",
  };
}

async function realismDetails() {
  const source = await readFile("src/features/commercial-map/data/territory.ts", "utf8");
  const { TREES, ENTITIES } = await import(
    `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
  );
  for (const scenario of [
    { name: "realism-normal", query: "" },
    ...(phase.startsWith("after") && !process.env.MAP_REALISM_DETAILS_NORMAL_ONLY
      ? [
          { name: "realism-pbr-failure", query: "mapPbr=fail" },
          { name: "realism-pbr-network-failure", query: "", networkFailure: true },
        ]
      : []),
  ]) {
    await check(scenario.name, async () => {
      const context = await newContext({ viewport: { width: 1280, height: 760 } });
      const failedAtlasRequests = [];
      if (scenario.networkFailure)
        await context.route("**/*normal.ktx2*", async (route) => {
          failedAtlasRequests.push(route.request().url());
          await route.fulfill({
            status: 404,
            contentType: "text/plain",
            body: "Map laboratory: missing normal atlas",
          });
        });
      const page = await context.newPage();
      const opening = await open(page, scenario.query);
      await profile(page, "balanced");
      if (phase.startsWith("after"))
        await page.waitForFunction(
          () =>
            window.__indumoveisMap?.realism?.ready === true &&
            window.__indumoveisMap.environmentReadyAt > 0,
          null,
          {
            timeout: 30000,
          },
        );
      if (!scenario.query && !scenario.networkFailure) {
        await capture(page, `${scenario.name}-initial`);
        await page.screenshot({
          path: path.join(artifactDir, `${scenario.name}-initial-page.png`),
        });
      }
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
      const details = [
        {
          name: "grass-close",
          ...poseFor(
            ENTITIES.find((entity) => entity.id === "indumoveis:external:lot:70").anchor,
            18,
            1.1,
            0.55,
          ),
        },
        { name: "tree-close", ...poseFor(TREES[4], 23, 0.92, 1.8) },
        { name: "urban-context", ...poseFor([63, 126], 155, 0.92, 0.05) },
        { name: "urban-close", ...poseFor([60, 137], 50, 1.1, 0.1) },
        { name: "urban-mid", ...poseFor([65, 126], 110, 0.95, 0.1) },
        { name: "urban-oblique-reverse", ...poseFor([65, 126], 110, 0.95, 3.2) },
        { name: "urban-close-reverse", ...poseFor([60, 137], 50, 0.9, 3.2) },
        { name: "urban-top-close", ...poseFor([60, 137], 75, 0.2, 0.1) },
        { name: "avenue-single", ...poseFor([67, 102], 180, 1.15, 0.05) },
        { name: "topology-top", ...poseFor([60, 124], 190, 0.2, 0.05) },
        { name: "topology-complete", ...poseFor([35, 76], 420, 0.12, 0.05) },
        { name: "roundabout-primary", ...poseFor([-52.7553, 96.4276], 90, 0.3, 0.05) },
        { name: "roundabout-secondary", ...poseFor([-101.7387, 61.6718], 80, 0.4, 0.05) },
        { name: "park-west-approach", ...poseFor([-18, 22], 170, 0.3, 0.05) },
        { name: "woodland-context", ...poseFor([-17, 65], 70, 0.85, 0.4) },
        { name: "concrete-close", ...poseFor([58.5, 90], 22, 0.85, 0.4) },
      ];
      for (const requested of scenario.networkFailure ? [] : details) {
        const name = `${scenario.name}-${requested.name}`;
        const paired = reference?.captures.find((r) => r.name === name)?.pose;
        await capture(page, name, paired ?? requested);
      }
      await page.evaluate(
        ({ position, target }) => window.__indumoveisMap.setReferencePose(position, target),
        poseFor([95.5, 55], 230, 0.84),
      );
      await idle(page);
      const avenuePicked = await page.evaluate(() => {
        const point = window.__indumoveisMap.project("indumoveis:road:benvenuto", 0);
        const rect = document.querySelector("canvas").getBoundingClientRect();
        if (!point || point.x < 0 || point.y < 0 || point.x > rect.width || point.y > rect.height)
          throw new Error("Avenue picking witness is outside the visible canvas");
        return window.__indumoveisMap.pickAt(point.x, point.y);
      });
      assert.equal(
        avenuePicked,
        "indumoveis:road:benvenuto",
        "Residential context intercepted the original avenue",
      );
      await select(page, "70", "Lote 70");
      const final = await idle(page);
      assert.equal(final.lastSelectedId, "indumoveis:external:lot:70");
      if (phase.startsWith("after")) {
        assert(final.realism, "Missing integrated realism metadata");
        if (scenario.query || scenario.networkFailure)
          assert.equal(
            final.realism.pbr.loaded,
            false,
            "Forced PBR failure still reports loaded atlas",
          );
        else
          assert.equal(
            final.realism.pbr.loaded,
            true,
            "Primary compressed atlas failed in supported laboratory",
          );
        assert(
          final.realism.urban.houseCount === Number(process.env.MAP_REALISM_EXPECTED_HOUSES ?? 32),
          "Residential count differs from the reviewed context expected by this laboratory",
        );
        if (scenario.networkFailure) {
          assert(failedAtlasRequests.length > 0, "Normal atlas request was not intercepted");
          assert.equal(
            final.realism.pbr.source,
            "procedural",
            "Missing atlas did not preserve procedural fallback",
          );
          assert.equal(final.decoderWorkers.active, 0, "Decoder worker survived atlas failure");
        }
      }
      const rendererInfo = await page.evaluate(() => window.__MAP_LAB__.rendererInfo());
      await context.close();
      return {
        query: scenario.query,
        failedAtlasRequests,
        avenuePicked,
        opening,
        final,
        rendererInfo,
      };
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

async function preparationPanHandoff(action = "pan") {
  const context = await newContext();
  const page = await context.newPage();
  let release;
  const moduleGate = new Promise((resolve) => {
    release = resolve;
  });
  let heldRequests = 0;
  await page.route("**/assets/MapRenderer-*.js", async (route) => {
    heldRequests++;
    await moduleGate;
    await route.continue();
  });
  try {
    await page.goto(`${baseURL}/mapa?mapDiagnostics=1`, { waitUntil: "domcontentloaded" });
    const svg = page.locator(".im-map-svg");
    await svg.waitFor({ state: "visible" });
    const before = await svg.getAttribute("viewBox");
    let expected;
    if (action === "pan") {
      const rect = await svg.boundingBox();
      await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(rect.x + rect.width * 0.65, rect.y + rect.height * 0.6, { steps: 8 });
      await page.mouse.up();
      const box = (await svg.getAttribute("viewBox")).split(/\s+/).map(Number);
      expected = [box[0] + box[2] / 2, box[1] + box[3] / 2];
    } else {
      const source = await readFile("src/features/commercial-map/data/territory.ts", "utf8");
      const { ENTITIES } = await import(
        `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
      );
      expected = ENTITIES.find((entity) => entity.id === "indumoveis:external:lot:70").anchor;
      await page.getByRole("button", { name: "Buscar lote, pavilhão ou via", exact: true }).click();
      await page.getByRole("textbox", { name: "Lote, pavilhão ou via", exact: true }).fill("70");
      await page
        .locator(".im-map-result")
        .filter({ has: page.getByText("Lote 70", { exact: true }) })
        .first()
        .click();
      await page.getByRole("heading", { name: "Lote 70", exact: true }).waitFor();
    }
    const after = await svg.getAttribute("viewBox");
    if (action === "pan") assert.notEqual(after, before, "Preparation SVG pan was ignored");
    assert(heldRequests > 0, "Renderer module gate did not intercept an actual request");
    release();
    await page.locator('.im-map-stage[data-representation="ready"]').waitFor({ timeout: 20000 });
    const final = await idle(page);
    if (action === "pan")
      assert(
        Math.hypot(final.target[0] - expected[0], final.target[1] - expected[1]) < 0.02,
        "First 3D presentation discarded the user-pan target from the preparation map",
      );
    else {
      assert.equal(final.lastSelectedId, "indumoveis:external:lot:70");
      const witness = await page.evaluate(() => {
        const point = window.__indumoveisMap.project("indumoveis:external:lot:70", 0);
        const canvas = document.querySelector("canvas").getBoundingClientRect();
        const detail = document.querySelector(".im-map-detail")?.getBoundingClientRect();
        const x = canvas.left + point.x,
          y = canvas.top + point.y;
        return {
          point,
          inCanvas: point.x > 0 && point.x < canvas.width && point.y > 0 && point.y < canvas.height,
          coveredByDetail:
            detail &&
            x >= detail.left &&
            x <= detail.right &&
            y >= detail.top &&
            y <= detail.bottom,
          picked: window.__indumoveisMap.pickAt(point.x, point.y),
        };
      });
      assert(
        witness.inCanvas && !witness.coveredByDetail,
        "Pending selection is obscured after 3D handoff",
      );
      assert.equal(witness.picked, "indumoveis:external:lot:70");
      final.selectionWitness = witness;
    }
    return {
      action,
      before,
      after,
      expectedTarget: expected,
      final,
      note: "Functional loading-handshake test holds the real renderer-module HTTP response until an SVG action finishes; not an opening or performance measurement.",
    };
  } finally {
    release();
    await context.close();
  }
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

async function softwareProfileRestoration() {
  assert.equal(process.env.MAP_BROWSER_GPU, "software");
  const context = await newContext();
  try {
    const page = await context.newPage();
    const opening = await open(page);
    await page.waitForFunction(() => window.__indumoveisMap?.realism?.ready === true, null, {
      timeout: 30000,
    });
    const rendererInfo = await page.evaluate(() => window.__MAP_LAB__.rendererInfo());
    assert.match(rendererInfo.unmaskedRenderer, /SwiftShader/i);
    await select(page, "70", "Lote 70");
    const before = await idle(page);
    assert.equal(before.realism.softwareRasterizer, true);
    await auxiliary(page, "Opções de visualização");
    await page
      .getByRole("combobox", { name: "Qualidade gráfica", exact: true })
      .selectOption("light");
    await page.getByRole("button", { name: "Fechar menu", exact: true }).click();
    await page.waitForFunction(() => window.__indumoveisMap?.dpr >= 0.99, null, { timeout: 20000 });
    const manual = await idle(page);
    invariant(before, manual);
    assert.equal(manual.instance, before.instance);
    assert.equal(manual.lastSelectedId, "indumoveis:external:lot:70");
    assert(manual.bufferPixels > before.bufferPixels, "Manual profile did not restore full buffer");
    await auxiliary(page, "Opções de visualização");
    await page
      .getByRole("combobox", { name: "Qualidade gráfica", exact: true })
      .selectOption("auto");
    await page.getByRole("button", { name: "Fechar menu", exact: true }).click();
    await page.waitForFunction(() => window.__indumoveisMap?.dpr < 0.8, null, { timeout: 20000 });
    const automatic = await idle(page);
    invariant(before, automatic);
    assert.equal(automatic.instance, before.instance);
    assert.equal(automatic.lastSelectedId, "indumoveis:external:lot:70");
    for (const snapshot of [manual, automatic]) {
      assert(Math.abs(snapshot.distance - before.distance) < 0.02, "Quality mode changed zoom");
      assert(
        Math.hypot(snapshot.target[0] - before.target[0], snapshot.target[1] - before.target[1]) <
          0.02,
        "Quality mode changed orbital target",
      );
    }
    assert.equal(automatic.decoderWorkers.active, 0);
    const contexts = await page.evaluate(() => window.__MAP_LAB__.contexts());
    assert.equal(contexts.active, 1);
    return {
      opening,
      rendererInfo,
      before,
      manual,
      automatic,
      contexts,
      note: "Separate functional Auto→manual Light→Auto trial after primary measurement; verifies idle activation, buffer restoration, camera/selection/context continuity. Canonical PBR material identity is covered by unit tests, not inferred solely from program counts.",
    };
  } finally {
    await context.close();
  }
}

async function optionalContextFailure() {
  const context = await newContext({ viewport: { width: 1280, height: 760 } });
  const failedModuleRequests = [];
  try {
    await context.route("**/urbanContext-*.js", async (route) => {
      failedModuleRequests.push(route.request().url());
      await route.fulfill({
        status: 404,
        contentType: "text/plain",
        body: "Map laboratory: missing optional residential module",
      });
    });
    const page = await context.newPage();
    const opening = await open(page);
    await page.waitForFunction(
      () =>
        window.__indumoveisMap?.realism?.ready === true &&
        window.__indumoveisMap.optionalFailures.includes("context-preparation"),
      null,
      { timeout: 30000 },
    );
    const before = await idle(page);
    assert(failedModuleRequests.length > 0, "Optional module request was not intercepted");
    assert.equal(before.realism.urban, null, "A failed optional module installed urban geometry");
    assert.equal(
      before.realism.pbr.loaded,
      true,
      "Optional context failure disabled shared materials",
    );
    await select(page, "70", "Lote 70");
    const after = await idle(page);
    invariant(before, after);
    assert.equal(after.lastSelectedId, "indumoveis:external:lot:70");
    assert.equal(after.active, true);
    assert.equal(after.decoderWorkers.active, 0);
    return {
      opening,
      failedModuleRequests,
      before,
      after,
      note: "A real HTTP404 for the deferred urban module is handled independently of the usable commercial core. Expected network console output is retained in the raw report.",
    };
  } finally {
    await context.close();
  }
}

async function openingSeries() {
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    if (
      process.env.MAP_REALISM_OPENING_WIDTHS &&
      !process.env.MAP_REALISM_OPENING_WIDTHS.split(",").map(Number).includes(viewport.width)
    )
      continue;
    const existing = report.openings.filter((row) => row.viewport.width === viewport.width).length;
    for (
      let iteration = existing;
      iteration < Number(process.env.MAP_REALISM_OPENING_ITERATIONS ?? 3);
      iteration++
    ) {
      await check(`cold/warm ${viewport.width} sample ${iteration + 1}`, async () => {
        const context = await newContext({ viewport });
        let page;
        try {
          page = await context.newPage();
          const coldStarted = performance.now();
          const cold = await open(page);
          await profile(page, "balanced");
          await page.waitForFunction(() => window.__indumoveisMap?.environmentBytes > 0, null, {
            timeout: 12000,
          });
          if (phase.startsWith("after"))
            await page.waitForFunction(
              () => window.__indumoveisMap?.realism?.ready === true,
              null,
              {
                timeout: 30000,
              },
            );
          const coldEnvReadyMs = performance.now() - coldStarted;
          const coldDiagnostic = await idle(page);
          const coldAssets = await page.evaluate(() =>
            performance
              .getEntriesByType("resource")
              .filter((entry) => /ktx2|basis_transcoder|KTX2Loader|urbanContext-/.test(entry.name))
              .map((entry) => ({
                name: entry.name,
                startTime: entry.startTime,
                duration: entry.duration,
                transferBytes: entry.transferSize,
                encodedBodyBytes: entry.encodedBodySize,
              })),
          );
          await navigateModule(page, "/financeiro");
          await page.locator("canvas").waitFor({ state: "detached" });
          const warmStarted = performance.now();
          await page.evaluate(() => performance.clearResourceTimings());
          const warmBrowserStartedAt = await page.evaluate(() => performance.now());
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
          if (phase.startsWith("after"))
            await page.waitForFunction(
              () => window.__indumoveisMap?.realism?.ready === true,
              null,
              {
                timeout: 30000,
              },
            );
          const warmEnvReadyMs = performance.now() - warmStarted;
          const warmDiagnostic = await idle(page);
          const warmAssets = await page.evaluate(() =>
            performance
              .getEntriesByType("resource")
              .filter((entry) => /ktx2|basis_transcoder|KTX2Loader|urbanContext-/.test(entry.name))
              .map((entry) => ({
                name: entry.name,
                startTime: entry.startTime,
                duration: entry.duration,
                transferBytes: entry.transferSize,
                encodedBodyBytes: entry.encodedBodySize,
              })),
          );
          if (phase.startsWith("after")) {
            for (const [label, d, assets] of [
              ["cold", coldDiagnostic, coldAssets],
              ["warm", warmDiagnostic, warmAssets],
            ]) {
              assert.equal(d.realism.pbr.loaded, true, `${label}: atlas did not finish`);
              assert.equal(d.decoderWorkers.active, 0, `${label}: decoder worker remains active`);
              const contextModules = assets.filter((asset) =>
                /\/urbanContext-[^/]+\.js$/.test(asset.name),
              );
              if (label === "cold")
                assert(contextModules.length > 0, "Cold opening did not record lazy urban module");
              assert(
                contextModules.every((asset) => asset.startTime >= d.readyAt),
                `${label}: urban module fetched before first 3D readiness`,
              );
              const atlas = assets.filter((asset) => /\.ktx2(?:\?|$)/.test(asset.name));
              assert.equal(atlas.length, 3, `${label}: missing atlas resource timing`);
              assert(
                atlas.every((asset) => asset.startTime >= d.readyAt),
                `${label}: atlas fetched before first 3D readiness`,
              );
              assert(
                assets.every((asset) => asset.startTime >= d.readyAt),
                `${label}: decoder chunk fetched before first 3D readiness`,
              );
              const createdWorkers = d.decoderWorkers.events
                .slice(label === "warm" ? coldDiagnostic.decoderWorkers.events.length : 0)
                .filter((event) => event.kind === "created");
              assert(
                createdWorkers.length > 0 &&
                  createdWorkers.every((worker) => worker.atMs >= d.readyAt),
                `${label}: decoder worker created before first 3D readiness`,
              );
            }
          }
          const row = {
            viewport,
            iteration: iteration + 1,
            cold: {
              ...cold,
              first3DReadyAt: coldDiagnostic.readyAt,
              environmentReadySinceOpeningMs: coldDiagnostic.environmentReadyAt,
              assetTimings: coldAssets,
              workers: coldDiagnostic.decoderWorkers,
              environmentReadyMs: coldEnvReadyMs,
              essentialProgramsPreparationMs: coldDiagnostic.essentialProgramsPreparationMs,
              terrainPreparationMs: coldDiagnostic.terrainPreparationMs,
              skyPreparationMs: coldDiagnostic.skyPreparationMs,
              environmentPrepareMs: coldDiagnostic.environmentPrepareMs,
              environmentBytes: coldDiagnostic.environmentBytes,
              textureBytes: coldDiagnostic.textureBytes,
              drawCalls: coldDiagnostic.drawCalls,
              realism: coldDiagnostic.realism,
            },
            warm: {
              usefulMs: warmUsefulMs,
              ready3DMs: warmReady3DMs,
              first3DReadyAt: warmDiagnostic.readyAt,
              browserStartedAt: warmBrowserStartedAt,
              environmentReadySinceOpeningMs:
                warmDiagnostic.environmentReadyAt - warmBrowserStartedAt,
              assetTimings: warmAssets,
              workers: warmDiagnostic.decoderWorkers,
              environmentReadyMs: warmEnvReadyMs,
              essentialProgramsPreparationMs: warmDiagnostic.essentialProgramsPreparationMs,
              terrainPreparationMs: warmDiagnostic.terrainPreparationMs,
              skyPreparationMs: warmDiagnostic.skyPreparationMs,
              environmentPrepareMs: warmDiagnostic.environmentPrepareMs,
              environmentBytes: warmDiagnostic.environmentBytes,
              textureBytes: warmDiagnostic.textureBytes,
              drawCalls: warmDiagnostic.drawCalls,
              realism: warmDiagnostic.realism,
            },
            rendererInfo: await page.evaluate(() => window.__MAP_LAB__.rendererInfo()),
            timingNotes:
              "usefulMs/ready3DMs stop on observed stage presentation; environmentReadyMs includes profile automation and optional-context polling, an automation upper bound. environmentReadySinceOpeningMs uses renderer diagnostic browser-clock completion relative to navigation start (cold) or pre-SPA navigation boundary (warm).",
          };
          report.openings.push(row);
          return row;
        } catch (error) {
          report.openingFailures ??= [];
          report.openingFailures.push({
            viewport,
            iteration: iteration + 1,
            error: String(error),
            state:
              page && !page.isClosed()
                ? await page
                    .evaluate(() => ({
                      representation:
                        document.querySelector(".im-map-stage")?.dataset.representation,
                      caption: document
                        .querySelector(".im-map-workspace")
                        ?.textContent?.slice(0, 4000),
                      canvasCount: document.querySelectorAll("canvas").length,
                      contexts: window.__MAP_LAB__?.contexts?.(),
                      renderer: window.__indumoveisMap
                        ? {
                            active: window.__indumoveisMap.active,
                            failureReason: window.__indumoveisMap.failureReason,
                            frames: window.__indumoveisMap.frames,
                            readyAt: window.__indumoveisMap.readyAt,
                            cameraState: window.__indumoveisMap.cameraState,
                            contextLosses: window.__indumoveisMap.contextLosses,
                          }
                        : null,
                    }))
                    .catch(() => null)
                : null,
          });
          throw error;
        } finally {
          await context.close();
        }
      });
    }
  }
}

try {
  if (process.env.MAP_REALISM_OPENINGS_ONLY === "1") {
    await openingSeries();
  } else if (process.env.MAP_REALISM_HARDWARE_SMOKE === "1") {
    await check(
      "available desktop GPU gestures selection fullscreen three warm reentries",
      hardwareSmoke,
    );
    await check("early gesture optional preparation light idle stable sun", earlyGestureAndIdle);
  } else if (process.env.MAP_REALISM_SOFTWARE_RESTORE_ONLY === "1") {
    await check("software automatic manual automatic idle restoration", softwareProfileRestoration);
  } else if (process.env.MAP_REALISM_STRESS_ONLY === "1") {
    await check(
      "actual software automatic quality sustained navigation and settle",
      automaticStress,
    );
  } else if (process.env.MAP_REALISM_DETAIL_ONLY === "1") {
    await realismDetails();
  } else if (process.env.MAP_REALISM_LIGHTING_ONLY === "1") {
    await lightingEvidence();
  } else if (process.env.MAP_REALISM_BENCH_ONLY === "1") {
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
      const baseline = reference?.checks.find(
        (entry) => entry.name === "orbit pan zoom preserve commercial transforms",
      )?.detail.before;
      if (baseline) {
        for (const key of [
          "minDistance",
          "cameraClearance",
          "protectedRegionCount",
          "minPolarAngle",
          "maxPolarAngle",
        ])
          assert.equal(
            before.navigation[key],
            baseline.navigation[key],
            `Commercial navigation invariant changed: ${key}`,
          );
        assert.deepEqual(before.navigation.commercialBounds, {
          minX: 4,
          minY: 7,
          maxX: 187,
          maxY: 103,
        });
        assert(
          before.navigation.navigationRegionCount > before.navigation.protectedRegionCount,
          "The explicitly authorized finite context was omitted from exploration",
        );
        assert(
          Number.isFinite(before.navigation.fitDistance) &&
            before.navigation.fitDistance > before.navigation.minDistance &&
            before.navigation.maxDistance >= before.navigation.fitDistance &&
            before.navigation.viewBounds.minX < before.navigation.commercialBounds.minX,
          "Finite context is missing from the global framing envelope",
        );
        for (const name of [
          "indumoveis-commercial-fixed",
          "indumoveis-derived-pavement",
          "indumoveis-presentation-architecture",
          "fixed-directional-ground-shadow",
        ]) {
          assert.deepEqual(
            before.commercialTransforms.find((entry) => entry.name === name),
            baseline.commercialTransforms.find((entry) => entry.name === name),
            `Authored group transform differs from baseline: ${name}`,
          );
        }
      }
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
      if (phase.startsWith("after")) {
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
        `${Number(process.env.MAP_REALISM_BENCH_MS ?? 30000) / 1000}s matched navigation ${tier}`,
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
      if (phase.startsWith("after")) assert(d.terrain, "Missing terrain diagnostic in fallback");
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
        assert.equal(
          (await page.evaluate(() => window.__MAP_LAB__.workers())).active,
          0,
          "Decoder worker survives map teardown",
        );
        await navigateModule(page, "/mapa");
        await page
          .locator('.im-map-stage[data-representation="ready"]')
          .waitFor({ timeout: 20000 });
        await profile(page, "light");
        await page.waitForTimeout(850);
        if (phase.startsWith("after"))
          await page.waitForFunction(
            () =>
              window.__indumoveisMap?.realism?.ready === true &&
              window.__indumoveisMap.environmentReadyAt > 0,
            null,
            {
              timeout: 30000,
            },
          );
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
      await check("preparation SVG pan survives first 3D presentation", preparationPanHandoff);
      await check("preparation SVG selection survives first 3D presentation", () =>
        preparationPanHandoff("selection"),
      );
      await check("early gesture optional preparation light idle stable sun", earlyGestureAndIdle);
      await check(
        "optional urban module HTTP404 preserves commercial core",
        optionalContextFailure,
      );
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
    path.join(artifactDir, "realism-validation.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({ artifactDir, summary: report.summary, errors: report.errors.length }),
  );
}
