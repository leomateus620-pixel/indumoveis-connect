import assert from "node:assert/strict";
import path from "node:path";

async function measureOrbit(page, ready) {
  const canvas = ready.locator("canvas");
  const gesture = await canvas.evaluate((surface) => {
    const box = surface.getBoundingClientRect();
    const y = box.top + box.height * 0.7;
    for (const fraction of [0.18, 0.24, 0.12, 0.31]) {
      const x = box.left + box.width * fraction;
      if (document.elementFromPoint(x, y) === surface)
        return { x, y, endX: box.left + box.width * 0.8, endY: box.top + box.height * 0.5 };
    }
    throw new Error("Missing unobstructed orbit start on the canvas.");
  });
  const marker = ready.locator('[data-room="12"]');
  const original = await marker.getAttribute("style");
  await page.mouse.move(gesture.x, gesture.y);
  await page.mouse.down();
  const sampler = await page.evaluateHandle(() => {
    const intervals = [];
    let previous = performance.now();
    let frame = requestAnimationFrame(sample);
    function sample(time) {
      intervals.push(time - previous);
      previous = time;
      frame = requestAnimationFrame(sample);
    }
    return () => {
      cancelAnimationFrame(frame);
      return intervals
        .slice(2)
        .filter((ms) => ms > 0)
        .map((ms) => Number(ms.toFixed(3)));
    };
  });
  const pointerSteps = 120;
  await page.mouse.move(gesture.endX, gesture.endY, { steps: pointerSteps });
  await page.mouse.up();
  const intervalsMs = await sampler.evaluate((stop) => stop());
  await sampler.dispose();
  assert.notEqual(
    await marker.getAttribute("style"),
    original,
    "The pointer must rotate the rendered model.",
  );
  assert(intervalsMs.length > 10, "Insufficient animation frames for the orbit sample.");
  const sorted = intervalsMs.slice().sort((a, b) => a - b);
  const percentile = (fraction) => sorted[Math.ceil(fraction * sorted.length) - 1];
  const renderer = await page.evaluate(() => window.__MAP_LAB__.rendererInfo());
  return {
    renderer: renderer.unmaskedRenderer || renderer.renderer,
    pointerSteps,
    discardedInitialIntervals: 2,
    sampleCount: intervalsMs.length,
    medianMs: percentile(0.5),
    p95Ms: percentile(0.95),
    fps: Number(((1000 * intervalsMs.length) / intervalsMs.reduce((a, b) => a + b, 0)).toFixed(1)),
    intervalsMs,
  };
}

// Uses the real interior route and the fixed-price inventory from the P1 browser fixture.
export async function checkGallery({ page, plan, lots, gallery, viewport, baseURL, artifactDir }) {
  assert(["before", "after"].includes(gallery));
  const root = baseURL + "/mapa/pavilhoes/1/interior";
  const mobile = viewport.width < 600;
  const snapshot = (name) =>
    page.screenshot({ path: path.join(artifactDir, name + "-" + viewport.width + ".png") });
  const modelFiles = [];
  const assetResponses = new Map();
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith(".glb")) modelFiles.push(request.url());
  });
  page.on("response", (response) => {
    const file = new URL(response.url()).pathname;
    if (response.ok() && file.startsWith("/map-assets/pavilion-1/"))
      assetResponses.set(file, response);
  });
  const rooms = plan.environments.filter((room) => room.kind === "commercial");
  const button = (name) => page.getByRole("button", { name, exact: true });
  const part = (code, kind) => page.locator(`[data-environment="${code}"] [data-part="${kind}"]`);
  // TanStack quotes values such as "12" to preserve their string type during JSON parsing.
  const selectedCode = (url) => url.searchParams.get("espaco")?.replace(/^"|"$/g, "");
  const openRoom = async (code, kind = "interior") => {
    await part(code, kind).focus();
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => selectedCode(url) === code);
  };
  await page.goto(root);
  await page.locator('[data-commercial-status="disponivel"]').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  if (gallery === "after") {
    await page.evaluate(async () => {
      const image = new Image();
      image.src = document
        .querySelector('.arq-plan image[href*="arq-design-plan"]')
        .getAttribute("href");
      await image.decode();
    });
  }
  await snapshot("planta");
  assert.equal(modelFiles.length, 0);
  await openRoom("12", "external");
  await page.getByRole("heading", { name: "Espaço 12", exact: true }).waitFor();
  await snapshot("terraco");
  if (gallery === "before") return { viewport, plant: true, terrace: true };
  if (!mobile) {
    for (const room of rooms) {
      await openRoom(room.code);
      await page.getByRole("heading", { name: room.name, exact: true }).waitFor();
      if (room.parts.some((p) => p.kind === "external")) await openRoom(room.code, "external");
    }
  }
  await page.goto(root);
  const showModel = button("Abrir maquete 3D");
  await showModel.waitFor();
  const ready = page.locator('.arq-p1-model[aria-busy="false"]');
  const clock = await showModel.evaluateHandle((toggle) => {
    const timing = { firstFrameMs: null };
    toggle.addEventListener(
      "click",
      () => {
        const start = performance.now();
        const observer = new MutationObserver(() => {
          // The renderer clears aria-busy only after its first completed render with the GLB.
          if (!document.querySelector('.arq-p1-model[aria-busy="false"]')) return;
          timing.firstFrameMs = Math.round(performance.now() - start);
          observer.disconnect();
        });
        observer.observe(document.body, {
          subtree: true,
          attributes: true,
          childList: true,
          attributeFilter: ["aria-busy"],
        });
      },
      { capture: true, once: true },
    );
    return timing;
  });
  await showModel.click();
  await ready.waitFor();
  const firstFrameMs = await clock.evaluate((timing) => timing.firstFrameMs);
  await clock.dispose();
  assert(firstFrameMs > 0);
  await snapshot("maquete");
  assert(modelFiles.length > 0);
  const orbit = await measureOrbit(page, ready);
  if (!mobile) {
    await button("Mostrar planta humanizada").click();
    await page.screencast.start({
      path: path.join(artifactDir, "planta-maquete.webm"),
      size: viewport,
    });
    await page.waitForTimeout(1100);
    await showModel.click();
    await ready.waitFor();
    await page.waitForTimeout(950);
    const canvas = await ready.locator("canvas").boundingBox();
    const x = canvas.x + canvas.width * 0.72,
      y = canvas.y + canvas.height * 0.65;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + canvas.width * 0.12, y - 35, { steps: 36 });
    await page.mouse.up();
    await button("Ajustar à tela").click();
    await page.locator('[data-room="12"]').click();
    await page.getByRole("heading", { name: "Espaço 12", exact: true }).waitFor();
    await page.waitForTimeout(1000);
    await button("Mostrar planta humanizada").click();
    await part("12", "external").waitFor();
    assert.equal(selectedCode(new URL(page.url())), "12");
    await page.waitForTimeout(700);
    await page.screencast.stop();
  }
  if (mobile) await button("Mostrar planta humanizada").click();
  const focusedRooms = mobile ? ["12"] : ["12", "01", "04", "salon"];
  for (const code of focusedRooms) {
    const room = plan.environments.find((item) => item.code === code);
    const linked = room.parts.some((item) => item.kind === "external");
    await openRoom(code, linked ? "external" : "interior");
    await page.getByRole("heading", { name: room.name, exact: true }).waitFor();
    await page.getByText("Projeto ilustrativo", { exact: true }).waitFor();
    await button("Ver ambiente em 3D").click();
    await ready.waitFor();
    const marker = ready.locator(`[data-room="${code}"]`);
    await marker.waitFor();
    assert.equal(await marker.getAttribute("aria-pressed"), "true");
    assert.equal(selectedCode(new URL(page.url())), code);
    if (mobile) {
      assert.equal(await page.locator(".arq-sidebar").isVisible(), false);
      const canvas = await ready.locator("canvas").boundingBox();
      assert(canvas.width >= viewport.width - 2, "A selected room should use the mobile viewport.");
    }
    await snapshot(code === "salon" ? "salao-design" : `ambiente-${code}`);
    await button("Mostrar planta humanizada").click();
    await part(code, "interior").waitFor();
    assert.equal(await part(code, "interior").getAttribute("aria-pressed"), "true");
    if (linked) assert.equal(await part(code, "external").getAttribute("aria-pressed"), "true");
    assert.equal(selectedCode(new URL(page.url())), code);
  }
  const detail = page.locator('image[href$="arq-design-plan-detail.webp"]');
  assert.equal(await detail.count(), 0, "The fit view should use the compact plan at DPR 1.");
  for (let i = 0; i < 10 && !(await detail.count()); i++) await button("Aproximar").click();
  await detail.waitFor({ state: "attached" });
  await detail.evaluate(async (element) => {
    const image = new Image();
    image.src = element.getAttribute("href");
    await image.decode();
  });
  const entries = await Promise.all(
    [...assetResponses].map(async ([file, response]) => ({
      file,
      bytes: Number(response.headers()["content-length"]) || (await response.body()).byteLength,
    })),
  );
  assert.equal(
    entries.length,
    3,
    "Compact plan, model and optional high-resolution plan should all load.",
  );
  const statuses = ["disponivel", "em_negociacao", "reservado", "vendido", "bloqueado"];
  const mixed = lots.map((lot, index) => ({ ...lot, status: statuses[index % statuses.length] }));
  await page.route("**/rpc/get_commercial_lots", (route) => route.fulfill({ json: mixed }));
  await page.goto(root);
  await part("04", "interior").waitFor();
  await page.locator('[data-environment="04"][data-commercial-status="vendido"]').waitFor();
  await snapshot("disponibilidade");
  await showModel.click();
  await ready.waitFor();
  assert.equal(
    await page.locator('[data-room="04"]').getAttribute("data-commercial-status"),
    "vendido",
  );
  await ready
    .locator("canvas")
    .evaluate((canvas) =>
      canvas.getContext("webgl2").getExtension("WEBGL_lose_context").loseContext(),
    );
  await page.getByText("A maquete ficou indisponível.", { exact: false }).waitFor();
  // Hold the response while clicking an unobstructed point near the middle of the model.
  // A tap before the first frame must never activate an invisible room.
  await page.goto(root);
  let releaseModel;
  const held = new Promise((resolve) => {
    releaseModel = resolve;
  });
  const routePattern = "**/arq-design.glb";
  const holdModel = async (route) => {
    await held;
    await route.continue();
  };
  await page.route(routePattern, holdModel);
  try {
    const requested = page.waitForRequest(routePattern);
    await showModel.click();
    await requested;
    const pending = page.locator('.arq-p1-model[aria-busy="true"] canvas');
    const click = await pending.evaluate((surface) => {
      const box = surface.getBoundingClientRect();
      for (const fraction of [0.55, 0.45, 0.6]) {
        const x = box.left + box.width / 2,
          y = box.top + box.height * fraction;
        if (document.elementFromPoint(x, y) === surface) return { x, y };
      }
      throw new Error("No free point beside the loading indicator.");
    });
    await page.mouse.click(click.x, click.y);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    assert.equal(selectedCode(new URL(page.url())), undefined);
    assert.equal(await pending.count(), 1);
  } finally {
    releaseModel();
    await page.unroute(routePattern, holdModel);
  }
  await ready.waitFor();
  assert.equal(selectedCode(new URL(page.url())), undefined);
  await button("Mostrar planta humanizada").click();
  await openRoom("14");
  // Block the asset after a fresh navigation so the loader exercises its real error path.
  await page
    .context()
    .route("**/arq-design.glb", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await page.reload();
  await showModel.click();
  await page.getByText("A maquete ficou indisponível.", { exact: false }).waitFor();
  assert.equal(selectedCode(new URL(page.url())), "14");
  await part("14", "interior").waitFor();
  return {
    viewport,
    roomCount: rooms.length,
    entries,
    focusedRooms,
    firstFrameMs,
    orbit,
    ignoredPickWhileLoading: true,
    preservedOnModelFailure: "14",
  };
}
