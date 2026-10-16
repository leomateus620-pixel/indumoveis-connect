/** Production-browser laboratory, entirely local REST/auth fixtures. No database writes.
 * MAP_BASE_URL=http://127.0.0.1:3000 node scripts/commercial-map-validation.mjs
 * Optional: PLAYWRIGHT_MODULE, MAP_ARTIFACT_DIR, MAP_BROWSER_GPU=hardware.
 * The default software renderer is explicitly not a physical GPU benchmark.
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
const pavilionCases = [
  ["1", "Pavilhão 1 · Mostra Arq & Design"],
  ["14", "Pavilhão 14 · SINDUSCOM"],
  ["12", "Pavilhão 12 · Móveis e seriados"],
  ["8", "Pavilhão 8 · Fornecedores e construção civil"],
  ["13", "Pavilhão 13 · Salão de Imóveis"],
  ["3", "Pavilhão 3 · Comércio e mobiliário"],
];
const poseError = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
const angularDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
async function settledPose(page) {
  // Allow the requested React prop to reach the existing renderer, then wait for its owner.
  await page.waitForTimeout(60);
  await cameraIdle(page);
  return diagnose(page);
}
async function dragCanvas(page, dx = 100, dy = 30, { button = "left", steps = 12 } = {}) {
  const stage = await page.locator(".im-map-stage").boundingBox();
  const x = stage.x + stage.width * 0.36,
    y = stage.y + stage.height * 0.49;
  await page.mouse.move(x, y);
  await page.mouse.down({ button });
  await page.mouse.move(x + dx, y + dy, { steps });
  await page.mouse.up({ button });
}
async function mapScenario(task, options = {}) {
  const context = await newContext(options);
  const page = await context.newPage();
  const usefulMs = await openMap(page);
  assert.equal(
    await settleRepresentation(page),
    "ready",
    "Compatible laboratory did not present 3D",
  );
  await setProfile(page, "light");
  await settledPose(page);
  const detail = await task(page, { context, usefulMs });
  await context.close();
  return detail;
}
let territoryData;
async function sourceTerritory() {
  if (!territoryData) {
    const source = await readFile("src/features/commercial-map/data/territory.ts", "utf8");
    territoryData = import(
      `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
    );
  }
  return territoryData;
}
async function panToArgentinaCrossing(page) {
  const { ENTITIES } = await sourceTerritory();
  const rects = ["argentina", "mercosul"].map((id) => {
    const entity = ENTITIES.find((entry) => entry.id === `indumoveis:road:${id}`);
    return {
      minX: Math.min(...entity.polygon.map((p) => p[0])),
      maxX: Math.max(...entity.polygon.map((p) => p[0])),
      minZ: Math.min(...entity.polygon.map((p) => p[1])),
      maxZ: Math.max(...entity.polygon.map((p) => p[1])),
    };
  });
  const target = [
    (Math.max(...rects.map((r) => r.minX)) + Math.min(...rects.map((r) => r.maxX))) / 2,
    (Math.max(...rects.map((r) => r.minZ)) + Math.min(...rects.map((r) => r.maxZ))) / 2,
  ];
  const pose = await settledPose(page),
    range = pose.distance * 0.08;
  const dx = target[0] - pose.target[0],
    dz = target[1] - pose.target[1];
  const horizontal = Math.round(
    (dx * Math.cos(pose.azimuth) - dz * Math.sin(pose.azimuth)) / range,
  );
  const vertical = Math.round((dx * Math.sin(pose.azimuth) + dz * Math.cos(pose.azimuth)) / range);
  assert(Math.abs(horizontal) + Math.abs(vertical) < 30, "Crossing focus was not already close");
  await openAuxiliary(page, "Ajuda de navegação");
  for (const [steps, negative, positive] of [
    [horizontal, "esquerda", "direita"],
    [vertical, "cima", "baixo"],
  ])
    for (let i = 0; i < Math.abs(steps); i++)
      await page
        .getByRole("button", { name: `Mover para ${steps < 0 ? negative : positive}`, exact: true })
        .click();
  await page.getByRole("button", { name: "Fechar menu", exact: true }).click();
  const result = await settledPose(page);
  assert(
    poseError(result.target, target) <= range * 1.5,
    "Close reference missed the real crossing",
  );
  return { target, actual: result.target, horizontal, vertical };
}
async function runStage2Checks() {
  await runCheck("N01 stable initial perspective is real WebGL", () =>
    mapScenario(async (page) => {
      const pose = await settledPose(page);
      assert(pose.position.every(Number.isFinite) && pose.distance > 0);
      assert(
        pose.polar > 0.15 && pose.polar < 1.44,
        "Initial stable view is effectively vertical or unsafe",
      );
      assert.equal(
        await page.locator(".im-map-svg").count(),
        0,
        "SVG remains the chosen representation",
      );
      assert.equal((await page.evaluate(() => window.__MAP_LAB__.contexts())).active, 1);
      await snapshot(page, "N01-perspective");
      return pose;
    }),
  );
  await runCheck("N02 Superior Girar real drag leaves vertical preset", () =>
    mapScenario(async (page) => {
      await chooseView(page, "Superior");
      const before = await settledPose(page);
      await snapshot(page, "N02-before-top-drag");
      await chooseGesture(page, "Girar");
      await dragCanvas(page, 110, -85);
      const after = await settledPose(page);
      await snapshot(page, "N02-after-top-drag");
      await writeFile(
        path.join(artifactDir, "N02-poses.json"),
        JSON.stringify({ before, after }, null, 2),
      );
      assert(
        Math.abs(angularDelta(after.azimuth, before.azimuth)) > 0.05,
        "Top preset blocked real orbit",
      );
      assert(Math.abs(after.polar - before.polar) > 0.05, "Top preset blocked real inclination");
      assert.equal(await page.locator('.im-map-views button[aria-pressed="true"]').count(), 0);
      assert.match(await page.locator(".im-map-caption").innerText(), /Orientação livre/);
      assert.equal(after.instance, before.instance);
      await snapshot(page, "N02-top-manual-orbit");
      return { before, after };
    }),
  );
  await runCheck("N03 presets preserve selected identity target and distance", () =>
    mapScenario(async (page) => {
      await selectResult(page, "70", "Lote 70");
      const before = await settledPose(page),
        samples = [];
      for (const view of ["Superior", "Oblíqua", "3D"]) {
        await chooseView(page, view);
        const pose = await settledPose(page);
        assert.equal(pose.lastSelectedId, "indumoveis:external:lot:70");
        assert(await page.getByRole("heading", { name: "Lote 70", exact: true }).isVisible());
        assert(poseError(pose.target, before.target) < 0.2, `${view} reset the selected target`);
        assert(
          Math.abs(pose.distance / before.distance - 1) < 0.03,
          `${view} reset perceived scale`,
        );
        samples.push({ view, pose });
      }
      return { before, samples };
    }),
  );
  await runCheck("N04 full pavilion orbit has safe inclination without azimuth wall", () =>
    mapScenario(async (page) => {
      await selectResult(page, "Pavilhão 1", pavilionCases[0][1]);
      await closeDetail(page);
      await chooseView(page, "Oblíqua");
      await chooseGesture(page, "Girar");
      let previous = await settledPose(page),
        unwrapped = 0;
      const samples = [previous];
      for (let i = 0; i < 12 && Math.abs(unwrapped) < Math.PI * 2 + 0.15; i++) {
        await dragCanvas(page, 250, i % 2 ? -8 : 8);
        const current = await settledPose(page);
        unwrapped += angularDelta(current.azimuth, previous.azimuth);
        assert(current.polar > 0 && current.polar < Math.PI / 2, "Orbit flipped or crossed ground");
        assert(current.position[1] > 0 && current.distance > 0);
        samples.push(current);
        previous = current;
      }
      assert(Math.abs(unwrapped) >= Math.PI * 2, `Orbit stopped at ${unwrapped} radians`);
      await snapshot(page, "N04-complete-orbit");
      return { unwrappedRadians: unwrapped, samples };
    }),
  );
  await runCheck("N05 each pavilion inspection orbits zooms and restores exterior pose", () =>
    mapScenario(async (page) => {
      const results = [];
      for (const [number, label] of pavilionCases) {
        await chooseView(page, "Oblíqua");
        await selectResult(page, `Pavilhão ${number}`, label);
        const exterior = await settledPose(page);
        await page.getByRole("button", { name: "Inspecionar sem cobertura", exact: true }).click();
        const entered = await settledPose(page);
        assert.equal(entered.inspectedId, `indumoveis:pavilion:${number}`);
        await closeDetail(page);
        await chooseGesture(page, "Girar");
        const beforeOrbit = await settledPose(page);
        await dragCanvas(page, 100, 15);
        const orbited = await settledPose(page);
        assert(Math.abs(angularDelta(orbited.azimuth, beforeOrbit.azimuth)) > 0.05);
        await page.getByRole("button", { name: "Aproximar", exact: true }).click();
        const zoomed = await settledPose(page);
        assert(zoomed.distance < orbited.distance, "Inspection zoom is locked");
        await snapshot(page, `N05-inspection-P${number}`);
        await page.getByRole("button", { name: "Voltar ao parque", exact: true }).click();
        const restored = await settledPose(page);
        assert.equal(restored.inspectedId, null);
        assert.equal(restored.instance, exterior.instance, "Inspection recreated Canvas");
        assert(
          poseError(restored.position, exterior.position) < 0.2,
          `P${number} exterior camera was lost`,
        );
        assert(
          poseError(restored.target, exterior.target) < 0.2,
          `P${number} exterior target was lost`,
        );
        results.push({ number, exterior, entered, orbited, zoomed, restored });
      }
      return results;
    }),
  );
  await runCheck("N06 pointer interrupts preset at visible pose without snap back", () =>
    mapScenario(async (page) => {
      await chooseGesture(page, "Girar");
      await chooseView(page, "Superior");
      await dragCanvas(page, 125, 48, { steps: 4 });
      const claimed = await settledPose(page);
      await page.waitForTimeout(520);
      const later = await diagnose(page);
      assert(
        poseError(claimed.position, later.position) < 0.05,
        "Cancelled preset resumed after gesture",
      );
      assert(poseError(claimed.target, later.target) < 0.05);
      assert.equal(later.cameraState, "idle");
      assert.match(await page.locator(".im-map-caption").innerText(), /Orientação livre/);
      return { claimed, later };
    }),
  );
  await runCheck("N07 wheel buttons pinch share limits and cancellation has no jump", () =>
    mapScenario(
      async (page, { context }) => {
        const box = await page.locator("canvas").boundingBox();
        const x = box.x + box.width * 0.5,
          y = box.y + box.height * 0.5;
        const wheelToLimit = async (direction) => {
          await page.mouse.move(x, y);
          // Input normalization intentionally caps each event: exercise sustained real input.
          for (let i = 0; i < 60; i++) await page.mouse.wheel(0, direction * 120);
          const limit = await settledPose(page);
          await page.mouse.wheel(0, direction * 120);
          const repeated = await settledPose(page);
          assert(
            Math.abs(repeated.distance - limit.distance) < 0.05,
            "Wheel did not reach a stable limit",
          );
          return repeated;
        };
        const wheelMin = await wheelToLimit(-1);
        await page.getByRole("button", { name: "Aproximar", exact: true }).click();
        const buttonMin = await settledPose(page);
        assert(
          Math.abs(buttonMin.distance - wheelMin.distance) < 0.05,
          "Button and wheel minimum differ",
        );
        const wheelMax = await wheelToLimit(1);
        await page.getByRole("button", { name: "Afastar", exact: true }).click();
        const buttonMax = await settledPose(page);
        assert(
          Math.abs(buttonMax.distance - wheelMax.distance) < 0.05,
          "Button and wheel maximum differ",
        );
        assert(wheelMax.distance > wheelMin.distance * 2);
        await page.getByRole("button", { name: "Reenquadrar parque", exact: true }).click();
        const beforeTouch = await settledPose(page);
        const cdp = await context.newCDPSession(page);
        const touches = (half) => [
          { x: x - half, y, id: 0 },
          { x: x + half, y, id: 1 },
        ];
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: x - 25, y, id: 0 }],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: touches(25),
        });
        const secondEntered = await diagnose(page);
        assert(
          poseError(secondEntered.position, beforeTouch.position) < 0.1,
          "Second finger entry jumped",
        );
        for (let i = 1; i <= 10; i++)
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: touches(25 + i * 5),
          });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
        const pinched = await settledPose(page);
        assert(pinched.distance < beforeTouch.distance * 0.85, "Real CDP pinch did not zoom");
        assert(
          pinched.distance >= wheelMin.distance - 0.05 &&
            pinched.distance <= wheelMax.distance + 0.05,
        );
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
        await page.waitForTimeout(300);
        const afterCancel = await diagnose(page);
        assert(
          poseError(afterCancel.position, pinched.position) < 0.05,
          "Cancelled pinch retained movement",
        );
        assert.equal(await page.locator(".im-map-detail").count(), 0);
        return {
          wheelMin,
          buttonMin,
          wheelMax,
          buttonMax,
          beforeTouch,
          secondEntered,
          pinched,
          afterCancel,
          note: "Synthetic Chromium CDP touch, not physical trackpad/touch certification.",
        };
      },
      { viewport: { width: 390, height: 844 } },
    ),
  );
  await runCheck("N08 pan buttons follow screen axes after orbit", () =>
    mapScenario(async (page) => {
      await chooseGesture(page, "Girar");
      await dragCanvas(page, 200, 22);
      const before = await settledPose(page);
      await openAuxiliary(page, "Ajuda de navegação");
      await page.getByRole("button", { name: "Mover para direita", exact: true }).click();
      const right = await settledPose(page);
      const expectedRight = [Math.cos(before.azimuth), -Math.sin(before.azimuth)];
      const delta = right.target.map((value, i) => value - before.target[i]);
      const dot = delta[0] * expectedRight[0] + delta[1] * expectedRight[1];
      const perpendicular = Math.abs(delta[0] * expectedRight[1] - delta[1] * expectedRight[0]);
      assert(
        dot > 0 && perpendicular < Math.hypot(...delta) * 0.05,
        "Pan is tied to territorial rather than screen axes",
      );
      await page.getByRole("button", { name: "Mover para esquerda", exact: true }).click();
      const back = await settledPose(page);
      assert(poseError(back.target, before.target) < 0.2);
      return { before, right, back, screenRightDot: dot, perpendicular };
    }),
  );
  await runCheck("N09 selection survives orientation sidebar and panel resize", () =>
    mapScenario(async (page) => {
      await selectResult(page, "70", "Lote 70");
      const before = await settledPose(page);
      await chooseView(page, "Oblíqua");
      await page.getByRole("button", { name: "Expandir menu", exact: true }).click();
      const expanded = await settledPose(page);
      const point = await projectedPoint(page, "indumoveis:external:lot:70");
      const stage = await page.locator(".im-map-stage").boundingBox();
      const panel = await page.locator(".im-map-detail").boundingBox();
      assert(point.x >= stage.x && point.y >= stage.y && point.y < stage.y + stage.height);
      assert(point.x < panel.x - 4, "Selected lot is hidden behind the side panel");
      assert.equal(expanded.lastSelectedId, before.lastSelectedId);
      assert.equal(expanded.instance, before.instance);
      await page.getByRole("button", { name: "Recolher menu", exact: true }).click();
      await snapshot(page, "N09-selected-sidebar");
      return { before, expanded, point, stage, panel };
    }),
  );
  await runCheck("N10 oblique facade picking identifies pavilion and B7 volume", () =>
    mapScenario(async (page) => {
      const results = [];
      for (const item of [
        { query: "Pavilhão 1", label: pavilionCases[0][1], id: "indumoveis:pavilion:1" },
        { query: "Estrutura B7", label: "Estrutura B7", id: "indumoveis:support:b7" },
      ]) {
        await selectResult(page, item.query, item.label);
        await closeDetail(page);
        await chooseView(page, "Oblíqua");
        const before = await settledPose(page);
        const point = await projectedPoint(page, item.id, 0.4);
        await page.mouse.click(point.x, point.y);
        await page
          .getByRole("heading", { name: item.label, exact: true })
          .waitFor({ timeout: 4000 });
        const after = await settledPose(page);
        assert.equal(after.lastSelectedId, item.id, "Facade ray picked another entity");
        await snapshot(page, `N10-facade-${item.id.split(":").at(-1)}`);
        results.push({ item, point, before, after });
        await closeDetail(page);
      }
      return results;
    }),
  );
  await runCheck("N11 header popovers do not click through or block remaining canvas", () =>
    mapScenario(async (page) => {
      const before = await settledPose(page);
      const search = await page
        .getByRole("button", { name: "Buscar lote, pavilhão ou via", exact: true })
        .boundingBox();
      await page.mouse.move(search.x + 22, search.y + 22);
      await page.mouse.wheel(0, -400);
      const toolbarWheel = await settledPose(page);
      assert(
        poseError(toolbarWheel.position, before.position) < 0.05,
        "Header wheel leaked to camera",
      );
      await openAuxiliary(page, "Legenda");
      await page.locator(".im-map-popover p").first().click();
      assert.equal(
        await page.locator(".im-map-detail").count(),
        0,
        "Legend click selected underlying entity",
      );
      await dragCanvas(page, 90, 20);
      const dragged = await settledPose(page);
      assert(
        poseError(dragged.position, toolbarWheel.position) > 0.5,
        "Popover overlay blocked the remaining Canvas",
      );
      await page.keyboard.press("Escape");
      const focus = await page.evaluate(() => document.activeElement.getAttribute("aria-label"));
      assert(
        ["Legenda", "Mais ações do mapa"].includes(focus),
        "Escape lost the upper trigger focus",
      );
      return { before, toolbarWheel, dragged, focus, layout: await geometryState(page) };
    }),
  );
  await runCheck("N11b header zoom takes ownership from a held touch", () =>
    mapScenario(
      async (page, { context }) => {
        await chooseGesture(page, "Mover");
        const before = await settledPose(page);
        const canvas = await page.locator("canvas").boundingBox();
        const x = canvas.x + canvas.width * 0.35,
          y = canvas.y + canvas.height * 0.48;
        const cdp = await context.newCDPSession(page);
        const sendTouch = (type, touchPoints) =>
          cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
        await sendTouch("touchStart", [{ x, y, id: 3 }]);
        const zoom = await page
          .getByRole("button", { name: "Aproximar", exact: true })
          .boundingBox();
        // A second input source activates the real upper control while the touch is held.
        await page.mouse.click(zoom.x + zoom.width / 2, zoom.y + zoom.height / 2);
        for (let step = 1; step <= 8; step++)
          await sendTouch("touchMove", [{ x: x + step * 7, y: y + step * 2, id: 3 }]);
        const commanded = await settledPose(page);
        assert(
          Math.abs(commanded.distance / before.distance - 1 / 1.2) < 0.002,
          "Held touch corrupted the header zoom destination",
        );
        await sendTouch("touchEnd", []);
        const released = await settledPose(page);
        assert(
          poseError(released.position, commanded.position) < 0.05,
          "Old touch release applied accumulated motion",
        );
        assert(poseError(released.target, commanded.target) < 0.05);
        assert.equal(released.instance, before.instance);
        assert.equal(
          await page.locator(".im-map-detail").count(),
          0,
          "Cancelled held touch selected a lot",
        );
        await sendTouch("touchStart", [{ x, y, id: 9 }]);
        for (let step = 1; step <= 6; step++)
          await sendTouch("touchMove", [{ x: x + step * 8, y: y + step * 3, id: 9 }]);
        await sendTouch("touchEnd", []);
        const freshGesture = await settledPose(page);
        assert(
          poseError(freshGesture.target, released.target) > 0.1,
          "New touch remained locked after header command",
        );
        assert.equal(freshGesture.instance, before.instance);
        await snapshot(page, "N11b-held-touch-header-zoom");
        return {
          before,
          commanded,
          released,
          freshGesture,
          note: "Real upper button via Chromium mouse input while a synthetic CDP touch stays held; old touch moves and a fresh gesture verify camera ownership. No physical-device claim.",
        };
      },
      { viewport: { width: 768, height: 1024 } },
    ),
  );
  await runCheck("stage2 architectural reference captures", () =>
    mapScenario(async (page) => {
      const references = [];
      const captures = [
        { name: "overview", view: "3D" },
        { name: "P1", view: "Oblíqua", query: "Pavilhão 1", label: pavilionCases[0][1] },
        { name: "P12", view: "Oblíqua", query: "Pavilhão 12", label: pavilionCases[2][1] },
        { name: "P8-P13-P3", view: "Oblíqua", query: "Pavilhão 8", label: pavilionCases[3][1] },
        { name: "B7", view: "Oblíqua", query: "Estrutura B7", label: "Estrutura B7" },
        {
          name: "Argentina-crossing",
          view: "3D",
          query: "01",
          label: "Lote 01",
        },
      ];
      // Fix only the evidence viewport. Source geometry, scene materials and camera remain real.
      await page.addStyleTag({
        content:
          ".im-map-workspace{position:fixed!important;inset:0 auto auto 0!important;width:1200px!important;height:656px!important}.im-map-header{height:56px!important;min-height:56px!important}",
      });
      await page.setViewportSize({ width: 1280, height: 760 });
      const previous = process.env.MAP_REFERENCE_POSES
        ? JSON.parse(await readFile(process.env.MAP_REFERENCE_POSES, "utf8"))
        : [];
      const territorySource = await readFile(
        "src/features/commercial-map/data/territory.ts",
        "utf8",
      );
      // Evidence framing derives its group centre from the three protected source rectangles.
      const groupRects = [8, 13, 3].map((number) => {
        const match = territorySource.match(
          new RegExp(`"pavilion:${number}",\\s*"pavilion",[\\s\\S]*?rect\\(([^)]+)\\)`),
        );
        assert(match, `Reference group footprint ${number} is no longer a source rectangle`);
        const coordinates = match[1].split(",").map((value) => Number(value.trim()) / 10);
        assert(coordinates.length === 4 && coordinates.every(Number.isFinite));
        return coordinates;
      });
      const groupCentre = [
        (Math.min(...groupRects.map((rect) => rect[0])) +
          Math.max(...groupRects.map((rect) => rect[2]))) /
          2,
        (Math.min(...groupRects.map((rect) => rect[1])) +
          Math.max(...groupRects.map((rect) => rect[3]))) /
          2,
      ];
      for (const capture of captures) {
        await chooseView(page, capture.view);
        await settledPose(page);
        if (capture.query) {
          await selectResult(page, capture.query, capture.label);
          await closeDetail(page);
          if (capture.name === "Argentina-crossing" && !process.env.MAP_REFERENCE_POSES) {
            await panToArgentinaCrossing(page);
          }
          if (capture.name === "P8-P13-P3") {
            for (let i = 0; i < 2; i++)
              await page.getByRole("button", { name: "Afastar", exact: true }).click();
            const groupPose = await settledPose(page);
            const dx = groupCentre[0] - groupPose.target[0],
              dz = groupCentre[1] - groupPose.target[1];
            await page.evaluate(
              ({ position, target }) => {
                window.__indumoveisMap?.setReferencePose?.(position, target);
              },
              {
                position: [
                  groupPose.position[0] + dx,
                  groupPose.position[1],
                  groupPose.position[2] + dz,
                ],
                target: groupCentre,
              },
            );
          }
        } else await page.getByRole("button", { name: "Reenquadrar parque", exact: true }).click();
        await settledPose(page);
        const reference = previous.find((row) => row.name === capture.name);
        const applied =
          reference &&
          (await page.evaluate((pose) => {
            if (!window.__indumoveisMap?.setReferencePose) return false;
            window.__indumoveisMap.setReferencePose(pose.position, pose.target);
            return true;
          }, reference.pose));
        await page.mouse.move(1275, 750);
        const pose = await settledPose(page);
        await snapshot(page, `reference-${capture.name}`);
        const canvas = await page.locator("canvas").boundingBox();
        assert(
          Math.abs(canvas.width - 1200) < 1 && Math.abs(canvas.height - 600) < 1,
          "Paired reference Canvas dimensions differ",
        );
        await page
          .locator("canvas")
          .screenshot({ path: path.join(artifactDir, `reference-${capture.name}-canvas.png`) });
        references.push({ ...capture, pose, canvas, baselinePoseApplied: !!applied });
      }
      await writeFile(
        path.join(artifactDir, "reference-poses.json"),
        `${JSON.stringify(references, null, 2)}\n`,
      );
      return {
        references,
        note: "Compare viewport, requested preset and recorded pose. MAP_REFERENCE_POSES applies a recorded baseline only when diagnostic pose setter is available; unmatched poses are not certified equivalent.",
      };
    }),
  );
}

try {
  playwright = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
} catch {
  playwright = require(bundle);
}

const baseURL = process.env.MAP_BASE_URL ?? "http://127.0.0.1:3000";
const mode = process.env.MAP_VALIDATION_MODE ?? "full";
const checkFilter = process.env.MAP_CHECK_FILTER ? new RegExp(process.env.MAP_CHECK_FILTER) : null;
const artifactDir = path.resolve(process.env.MAP_ARTIFACT_DIR ?? "artifacts.local/commercial-map");
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
  executablePath,
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

async function openMap(page) {
  const started = performance.now();
  await page.goto(`${baseURL}/mapa?mapDiagnostics=1`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Mapa Comercial", exact: true }).waitFor();
  await page.locator(".im-map-svg, canvas").first().waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Aproximar", exact: true }).waitFor({ state: "visible" });
  return performance.now() - started;
}

async function diagnose(page) {
  return page.evaluate(() => {
    const value = window.__indumoveisMap;
    if (!value) return null;
    const { project, resetSamples, loseContext, setReferencePose, ...data } = value;
    return {
      ...data,
      position: value.position,
      distance: value.distance,
      polar: value.polar,
      azimuth: value.azimuth,
      inspectedId: value.inspectedId,
    };
  });
}

async function snapshot(page, name) {
  await page.screenshot({ path: path.join(artifactDir, `${name}.png`), fullPage: true });
  await page
    .locator(".im-map-workspace")
    .screenshot({ path: path.join(artifactDir, `${name}-workspace.png`) });
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
    canvases: document.querySelectorAll("canvas").length,
    contexts: window.__MAP_LAB__?.contexts(),
    marks: performance
      .getEntriesByType("mark")
      .filter((mark) => /map/i.test(mark.name))
      .map((mark) => ({ name: mark.name, startTime: mark.startTime })),
  }));
}

async function runCheck(name, task) {
  if (checkFilter && !checkFilter.test(name)) return;
  const existingContexts = new Set(liveContexts);
  try {
    const detail = await task();
    const passed = detail?.accepted !== false;
    report.checks.push({ name, passed, detail });
    console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.stack ?? String(error) });
    console.log(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
    for (const context of liveContexts) if (!existingContexts.has(context)) await context.close();
  }
  await writeFile(
    path.join(artifactDir, "validation-progress.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

async function geometryState(page) {
  return page.evaluate(() => {
    const stage = document.querySelector(".im-map-stage").getBoundingClientRect();
    const shellHeader = document.querySelector(".im-map-workspace").getBoundingClientRect();
    const rectangles = [
      ...document.querySelectorAll(
        ".im-map-stage > .im-map-caption,.im-map-stage > .im-map-notice",
      ),
    ]
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.width && rect.height);
    const occupiedArea = rectangles.reduce((sum, rect) => sum + rect.width * rect.height, 0);
    const controls = [...document.querySelectorAll(".im-map-header button,.im-map-header select")]
      .map((el) => ({
        label: el.getAttribute("aria-label") ?? el.textContent.trim(),
        width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height,
        x: el.getBoundingClientRect().x,
        y: el.getBoundingClientRect().y,
      }))
      .filter((rect) => rect.width && rect.height);
    return {
      stage: { x: stage.x, y: stage.y, width: stage.width, height: stage.height },
      mapFractionBelowGlobalHeader:
        (stage.width * stage.height - occupiedArea) / (shellHeader.width * shellHeader.height),
      controls,
      below44: controls.filter((rect) => rect.width < 43.5 || rect.height < 43.5),
      outsideHeader: controls.filter((rect) => rect.y + rect.height > stage.y + 1),
      legacyDocks: document.querySelectorAll(
        ".im-map-stage > .im-map-controls,.im-map-stage > .im-map-secondary",
      ).length,
    };
  });
}

async function settleRepresentation(page) {
  await page
    .locator('.im-map-stage[data-representation="ready"], .im-map-stage[data-representation="2d"]')
    .waitFor({ timeout: 12000 });
  return page.locator(".im-map-stage").getAttribute("data-representation");
}

/** One visible presentation per container width: desktop buttons or compact header select. */
async function chooseView(page, name) {
  const compact = page.getByRole("combobox", { name: "Vista do mapa", exact: true });
  if (await compact.isVisible()) await compact.selectOption({ label: name });
  else await page.getByRole("button", { name, exact: true }).click();
}

async function chooseGesture(page, name) {
  const compact = page.getByRole("combobox", { name: "Gesto de navegação", exact: true });
  if (await compact.isVisible()) await compact.selectOption({ label: name });
  else await page.getByRole("button", { name: `${name} mapa`, exact: true }).click();
}

/** Auxiliary actions move into the same top-header menu in narrow containers. */
async function openAuxiliary(page, name) {
  const direct = page.getByRole("button", { name, exact: true });
  if (await direct.isVisible()) return direct.click();
  await page.getByRole("button", { name: "Mais ações do mapa", exact: true }).click();
  await direct.click();
}

async function selectResult(page, query, expected) {
  await page.getByRole("button", { name: "Buscar lote, pavilhão ou via", exact: true }).click();
  await page.getByRole("textbox", { name: "Lote, pavilhão ou via", exact: true }).fill(query);
  const result = page
    .locator(".im-map-result")
    .filter({ has: page.getByText(expected, { exact: true }) })
    .first();
  await result.waitFor();
  const started = await page.evaluate(() => performance.now());
  await result.click();
  await page.getByRole("heading", { name: expected, exact: true }).waitFor();
  const lot = expected.match(/^Lotes? ([\d /]+)$/);
  const pavilion = expected.match(/^Pavilhão (\d+)/);
  const entityId = lot
    ? `indumoveis:external:lot:${lot[1].split(" / ").join("-")}`
    : pavilion
      ? `indumoveis:pavilion:${Number(pavilion[1])}`
      : undefined;
  if (entityId && (await page.locator('.im-map-stage[data-representation="ready"]').count())) {
    await page.waitForFunction((id) => window.__indumoveisMap?.lastSelectedId === id, entityId, {
      timeout: 4000,
    });
  }
  return page.evaluate((start) => {
    const mark = performance.getEntriesByName("indumoveis:selection-dom").at(-1);
    const input = performance.getEntriesByName("indumoveis:selection-input").at(-1);
    return {
      eventToDOMMs: mark ? mark.startTime - input.startTime : null,
      eventToSubmittedDrawMs:
        window.__indumoveisMap?.selectionDrawAt && input
          ? window.__indumoveisMap.selectionDrawAt - input.startTime
          : null,
      automationToDOMMs: performance.now() - start,
    };
  }, started);
}

async function closeDetail(page) {
  await page.getByRole("button", { name: "Fechar ficha", exact: true }).click();
  await page.locator(".im-map-detail").waitFor({ state: "detached" });
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

async function cameraIdle(page) {
  await page.waitForFunction(
    () => !window.__indumoveisMap || window.__indumoveisMap.cameraState === "idle",
    null,
    { timeout: 4000 },
  );
}

async function projectedPoint(page, id, heightFraction) {
  await cameraIdle(page);
  const point = await page.evaluate(
    ([entityId, fraction]) => window.__indumoveisMap?.project(entityId, fraction),
    [id, heightFraction],
  );
  const canvas = await page.locator("canvas").boundingBox();
  assert(point && canvas, "Projection unavailable");
  return { x: canvas.x + point.x, y: canvas.y + point.y };
}

async function setProfile(page, quality) {
  await openAuxiliary(page, "Opções de visualização");
  await page
    .getByRole("combobox", { name: "Qualidade gráfica", exact: true })
    .selectOption(quality);
  await page.getByRole("button", { name: "Fechar menu", exact: true }).click();
}

async function throttle(page, cpuRate = 1) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 80,
    downloadThroughput: 10_000_000 / 8,
    uploadThroughput: 10_000_000 / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
  return cdp;
}

async function navigate30Seconds(page, quality, { nearLot70 = false, target } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await page.bringToFront();
  assert(!(await page.evaluate(() => document.hidden)), "Benchmark page is hidden");
  await chooseView(page, "3D");
  await settledPose(page);
  if (nearLot70 || target) {
    await selectResult(page, target?.query ?? "70", target?.label ?? "Lote 70");
    await closeDetail(page);
    if (target?.name === "asphalt-crossing") await panToArgentinaCrossing(page);
  } else await page.getByRole("button", { name: "Reenquadrar parque", exact: true }).click();
  await setProfile(page, quality);
  await cameraIdle(page);
  await page.waitForFunction((tier) => window.__indumoveisMap?.tier === tier, quality, {
    timeout: 5000,
  });
  if (process.env.MAP_BENCH_POSES && !target && !nearLot70) {
    const baseline = JSON.parse(await readFile(process.env.MAP_BENCH_POSES, "utf8"));
    const requested = baseline.checks.find((row) => row.name === `30s active navigation ${quality}`)
      ?.detail.startPose;
    assert(requested, "Equivalent benchmark start pose is missing");
    await page.evaluate(
      (pose) => window.__indumoveisMap.setReferencePose(pose.position, pose.target),
      requested,
    );
    await settledPose(page);
  }
  const initial = await diagnose(page);
  const startPose = {
    position: initial.position,
    target: initial.target,
    distance: initial.distance,
    polar: initial.polar,
    azimuth: initial.azimuth,
  };
  await page.evaluate(() => window.__indumoveisMap?.resetSamples());
  const stage = await page.locator(".im-map-stage").boundingBox();
  const start = performance.now();
  const peakBudget = {
    drawCalls: 0,
    triangles: 0,
    textures: 0,
    textureBytes: 0,
    dpr: 0,
    bufferPixels: 0,
  };
  const sampleBudget = async () => {
    const sample = await page.evaluate(() => {
      const value = window.__indumoveisMap;
      return {
        drawCalls: value.drawCalls,
        triangles: value.triangles,
        textures: value.textures,
        textureBytes: value.textureBytes,
        dpr: value.dpr,
        bufferPixels: value.buffer[0] * value.buffer[1],
      };
    });
    for (const key of Object.keys(peakBudget))
      peakBudget[key] = Math.max(peakBudget[key], sample[key]);
  };
  await sampleBudget();
  let round = 0;
  while (performance.now() - start < 30000) {
    const x = stage.x + stage.width * 0.42,
      y = stage.y + stage.height * 0.48;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (round % 2 ? -1 : 1) * 90, y + 24, { steps: 24 });
    await page.mouse.up();
    await page.mouse.wheel(0, round % 2 ? -90 : 90);
    await sampleBudget();
    round++;
  }
  const diagnostics = await diagnose(page);
  await sampleBudget();
  const intervals = diagnostics?.frameIntervals ?? [];
  const p50 = percentile(intervals, 0.5),
    p95 = percentile(intervals, 0.95);
  const medianFps = p50 ? 1000 / p50 : null;
  const stallsAbove200Ms = intervals.filter((value) => value > 200).length;
  const budget = {
    drawCalls: quality === "light" ? 80 : 150,
    triangles: quality === "light" ? 80000 : 200000,
    textureBytes: (quality === "light" ? 16 : 32) * 1024 * 1024,
    dpr: quality === "light" ? 1 : 1.5,
    bufferPixels: quality === "light" ? 1000000 : 2000000,
  };
  const budgetAccepted =
    peakBudget.drawCalls <= budget.drawCalls &&
    peakBudget.triangles <= budget.triangles &&
    peakBudget.textureBytes <= budget.textureBytes &&
    peakBudget.dpr <= budget.dpr + 0.001 &&
    peakBudget.bufferPixels <= budget.bufferPixels;
  return {
    quality,
    startPose,
    durationMs: performance.now() - start,
    rounds: round,
    samples: intervals.length,
    medianFps,
    p95IntervalMs: p95,
    stallsAbove200Ms,
    targetFps: quality === "light" ? 30 : 50,
    budget,
    peakBudget,
    budgetAccepted,
    accepted:
      medianFps >= (quality === "light" ? 30 : 50) &&
      (quality !== "light" || p95 <= 50) &&
      stallsAbove200Ms === 0 &&
      budgetAccepted,
    diagnostics,
    rendererInfo: await page.evaluate(() => window.__MAP_LAB__.rendererInfo()),
    referenceView: target
      ? `Perspective, focus ${target.label}, close detail without camera reset${target.name === "asphalt-crossing" ? ", then help pan buttons to the source Argentina/Mercosul crossing" : ""}.`
      : nearLot70
        ? "Visible foreground page, perspective, focus lot70 then close detail without camera reset; same scene after interaction cycles."
        : "Visible foreground page, perspective, whole-park reframe before each profile; same scene after interaction cycles.",
    note: "Renderer submitted-frame timing during continuous scripted input; not input-to-photon or physical-device GPU validation.",
  };
}

try {
  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [844, 390],
    [768, 1024],
    [1366, 768],
    [1920, 1080],
  ]) {
    const context = await newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const usefulMs = await openMap(page);
    const evidence = await snapshot(page, `initial-${width}x${height}`);
    assert(evidence.scrollWidth <= width + 1, `Horizontal overflow at ${width}x${height}`);
    assert(evidence.canvases <= 1, "More than one WebGL canvas");
    report.layouts.push({ viewport: `${width}x${height}`, usefulMs, ...evidence });
    if (mode !== "smoke") {
      await runCheck(`layout journeys ${width}x${height}`, async () => {
        const representation = await settleRepresentation(page);
        const initialLayout = await geometryState(page);
        assert(
          initialLayout.mapFractionBelowGlobalHeader >= 0.8,
          `Unobstructed map fraction ${initialLayout.mapFractionBelowGlobalHeader}`,
        );
        assert.equal(
          initialLayout.below44.length,
          0,
          "Some visible controls are smaller than 44px",
        );
        assert.equal(initialLayout.outsideHeader.length, 0, "Navigation escaped the top header");
        assert.equal(initialLayout.legacyDocks, 0, "A bottom control dock is still mounted");
        await snapshot(page, `ready-${width}x${height}`);
        await selectResult(page, "9", "Lotes 09 / 10");
        await snapshot(page, `lot-${width}x${height}`);
        await closeDetail(page);
        await selectResult(page, "Pavilhão 1", "Pavilhão 1 · Mostra Arq & Design");
        const expand = page.getByRole("button", { name: "Mais detalhes", exact: true });
        if (await expand.isVisible()) await expand.click();
        await page.getByRole("button", { name: "Inspecionar sem cobertura", exact: true }).click();
        await page.getByRole("button", { name: "Voltar ao parque", exact: true }).waitFor();
        const closeBounds = await page
          .getByRole("button", { name: "Fechar ficha", exact: true })
          .boundingBox();
        const stageBounds = await page.locator(".im-map-stage").boundingBox();
        assert(
          closeBounds &&
            closeBounds.y >= stageBounds.y &&
            closeBounds.y + closeBounds.height <= stageBounds.y + stageBounds.height,
          "Close control scrolled outside visible stage during inspection",
        );
        await snapshot(page, `inspection-${width}x${height}`);
        await closeDetail(page);
        assert(
          await page.getByRole("button", { name: "Voltar ao parque", exact: true }).isVisible(),
          "Closing the panel left inspection mode",
        );
        await page.getByRole("button", { name: "Voltar ao parque", exact: true }).click();
        if (representation === "ready") {
          await chooseView(page, "Superior");
          await chooseView(page, "Oblíqua");
          await chooseView(page, "3D");
        }
        await page.getByRole("button", { name: "Tela cheia", exact: true }).click();
        await page.getByRole("button", { name: "Sair da tela cheia", exact: true }).waitFor();
        await snapshot(page, `fullscreen-${width}x${height}`);
        await page.getByRole("button", { name: "Sair da tela cheia", exact: true }).click();
        assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= width + 1);
        return { representation, initialLayout, diagnostics: await diagnose(page) };
      });
    }
    console.log(`Layout ${width}x${height}: ${Math.round(usefulMs)}ms first useful representation`);
    await context.close();
  }
  if (mode === "full") {
    await runStage2Checks();
    for (const scenario of [
      { name: "medium", cpu: 1, viewport: { width: 1366, height: 768 }, targetMs: 3000 },
      { name: "weak-cpu4", cpu: 4, viewport: { width: 390, height: 844 }, targetMs: 5000 },
    ]) {
      await runCheck(`five cold and warm openings ${scenario.name}`, async () => {
        const samples = [];
        for (let i = 0; i < 5; i++) {
          const context = await newContext({ viewport: scenario.viewport });
          const page = await context.newPage();
          await throttle(page, scenario.cpu);
          const coldStarted = performance.now();
          const usefulMs = await openMap(page);
          const representation = await settleRepresentation(page);
          const ready3DMs = representation === "ready" ? performance.now() - coldStarted : null;
          const details = await page.evaluate(() => ({
            marks: performance
              .getEntriesByType("mark")
              .filter((mark) => /indumoveis/.test(mark.name))
              .map((mark) => ({ name: mark.name, ms: mark.startTime })),
            transferBytes: performance
              .getEntriesByType("resource")
              .reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
            featureResources: performance
              .getEntriesByType("resource")
              .filter((entry) => /mapa-|MapRenderer-/.test(entry.name))
              .map((entry) => ({
                file: entry.name.split("/").at(-1),
                transferSize: entry.transferSize,
                encodedBodySize: entry.encodedBodySize,
                duration: entry.duration,
              })),
          }));
          samples.push({ state: "cold", usefulMs, ready3DMs, representation, ...details });
          // SPA reentry retains downloaded/evaluated chunks, without assuming HTTP cache under interception.
          await navigateModule(page, "/financeiro");
          await page.locator(".im-map-stage").waitFor({ state: "detached" });
          const started = performance.now();
          await navigateModule(page, "/mapa");
          await page.locator(".im-map-svg, canvas").first().waitFor({ state: "visible" });
          const warmUsefulMs = performance.now() - started;
          const warmRepresentation = await settleRepresentation(page);
          const warm3DMs = warmRepresentation === "ready" ? performance.now() - started : null;
          samples.push({
            state: "warm-SPA-reentry",
            usefulMs: warmUsefulMs,
            ready3DMs: warm3DMs,
            representation: warmRepresentation,
          });
          await context.close();
        }
        const summarize = (state) => {
          const rows = samples.filter((row) => row.state === state);
          return {
            n: rows.length,
            medianMs: percentile(
              rows.map((row) => row.usefulMs),
              0.5,
            ),
            worstMs: Math.max(...rows.map((row) => row.usefulMs)),
            median3DMs: percentile(rows.map((row) => row.ready3DMs).filter(Number.isFinite), 0.5),
            worst3DMs: rows.some((row) => row.ready3DMs != null)
              ? Math.max(...rows.map((row) => row.ready3DMs ?? 0))
              : null,
            ready3DCount: rows.filter((row) => row.ready3DMs != null).length,
            passed: rows.every((row) => row.usefulMs <= scenario.targetMs),
          };
        };
        const outcome = {
          ...scenario,
          network: "10Mbps down/up, RTT latency80ms via Chromium CDP",
          cache:
            "Cold fresh browser contexts; warm SPA reentry keeps evaluated chunks; fixture routing disables HTTP cache",
          samples,
          cold: summarize("cold"),
          warm: summarize("warm-SPA-reentry"),
        };
        outcome.accepted = outcome.cold.passed && outcome.warm.passed;
        report.openings.push(outcome);
        return outcome;
      });
    }

    const context = await newContext();
    const page = await context.newPage();
    await openMap(page);
    await settleRepresentation(page);
    await runCheck("existing host WebGL renderer information", async () => {
      const info = await page.evaluate(() => window.__MAP_LAB__.rendererInfo());
      report.conditions.actualGL = info;
      return info;
    });
    await runCheck("30 selections, 20 closes, same renderer", async () => {
      const before = await diagnose(page);
      const samples = [];
      const lots = ["01", "09 / 10", "35 / 36 / 49 / 50", "69", "70"];
      for (let i = 0; i < 30; i++) {
        const value = lots[i % lots.length];
        const label = `${value.includes("/") ? "Lotes" : "Lote"} ${value}`;
        samples.push(await selectResult(page, value.split(" /")[0], label));
        if (i < 20) await closeDetail(page);
      }
      await snapshot(page, "selection-desktop");
      await closeDetail(page);
      const after = await diagnose(page);
      if (before && after)
        assert.equal(after.instance, before.instance, "Selection recreated renderer");
      return {
        n: samples.length,
        samples,
        medianDOMMs: percentile(
          samples.map((row) => row.eventToDOMMs).filter(Number.isFinite),
          0.5,
        ),
        p95DOMMs: percentile(samples.map((row) => row.eventToDOMMs).filter(Number.isFinite), 0.95),
        p95SubmittedDrawMs: percentile(
          samples.map((row) => row.eventToSubmittedDrawMs).filter(Number.isFinite),
          0.95,
        ),
        accepted:
          percentile(samples.map((row) => row.eventToDOMMs).filter(Number.isFinite), 0.95) <= 150 &&
          percentile(
            samples.map((row) => row.eventToSubmittedDrawMs).filter(Number.isFinite),
            0.95,
          ) <= 150,
        before,
        after,
        note: "DOM acknowledgement measured separately; screenshots confirm content, not input-to-photon latency.",
      };
    });
    await runCheck("20 view cycles and pavilion inspection/return cycles", async () => {
      const cycle = async () => {
        for (const name of ["Superior", "Oblíqua", "3D"]) await chooseView(page, name);
        await selectResult(page, "Pavilhão 3", "Pavilhão 3 · Comércio e mobiliário");
        await page.getByRole("button", { name: "Inspecionar sem cobertura", exact: true }).click();
        await settledPose(page);
        await page.getByRole("button", { name: "Voltar ao parque", exact: true }).click();
        await settledPose(page);
        await closeDetail(page);
      };
      // Compile every exterior/inspection material and finish optional scene work once.
      await cycle();
      const before = await diagnose(page);
      for (let i = 0; i < 20; i++) await cycle();
      const after = await diagnose(page);
      if (before && after)
        assert.equal(after.instance, before.instance, "View/inspection cycles recreated renderer");
      assert.equal(await page.locator("canvas").count(), 1);
      for (const resource of ["geometries", "textures", "programs"])
        assert.equal(
          after[resource],
          before[resource],
          `${resource} grew after warmed view/inspection cycles`,
        );
      return { warmupCycles: 1, measuredCycles: 20, before, after };
    });
    await runCheck(
      "real canvas picking, drag rejection, cancellation and manual interruption",
      async () => {
        await chooseView(page, "Superior");
        await page.getByRole("button", { name: "Reenquadrar parque", exact: true }).click();
        let point = await projectedPoint(page, "indumoveis:pavilion:1");
        await page.mouse.click(point.x, point.y);
        await page
          .getByRole("heading", { name: "Pavilhão 1 · Mostra Arq & Design", exact: true })
          .waitFor();
        await closeDetail(page);
        point = await projectedPoint(page, "indumoveis:pavilion:1");
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
        await page.mouse.move(point.x + 70, point.y + 25, { steps: 12 });
        await page.mouse.up();
        assert.equal(
          await page.locator(".im-map-detail").count(),
          0,
          "Dragging over pavilion selected it",
        );
        await page.mouse.down();
        await page
          .locator("canvas")
          .dispatchEvent("pointercancel", { pointerId: 1, bubbles: true });
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
        await page.mouse.up();
        await page.getByRole("button", { name: "Reenquadrar parque", exact: true }).click();
        point = await projectedPoint(page, "indumoveis:pavilion:1");
        await page.mouse.click(point.x, point.y);
        await page
          .getByRole("heading", { name: "Pavilhão 1 · Mostra Arq & Design", exact: true })
          .waitFor();
        const stage = await page.locator(".im-map-stage").boundingBox();
        await page.mouse.move(stage.x + stage.width * 0.45, stage.y + stage.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(
          stage.x + stage.width * 0.45 + 28,
          stage.y + stage.height * 0.5 + 12,
          { steps: 3 },
        );
        await page.mouse.up();
        const evidence = await diagnose(page);
        assert(evidence.target.every(Number.isFinite), "Camera target became invalid");
        await closeDetail(page);
        return evidence;
      },
    );
    await runCheck("keyboard search and Esc restores useful focus", async () => {
      await page.getByRole("button", { name: "Buscar lote, pavilhão ou via", exact: true }).click();
      const input = page.getByRole("textbox", { name: "Lote, pavilhão ou via", exact: true });
      await input.fill("09");
      await input.press("ArrowDown");
      await page.keyboard.press("Enter");
      await page.getByRole("heading", { name: "Lotes 09 / 10", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await page.locator(".im-map-detail").waitFor({ state: "detached" });
      const active = await page.evaluate(() => ({
        tag: document.activeElement.tagName,
        label: document.activeElement.getAttribute("aria-label"),
      }));
      assert.equal(active.label, "Buscar lote, pavilhão ou via");
      return active;
    });
    await runCheck("sidebar resize preserves selected identity and renderer", async () => {
      await selectResult(page, "70", "Lote 70");
      const before = await diagnose(page);
      await page.getByRole("button", { name: "Expandir menu", exact: true }).click();
      assert(await page.getByRole("heading", { name: "Lote 70", exact: true }).isVisible());
      await page.getByRole("button", { name: "Recolher menu", exact: true }).click();
      const after = await diagnose(page);
      assert.equal(before.instance, after.instance);
      await closeDetail(page);
      return { before, after };
    });
    await runCheck("rapid A B C selection and close reopen during panel transition", async () => {
      await selectResult(page, "01", "Lote 01");
      const afterA = await diagnose(page);
      await selectResult(page, "35", "Lotes 35 / 36 / 49 / 50");
      const afterB = await diagnose(page);
      await selectResult(page, "70", "Lote 70");
      await cameraIdle(page);
      const afterC = await diagnose(page);
      assert.equal(afterC.lastSelectedId, "indumoveis:external:lot:70");
      assert.equal(await page.locator(".im-map-detail").count(), 1);
      assert.equal(await page.getByRole("heading", { name: "Lote 70", exact: true }).count(), 1);
      assert(
        afterA.cameraState === "transition" || afterB.cameraState === "transition",
        "Test did not exercise an in-flight focus",
      );
      await page.getByRole("button", { name: "Fechar ficha", exact: true }).click({ force: true });
      assert(
        await page.locator(".im-map-detail.closing").count(),
        "Test did not enter closing phase",
      );
      await page.getByRole("button", { name: "Buscar lote, pavilhão ou via", exact: true }).click();
      await page.getByRole("textbox", { name: "Lote, pavilhão ou via", exact: true }).fill("69");
      await page
        .locator(".im-map-result")
        .filter({ hasText: "Lote 69" })
        .first()
        .click({ force: true });
      await page.getByRole("heading", { name: "Lote 69", exact: true }).waitFor();
      await cameraIdle(page);
      const reopened = await diagnose(page);
      assert.equal(reopened.lastSelectedId, "indumoveis:external:lot:69");
      assert.equal(await page.locator(".im-map-detail").count(), 1);
      assert.equal(await page.locator(".im-map-detail[inert],.im-map-detail.closing").count(), 0);
      assert.equal(await page.locator(".im-map-popover").count(), 0);
      await closeDetail(page);
      return {
        afterA,
        afterB,
        afterC,
        reopened,
        note: "Real DOM clicks; force bypasses Playwright element stability so close/reopen happens while the visual panel is transitioning.",
      };
    });
    for (const quality of ["light", "balanced"])
      await runCheck(`30s active navigation ${quality}`, () => navigate30Seconds(page, quality));
    await runCheck("30s active navigation light near lot70", () =>
      navigate30Seconds(page, "light", { nearLot70: true }),
    );
    for (const target of [
      { name: "pavilions8-13-3", query: "Pavilhão 8", label: pavilionCases[3][1] },
      { name: "B7", query: "Estrutura B7", label: "Estrutura B7" },
      { name: "asphalt-crossing", query: "01", label: "Lote 01" },
    ])
      for (const quality of ["light", "balanced"])
        await runCheck(`30s active navigation ${quality} ${target.name}`, () =>
          navigate30Seconds(page, quality, { target }),
        );
    await runCheck("10 exits/reentries clean up own WebGL context", async () => {
      const samples = [];
      for (let i = 0; i < 10; i++) {
        await navigateModule(page, "/financeiro");
        await page.locator(".im-map-stage").waitFor({ state: "detached" });
        const contexts = await page.evaluate(() => window.__MAP_LAB__.contexts());
        const diagnostic = await diagnose(page);
        assert.equal(contexts.active, 0, "Feature context still active after leaving route");
        if (diagnostic)
          assert(!diagnostic.active, "Feature loop still marked active after unmount");
        samples.push({ contexts, diagnostic });
        await navigateModule(page, "/mapa");
        await settleRepresentation(page);
      }
      return samples;
    });
    await context.close();

    await runCheck("external font CSS delayed 5s does not block useful map", async () => {
      const context = await newContext({ fontDelayMs: 5000 });
      const page = await context.newPage();
      const usefulMs = await openMap(page);
      const link = page.locator('link[rel="stylesheet"][href*="fonts.googleapis.com"]').first();
      const before = await link.getAttribute("media");
      assert(usefulMs <= 3000, `Delayed stylesheet blocked map for ${usefulMs}ms`);
      assert.equal(before, "print", "Pending external stylesheet became render-blocking");
      await page.getByRole("button", { name: "Aproximar", exact: true }).click();
      await page.waitForFunction(
        () =>
          document.querySelector('link[rel="stylesheet"][href*="fonts.googleapis.com"]')?.media ===
          "all",
        null,
        { timeout: 8000 },
      );
      const after = await link.getAttribute("media");
      await context.close();
      return {
        usefulMs,
        mediaWhilePending: before,
        mediaAfterStylesheetLoad: after,
        delayMs: 5000,
        note: "Delayed intercepted external CSS response tests browser stylesheet loading; font rasterization uses existing fallbacks.",
      };
    });

    await runCheck(
      "SVG navigation during renderer preparation keeps live target and gesture owner",
      async () => {
        const context = await newContext();
        await context.addInitScript(() => {
          const request = window.requestAnimationFrame.bind(window);
          const cancel = window.cancelAnimationFrame.bind(window);
          const pending = new Map();
          let held = true,
            nextId = -1;
          window.requestAnimationFrame = (callback) => {
            if (
              held &&
              window.__MAP_LAB__?.contexts().created > 0 &&
              document.querySelector(".im-map-stage")?.dataset.representation === "preparing"
            ) {
              const id = nextId--;
              pending.set(id, callback);
              return id;
            }
            return request(callback);
          };
          window.cancelAnimationFrame = (id) => {
            if (!pending.delete(id)) cancel(id);
          };
          window.__MAP_BOOT_GATE__ = {
            get pending() {
              return pending.size;
            },
            step() {
              const next = pending.entries().next().value;
              if (next) {
                pending.delete(next[0]);
                request(next[1]);
              }
            },
            release() {
              held = false;
              for (const callback of pending.values()) request(callback);
              pending.clear();
            },
          };
        });
        const page = await context.newPage();
        await openMap(page);
        await page.waitForFunction(() => window.__MAP_BOOT_GATE__?.pending > 0, null, {
          polling: 20,
        });
        const svg = page.locator(".im-map-svg");
        const box = await svg.boundingBox();
        const start = { x: box.x + box.width * 0.45, y: box.y + box.height * 0.5 };
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + 70, start.y + 20, { steps: 3 });
        for (let frame = 1; frame <= 3; frame++) {
          await page.evaluate(() => window.__MAP_BOOT_GATE__.step());
          await page.waitForFunction(
            (minimum) => window.__indumoveisMap?.frames >= minimum,
            frame,
            { polling: 20 },
          );
          if (frame < 3)
            await page.mouse.move(start.x + 70 + frame * 20, start.y + 20 + frame * 8, {
              steps: 2,
            });
        }
        // Laboratory hold crosses the preparation deadline without releasing the useful SVG gesture.
        const heldStarted = performance.now();
        await page.waitForTimeout(5000);
        const heldGestureMs = performance.now() - heldStarted;
        assert.equal(
          await page.locator('.im-map-stage[data-representation="preparing"]').count(),
          1,
          "Renderer stole an active fallback gesture before pointerup",
        );
        const expected = await svg.evaluate((node) => {
          const b = node.viewBox.baseVal;
          return [b.x + b.width / 2, b.y + b.height / 2];
        });
        await page.mouse.up();
        await page.evaluate(() => window.__MAP_BOOT_GATE__.release());
        await settleRepresentation(page);
        const actual = await diagnose(page);
        assert(
          Math.hypot(actual.target[0] - expected[0], actual.target[1] - expected[1]) < 0.05,
          "Renderer restored a stale import-time target after SVG navigation",
        );
        assert.equal(await page.locator(".im-map-detail").count(), 0);
        const contexts = await page.evaluate(() => window.__MAP_LAB__.contexts());
        assert.equal(contexts.created, 1);
        await context.close();
        return {
          expected,
          actualTarget: actual.target,
          contexts,
          heldGestureMs,
          note: "Laboratory RAF gate steps the first three actual renderer draws while real pointer input pans the visible SVG, then holds the pointer for at least 5s. This laboratory-only wait proves the preparation watchdog excludes an active fallback gesture. No additional WebGL context or mocked renderer.",
        };
      },
    );

    await runCheck(
      "AUTO sustained slow active frames switches to 2D once and preserves selection",
      async () => {
        const context = await newContext();
        await context.addInitScript(() => {
          Object.defineProperty(navigator, "hardwareConcurrency", {
            configurable: true,
            get: () => 2,
          });
          Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => 2 });
          const request = window.requestAnimationFrame.bind(window);
          window.__MAP_SLOW_FRAMES__ = { enabled: false };
          window.requestAnimationFrame = (callback) =>
            request((time) => {
              if (window.__MAP_SLOW_FRAMES__.enabled)
                setTimeout(() => callback(performance.now()), 50);
              else callback(time);
            });
        });
        const page = await context.newPage();
        await openMap(page);
        await settleRepresentation(page);
        await selectResult(page, "70", "Lote 70");
        await cameraIdle(page);
        const before = await diagnose(page);
        assert.equal(before.tier, "light", "Conservative signals did not start in Leve");
        await page.evaluate(() => {
          window.__MAP_SLOW_FRAMES__.enabled = true;
        });
        const canvas = await page.locator("canvas").boundingBox();
        const x = canvas.x + canvas.width * 0.35,
          y = canvas.y + canvas.height * 0.45;
        await page.mouse.move(x, y);
        await page.mouse.down();
        const started = performance.now();
        let moves = 0;
        while (
          (await page.locator('.im-map-stage[data-representation="2d"]').count()) === 0 &&
          performance.now() - started < 20000
        ) {
          await page.mouse.move(x + (moves % 2 ? -1 : 1) * 18, y + (moves % 2 ? 4 : -4), {
            steps: 3,
          });
          moves++;
        }
        await page.mouse.up();
        await page.locator('.im-map-stage[data-representation="2d"]').waitFor({ timeout: 1000 });
        await page.evaluate(() => {
          window.__MAP_SLOW_FRAMES__.enabled = false;
        });
        assert(await page.getByRole("heading", { name: "Lote 70", exact: true }).isVisible());
        const after = await diagnose(page);
        const target = await page.locator(".im-map-svg").evaluate((node) => {
          const b = node.viewBox.baseVal;
          return [b.x + b.width / 2, b.y + b.height / 2];
        });
        assert(
          Math.hypot(after.target[0] - target[0], after.target[1] - target[1]) < 1,
          "Adaptive fallback lost the last camera target",
        );
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const contexts = await page.evaluate(() => window.__MAP_LAB__.contexts());
        assert.deepEqual(
          contexts,
          { created: 1, active: 0 },
          "Adaptive fallback retried or retained WebGL context",
        );
        assert(!after.active && after.activeLoops === 0);
        await context.close();
        return {
          elapsedMs: performance.now() - started,
          moves,
          before,
          after,
          target,
          contexts,
          note: "Artificial 50 ms RAF delay plus conservative 2-core/2 GiB navigator signals tests sustained-degradation behavior. This is a simulation, not physical weak-device performance.",
        };
      },
    );

    for (const fault of [
      { name: "no-webgl", noWebGL: true },
      { name: "chunk-failure", chunkFailure: true },
      { name: "commercial-api-failure", apiFailure: true },
      { name: "reduced-motion", reducedMotion: true },
    ]) {
      await runCheck(`resilience ${fault.name}`, async () => {
        const context = await newContext(fault);
        const page = await context.newPage();
        const usefulMs = await openMap(page);
        const representation = await settleRepresentation(page);
        if (fault.noWebGL || fault.chunkFailure) assert.equal(representation, "2d");
        await selectResult(page, "70", "Lote 70");
        await snapshot(page, fault.name);
        assert(await page.getByRole("heading", { name: "Lote 70", exact: true }).isVisible());
        const evidence = {
          usefulMs,
          representation,
          contexts: await page.evaluate(() => window.__MAP_LAB__.contexts()),
          diagnostics: await diagnose(page),
        };
        await context.close();
        return evidence;
      });
    }
    await runCheck("context loss recovery finite, identity preserved", async () => {
      const context = await newContext();
      const page = await context.newPage();
      await openMap(page);
      await settleRepresentation(page);
      await selectResult(page, "69", "Lote 69");
      await page.evaluate(() => window.__indumoveisMap.loseContext());
      await page.waitForFunction(
        () =>
          window.__MAP_LAB__.contexts().created >= 2 ||
          document.querySelector(".im-map-stage")?.dataset.representation === "2d",
        null,
        { timeout: 12000 },
      );
      await settleRepresentation(page);
      assert(await page.getByRole("heading", { name: "Lote 69", exact: true }).isVisible());
      if (await page.locator('.im-map-stage[data-representation="ready"]').count()) {
        await page.evaluate(() => window.__indumoveisMap.loseContext());
        await page.locator('.im-map-stage[data-representation="2d"]').waitFor({ timeout: 12000 });
      }
      const count = await page.evaluate(() => window.__MAP_LAB__.contexts());
      assert(count.created <= 2, "Context recovery repeated without bound");
      const evidence = await snapshot(page, "context-loss");
      await context.close();
      return evidence;
    });
    await runCheck(
      "fallback mobile labels, drag, zoom and search without engine chunk",
      async () => {
        const context = await newContext({
          viewport: { width: 390, height: 844 },
          chunkFailure: true,
        });
        const page = await context.newPage();
        await openMap(page);
        await settleRepresentation(page);
        const labels = await page.evaluate(() =>
          [...document.querySelectorAll(".im-map-svg .im-map-pavilion text")]
            .filter(
              (text) =>
                getComputedStyle(text).visibility !== "hidden" &&
                getComputedStyle(text).display !== "none",
            )
            .map((text) => {
              const matrix = text.getScreenCTM();
              return {
                text: text.textContent,
                screenFontPx:
                  parseFloat(getComputedStyle(text).fontSize) * Math.hypot(matrix.a, matrix.b),
              };
            }),
        );
        assert(labels.length >= 3, "Overview hides every pavilion label");
        assert(
          labels.every((label) => label.screenFontPx >= 9.5),
          "Pavilion text falls below 10 CSS px",
        );
        await snapshot(page, "fallback-mobile-overview");
        const lotLabelFit = [];
        for (let level = 0; level < 5; level++) {
          if (level) {
            await page.getByRole("button", { name: "Aproximar", exact: true }).click();
            await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 260)));
          }
          const visible = await page.evaluate(() =>
            [...document.querySelectorAll(".im-map-svg .im-map-lot")].flatMap((group) => {
              const text = group.querySelector("text");
              if (
                !text ||
                getComputedStyle(text).visibility === "hidden" ||
                getComputedStyle(text).display === "none"
              )
                return [];
              // Labels are painted in the final SVG layer; locate their canonical
              // sibling polygon by the shared entity identity, never by display text.
              const identity =
                group.getAttribute("data-label-entity") ?? group.getAttribute("data-entity");
              const polygon = [...group.ownerSVGElement.querySelectorAll("polygon")].find(
                (node) => node.parentElement.getAttribute("data-entity") === identity,
              );
              if (!polygon) throw new Error(`Label has no canonical polygon: ${identity}`);
              const label = text.getBoundingClientRect(),
                lot = polygon.getBoundingClientRect();
              return [
                {
                  text: text.textContent,
                  fits:
                    label.left >= lot.left - 1 &&
                    label.right <= lot.right + 1 &&
                    label.top >= lot.top - 1 &&
                    label.bottom <= lot.bottom + 1,
                },
              ];
            }),
          );
          assert(
            visible.every((label) => label.fits),
            "Visible lot number exceeds its envelope during zoom",
          );
          lotLabelFit.push({ level, visible });
        }
        assert(
          lotLabelFit.some((level) => level.visible.length > 0),
          "No lot number became visible while zooming",
        );
        const box = await page.locator(".im-map-svg").boundingBox();
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.5 + 45, box.y + box.height * 0.5 + 25, {
          steps: 8,
        });
        await page.mouse.up();
        assert.equal(await page.locator(".im-map-detail").count(), 0);
        await page.getByRole("button", { name: "Aproximar", exact: true }).click();
        await selectResult(page, "09", "Lotes 09 / 10");
        await snapshot(page, "fallback-mobile-selected");
        await closeDetail(page);
        const contexts = await page.evaluate(() => window.__MAP_LAB__.contexts());
        assert.equal(contexts.created, 0);
        await context.close();
        return { labels, lotLabelFit, contexts };
      },
    );
    await runCheck(
      "visibility pause, gesture cancellation and return without hidden frame interval",
      async () => {
        const context = await newContext();
        const page = await context.newPage();
        let commercialReads = 0;
        page.on("request", (request) => {
          if (request.url().includes("/rest/v1/space_status_v")) commercialReads++;
        });
        await openMap(page);
        await settleRepresentation(page);
        await cameraIdle(page);
        const box = await page.locator("canvas").boundingBox();
        await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.45 + 24, box.y + box.height * 0.45 + 12, {
          steps: 4,
        });
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const before = await diagnose(page);
        const projectedBefore = await page.evaluate(() =>
          window.__indumoveisMap.project("indumoveis:pavilion:1"),
        );
        const other = await context.newPage();
        await other.goto("about:blank");
        await other.bringToFront();
        const actualHidden = await page.evaluate(() => document.hidden);
        if (!actualHidden)
          await page.evaluate(() => {
            Object.defineProperty(document, "hidden", { configurable: true, value: true });
            Object.defineProperty(document, "visibilityState", {
              configurable: true,
              value: "hidden",
            });
            document.dispatchEvent(new Event("visibilitychange"));
          });
        const hidden = await diagnose(page);
        await new Promise((resolve) => setTimeout(resolve, 350));
        const paused = await diagnose(page);
        assert.equal(paused.frames, hidden.frames, "Scene keeps drawing while hidden");
        await page.bringToFront();
        if (!actualHidden)
          await page.evaluate(() => {
            delete document.hidden;
            delete document.visibilityState;
            document.dispatchEvent(new Event("visibilitychange"));
          });
        await other.close();
        await page.mouse.up();
        await page.waitForFunction(
          (frames) => window.__indumoveisMap.frames > frames,
          paused.frames,
          { timeout: 3000 },
        );
        const after = await diagnose(page);
        const projectedAfter = await page.evaluate(() =>
          window.__indumoveisMap.project("indumoveis:pavilion:1"),
        );
        assert.equal(after.instance, before.instance, "Visibility/refetch remounted renderer");
        assert.equal(
          await page.locator(".im-map-detail").count(),
          0,
          "Cancelled gesture selected an entity on return",
        );
        assert(
          Math.hypot(projectedAfter.x - projectedBefore.x, projectedAfter.y - projectedBefore.y) <
            1.5,
          "Camera jumped after visibility return",
        );
        await page.mouse.wheel(0, -20);
        await page.waitForFunction(
          (count) => window.__indumoveisMap.frameIntervals.length >= count + 2,
          hidden.frameIntervals.length,
          { timeout: 3000 },
        );
        const resumed = await diagnose(page);
        const addedIntervals = resumed.frameIntervals.slice(hidden.frameIntervals.length);
        assert(
          addedIntervals.every((interval) => interval < 300),
          "Hidden interval entered active frame sample",
        );
        const evidence = {
          mode: actualHidden
            ? "Real document.hidden changed when another automated tab was foreground"
            : "Headless tabs stayed visible; document.hidden/visibilityState + visibilitychange explicitly simulated",
          hiddenFrames: hidden.frames,
          pausedFrames: paused.frames,
          projectedBefore,
          projectedAfter,
          addedIntervals,
          commercialReads,
          instance: after.instance,
        };
        await context.close();
        return evidence;
      },
    );
    await runCheck("Financeiro and Documentos never request renderer on direct entry", async () => {
      const contexts = [];
      for (const route of ["financeiro", "documentos"]) {
        const context = await newContext();
        const page = await context.newPage();
        const requests = [];
        page.on("request", (request) => {
          if (/MapRenderer|three(?:-|\.)/i.test(request.url())) requests.push(request.url());
        });
        await page.goto(`${baseURL}/${route}`, { waitUntil: "networkidle" });
        assert.equal(requests.length, 0, `Renderer entered ${route} request path`);
        contexts.push({
          route,
          rendererRequests: requests,
          canvases: await page.locator("canvas").count(),
        });
        await context.close();
      }
      return contexts;
    });
    await runCheck("mobile pinch, remaining pointer and orientation", async () => {
      const context = await newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await openMap(page);
      await settleRepresentation(page);
      const cdp = await context.newCDPSession(page);
      const stage = await page.locator(".im-map-stage").boundingBox();
      const x = stage.x + stage.width / 2,
        y = stage.y + stage.height / 2;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: x - 30, y, id: 0 },
          { x: x + 30, y, id: 1 },
        ],
      });
      for (let step = 1; step <= 8; step++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { x: x - 30 - step * 3, y, id: 0 },
            { x: x + 30 + step * 3, y, id: 1 },
          ],
        });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [{ x: x - 54, y, id: 0 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - 40, y: y + 20, id: 0 }],
      });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      assert.equal(await page.locator(".im-map-detail").count(), 0, "Pinch selected an area");
      await selectResult(page, "70", "Lote 70");
      const before = await diagnose(page);
      await page.setViewportSize({ width: 844, height: 390 });
      assert(await page.getByRole("heading", { name: "Lote 70", exact: true }).isVisible());
      const after = await diagnose(page);
      if (before && after) assert.equal(before.instance, after.instance);
      await snapshot(page, "mobile-rotated-selection");
      await context.close();
      return {
        before,
        after,
        note: "Synthetic CDP touch in Chromium; not physical-device touch verification.",
      };
    });
  }
  report.summary = {
    usefulMedianMs: percentile(
      report.layouts.map((row) => row.usefulMs),
      0.5,
    ),
    usefulWorstMs: Math.max(...report.layouts.map((row) => row.usefulMs)),
    passedChecks: report.checks.filter((row) => row.passed).length,
    failedChecks: report.checks.filter((row) => !row.passed).length,
  };
} catch (error) {
  report.errors.push(error.stack ?? String(error));
  process.exitCode = 1;
} finally {
  if (report.errors.length) process.exitCode = 1;
  await browser.close();
  await writeFile(
    path.join(artifactDir, "validation.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({
      artifactDir,
      layouts: report.layouts.length,
      errors: report.errors.length,
      summary: report.summary,
    }),
  );
}
