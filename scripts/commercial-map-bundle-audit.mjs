// Build-artifact evidence only; browser traffic is measured by the separate lab.
import assert from "node:assert/strict";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const directory = path.resolve(".output/public/assets");
const output = path.resolve(process.argv[2] ?? "docs/validation/commercial-map/bundle.json");
const files = await readdir(directory);
const modules = new Map(
  await Promise.all(
    files
      .filter((file) => file.endsWith(".js"))
      .map(async (file) => [file, await readFile(path.join(directory, file), "utf8")]),
  ),
);
const find = (prefix) =>
  files.find((file) => file.startsWith(`${prefix}-`) && file.endsWith(".js"));
function imports(file) {
  const source = modules.get(file) ?? "";
  return [...source.matchAll(/(?:\bfrom\s*|\bimport\s*)["']\.\/([^"']+\.js)["']/g)].map(
    (match) => match[1],
  );
}
function closure(entry, output = new Set()) {
  if (!entry || output.has(entry)) return output;
  output.add(entry);
  for (const dependency of imports(entry)) closure(dependency, output);
  return output;
}
const renderer = find("MapRenderer"),
  map = find("mapa");
assert(renderer && map, "Build must emit a separate map route and renderer.");
const finance = closure(find("financeiro")),
  documents = closure(find("documentos"));
assert(
  !finance.has(renderer) && !documents.has(renderer),
  "Engine entered another module static path.",
);
for (const file of new Set([...finance, ...documents]))
  assert(
    !/class\s+WebGLRenderer|WebGL2RenderingContext/.test(modules.get(file) ?? ""),
    `Engine code leaked into ${file}`,
  );
const shell = closure(find("index"));
// The authenticated shell is another route chunk; include it in the already loaded shell.
for (const file of files.filter((file) => file.startsWith("route-") && file.endsWith(".js")))
  for (const dependency of closure(file)) shell.add(dependency);
const feature = new Set([...closure(map), ...closure(renderer)]);
for (const file of shell) feature.delete(file);
for (const file of files.filter((file) => file.startsWith("mapa-") && file.endsWith(".css")))
  feature.add(file);
const assets = await Promise.all(
  [...feature].sort().map(async (file) => {
    const buffer = await readFile(path.join(directory, file));
    return { file, bytes: buffer.length, gzipBytes: gzipSync(buffer).length };
  }),
);
const compressedBytes = assets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
assert(compressedBytes <= 3 * 1024 * 1024, "Essential feature exceeds 3 MiB gzip budget.");
const result = {
  generatedAt: new Date().toISOString(),
  kind: "static production artifacts; not observed network transfer",
  renderer,
  map,
  featureAssets: assets,
  compressedBytes,
  budgetBytes: 3 * 1024 * 1024,
  financeStaticFiles: [...finance],
  documentsStaticFiles: [...documents],
  engineIsolated: true,
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ renderer, featureGzipBytes: compressedBytes, engineIsolated: true }));
