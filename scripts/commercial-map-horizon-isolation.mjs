// Run against either production build. These substitutions exist only in the test
// browser and never add branches, uniforms or a second WebGL context to the map.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  artifactDir,
  baseURL,
  browser,
  newContext,
  report,
} from "./commercial-map-browser-fixtures.mjs";

const layers = [
  "composite",
  "without-underlay",
  "without-relief",
  "low",
  "high",
  "without-depth",
  "without-panorama",
  "without-haze",
  "without-settlement",
  "without-aerial",
];
const profiles = [];
try {
  for (const layer of layers) {
    const context = await newContext({
      viewport: { width: 1366, height: 768 },
      reducedMotion: true,
    });
    try {
      const page = await context.newPage();
      await page.addInitScript((layer) => {
        localStorage.setItem("indumoveis:map-quality", "detailed");
        localStorage.setItem("indumoveis:map-lighting", "natural");
        window.probedShaders = 0;
        const proto = WebGL2RenderingContext.prototype;
        const compile = proto.shaderSource;
        proto.shaderSource = function (shader, source) {
          let isolate = source;
          const relief = source.includes("varying vec3 regionalWorld;");
          if (layer === "without-underlay" && source.includes("float modelWeight = 1.;"))
            isolate = source.replace("float modelWeight = 1.;", "discard; float modelWeight = 1.;");
          if (layer === "without-relief" && relief && source.includes("gl_FragColor"))
            isolate = source.replace("void main() {", "void main() { discard;");
          if (layer === "low" || layer === "high")
            isolate = source.replace(
              "float blend = smoothstep(40.,48.,height);",
              "float blend = " + (layer === "low" ? "0.;" : "1.;"),
            );
          if (layer === "without-depth")
            isolate = source.replace(
              "float radius = 3700.;",
              "distanceM=3700.; return textureGrad(picture,vec2(atan(ray.x,ray.y)/(2.*3.14159265),(degrees(atan(slope))+16.)/24.),dx,dy); float radius = 3700.;",
            );
          if (layer === "without-panorama")
            isolate = source.replace("travel = 25000.;", "travel = 25000.; return vec4(0.);");
          if (layer === "without-haze")
            isolate = source.replace("landscapeAir, haze);", "landscapeAir, 0.);");
          if (layer === "without-aerial")
            isolate = source.replace(
              "vec3 landscapeAerial(vec2 worldXZ) {",
              "vec3 landscapeAerial(vec2 worldXZ) { return vec3(.2);",
            );
          if (
            layer === "without-settlement" &&
            (source.includes("vec3 localMaterial(") ||
              (source.includes("uniform sampler2D landscapeSettlement;") &&
                source.includes("gl_FragColor")))
          )
            isolate = source.replace("void main() {", "void main() { discard;");
          if (isolate !== source) window.probedShaders++;
          compile.call(this, shader, isolate);
        };
      }, layer);
      await page.goto(baseURL + "/mapa?mapDiagnostics=1", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => window.__indumoveisMap?.landscape?.finalAt && window.__indumoveisMap.realism.ready,
        null,
        { timeout: 90000 },
      );
      assert(
        layer === "composite" || (await page.evaluate(() => window.probedShaders > 0)),
        layer + " shader did not match",
      );
      for (const height of [24, 40, 44, 48, 72]) {
        const actual = await page.evaluate(async (height) => {
          const d = window.__indumoveisMap;
          const y = height * 0.4548161444;
          d.setReferencePose([145 + y * 4.8, y, 45], [145, 43]);
          await new Promise((resolve) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
          );
          return {
            position: d.position,
            target: d.target,
            buffer: d.buffer,
            lighting: d.daylight.mode,
            level: d.landscape.level,
            frames: d.frames,
          };
        }, height);
        await page
          .locator(".im-map-stage")
          .screenshot({ path: path.join(artifactDir, layer + "-" + height + ".png") });
        profiles.push({ layer, height, ...actual });
      }
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(
    path.join(artifactDir, "isolamento.json"),
    JSON.stringify({ conditions: report.conditions, profiles, errors: report.errors }, null, 2) +
      "\n",
  );
  await browser.close();
}
