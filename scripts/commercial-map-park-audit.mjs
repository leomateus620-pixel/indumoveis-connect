/** Local technical export. Usage: node scripts/commercial-map-park-audit.mjs [output]
 * Optional A2 overlay: --a2 --raster=<local file> --raster-size=width,height.
 * Other raster overlays require explicit --raster-transform=a,b,c,d,e,f.
 * The raster is linked locally, never embedded.
 * A2 has its own 270° page rotation; do not reuse Illustrator registration. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { rolldown } from "rolldown";

const args = process.argv.slice(2);
const output = path.resolve(
  args.find((arg) => !arg.startsWith("--")) ?? "artifacts.local/commercial-map-park-audit",
);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const rasterPath = option("raster");
const rasterMatrix = option("raster-transform")?.split(",").map(Number);
const rasterSize = option("raster-size")?.split(",").map(Number);
const a2 = args.includes("--a2");
if (
  rasterPath &&
  ((!a2 && !rasterMatrix) ||
    (rasterMatrix && (rasterMatrix.length !== 6 || !rasterMatrix.every(Number.isFinite))))
)
  throw new Error("Raster overlay requires six explicit finite --raster-transform matrix values.");
if (!rasterPath && rasterMatrix) throw new Error("--raster-transform requires --raster.");
if (
  rasterPath &&
  (!rasterSize ||
    rasterSize.length !== 2 ||
    !rasterSize.every((value) => Number.isFinite(value) && value > 0))
)
  throw new Error("Raster overlay requires positive --raster-size=width,height in pixels.");
if (rasterPath) await fs.access(path.resolve(rasterPath));

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "indumoveis-park-audit-"));
const bundled = path.join(directory, "audit.mjs");
let build;
try {
  build = await rolldown({
    input: path.resolve("scripts/commercial-map-park-audit.ts"),
    platform: "node",
    external: (id) => id.startsWith("node:"),
  });
  await build.write({ file: bundled, format: "esm" });
  const { createParkTechnicalAudit } = await import(pathToFileURL(bundled).href);
  const audit = createParkTechnicalAudit({
    generatedAt: new Date().toISOString(),
    connectivity: args.includes("--connectivity"),
    raster: rasterPath
      ? {
          href: pathToFileURL(path.resolve(rasterPath)).href,
          matrix: rasterMatrix,
          width: rasterSize[0],
          height: rasterSize[1],
          frame: a2 ? "a2-normalized" : undefined,
        }
      : undefined,
  });
  await fs.mkdir(output, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(output, "park-technical.svg"), audit.svg),
    fs.writeFile(
      path.join(output, "park-technical.json"),
      `${JSON.stringify(audit.data, null, 2)}\n`,
    ),
    fs.writeFile(path.join(output, "park-correspondence.md"), audit.markdown),
  ]);
  console.log(JSON.stringify({ output, ...audit.summary }));
} finally {
  if (build) await build.close();
  await fs.unlink(bundled).catch(() => {});
  await fs.rmdir(directory).catch(() => {});
}
