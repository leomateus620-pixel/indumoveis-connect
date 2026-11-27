import assert from "node:assert/strict";
import { stripTypeScriptTypes, createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const runtime = path.join(
  os.homedir(),
  ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
} catch {
  playwright = require(runtime);
}

const url = new URL(process.env.PARK_WALKING_URL ?? "http://127.0.0.1:4207/");
url.searchParams.set("mapDiagnostics", "1");
const output = process.env.PARK_WALKING_ARTIFACTS ?? "docs/validation/navegar-parque";
await mkdir(output, { recursive: true });
const folder = new URL("../../src/features/commercial-map/", import.meta.url);
const moduleUrl = async (name, imports = {}) => {
  let code = stripTypeScriptTypes(await readFile(new URL(name, folder), "utf8"));
  for (const [source, destination] of Object.entries(imports))
    code = code.replaceAll(`"${source}"`, `"${destination}"`);
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
};
const urban = await moduleUrl("urbanReference.ts");
const graph = await moduleUrl("walking/network.ts");
const { INDOMOVEIS_WALKING_PILOT: network } = await import(
  await moduleUrl("walking/pilot.ts", { "../urbanReference": urban, "./network": graph })
);
const { referenceMetresToScene, sceneToReferenceCoordinate, URBAN_REFERENCE } = await import(urban);
const { findWalkingRoute, pathAfter } = await import(graph);

const installedChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await playwright.chromium.launch({
  headless: true,
  executablePath:
    process.env.MAP_CHROMIUM_EXECUTABLE ??
    (existsSync(installedChrome) ? installedChrome : undefined),
  args: ["--enable-webgl", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
});
const report = { browser: browser.version(), checks: [], performance: {}, privacy: {} };
let observed = 0;
const errors = [];
const unexpected = [];
const privateTokens = new Set();
function contrast(foreground, background) {
  const luma = (color) =>
    color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((x) => x / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
      .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
  const values = [luma(foreground), luma(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
const allRequests = [];
async function open({ mobile = false, noWebGL = false } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 1,
    reducedMotion: mobile ? "reduce" : "no-preference",
    serviceWorkers: "block",
  });
  await context.route("**/*", async (route) => {
    const req = route.request();
    observed++;
    allRequests.push([req.url(), req.postData(), req.headers().referer]);
    if (
      new URL(req.url()).origin !== url.origin ||
      req.method() !== "GET" ||
      (["fetch", "xhr", "ping", "websocket"].includes(req.resourceType()) &&
        !/^\/(assets|map-assets|commercial-map|landscape)\//.test(new URL(req.url()).pathname))
    ) {
      unexpected.push({
        type: req.resourceType(),
        local: new URL(req.url()).origin === url.origin,
      });
      return route.abort();
    }
    if (noWebGL && /\/MapRenderer-/.test(req.url())) return route.abort();
    return route.continue();
  });
  await context.addInitScript(() => {
    let accept, reject;
    const stats = { watch: 0, clear: 0 };
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition(ok, error) {
          accept = ok;
          reject = error;
          return ++stats.watch;
        },
        clearWatch() {
          accept = reject = undefined;
          stats.clear++;
        },
      },
    });
    let time = Date.now();
    const native = Date.now;
    Date.now = () => Math.max(native(), time);
    window.__walkingTest = {
      send(longitude, latitude, accuracy, step = 2_000, age = 0) {
        time = Math.max(native(), time + step);
        accept?.({ timestamp: time - age, coords: { longitude, latitude, accuracy } });
      },
      error(code) {
        reject?.({ code });
      },
      stats,
    };
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url.href);
  return { context, page };
}

const button = (page, name) => page.getByRole("button", { name, exact: true });
const ready = (page) =>
  page.locator('.im-map-stage[data-representation="ready"]').waitFor({ timeout: 40_000 });
const marker = (page, value) =>
  page.locator(`[data-walking-marker="${value}"]`).waitFor({ timeout: 7_000 });
const snap = (page, label) =>
  page.screenshot({ path: path.join(output, label + ".jpg"), type: "jpeg", quality: 86 });
async function send(page, point, accuracy = 2, step = 2_000, age = 0) {
  const coords = sceneToReferenceCoordinate(point);
  for (const value of coords) privateTokens.add(value.toFixed(6).slice(0, -1));
  await page.evaluate(
    ([lon, lat, accuracy, step, age]) => window.__walkingTest.send(lon, lat, accuracy, step, age),
    [...coords, accuracy, step, age],
  );
}
async function setPose(page, [x, z], y, dz) {
  await page.evaluate(
    ([[x, z], y, dz]) => window.__indumoveisMap.setReferencePose([x, y, z + dz], [x, z]),
    [[x, z], y, dz],
  );
  await page
    .locator("canvas")
    .evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
}
async function startBrowserGps(page) {
  await page.getByLabel("GPS", { exact: true }).selectOption("browser");
  await button(page, "Navegar pelo parque").click();
  assert.equal(await page.evaluate(() => window.__walkingTest.stats.watch), 0);
  await button(page, "Minha localização").click();
  await page.waitForFunction(() => window.__walkingTest.stats.watch === 1);
}
async function find(page, input, result) {
  await button(page, "Buscar lote, pavilhão, via ou estrutura").click();
  await page.getByPlaceholder("Lote, pavilhão, via ou estrutura").fill(input);
  await page.locator(".im-map-result").filter({ hasText: result }).first().click();
}
async function frames(page, [x, z]) {
  await page.evaluate(() => window.__indumoveisMap.resetSamples());
  const rect = await page.locator("canvas").boundingBox();
  await page.mouse.move(rect.x + rect.width * 0.7, rect.y + rect.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.75, rect.y + rect.height * 0.24, { steps: 28 });
  await page.mouse.up();
  await setPose(page, [x, z], 25, 29);
  return page.evaluate(() => {
    const d = window.__indumoveisMap;
    const sorted = [...d.frameIntervals].sort((a, b) => a - b);
    return {
      frameSamples: sorted.length,
      intervalMedianMs: sorted[Math.floor(sorted.length / 2)] ?? null,
      intervalP95Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? null,
      drawCalls: d.drawCalls,
      triangles: d.triangles,
      contexts: d.activeContexts,
      tier: d.tier,
      renderer: d.realism.softwareRasterizer ? "software" : "hardware requested",
    };
  });
}

const point = (id) => referenceMetresToScene(network.nodes[id].point);
const gate = point("gate-03");
const p1 = network.destinations[0];
const baseRoute = findWalkingRoute(network, { node: "gate-03" }, p1);
const altRoute = findWalkingRoute(network, { node: "gate-03" }, network.destinations[1]);
try {
  const { context, page } = await open();
  await startBrowserGps(page);
  await ready(page);
  await page.waitForFunction(() => window.__indumoveisMap.realism.ready);
  await setPose(page, gate, 25, 29);
  report.performance.desktopOff = await frames(page, gate);
  const instance = await page.evaluate(() => window.__indumoveisMap.instance);
  await send(page, gate, 2, 2_000, 20_000);
  assert.equal(await page.locator("[data-walking-marker]").count(), 0);
  await send(page, gate);
  await send(page, gate);
  await page.getByText("Localização ativa", { exact: false }).waitFor();
  await page.getByText("Destinos a pé", { exact: true }).click();
  await page.getByRole("button", { name: /Pavilhão 1 · Mostra/ }).click();
  await page.getByText("280 m", { exact: true }).waitFor();
  await setPose(page, [107, 81], 235, 13);
  await marker(page, "icon");
  await snap(page, "01-aerea");
  await setPose(page, [128, 80], 60, 69);
  await marker(page, "icon");
  await snap(page, "02-intermediaria");
  await setPose(page, gate, 14, 16);
  await marker(page, "avatar");
  assert.equal(
    await page.locator("[data-walking-marker]").getAttribute("data-walking-motion"),
    "still",
  );
  await snap(page, "03-proxima");
  report.performance.desktopOn = await frames(page, gate);
  await page.getByText("câmera em exploração", { exact: false }).waitFor();
  await button(page, "Recentralizar").click();
  await setPose(page, gate, 14, 16);

  const [x0, z0] = gate;
  const pointer = await page.locator("canvas").boundingBox();
  await page.mouse.move(pointer.x + pointer.width * 0.75, pointer.y + pointer.height * 0.55);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(pointer.x + pointer.width * 0.84, pointer.y + pointer.height * 0.57, {
    steps: 10,
  });
  await page.mouse.up({ button: "right" });
  await page.getByText("câmera em exploração", { exact: false }).waitFor();
  await button(page, "Recentralizar").click();
  await setPose(page, gate, 14, 16);

  async function walk(route, start, end, step = 3.2) {
    for (let m = start; m < end; m += step)
      await send(page, referenceMetresToScene(pathAfter(route.path, m)[0]), 1.5);
  }
  await walk(altRoute, 3.2, 9.7);
  await page.locator('[data-walking-motion="walking"]').waitFor({ timeout: 4_000 });
  await snap(page, "04-caminhando");
  const distanceLabel = await page.locator(".im-walking-metrics strong").textContent();
  assert.notEqual(distanceLabel, "280 m");
  await walk(altRoute, 12.8, altRoute.metres, 4.8);
  for (let i = 0; i < 4; i++) await send(page, point("p12-front"), 1.5);
  await page.getByText("Rota recalculada", { exact: true }).waitFor();
  await setPose(page, [72, 66], 30, 31);
  await snap(page, "05-desvio");
  const toP1 = findWalkingRoute(network, { node: "p12-front" }, p1);
  await walk(toP1, 3.2, toP1.metres, 4.8);
  await send(page, point("p1-front"), 1.5);
  await send(page, point("p1-front"), 1.5);
  await send(page, point("p1-front"), 1.5);
  await page.getByText("Chegada simulada", { exact: true }).waitFor();
  await setPose(page, point("p1-front"), 16, 17);
  await snap(page, "06-chegada");
  await page.evaluate(() => window.__walkingTest.error(2));
  await page.getByText("Sinal indisponível", { exact: false }).waitFor();
  await snap(page, "07-sem-sinal");
  assert.equal(await page.evaluate(() => window.__indumoveisMap.instance), instance);
  assert.deepEqual(await page.evaluate(() => window.__indumoveisMap.target), [0, 0]);
  await button(page, "Sair da navegação").click();
  assert.deepEqual(await page.evaluate(() => window.__walkingTest.stats), { watch: 1, clear: 1 });
  await send(page, [x0, z0]);
  assert.equal(await page.locator("[data-walking-marker]").count(), 0);
  report.checks.push(
    "aérea, média, próxima, parado, caminhada, órbita, pan, recentralizar, progresso, desvio, chegada, perda de sinal, clearWatch, contexto WebGL preservado",
  );
  await context.close();

  const mobile = await open({ mobile: true, noWebGL: true });
  await startBrowserGps(mobile.page);
  await mobile.page.evaluate(() => window.__walkingTest.error(1));
  await mobile.page.getByText("A permissão de localização foi negada.").waitFor();
  await mobile.page.getByLabel("Escolher ponto de partida").selectOption("gate-03");
  await mobile.page.getByText("Destinos a pé", { exact: true }).click();
  await mobile.page.getByRole("button", { name: /Pavilhão 1 · Mostra/ }).click();
  await mobile.page.locator(".im-walking-plan .im-walking-route").waitFor();
  await mobile.page.getByText("280 m", { exact: true }).waitFor();
  await snap(mobile.page, "08-celular-planta");
  assert.deepEqual(await mobile.page.evaluate(() => window.__walkingTest.stats), {
    watch: 1,
    clear: 1,
  });
  report.checks.push(
    "390 × 844 toque emulado, redução de movimento, sem WebGL, permissão negada, origem manual, linha e texto em SVG",
  );
  await mobile.context.close();

  const mobile3d = await open({ mobile: true });
  await startBrowserGps(mobile3d.page);
  await ready(mobile3d.page);
  await mobile3d.page.waitForFunction(() => window.__indumoveisMap.realism.ready);
  await setPose(mobile3d.page, gate, 25, 29);
  report.performance.mobileOff = await frames(mobile3d.page, gate);
  await send(mobile3d.page, gate);
  await send(mobile3d.page, gate);
  await mobile3d.page.getByText("Destinos a pé", { exact: true }).click();
  await mobile3d.page.getByRole("button", { name: /Pavilhão 1 · Mostra/ }).click();
  await setPose(mobile3d.page, gate, 10, 14);
  await marker(mobile3d.page, "avatar");
  for (const m of [3.2, 6.4, 9.6])
    await send(mobile3d.page, referenceMetresToScene(pathAfter(baseRoute.path, m)[0]), 1.5);
  assert.equal(
    await mobile3d.page.locator("[data-walking-marker]").getAttribute("data-walking-motion"),
    "still",
  );
  report.performance.mobileOn = await frames(mobile3d.page, gate);
  await mobile3d.page.getByText("câmera em exploração", { exact: false }).waitFor();
  await button(mobile3d.page, "Recentralizar").tap();
  await setPose(mobile3d.page, [113, 79], 190, 16);
  await marker(mobile3d.page, "icon");
  await snap(mobile3d.page, "10-celular-3d");
  report.checks.push(
    "WebGL a 390 × 844, toque em Recentralizar e personagem estático com movimento reduzido",
  );
  await mobile3d.context.close();

  const ext = await open();
  await ext.page.getByLabel("Rede", { exact: true }).selectOption("extended");
  await button(ext.page, "Navegar pelo parque").click();
  await ext.page.getByLabel("Escolher ponto de partida").selectOption("A3-exterior:1");
  for (const [term, label] of [
    ["Lote 57", "Lote 57"],
    ["Lote 66", "Lote 66"],
    ["Lote 01", "Lote 01"],
    ["Pavilhão 1", /^Pavilhão 1 ·/],
    ["Pavilhão 3", /^Pavilhão 3 ·/],
    ["Pavilhão 14", /^Pavilhão 14 ·/],
  ]) {
    // Selection in walking mode stays independent from the commercial inspection.
    await find(ext.page, term, label);
    await button(ext.page, "Traçar rota a pé").click();
    await ext.page.getByLabel("Resumo da rota").getByText("no trajeto", { exact: false }).waitFor();
    if (term === "Pavilhão 14") {
      await ext.page.getByRole("button", { name: /^Alternativa / }).click();
      await ext.page.getByRole("button", { name: /^Alternativa /, pressed: true }).waitFor();
      await ext.page.evaluate(() => document.fonts.ready);
      const ui = await ext.page.evaluate(() => {
        const cards = [...document.querySelectorAll(".im-walking-option")].map((option) => {
          const style = getComputedStyle(option);
          return {
            pressed: option.getAttribute("aria-pressed"),
            text: style.color,
            surface: style.backgroundColor,
          };
        });
        const brand = document.querySelector(".im-map-header h1").getBoundingClientRect();
        const toggle = document.querySelector(".im-walking-toggle").getBoundingClientRect();
        const views = document.querySelector(".im-map-header-tools").getBoundingClientRect();
        return {
          cards,
          fontReady: document.fonts.check('700 16px "Figtree Map"'),
          noHeaderOverlap: brand.right <= toggle.left && toggle.right <= views.left,
        };
      });
      const ratios = ui.cards.map(({ text, surface }) => contrast(text, surface));
      assert.ok(ratios.every((ratio) => ratio >= 4.5));
      assert.equal(ui.noHeaderOverlap, true);
      assert.equal(ui.fontReady, true);
      report.routeOptions = { contrast: ratios.map((ratio) => Number(ratio.toFixed(2))), ...ui };
      await ext.page.locator(".im-map-popover-search").waitFor({ state: "hidden" });
      await snap(ext.page, "09-alternativas");
    }
    assert.equal(await ext.page.getByLabel("Detalhes da área").count(), 0);
  }
  await ext.page.getByLabel("Escolher ponto de partida").selectOption("indumoveis:pavilion:1:1");
  await button(ext.page, "Quero sair").click();
  await ext.page.getByText("Saída do parque", { exact: true }).waitFor();
  await ext.page
    .getByLabel("Resumo da rota")
    .locator("p.im-walking-arrival")
    .filter({ hasText: "acesso em revisão" })
    .waitFor();
  report.checks.push(
    "lotes 01, 57 e 66, pavilhões 1, 3 e 14, duas opções no P14 e saída pelos nós candidatos",
  );
  await ext.context.close();

  const a = await open({ noWebGL: true }),
    b = await open({ noWebGL: true });
  await startBrowserGps(a.page);
  await startBrowserGps(b.page);
  await send(a.page, gate);
  await send(b.page, URBAN_REFERENCE.roundabout.center, 12);
  await a.page.getByText("Localização ativa", { exact: false }).waitFor();
  await b.page.getByText("Localização aproximada", { exact: false }).waitFor();
  await b.page.getByText("entorno do parque", { exact: false }).waitFor();
  assert.notEqual(
    await a.page.locator(".im-walking-plan-position").locator("..").getAttribute("transform"),
    await b.page.locator(".im-walking-plan-position").locator("..").getAttribute("transform"),
  );
  await send(b.page, [890, -600], 2, 75_000);
  await b.page.getByText("Fora da área do mapa", { exact: false }).waitFor();
  await b.page.getByText("Posição do dispositivo", { exact: true }).click();
  await b.page.getByText("Margem informada pelo dispositivo", { exact: false }).waitFor();
  assert.equal(await b.page.getByLabel("Resumo da rota").count(), 0);
  assert.equal(await b.page.locator(".im-walking-plan-position").count(), 0);
  assert.equal(await a.page.locator(".im-walking-plan-position").count(), 1);
  for (const { context, page } of [a, b]) {
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(await context.cookies(), []);
    await context.close();
  }
  report.checks.push(
    "dois contextos independentes, rótula, posição aproximada e cidade fora da área",
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(unexpected.length, 0, JSON.stringify(unexpected));
  const leaked = allRequests.filter((request) =>
    request.some(
      (value) =>
        value &&
        ([...privateTokens].some((token) => value.includes(token)) ||
          /gate-03|p1-front|p12-front/.test(value)),
    ),
  );
  assert.equal(leaked.length, 0);
  report.privacy = {
    requestsIntercepted: observed,
    unexpected: unexpected.length,
    candidateDataLeaks: leaked.length,
    cookies: 0,
    storedSessionEntries: 0,
    isolatedContexts: 2,
    syntheticFixesOnly: true,
  };
} catch (error) {
  if (errors.length || unexpected.length) console.error({ errors, unexpected });
  throw error;
} finally {
  await writeFile(path.join(output, "browser.json"), JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
