import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  browser,
  newContext,
  report,
  baseURL,
  artifactDir,
} from "./commercial-map-browser-fixtures.mjs";

const segments = [
  { key: "p1", pavilionNumber: 1, total: 12, sold: 1, soldPercent: 100 / 12 },
  { key: "p3", pavilionNumber: 3, total: 0, sold: 0, soldPercent: null },
  { key: "p8", pavilionNumber: 8, total: 7, sold: 0, soldPercent: 0 },
  { key: "p12", pavilionNumber: 12, total: 254, sold: 65, soldPercent: 6500 / 254 },
  { key: "p13", pavilionNumber: 13, total: 80, sold: 80, soldPercent: 100 },
  { key: "p14", pavilionNumber: 14, total: 0, sold: 0, soldPercent: null },
];
const exteriorFixture = ["09", "10", "35", "36", "37", "38", "43", "44", "49", "50"].map(
  (code) => ({
    id: `fixture-${code}`,
    code,
    segmentKey: Number(code) >= 43 ? "automobile" : "external",
    geometryId: `indumoveis:external:lot:${code}`,
    areaM2: Number(code) < 11 ? 203 : 227,
    tariffCents: null,
    grossCents: null,
    status: code === "36" ? "vendido" : "disponivel",
    pricingState: Number(code) >= 43 ? "no_tariff" : "corner_pending",
  }),
);
const findings = [];
try {
  for (const settings of [
    { name: "desktop-3d", viewport: { width: 1440, height: 900 }, noWebGL: false },
    {
      name: "mobile-2d",
      viewport: { width: 390, height: 844 },
      noWebGL: true,
      reducedMotion: true,
    },
  ]) {
    const context = await newContext({
      ...settings,
      commercialOverview: { segments, financial: false, activity: false },
      commercialLots: exteriorFixture,
    });
    await context.addInitScript((origin) => {
      if (location.origin === origin) localStorage.setItem("indumoveis:map-quality", "light");
    }, new URL(baseURL).origin);
    const page = await context.newPage();
    await page.goto(`${baseURL}/mapa?pavilhao=12&mapDiagnostics=1`, {
      waitUntil: "domcontentloaded",
    });
    const representation = settings.noWebGL ? "2d" : "ready";
    await page
      .locator(`.im-map-stage[data-representation="${representation}"]`)
      .waitFor({ timeout: 25000 });
    const target = page.locator('[data-pavilion-progress="12"]');
    const disk = target.locator(".im-pavilion-marker-disc");
    await disk.waitFor({ state: "visible", timeout: 10000 });
    const pct = new Intl.NumberFormat("pt-BR", {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(segments[3].soldPercent / 100);
    assert.equal(await target.locator("strong").textContent(), pct);
    assert.match(
      await page.locator(".im-map-pavilion-progress").textContent(),
      /65 de 254 lotes vendidos/,
    );
    const neutral = page.locator('[data-pavilion-progress="3"]');
    assert.equal(await neutral.locator("strong").textContent(), "—");
    assert.equal(await neutral.locator(".im-pavilion-marker-value").count(), 0);
    const empty = page.locator('[data-pavilion-progress="8"]');
    assert.equal(await empty.locator("strong").textContent(), "0%");
    assert.equal(await empty.locator(".im-pavilion-marker-value").count(), 0);
    const full = page.locator('[data-pavilion-progress="13"]');
    assert.equal(await full.locator("strong").textContent(), "100%");
    assert.equal(await full.locator(".im-pavilion-marker-value").count(), 1);
    assert.equal(
      await full.locator(".im-pavilion-marker-value").getAttribute("stroke-dasharray"),
      null,
    );
    assert.equal(await disk.locator(".im-pavilion-marker-value").count(), 1);
    const diagnostics = await page.evaluate(() => {
      const map = window.__indumoveisMap;
      return (
        map && {
          frames: map.frames,
          calls: map.drawCalls,
          textures: map.textures,
          context: map.contextCount,
        }
      );
    });
    await page.screenshot({ path: path.join(artifactDir, `sales-progress-${settings.name}.png`) });
    const box = await disk.boundingBox();
    const [minSize, maxSize] = settings.noWebGL ? [40, 45] : [44, 53];
    assert(box && box.width >= minSize && box.width <= maxSize);
    assert(Math.abs(box.width - box.height) < 1, "visible marker must be circular");
    const doesNotCaptureGestures = await disk.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return !node.contains(
        document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
      );
    });
    assert(doesNotCaptureGestures);
    const after = await page.evaluate(() => window.__indumoveisMap?.frames);
    if (diagnostics && after != null)
      assert(after - diagnostics.frames < 20, "markers must settle");
    const detail = page.getByRole("complementary", { name: "Detalhes da área" });
    const measureAnchors = () =>
      target.evaluate((node) => {
        const wrapper = node.getBoundingClientRect();
        const disk = node.querySelector(".im-pavilion-marker-disc").getBoundingClientRect();
        const roof = node.querySelector(".im-pavilion-marker-roof");
        return {
          x: wrapper.x,
          y: wrapper.y,
          dx: disk.x + disk.width / 2 - wrapper.x,
          lift: wrapper.y - disk.bottom,
          lightAngle: node.style.getPropertyValue("--im-progress-light-angle"),
          roof: getComputedStyle(roof).transform,
        };
      });
    const beforeMotion = await measureAnchors();
    if (!settings.noWebGL) {
      const rotate = page.getByRole("button", { name: "Girar à direita" });
      await rotate.click();
      await page.waitForFunction(() => window.__indumoveisMap?.cameraState === "idle");
      await disk.waitFor({ state: "visible" });
    } else {
      await page.getByRole("button", { name: "Aproximar" }).click();
    }
    const afterMotion = await measureAnchors();
    for (const position of [beforeMotion, afterMotion]) {
      assert(Math.abs(position.dx) < 0.5, "disk horizontal center must stay over the roof");
      assert(Math.abs(position.lift - 8) < 0.5, "disk must hover 8px above the roof");
    }
    if (!settings.noWebGL) {
      assert.notEqual(
        beforeMotion.lightAngle,
        afterMotion.lightAngle,
        "roof light must follow camera projection",
      );
      assert.notEqual(beforeMotion.roof, afterMotion.roof);
    }
    if (settings.noWebGL) {
      const more = detail.getByRole("button", { name: "Mais detalhes", exact: true });
      await more.click();
      await detail.getByRole("button", { name: "Ver na dashboard comercial" }).waitFor();
      assert.equal(await page.locator('[data-entity^="indumoveis:external:lot:"]').count(), 68);
      for (const code of ["36", "37", "43", "44"]) {
        const item = page
          .locator(`[data-entity="indumoveis:external:lot:${code}"] > polygon`)
          .first();
        const polygon = await item.getAttribute("points");
        assert(polygon?.length);
      }
    } else {
      const pickEvidence = await page.evaluate(() => {
        const map = window.__indumoveisMap;
        // Top view on the central blocks, leaving all group witnesses in view.
        map.setReferencePose([109, 109, 45], [109, 0, 45]);
        return true;
      });
      assert(pickEvidence);
      await page.waitForTimeout(300);
      const picked = await page.evaluate(
        (codes) =>
          codes.map((code) => {
            const map = window.__indumoveisMap;
            const id = `indumoveis:external:lot:${code}`;
            const point = map.project(id, 0);
            return map.pickAt(point.x, point.y);
          }),
        exteriorFixture.map((lot) => lot.code),
      );
      assert.deepEqual(
        picked,
        exteriorFixture.map((lot) => lot.geometryId),
      );
    }
    const searchButton = page.getByRole("button", {
      name: "Buscar lote, pavilhão, via ou estrutura",
    });
    for (const code of ["36", "37", "43", "44"]) {
      await searchButton.click();
      await page.getByRole("textbox", { name: "Lote, pavilhão, via ou estrutura" }).fill(code);
      await page.getByRole("button", { name: new RegExp(`Lote ${code}\\b`) }).click();
      await detail.getByRole("heading", { name: `Lote ${code}`, exact: true }).waitFor();
      assert.match(await detail.textContent(), code === "36" ? /Vendido/ : /Disponível/);
    }
    await page.locator(".im-map-popover").waitFor({ state: "hidden" });
    if (!settings.noWebGL)
      await page.waitForFunction(
        () =>
          window.__indumoveisMap?.lastSelectedId === "indumoveis:external:lot:44" &&
          window.__indumoveisMap.cameraState === "idle",
      );
    await page.screenshot({ path: path.join(artifactDir, `external-lots-${settings.name}.png`) });
    findings.push({
      layout: settings.name,
      representation,
      percent: pct,
      size: box,
      diagnostics,
      anchors: { beforeMotion, afterMotion },
      individualLots: ["36", "37", "43", "44"],
    });
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  await writeFile(
    path.join(artifactDir, "sales-progress-validation.json"),
    JSON.stringify(findings, null, 2),
  );
  console.log(JSON.stringify(findings, null, 2));
} finally {
  await browser.close();
}
