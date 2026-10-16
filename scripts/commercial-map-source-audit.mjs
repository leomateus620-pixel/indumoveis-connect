/** Node 24+. Development-only export; does not read or publish source raster. */
import fs from "node:fs/promises";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { createHash } from "node:crypto";

const output = path.resolve(process.argv[2] ?? "artifacts.local/commercial-map-source-audit");
const input = await fs.readFile("src/features/commercial-map/data/territory.ts", "utf8");
const data = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(input)).toString("base64")}`
);
const { ENTITIES, TREES, MAP_BOUNDS } = data;
const protectedTerritory = {
  MAP_BOUNDS,
  TREES,
  entities: ENTITIES.map(
    ({ id, kind, polygon, anchor, numbers, accesses, declaredAreaM2, label, location }) => ({
      id,
      kind,
      polygon,
      anchor,
      numbers,
      accesses,
      declaredAreaM2,
      label,
      location,
    }),
  ),
};
const signature = {
  algorithm: "sha256",
  sourceSha256: createHash("sha256").update(input.replaceAll("\r\n", "\n")).digest("hex"),
  protectedSha256: createHash("sha256").update(JSON.stringify(protectedTerritory)).digest("hex"),
  envelopes: ENTITIES.filter((e) => e.kind === "lot").length,
  numbers: ENTITIES.filter((e) => e.kind === "lot").flatMap((e) => e.numbers ?? []).length,
};
if (process.argv[3]) {
  const baseline = JSON.parse(await fs.readFile(process.argv[3], "utf8"));
  if (baseline.protectedSha256 !== signature.protectedSha256)
    throw new Error("Protected territory changed");
  signature.matchesBaseline = true;
}
const escape = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const palette = {
  landscape: "#d2dcc6",
  road: "#d4d1cb",
  lot: "#e5d6c6",
  pavilion: "#f6f2eb",
  support: "#bda8b4",
};
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1955" height="1062" viewBox="0 0 195.53776 106.24523"><rect width="196" height="107" fill="#faf8f3"/>${ENTITIES.map((e) => `<g><polygon points="${e.polygon.map((p) => p.join(",")).join(" ")}" fill="${palette[e.kind]}" stroke="${e.kind === "lot" ? "#674b5e" : "#8f9286"}" stroke-width=".13"/><text x="${e.anchor[0]}" y="${e.anchor[1]}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${e.kind === "lot" ? 1.2 : e.kind === "pavilion" ? 1.1 : 0.8}" fill="#3f3039">${escape(e.numbers?.map((n) => String(n).padStart(2, "0")).join("/") ?? e.label)}</text></g>`).join("")}${TREES.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r=".7" fill="#7d906d"/>`).join("")}</svg>`;
const controls = [
  {
    entityId: "indumoveis:pavilion:1",
    sourcePdf: [307.6543, 550.3308],
    drawing: [30.76543, 55.03308],
  },
  {
    entityId: "indumoveis:pavilion:14",
    sourcePdf: [329.4879, 697.8562],
    drawing: [32.94879, 69.78562],
  },
  {
    entityId: "indumoveis:pavilion:12",
    sourcePdf: [647.1247, 703.7982],
    drawing: [64.71247, 70.37982],
  },
  {
    entityId: "indumoveis:pavilion:3",
    sourcePdf: [1158.7329, 678.8834],
    drawing: [115.87329, 67.88834],
  },
  {
    entityId: "indumoveis:external:lot:70",
    sourcePdf: [1528.9597, 669.8046],
    drawing: [152.89597, 66.98046],
  },
];
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, "signature.json"), JSON.stringify(signature, null, 2) + "\n");
await fs.writeFile(path.join(output, "territory.svg"), svg);
await fs.writeFile(
  path.join(output, "territory.json"),
  JSON.stringify({ ENTITIES, TREES, MAP_BOUNDS, controls }, null, 2),
);
console.log(
  JSON.stringify({
    output,
    envelopes: ENTITIES.filter((e) => e.kind === "lot").length,
    controlResidualPdfPoints: controls.map((c) =>
      Math.hypot(c.sourcePdf[0] - c.drawing[0] * 10, c.sourcePdf[1] - c.drawing[1] * 10),
    ),
  }),
);
