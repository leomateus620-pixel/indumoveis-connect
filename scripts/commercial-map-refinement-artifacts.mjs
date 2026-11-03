/** Package paired screenshots without crop, resize or retouch. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require("sharp");
} catch {
  sharp = require(
    path.join(
      os.homedir(),
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp",
    ),
  );
}
const input = path.resolve("artifacts.local/map-refinement");
const output = path.resolve("docs/validation/map-refinement-2026-11-03");
const read = async (file) => JSON.parse(await fs.readFile(path.join(input, file), "utf8"));
const reports = {
  before: await read("before/refinement.json"),
  after: await read("after/refinement.json"),
};
const manifest = {
  baselineCommit: reports.before.study.baseCommit,
  conditions: reports.after.conditions,
  method:
    "Production build, intercepted read-only lab data, same camera/CSS/buffer/profile on the same host. PNG to WebP quality92 only; no resize/crop/retouch.",
  performance: {},
  pairs: [],
};
await fs.mkdir(output, { recursive: true });
const hash = (data) => createHash("sha256").update(data).digest("hex");
for (const [phase, report] of Object.entries(reports)) {
  assert(report.study.passed && report.errors.length === 0, `${phase}: failed browser study`);
  const nav = report.study.navigation;
  manifest.performance[phase] = {
    ...nav,
    labels: undefined,
    lotLabels: undefined,
    position: undefined,
    target: undefined,
    zoom: report.study.zoom,
    openingMs: report.study.openingMs,
    cycles: report.study.cycles,
    renderer: report.study.renderer,
  };
  await fs.writeFile(path.join(output, `${phase}.json.gz`), gzipSync(JSON.stringify(report)));
}
const startupCapture = (report) => ({
  name: "startup-workspace",
  ...report.study.startup,
  pose: { position: report.study.startup.position, target: report.study.startup.target },
  samePose: true,
});
for (const a of [...reports.before.study.captures, startupCapture(reports.before)]) {
  const b =
    a.name === "startup-workspace"
      ? startupCapture(reports.after)
      : reports.after.study.captures.find((c) => c.name === a.name);
  assert(b && b.samePose, `Missing matched pose ${a.name}`);
  assert.deepEqual(a.buffer, b.buffer, `${a.name}: buffer changed`);
  const delta = (x, y) => Math.hypot(...x.map((n, i) => n - y[i]));
  const pair = {
    name: a.name,
    pose: a.pose,
    positionError: delta(a.position, b.position),
    targetError: delta(a.target, b.target),
    images: {},
  };
  assert(pair.positionError < 0.02 && pair.targetError < 0.02, `${a.name}: camera changed`);
  for (const phase of ["before", "after"]) {
    const png = await fs.readFile(path.join(input, phase, `${a.name}.png`));
    const webp = await sharp(png).webp({ quality: 92 }).toBuffer();
    await fs.mkdir(path.join(output, phase), { recursive: true });
    const file = `${phase}/${a.name}.webp`;
    await fs.writeFile(path.join(output, file), webp);
    const { width, height } = await sharp(webp).metadata();
    pair.images[phase] = {
      file,
      width,
      height,
      bytes: webp.length,
      pngSha256: hash(png),
      webpSha256: hash(webp),
    };
  }
  manifest.pairs.push(pair);
}
await fs.copyFile(
  path.join(input, "source/signature.json"),
  path.join(output, "commercial-protection.json"),
);
await fs.copyFile(
  path.join(input, "published-assets.json"),
  path.join(output, "published-assets.json"),
);
const interactionRoot = path.resolve("artifacts.local/mapa-refinement/navigation");
const interaction = JSON.parse(
  await fs.readFile(path.join(interactionRoot, "navigation-production.json"), "utf8"),
);
assert.equal(interaction.errors.length, 0, "Navigation application errors");
assert(interaction.findings.length >= 17, "Incomplete gesture study");
manifest.navigation = {
  scenarios: interaction.findings.map((f) => f.name),
  errors: interaction.errors,
  consoleMessages: interaction.consoleErrors.length,
  kind: interaction.kind,
};
await fs.writeFile(path.join(output, "navigation.json.gz"), gzipSync(JSON.stringify(interaction)));
manifest.interactionImages = [];
await fs.mkdir(path.join(output, "interaction"), { recursive: true });
for (const name of (await fs.readdir(interactionRoot)).filter((n) => n.endsWith(".png"))) {
  const png = await fs.readFile(path.join(interactionRoot, name));
  const webp = await sharp(png).webp({ quality: 92 }).toBuffer();
  const file = `interaction/${name.replace(/\.png$/, ".webp")}`;
  await fs.writeFile(path.join(output, file), webp);
  const { width, height } = await sharp(webp).metadata();
  manifest.interactionImages.push({
    file,
    width,
    height,
    pngSha256: hash(png),
    webpSha256: hash(webp),
  });
}
await fs.writeFile(path.join(output, "comparison.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  JSON.stringify({
    output,
    pairs: manifest.pairs.length,
    before: manifest.performance.before.p95Ms,
    after: manifest.performance.after.p95Ms,
  }),
);
