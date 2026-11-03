/** Shared local browser laboratory fixtures. No production login or writes.
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

export { browser, newContext, report, baseURL, artifactDir };
