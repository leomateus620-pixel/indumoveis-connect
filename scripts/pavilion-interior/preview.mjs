/** Local-only visual QA backend. Never connects to or writes to a real database.
 * Start Vite with VITE_SUPABASE_URL=http://127.0.0.1:4000 VITE_SUPABASE_PUBLISHABLE_KEY=local-preview-key
 * on port 3001, then run this script and visit http://127.0.0.1:4000/__qa/start.
 * Production code contains no preview bypass. Only source plan geometry is reused.
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
const port = 4000;
const origin = `http://127.0.0.1:${port}`;
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "preview@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const editionId = "22222222-2222-4222-8222-222222222222";
const plan = JSON.parse(
  await readFile("src/features/pavilion-interior/plan.generated.json", "utf8"),
);
Object.assign(plan, {
  editionId,
  databasePlanId: "33333333-3333-4333-8333-333333333333",
  revisionId: "44444444-4444-4444-8444-444444444444",
});
const exp = Math.floor(Date.now() / 1000) + 86400;
const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const session = {
  access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp, role: "authenticated" })}.local`,
  refresh_token: "local-fixture",
  expires_at: exp,
  expires_in: 86400,
  token_type: "bearer",
  user,
};
const payloads = {
  pavilion_plan_revisions: { id: plan.revisionId, revision: plan.revision },
  user_roles: [{ user_id: user.id, role: "admin" }],
  role_permissions: [],
  profiles: { id: user.id, full_name: "Prévia local" },
  editions: [
    {
      id: editionId,
      name: "Indumóveis · prévia local",
      year: 2027,
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
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, origin);
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "*");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname === "/__qa/start") {
      res.setHeader("content-type", "text/html");
      res.end(
        `<script>localStorage.setItem('sb-127-auth-token',${JSON.stringify(JSON.stringify(session))});localStorage.setItem('indumoveis:map-quality','light');location.replace('/mapa/pavilhoes/1/interior')</script>`,
      );
      return;
    }
    if (url.pathname.startsWith("/auth/v1/") || url.pathname.startsWith("/rest/v1/")) {
      const name = url.pathname.split("/").at(-1);
      let value;
      if (name === "user") value = user;
      else if (name === "ensure_profile") value = null;
      else if (name === "get_pavilion_interior") value = plan;
      else if (name === "get_pavilion_interior_commercial") value = {};
      else if (req.method === "GET" && name in payloads) value = payloads[name];
      else {
        res.writeHead(403, { "content-type": "application/json" });
        res.end('{"message":"Unsupported local QA request"}');
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
      return;
    }
    const proxy = http.request(
      new URL(req.url, "http://127.0.0.1:3001"),
      { method: req.method, headers: { ...req.headers, host: "127.0.0.1:3001" } },
      (incoming) => {
        res.writeHead(incoming.statusCode, incoming.headers);
        incoming.pipe(res);
      },
    );
    proxy.on("error", (error) => {
      res.writeHead(502);
      res.end(error.message);
    });
    req.pipe(proxy);
  })
  .listen(port, "127.0.0.1", () => console.log(`Local fixture preview: ${origin}/__qa/start`));
