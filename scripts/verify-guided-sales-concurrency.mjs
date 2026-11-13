// Run against a disposable local PostgreSQL with the app migrations applied:
// GUIDED_SALES_TEST_DB=postgres://postgres@127.0.0.1:55483/postgres node scripts/verify-guided-sales-concurrency.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const target = new URL(process.env.GUIDED_SALES_TEST_DB ?? "http://invalid");
assert(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname), "Use a disposable local DB.");
assert(target.protocol === "postgres:" || target.protocol === "postgresql:");

const sql = postgres(target.href, { max: 3, onnotice() {} });
const actor = randomUUID();
const buyer = randomUUID();
const saleKey = randomUUID();
let second;
try {
  const [{ id: editionId, due }] = await sql`
    select id, ((now() at time zone timezone)::date)::text as due
    from public.editions where is_active and year=2027`;
  const [{ space_id: lot }] = await sql`
    select i.space_id from public.commercial_inventory_v i
    join public.space_commercial_state_v s on s.id=i.space_id
    where i.edition_id=${editionId} and i.segment_key='p12' and s.commercial_status='disponivel'
    order by i.lot_code::int limit 1`;
  await sql`insert into public.user_roles(user_id,role) values(${actor},'admin')`;
  await sql`insert into public.companies(id,legal_name,trade_name)
            values(${buyer},'Concorrência de teste','Concorrência')`;
  const payment = { method: "pix", mode: "a_vista", installmentCount: 1, firstDueOn: due };
  let notifyFirst;
  const firstHasLot = new Promise((resolve) => (notifyFirst = resolve));
  let releaseFirst;
  const holdFirst = new Promise((resolve) => (releaseFirst = resolve));
  const first = sql.begin(async (t) => {
    try {
      await t`select set_config('request.jwt.claim.sub',${actor},true)`;
      const [{ quote }] = await t`select public.preview_guided_sale(
        ${editionId},array[${lot}]::uuid[],'{}',${t.json(payment)}) as quote`;
      const [{ sale }] = await t`select public.save_guided_sale(
        ${editionId},array[${lot}]::uuid[],'{}',${t.json(payment)},${quote.quoteFingerprint},
        ${buyer},null,${saleKey}) as sale`;
      assert.equal(sale.status, "reservada");
      notifyFirst(sale);
      await holdFirst;
      return sale;
    } catch (error) {
      notifyFirst(null);
      throw error;
    }
  });
  const prepared = await firstHasLot;
  if (!prepared) await first;
  const applicationName = "guided-sales-concurrent-legacy";
  second = sql
    .begin(async (t) => {
      await t`select set_config('request.jwt.claim.sub',${actor},true),
                     set_config('application_name',${applicationName},true)`;
      return t`select public.save_deal(null,${editionId},${buyer},null,null,null,
      array[${lot}]::uuid[],array[81000]::bigint[],null)`;
    })
    .then(
      (result) => ({ result }),
      (error) => ({ error }),
    );
  try {
    let blocked = false;
    for (let i = 0; i < 50 && !blocked; i++) {
      const [row] = await sql`select exists(select from pg_stat_activity
        where application_name=${applicationName} and wait_event_type='Lock'
          and wait_event='advisory') as waiting`;
      blocked = row.waiting;
      if (!blocked) await new Promise((resolve) => setTimeout(resolve, 40));
    }
    assert(blocked, "The legacy session must wait for the guided transaction.");
  } finally {
    releaseFirst();
    await first;
    const { error } = await second;
    assert.match(error?.message ?? "", /outra negociação ativa/);
  }
  const [{ count }] = await sql`select count(*)::int as count from public.deal_spaces
    where space_id=${lot}`;
  assert.equal(count, 1);
  console.log(
    "Verified real two-session contention: guided sale commits; legacy sale rejects the same lot.",
  );
} finally {
  await sql.end({ timeout: 5 });
}
