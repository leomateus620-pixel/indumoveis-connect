/** Browser QA with isolated, documentary fixtures. No production login or writes. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  browser,
  newContext,
  baseURL,
  artifactDir,
  report,
} from "./commercial-map-browser-fixtures.mjs";
const plan = JSON.parse(
  await readFile("src/features/pavilion-interior/plan.generated.json", "utf8"),
);
const editionId = "22222222-2222-4222-8222-222222222222";
Object.assign(plan, {
  editionId,
  databasePlanId: "33333333-3333-4333-8333-333333333333",
  revisionId: "44444444-4444-4444-8444-444444444444",
});
const gallery = process.env.PAVILION_1_GALLERY_PHASE;
const prices = [
  450000, 660000, 660000, 1020000, 1020000, 660000, 660000, 1020000, 1020000, 660000, 960000,
  1500000, 960000, 1500000, 450000,
];
const lots = plan.environments
  .filter((e) => e.kind === "commercial")
  .map((e, i) => ({
    id: `55555555-5555-4555-8555-${String(i + 1).padStart(12, "0")}`,
    code: e.code,
    segmentKey: "p1",
    environmentId: e.id,
    geometryId: null,
    areaM2: e.declaredAreaM2,
    areaPending: false,
    status: "disponivel",
    pricingState: "priced",
    pricingBasis: "fixed",
    tariffCents: null,
    grossCents: prices[i],
    cornerState: null,
    policyVersion: 1,
    priceSource: {
      name: "Mostra Arq&Design.pdf",
      sha256: "8868c5a7b077a6b88223986dea8faf8b42bcde5df36a1a1ed71408ee42dfbef7",
      page: 1,
    },
  }));
const aggregate = {
  total: 15,
  sold: 0,
  reserved: 0,
  negotiating: 0,
  available: 15,
  blocked: 0,
  soldPercent: 0,
  knownAreaM2: 1203.62,
  soldAreaM2: 0,
  areaKnownCount: 15,
  soldAreaKnownCount: 0,
  soldAreaPercent: 0,
  pricedCount: 15,
  grossCents: 13200000,
  availableGrossCents: 13200000,
  availablePricedCount: 15,
};
const overview = {
  overall: aggregate,
  segments: [
    {
      ...aggregate,
      key: "p1",
      pavilionNumber: 1,
      label: "Pavilhão 1",
      description: "Mostra ARQ & Design",
    },
  ],
  financial: true,
  activity: true,
};
const details = {
  lots,
  events: [],
  totals: { contractedCents: null, negotiatingCents: null, receivedCents: null, openCents: null },
};
report.conditions.authAndData =
  "Isolated browser fixtures for fifteen documentary P1 spaces; no production login or writes.";
await mkdir(artifactDir, { recursive: true });
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const context = await newContext({
      viewport,
      commercialOverview: overview,
      commercialLots: lots,
    });
    await context.route("**/rest/v1/**", async (route) => {
      const request = route.request();
      const endpoint = new URL(request.url()).pathname.split("/").at(-1);
      if (endpoint === "preview_guided_sale") {
        const args = request.postDataJSON();
        const selected = lots.filter((l) => args.p_space_ids.includes(l.id));
        const total = selected.reduce((sum, l) => sum + l.grossCents, 0);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            editionId,
            segmentKey: "p1",
            lots: selected.map((l) => ({ ...l, agreedCents: l.grossCents })),
            areaM2: selected.reduce((sum, l) => sum + l.areaM2, 0),
            grossCents: total,
            totalCents: total,
            schedule: [],
            policy: {
              version: 1,
              today: "2026-11-15",
              firstDueOn: "2026-11-15",
              lastDueOn: "2027-03-30",
              maxInstallments: 18,
            },
            quoteFingerprint: "local-browser-fixture",
          }),
        });
      }
      const values = {
        get_pavilion_interior: plan,
        pavilion_plan_revisions: { id: plan.revisionId, revision: 2 },
        get_pavilion_interior_commercial: Object.fromEntries(
          lots.map((l) => [l.code, { status: "disponivel" }]),
        ),
        get_commercial_details: details,
        companies: [
          {
            id: "66666666-6666-4666-8666-666666666666",
            trade_name: "Empresa de teste",
            legal_name: "Empresa de teste",
            tax_id: null,
          },
        ],
      };
      if (Object.hasOwn(values, endpoint))
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(values[endpoint]),
        });
      return route.fallback();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    if (gallery) {
      const { checkGallery } = await import("./pavilion-interior/check-arq-design.mjs");
      report.checks.push(
        await checkGallery({ page, plan, lots, gallery, viewport, baseURL, artifactDir }),
      );
      await context.close();
      continue;
    }
    await page.goto(`${baseURL}/dashboard-comercial?segmento=p1`);
    await page.getByText("15 lotes comerciais", { exact: true }).waitFor();
    assert.match(await page.locator(".cd-overview").innerText(), /132\.000,00/);
    assert.match(await page.locator(".cd-overview").innerText(), /1\.203,62/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    assert.equal(overflow, false, "Dashboard viewport overflow");
    await page.screenshot({
      path: path.join(artifactDir, `dashboard-${viewport.width}.png`),
      fullPage: true,
    });
    await page.goto(`${baseURL}/mapa/pavilhoes/1/interior?espaco=15`);
    await page.getByRole("heading", { name: "Banheiros", exact: true }).waitFor();
    assert.match(await page.locator(".arq-sidebar").innerText(), /Preço por espaço/);
    assert.match(await page.locator(".arq-sidebar").innerText(), /4\.500,00/);
    assert.doesNotMatch(
      await page.locator(".arq-sidebar").innerText(),
      /Tarifa por m²|Ambiente de apoio/,
    );
    await page.screenshot({ path: path.join(artifactDir, `space15-${viewport.width}.png`) });
    await page.reload();
    await page.getByText("Preço por espaço", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Modo Comercialização", exact: true }).click();
    if (viewport.width < 600)
      await page.getByRole("button", { name: "Ambientes", exact: true }).click();
    await page
      .locator(".arq-sidebar")
      .getByRole("button", { name: "15 · Banheiros", exact: true })
      .click();
    await page
      .locator(".arq-sidebar")
      .getByRole("button", { name: "01 · Recepção", exact: true })
      .click();
    if (viewport.width < 600) await page.locator(".guided-mobile-bar").click();
    await page.getByRole("button", { name: "Remover lote 15", exact: true }).waitFor();
    assert.match(await page.locator(".guided-cart-totals:visible").innerText(), /9\.000,00/);
    await page.screenshot({ path: path.join(artifactDir, `selection-${viewport.width}.png`) });
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.screenshot({ path: path.join(artifactDir, `checkout-start-${viewport.width}.png`) });
    await page
      .getByRole("combobox", { name: /^Empresa/ })
      .selectOption("66666666-6666-4666-8666-666666666666");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByRole("heading", { name: "Valores e pagamento", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Informar outro valor", exact: true }).count(),
      2,
    );
    assert.match(await page.getByLabel("Valores por lote").innerText(), /Tabela R\$\s*4\.500,00/);
    await page.screenshot({ path: path.join(artifactDir, `checkout-${viewport.width}.png`) });
    report.checks.push({
      viewport,
      dashboard: true,
      fixedPrice: true,
      reload: true,
      selection9000: true,
      checkout: true,
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
