/** Local intercepted browser fixtures. Never uses a production session or writes to the backend. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  browser,
  newContext,
  baseURL,
  artifactDir,
  report,
} from "./commercial-map-browser-fixtures.mjs";

const editionId = "22222222-2222-4222-8222-222222222222";
const plans = {};
for (const number of [1, 3, 8, 12, 13]) {
  const plan = JSON.parse(
    await readFile(
      `src/features/pavilion-interior/${number === 1 ? "plan" : `pavilion${number}`}.generated.json`,
      "utf8",
    ),
  );
  Object.assign(plan, {
    editionId,
    databasePlanId: `33333333-3333-4333-8333-${String(number).padStart(12, "0")}`,
    revisionId: `44444444-4444-4444-8444-${String(number).padStart(12, "0")}`,
  });
  plans[number] = plan;
}
const lots = plans[3].environments.map((e, i) => ({
  id: `55555555-5555-4555-8555-${String(i + 1).padStart(12, "0")}`,
  code: e.code,
  segmentKey: "p3",
  environmentId: e.id,
  geometryId: null,
  areaM2: 5,
  areaPending: false,
  status: "disponivel",
  pricingState: "priced",
  pricingBasis: "per_m2",
  tariffCents: 26500,
  grossCents: 132500,
  cornerState: null,
  policyVersion: 1,
}));
report.conditions.authAndData =
  "Isolated fixtures for 142 P3 lots; 5 m², R$265/m², R$1325 each. No production session or writes.";
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const context = await newContext({ viewport, noWebGL: true, commercialLots: lots });
    await context.route("**/rest/v1/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const endpoint = url.pathname.split("/").at(-1);
      const args = request.method() === "POST" ? request.postDataJSON() : {};
      const number = Number(
        args?.p_pavilion_number ?? url.searchParams.get("pavilion_number")?.replace("eq.", "") ?? 3,
      );
      const plan = plans[number];
      const values = {
        get_pavilion_interior: plan,
        pavilion_plan_revisions: { id: plan?.revisionId, revision: plan?.revision },
        get_pavilion_interior_commercial: {},
      };
      if (endpoint === "preview_guided_sale") {
        const selected = lots.filter((lot) => args.p_space_ids.includes(lot.id));
        const total = selected.length * 132500;
        return route.fulfill({
          json: {
            editionId,
            segmentKey: "p3",
            lots: selected.map((lot) => ({ ...lot, agreedCents: lot.grossCents })),
            areaM2: selected.length * 5,
            grossCents: total,
            totalCents: total,
            schedule: [],
            policy: { version: 1 },
            quoteFingerprint: "local-fixture",
          },
        });
      }
      if (Object.hasOwn(values, endpoint)) return route.fulfill({ json: values[endpoint] });
      return route.fallback();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(`${baseURL}/mapa/pavilhoes/3/interior`);
    await page
      .getByRole("heading", { name: "Construção e Mobiliário", exact: true })
      .waitFor({ state: "attached" });
    await page.locator('[data-environment="142"]').waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Perspectiva", exact: true }).isDisabled(),
      true,
    );
    await page.getByRole("button", { name: "Modo Comercialização", exact: true }).click();
    for (const code of ["39", "104"]) {
      const target = page.locator(`[data-environment="${code}"] [data-part="interior"]`);
      await target.focus();
      await page.keyboard.press("Enter");
      assert.equal(await target.getAttribute("aria-pressed"), "true");
    }
    if (viewport.width < 600) await page.locator(".guided-mobile-bar").click();
    await page.getByRole("button", { name: "Remover lote 39", exact: true }).waitFor();
    await page.getByRole("button", { name: "Remover lote 104", exact: true }).waitFor();
    assert.match(await page.locator(".guided-cart-totals:visible").innerText(), /2\.650,00/);
    await page.screenshot({
      animations: "disabled",
      path: path.join(artifactDir, `individual-sale-${viewport.width}.png`),
    });
    await page
      .getByRole("button", {
        name: viewport.width < 600 ? "Sair do modo" : "Sair do modo comercialização",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog", { name: "Sair da comercialização?" })
      .getByRole("button", { name: "Sair do modo", exact: true })
      .click();
    assert.equal(await page.locator("[data-environment]").count(), 142);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    await page.screenshot({
      animations: "disabled",
      path: path.join(artifactDir, `overview-${viewport.width}.png`),
    });
    await page.goto(`${baseURL}/mapa/pavilhoes/3/interior?lote=104`);
    await page.getByRole("heading", { name: "Lote 104", exact: true }).waitFor();
    const panel = page.locator(".p3-panel");
    assert.match(await panel.innerText(), /5,00 m²/);
    assert.match(await panel.innerText(), /265,00/);
    assert.match(await panel.innerText(), /1\.325,00/);
    await page.screenshot({
      animations: "disabled",
      path: path.join(artifactDir, `lot104-${viewport.width}.png`),
    });
    await page.reload();
    await page.getByRole("heading", { name: "Lote 104", exact: true }).waitFor();
    await page.getByRole("searchbox", { name: "Buscar lote" }).fill("142");
    await page.getByRole("button", { name: "Localizar lote", exact: true }).click();
    await page.getByRole("heading", { name: "Lote 142", exact: true }).waitFor();
    assert.equal(JSON.parse(new URL(page.url()).searchParams.get("lote")), "142");
    await page.getByRole("button", { name: "Focar lote" }).click();
    await page.screenshot({
      animations: "disabled",
      path: path.join(artifactDir, `located142-${viewport.width}.png`),
    });
    const drawing = page.locator(".p3-plan-view > g");
    const before = await drawing.getAttribute("transform");
    await page.getByRole("button", { name: "Aproximar", exact: true }).click();
    assert.notEqual(await drawing.getAttribute("transform"), before);
    await page.getByRole("button", { name: "Ajustar à tela", exact: true }).click();
    await page.getByRole("link", { name: "Acesso ao Pavilhão 13" }).focus();
    await page.keyboard.press("Enter");
    await page.waitForURL("**/mapa/pavilhoes/13/interior");
    await page.getByRole("link", { name: "Acesso ao Pavilhão 3" }).focus();
    await page.keyboard.press("Enter");
    await page.waitForURL("**/mapa/pavilhoes/3/interior");
    await page.getByRole("button", { name: "Voltar ao parque", exact: true }).click();
    await page.waitForURL(
      (url) => url.pathname === "/mapa" && ["3", '"3"'].includes(url.searchParams.get("pavilhao")),
    );
    await page.getByRole("button", { name: "Acesso Interno", exact: true }).click();
    await page.waitForURL("**/mapa/pavilhoes/3/interior");
    await page.locator('[data-environment="142"]').waitFor();
    report.checks.push({
      viewport,
      individualTargets: 142,
      area: 5,
      rate: 265,
      gross: 1325,
      reload: true,
      search142: true,
      zoom: true,
      passageRoundtrip: true,
      parkRoundtrip: true,
      independentSale39And104: 2650,
    });
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.unexpectedRequests, []);
  await writeFile(path.join(artifactDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({ checks: report.checks, errors: report.errors, artifactDir }, null, 2),
  );
} finally {
  await browser.close();
}
