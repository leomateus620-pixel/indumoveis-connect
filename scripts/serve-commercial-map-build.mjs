// Local adapter for the existing Cloudflare-module production output. No deployment.
// node scripts/serve-commercial-map-build.mjs 4174
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const output = path.resolve(".output");
const publicRoot = path.join(output, "public");
const application = (await import(pathToFileURL(path.join(output, "server", "index.mjs")).href))
  .default;
const port = Number(process.argv[2] ?? 4174);
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const compressedAssets = new Map();
const server = http.createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, `http://127.0.0.1:${port}`);
    const asset = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
    if (asset.startsWith(`${publicRoot}${path.sep}`)) {
      try {
        const data = await readFile(asset);
        const compress =
          /gzip/.test(incoming.headers["accept-encoding"] ?? "") &&
          /\.(js|css|json|svg)$/.test(asset);
        let body = data;
        if (compress) {
          body = compressedAssets.get(asset) ?? gzipSync(data);
          compressedAssets.set(asset, body);
        }
        outgoing.writeHead(200, {
          "content-type": mime[path.extname(asset)] ?? "application/octet-stream",
          "content-length": body.length,
          ...(compress ? { "content-encoding": "gzip", vary: "Accept-Encoding" } : {}),
        });
        outgoing.end(body);
        return;
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error;
      }
    }
    const request = new Request(url, { headers: incoming.headers, method: incoming.method });
    const response = await application.fetch(
      request,
      {},
      { waitUntil: (promise) => promise.catch(() => {}) },
    );
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500, { "content-type": "text/plain" });
    outgoing.end("Local production adapter failed; inspect its terminal.");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Local production output: http://127.0.0.1:${port}`),
);
