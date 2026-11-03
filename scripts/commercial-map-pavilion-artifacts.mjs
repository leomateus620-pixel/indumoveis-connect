/** Package real paired browser evidence. Run after the two photo/park studies.
 * No rendered object, colour, pose or pixel dimensions are changed. WebP is
 * only a storage codec; PNG hashes retain the provenance of every capture. */
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
const input = path.resolve(process.argv[2] ?? "artifacts.local/pavilion-photos");
const output = path.resolve(process.argv[3] ?? "docs/validation/pavilion-photos-2026-11");
const hash = (data) => createHash("sha256").update(data).digest("hex");
const read = async (dir) =>
  JSON.parse(await fs.readFile(path.join(input, dir, "realism-validation.json"), "utf8"));
const reports = {
  before: await read("before"),
  after: await read("after"),
  parkBefore: await read("performance-before"),
  parkAfter: await read("performance-after"),
};
for (const report of Object.values(reports)) {
  assert.equal(report.errors.length, 0, "Application/shader error in source report");
  assert.equal(report.summary.failed, 0, "A browser study failed");
}
await fs.mkdir(output, { recursive: true });
const manifest = {
  generatedAt: new Date().toISOString(),
  baselineCommit: "a10053b11e985a663fd547d4ce84f3b5e77ea34f",
  conditions: {
    before: reports.parkBefore.conditions,
    after: reports.parkAfter.conditions,
    rendererBefore: reports.parkBefore.park.renderer,
    rendererAfter: reports.parkAfter.park.renderer,
  },
  performance: {
    before: reports.parkBefore.park.navigation,
    after: reports.parkAfter.park.navigation,
    openingBefore: reports.parkBefore.park.opening,
    openingAfter: reports.parkAfter.park.opening,
    cyclesBefore: reports.parkBefore.park.cycles,
    cyclesAfter: reports.parkAfter.park.cycles,
  },
  encoding:
    "Full-size PNG captures -> WebP quality90. No resize, crop, retouch, image generation or object removal.",
  pairs: [],
};
for (const [group, beforeName, afterName, a, b] of [
  ["pavilion", "before", "after", reports.before, reports.after],
  ["park", "performance-before", "performance-after", reports.parkBefore, reports.parkAfter],
]) {
  assert.equal(a.captures.length, group === "pavilion" ? 30 : 8);
  assert.equal(a.captures.length, b.captures.length);
  for (const before of a.captures) {
    const after = b.captures.find((c) => c.name === before.name);
    assert(after, `Missing capture ${before.name}`);
    assert(before.samePose && after.samePose, `Clamped reference camera ${before.name}`);
    const positionError = Math.hypot(
      ...before.pose.position.map((n, i) => n - after.pose.position[i]),
    );
    const targetError = Math.hypot(...before.pose.target.map((n, i) => n - after.pose.target[i]));
    assert(positionError < 0.02 && targetError < 0.02, `Camera mismatch ${before.name}`);
    const pair = {
      group,
      name: before.name,
      pose: after.pose,
      positionError,
      targetError,
      images: {},
    };
    for (const [phase, dir, cap] of [
      ["before", beforeName, before],
      ["after", afterName, after],
    ]) {
      const png = await fs.readFile(path.join(input, dir, `${cap.name}.png`));
      const webp = await sharp(png).webp({ quality: 90 }).toBuffer();
      const destination = path.join(output, phase);
      await fs.mkdir(destination, { recursive: true });
      const file = `${phase}/${cap.name}.webp`;
      await fs.writeFile(path.join(output, file), webp);
      pair.images[phase] = {
        file,
        pngSha256: hash(png),
        webpSha256: hash(webp),
        bytes: webp.length,
        ...(await sharp(webp)
          .metadata()
          .then((m) => ({ width: m.width, height: m.height }))),
      };
    }
    manifest.pairs.push(pair);
  }
}
for (const [name, report] of Object.entries(reports))
  await fs.writeFile(path.join(output, `${name}.json.gz`), gzipSync(`${JSON.stringify(report)}\n`));
await fs.writeFile(path.join(output, "comparison.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await fs.copyFile(
  path.join(input, "source-after/signature.json"),
  path.join(output, "commercial-protection.json"),
);
console.log(
  JSON.stringify({ output, pairs: manifest.pairs.length, performance: manifest.performance }),
);
