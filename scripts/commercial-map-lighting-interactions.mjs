// Run against a local production build with the existing map browser fixtures.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const { browser, newContext, report, baseURL, artifactDir } =
  await import("./commercial-map-browser-fixtures.mjs");
const results = [];
const ready = (page, previousInstance = null) =>
  page.waitForFunction(
    (previous) => {
      const d = window.__indumoveisMap;
      return d?.active && d.instance !== previous && d.realism.ready && !d.optionalFailures.length;
    },
    previousInstance,
    { timeout: 45000 },
  );
async function state(page) {
  return page.evaluate(() => {
    const d = window.__indumoveisMap;
    return {
      mode: d.daylight.mode,
      mix: d.daylight.mix,
      profile: d.daylight.profileKey,
      tier: d.tier,
      target: d.target,
      position: d.position,
      instance: d.instance,
      selected: d.lastSelectedId,
      preparations: d.daylight.environmentPreparations,
      shadowUpdates: d.realism.shadows.updates,
      programs: d.programs,
      textures: d.textures,
      bytes: d.textureBytes,
    };
  });
}

async function exercise(mobile) {
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 };
  const context = await newContext({ viewport, reducedMotion: mobile });
  const page = await context.newPage();
  const button = (name) => page.getByRole("button", { name, exact: true });
  const activate = (target) => (mobile ? target.tap() : target.click());
  const settings = async () => {
    if (!(await button("Opções de visualização").isVisible()))
      await activate(button("Mais ações do mapa"));
    await activate(button("Opções de visualização"));
  };
  const lighting = page.getByRole("combobox", { name: "Iluminação" });
  const quality = page.getByRole("combobox", { name: "Qualidade gráfica" });
  let releasePanorama;
  const held = new Promise((resolve) => {
    releasePanorama = resolve;
  });
  try {
    await page.route("**/daylight-*.png", async (route) => {
      await held;
      await route.continue();
    });
    await page.addInitScript(() => {
      if (!localStorage.getItem("indumoveis:map-quality"))
        localStorage.setItem("indumoveis:map-quality", "detailed");
    });
    await page.goto(`${baseURL}/mapa?mapDiagnostics=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('canvas[data-map-ready="true"]');
    await settings();
    await lighting.selectOption("warm");
    await lighting.selectOption("natural");
    await lighting.selectOption("warm");
    releasePanorama();
    await ready(page);
    const afterDecode = await state(page);
    assert.equal(afterDecode.mode, "warm");
    assert.equal(afterDecode.mix, 1);
    await lighting.selectOption("natural");
    await page.waitForFunction(() => window.__indumoveisMap.daylight.mix === 0);
    await page.keyboard.press("Escape");
    await activate(button("Buscar lote, pavilhão, via ou estrutura"));
    await page.getByRole("textbox", { name: "Lote, pavilhão, via ou estrutura" }).fill("Lote 01");
    await activate(page.locator(".im-map-result").first());
    await page.waitForFunction(() => {
      const d = window.__indumoveisMap;
      return d.lastSelectedId === "indumoveis:external:lot:01" && d.cameraState === "idle";
    });
    await settings();
    const before = await state(page);
    if (mobile) await lighting.selectOption("warm");
    else {
      await lighting.focus();
      await lighting.press("ArrowDown");
      await lighting.press("Enter");
    }
    for (const mode of ["natural", "warm", "natural", "warm"]) await lighting.selectOption(mode);
    await page.waitForFunction(() => window.__indumoveisMap.daylight.mix === 1);
    const warm = await state(page);
    assert.equal(warm.mode, "warm");
    for (const key of [
      "instance",
      "tier",
      "target",
      "position",
      "selected",
      "preparations",
      "shadowUpdates",
      "programs",
      "textures",
      "bytes",
    ])
      assert.deepEqual(warm[key], before[key], `lighting changed ${key}`);

    for (const [tier, mode] of [
      ["light", "natural"],
      ["detailed", "warm"],
      ["balanced", "warm"],
    ]) {
      await quality.selectOption(tier);
      await lighting.selectOption(mode);
    }
    await page.waitForFunction(() => window.__indumoveisMap.tier === "balanced");
    await page.setViewportSize(mobile ? { width: 844, height: 390 } : { width: 1050, height: 700 });
    const resized = await state(page);
    assert.equal(resized.mode, "warm");
    assert.equal(resized.selected, before.selected);
    assert.equal(resized.instance, before.instance);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Buscar lote, pavilhão, via ou estrutura" }).click();
    await page
      .getByRole("textbox", { name: "Lote, pavilhão, via ou estrutura" })
      .fill("Pavilhão 12");
    await page.locator(".im-map-result").first().click();
    await page.locator(".im-map-interior-action").click();
    await page.waitForURL("**/mapa/pavilhoes/12/interior**");
    await page.waitForFunction(() => window.__MAP_LAB__.contexts().active === 0);
    await page.goBack();
    await ready(page, before.instance);
    const returned = await state(page);
    assert.notEqual(returned.instance, before.instance);
    assert.equal(returned.tier, "balanced");
    assert.equal(returned.mode, "warm");
    assert.equal(returned.mix, 1);
    const contexts = await page.evaluate(() => window.__MAP_LAB__.contexts());
    assert.equal(contexts.active, 1);
    const renderer = await page.evaluate(() => window.__MAP_LAB__.rendererInfo());
    results.push({
      viewport,
      renderer,
      reducedMotion: mobile,
      afterDecode,
      before,
      warm,
      resized,
      returned,
      contexts,
    });
  } finally {
    releasePanorama();
    await context.close();
  }
}

try {
  await exercise(false);
  await exercise(true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(
    report.consoleErrors.filter((e) => /shader|webgl|three\.js/i.test(e.text)),
    [],
  );
} finally {
  await writeFile(
    path.join(artifactDir, "lighting-interactions.json"),
    JSON.stringify(
      {
        conditions: report.conditions,
        results,
        errors: report.errors,
        consoleErrors: report.consoleErrors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
