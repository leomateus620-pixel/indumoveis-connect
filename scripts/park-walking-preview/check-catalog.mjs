import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const click = (locator) => locator.evaluate((element) => element.click());

async function loadCatalogue() {
  const configFile = fileURLToPath(new URL("./vite.config.ts", import.meta.url));
  const source = fileURLToPath(new URL("../../src/features/commercial-map/", import.meta.url));
  const server = await createServer({
    configFile,
    server: { middlewareMode: true, ws: false },
    appType: "custom",
  });
  try {
    const [territory, layout, guidance, position, urban, { default: network }] = await Promise.all(
      [
        "data/territory",
        "permanentParkLayout",
        "walking/guidance",
        "walking/position",
        "urbanReference",
      ]
        .map((file) => server.ssrLoadModule(`/@fs${source}${file}.ts`))
        .concat(server.ssrLoadModule("/extended-network.json")),
    );
    const entries = [
      ...territory.ENTITIES.map(({ id, label, kind, location }) => ({ id, label, kind, location })),
      ...layout.PERMANENT_PARK_LANDMARKS.map(({ id, name, existingOwner }) => ({
        id,
        label: name,
        kind: "structure",
        location: "Disponível no mapa 3D",
        existingOwner,
      })),
    ];
    const seen = new Map();
    const targets = entries.map((target) => {
      const key = JSON.stringify([target.label, target.location]);
      const index = seen.get(key) ?? 0;
      seen.set(key, index + 1);
      const destination = network.destinations.find(({ id }) => id === target.id);
      const alias = entries.find(({ existingOwner }) => existingOwner === target.id);
      const shared = alias && network.destinations.find(({ id }) => id === alias.id);
      return {
        ...target,
        index,
        destination: destination ?? (shared && { ...shared, id: target.id, label: target.label }),
      };
    });
    const shapes = [
      ...layout.PARK_CORE_ENTITIES.filter(({ kind }) => kind !== "landscape"),
      ...layout.PERMANENT_PARK_LANDMARKS.filter(({ existingOwner }) => !existingOwner),
    ];
    return { targets, shapes, network, ...guidance, ...position, ...urban };
  } finally {
    await server.close();
  }
}

async function choose(page, target) {
  await click(page.getByRole("button", { name: "Buscar lote, pavilhão, via ou estrutura" }));
  await page.getByPlaceholder("Lote, pavilhão, via ou estrutura").fill(target.label);
  const clicked = await page.locator(".im-map-result-copy").evaluateAll((rows, item) => {
    const match = rows.filter(
      (row) =>
        row.querySelector("strong").textContent === item.label &&
        row.querySelector("small").textContent === item.location,
    )[item.index];
    match?.closest("button").click();
    return Boolean(match);
  }, target);
  assert.ok(clicked, `Destino ausente na busca: ${target.id}`);
}

async function clickMapTargets(page, stage, targets, button) {
  const map = stage.getByRole("img", { name: /Planta interativa do parque/ });
  const picked = page.getByLabel("Destino selecionado");
  const original = await map.getAttribute("viewBox");
  const hit = [];
  const overlapped = [];
  try {
    for (const { id, label } of targets) {
      const point = await map.evaluate((svg, id) => {
        const target = [...svg.querySelectorAll("[data-entity], [data-landmark]")].find(
          (element) =>
            (element.getAttribute("data-entity") ?? element.getAttribute("data-landmark")) === id,
        );
        const box = target.getBBox();
        // Frame each mapped graphic before exercising real browser hit testing.
        const width = Math.max(box.width * 1.4, 24);
        const height = Math.max(box.height * 1.4, 24);
        svg.setAttribute(
          "viewBox",
          [box.x + (box.width - width) / 2, box.y + (box.height - height) / 2, width, height].join(
            " ",
          ),
        );
        const matrix = svg.getScreenCTM();
        const offsets = [0.5, 0.35, 0.65, 0.2, 0.8, 0.08, 0.92, 0.02, 0.98];
        for (const u of offsets) {
          for (const v of offsets) {
            const pt = new DOMPoint(box.x + u * box.width, box.y + v * box.height).matrixTransform(
              matrix,
            );
            const visible = document
              .elementFromPoint(pt.x, pt.y)
              ?.closest("[data-entity], [data-landmark]");
            if (visible === target) return [pt.x, pt.y];
          }
        }
        return null;
      }, id);
      if (!point) {
        overlapped.push(id);
        continue;
      }
      await page.mouse.click(...point);
      await picked.getByText(label, { exact: true }).waitFor();
      await click(button(page, "Limpar destino selecionado"));
      hit.push(id);
    }
  } finally {
    await map.evaluate((svg, value) => svg.setAttribute("viewBox", value), original);
  }
  return { actualClicks: hit.length, overlapped };
}

export async function checkCatalogue({ open, startBrowserGps, send, button, findWalkingRoute }) {
  const catalog = await loadCatalogue();
  const { targets, network, URBAN_REFERENCE, sceneToReferenceMetres } = catalog;
  const report = {
    selectable: targets.length,
    withoutRoute: targets
      .filter(({ destination }) => !destination)
      .map(({ id, label, kind }) => ({
        id,
        label,
        kind,
      })),
    scenarios: [],
  };
  const scenarios = [
    { area: "Portão 3", point: [149.1042480964776, 95.8], accuracy: 2, route: true },
    { area: "Alameda Mercosul", point: [70, 47], accuracy: 5, route: true },
    { area: "Rua Brasil", point: [100, 24.5], accuracy: 8, route: true },
    { area: "Setor leste sem corredor", point: [170, 60], accuracy: 2, route: false },
    {
      area: "Rótula do entorno",
      point: URBAN_REFERENCE.roundabout.center,
      accuracy: 8,
      route: false,
    },
    {
      area: "Leitura aproximada na Rua Argentina",
      point: [90, 65.8125],
      accuracy: 35,
      route: false,
    },
    { area: "Fora da área do mapa", point: [900, -600], accuracy: 5, route: false, outside: true },
    { area: "Partida manual no Pavilhão 12", manual: "indumoveis:pavilion:12:1", route: true },
  ];
  const { page, context } = await open({ noWebGL: true });
  const counters = { route: 0, waitForOrigin: 0, noDestination: 0 };
  try {
    await page.getByLabel("Rede", { exact: true }).selectOption("extended");
    await startBrowserGps(page);
    page.setDefaultTimeout(7_000);
    const stage = page.locator('.im-map-stage[data-representation="2d"]');
    await stage.waitFor();
    const shapeIds = await stage
      .locator("[data-entity], [data-landmark]")
      .evaluateAll((nodes) =>
        nodes
          .map((node) => node.getAttribute("data-entity") ?? node.getAttribute("data-landmark"))
          .sort(),
      );
    assert.deepEqual(
      shapeIds,
      targets
        .filter(({ kind, existingOwner }) => kind !== "landscape" && !existingOwner)
        .map(({ id }) => id)
        .sort(),
    );
    report.mapTargets = shapeIds.length;
    const path = stage.locator(".im-walking-plan .im-walking-route");
    const position = stage.locator(".im-walking-plan-position");
    const summary = page.getByLabel("Resumo da rota");
    const picked = page.getByLabel("Destino selecionado");
    const metrics = summary.locator(".im-walking-metrics");
    const clear = async () => {
      if (await summary.count()) await click(button(page, "Limpar rota"));
      if (await picked.count()) await click(button(page, "Limpar destino selecionado"));
    };
    for (const scenario of scenarios) {
      const before = { ...counters };
      let start;
      if (scenario.manual) {
        await page.evaluate(() => window.__walkingTest.error(1));
        await page.getByText("A permissão de localização foi negada.").waitFor();
        await page.getByLabel("Escolher ponto de partida").selectOption(scenario.manual);
        start = { node: scenario.manual };
      } else {
        await send(page, scenario.point, scenario.accuracy, 16_000);
        await send(page, scenario.point, scenario.accuracy);
        const fix = catalog.filterFix(null, {
          point: sceneToReferenceMetres(scenario.point),
          at: 1,
          accuracy: scenario.accuracy,
        });
        const match = catalog.matchPosition(network, fix, null);
        start = match?.location;
        assert.equal(Boolean(start), scenario.route, scenario.area);
        if (scenario.outside) {
          await page.getByText("Fora da área do mapa", { exact: false }).waitFor();
          assert.equal(await position.count(), 0);
          assert.equal(await path.count(), 0);
        } else {
          await page.getByText(`GPS ±${scenario.accuracy} m`, { exact: false }).waitFor();
          await position.waitFor();
        }
      }
      for (const [index, target] of targets.entries()) {
        try {
          await clear();
          if (!scenario.manual && index % 8 === 0)
            await send(page, scenario.point, scenario.accuracy);
          await choose(page, target);
          await picked.getByText(target.label, { exact: true }).waitFor();
          if (!target.destination) {
            await picked.getByText("Sem caminho validado para este destino.").waitFor();
            assert.equal(await button(page, "Traçar rota a pé").count(), 0);
            assert.equal(await path.count(), 0);
            counters.noDestination++;
            continue;
          }
          await click(button(page, "Traçar rota a pé"));
          await summary.getByText(target.destination.label, { exact: true }).first().waitFor();
          if (!scenario.route) {
            await summary
              .getByText("Escolha uma partida ou aguarde uma posição confiável na rede do piloto.")
              .waitFor();
            assert.equal(await path.count(), 0);
            counters.waitForOrigin++;
            continue;
          }
          const expected = findWalkingRoute(network, start, target.destination);
          assert.ok(expected, "A entrada candidata deve ser alcançável");
          const rounded = Math.round(expected.metres / 5) * 5;
          const eta =
            expected.metres < 75
              ? "menos de 1 min"
              : `cerca de ${Math.round(expected.metres / 75)} min`;
          await metrics
            .getByText(rounded ? `${rounded} m` : "menos de 5 m", { exact: true })
            .waitFor();
          await metrics.getByText(eta, { exact: true }).waitFor();
          const arrival = summary.locator(".im-walking-arrival");
          assert.equal(
            await arrival.textContent(),
            `Chegada${network.nodes[expected.entry].label}`,
          );
          assert.equal(await path.count(), expected.metres > 1e-6 ? 1 : 0);
          counters.route++;
        } catch (error) {
          throw new Error(`${scenario.area} · ${target.id}`, { cause: error });
        }
      }
      await clear();
      await button(page, "Quero sair").click();
      if (scenario.route) await summary.locator(".im-walking-arrival").waitFor();
      else await summary.getByText(/aguarde uma posição confiável/).waitFor();
      if (scenario.area === "Rua Brasil") {
        // A preexisting GPS route must cease to render immediately outside the map.
        await send(page, [900, -600], 5, 16_000);
        await page.getByText("Fora da área do mapa", { exact: false }).waitFor();
        assert.equal(await path.count(), 0);
        assert.equal(await position.count(), 0);
        report.activeRouteHiddenOutside = true;
      }
      await clear();
      report.scenarios.push({
        area: scenario.area,
        accuracy: scenario.accuracy ?? null,
        ...Object.fromEntries(
          Object.entries(counters).map(([key, count]) => [key, count - before[key]]),
        ),
        exit: scenario.route ? "route" : "waitForOrigin",
      });
      console.log(`Catálogo completo: ${scenario.area}`);
    }
    report.mapHitTesting = await clickMapTargets(
      page,
      stage,
      targets.filter(({ id }) => shapeIds.includes(id)),
      button,
    );
    assert.deepEqual(report.mapHitTesting.overlapped, []);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(await context.cookies(), []);
    return { ...report, totals: counters };
  } finally {
    await context.close();
  }
}

export async function checkMap3D({ open, ready, setPose, button }) {
  const { targets, shapes } = await loadCatalogue();
  const { page, context } = await open();
  try {
    await page.getByLabel("Rede", { exact: true }).selectOption("extended");
    await button(page, "Navegar pelo parque").click();
    await ready(page);
    await page.waitForFunction(() => window.__indumoveisMap.realism.ready);
    const canvas = page.locator("canvas");
    const picked = page.getByLabel("Destino selecionado").locator("strong");
    const verified = [];
    for (const shape of shapes) {
      const { id, label, kind, destination } = targets.find(({ id }) => id === shape.id);
      const xs = shape.polygon.map(([x]) => x);
      const zs = shape.polygon.map(([, z]) => z);
      const centre = [
        (Math.min(...xs) + Math.max(...xs)) / 2,
        (Math.min(...zs) + Math.max(...zs)) / 2,
      ];
      await setPose(page, centre, 45, 0.15);
      const rect = await canvas.boundingBox();
      const samples = await page.evaluate(
        ({ id, kind, width, height }) => {
          const map = window.__indumoveisMap;
          const middle = { x: width / 2, y: height / 2 };
          const offsets = [0, -9, 9, -20, 20, -35, 35, -60, 60, -95, 95];
          const projections = [map.project(id, 0), map.project(id, 1), middle].filter(Boolean);
          const points = projections
            .flatMap(({ x, y }) =>
              offsets.flatMap((dx) => offsets.map((dy) => ({ x: x + dx, y: y + dy }))),
            )
            .filter(({ x, y }) => x >= width * 0.27 && x < width && y > 0 && y < height);
          if (kind === "structure")
            return points.filter(({ x, y }) => map.pickAt(x, y) === null).slice(0, 16);
          const point = points.find(({ x, y }) => map.pickAt(x, y) === id);
          return point ? [point] : [];
        },
        { id, kind, width: rect.width, height: rect.height },
      );
      assert.ok(samples.length, `Nenhum ponto de seleção 3D para ${id}`);
      let confirmed = false;
      for (const { x, y } of samples) {
        await page.mouse.click(rect.x + x, rect.y + y);
        if ((await picked.textContent({ timeout: 350 }).catch(() => null)) === label) {
          confirmed = true;
          assert.equal(await button(page, "Traçar rota a pé").count(), destination ? 1 : 0, id);
        }
        const clear = button(page, "Limpar destino selecionado");
        if (await clear.count()) await click(clear);
        if (confirmed) break;
      }
      assert.ok(confirmed, `Clique 3D não selecionou ${id}`);
      verified.push(id);
    }
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(await context.cookies(), []);
    return { actualClicks: verified.length, verified };
  } finally {
    await context.close();
  }
}
