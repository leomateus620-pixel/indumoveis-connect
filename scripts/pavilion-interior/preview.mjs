/** Local-only visual QA backend. Never connects to or writes to a real database.
 * Start Vite with VITE_SUPABASE_URL=http://127.0.0.1:4000 VITE_SUPABASE_PUBLISHABLE_KEY=local-preview-key
 * on port 3001, then run this script and visit http://127.0.0.1:4000/__qa/start.
 * Production code contains no preview bypass. Only source plan geometry is reused.
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
const port = Number(process.env.PAVILION_QA_PORT ?? 4000);
const vitePort = Number(process.env.PAVILION_QA_VITE_PORT ?? 3001);
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
const plans = {};
for (const [pavilion, planIdDigit, revisionIdDigit] of [
  [1, "3", "4"],
  [8, "7", "8"],
  [12, "9", "a"],
  [13, "5", "6"],
]) {
  const source = pavilion === 1 ? "plan.generated.json" : `pavilion${pavilion}.generated.json`;
  const plan = JSON.parse(await readFile(`src/features/pavilion-interior/${source}`, "utf8"));
  const id = (digit) => "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replaceAll("x", digit);
  Object.assign(plan, {
    editionId,
    databasePlanId: id(planIdDigit),
    revisionId: id(revisionIdDigit),
  });
  plans[pavilion] = plan;
}
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
      const requested = Number(url.searchParams.get("pavilhao")) || 1;
      res.end(
        `<script>localStorage.setItem('sb-127-auth-token',${JSON.stringify(JSON.stringify(session))});localStorage.setItem('indumoveis:map-quality','light');location.replace('/mapa/pavilhoes/${plans[requested] ? requested : 1}/interior')</script>`,
      );
      return;
    }
    if (url.pathname.startsWith("/auth/v1/") || url.pathname.startsWith("/rest/v1/")) {
      const name = url.pathname.split("/").at(-1);
      let args = {};
      if (req.method === "POST") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        try {
          args = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        } catch {
          res.writeHead(400);
          res.end();
          return;
        }
      }
      const pavilion = Number(
        args.p_pavilion_number ?? url.searchParams.get("pavilion_number")?.replace("eq.", "") ?? 1,
      );
      const plan = plans[pavilion];
      let value;
      if (name === "user") value = user;
      else if (name === "ensure_profile") value = null;
      else if (name === "pavilion_plan_revisions")
        value = plan ? { id: plan.revisionId, revision: plan.revision } : null;
      else if (name === "get_pavilion_interior") value = plan ?? null;
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
      new URL(req.url, `http://127.0.0.1:${vitePort}`),
      { method: req.method, headers: { ...req.headers, host: `127.0.0.1:${vitePort}` } },
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
