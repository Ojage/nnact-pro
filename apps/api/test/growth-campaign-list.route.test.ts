/**
 * Response shape for GET /growth/campaigns.
 * Run with: node --import tsx --experimental-test-module-mocks --test test/growth-campaign-list.route.test.ts
 *
 * This exists because the list route returned `{ campaigns }` while the web
 * typed it as GrowthCampaignDTO[] and every sibling list route returns a bare
 * array. The mismatch was invisible at compile time and threw
 * "(intermediate value).map is not a function" in the browser. The shape is
 * the contract, so it is pinned here.
 */
import assert from "node:assert/strict";
import { test, mock } from "node:test";
import Fastify from "fastify";
import fjwt from "@fastify/jwt";
import { AUTH_AUDIENCES } from "@nnact/shared";

const ORG = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const CAMPAIGN = "33333333-3333-3333-3333-333333333333";

const ROW = {
  id: CAMPAIGN,
  orgId: ORG,
  name: "Spring maintenance push",
  status: "DRAFT",
  purpose: "PERMISSION_MARKETING",
};

/** Rows the fake db resolves to; reassigned per test. */
let currentRows: unknown[] = [];

/**
 * Drizzle query builders are chainable and thenable, and this route only ever
 * chains select/from/where/orderBy/limit/offset before awaiting. A proxy that
 * returns itself for every method and resolves on `then` is enough to drive the
 * handler without a live database.
 */
function fakeDb() {
  const target = {
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(currentRows).then(onFulfilled, onRejected);
    },
  };
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") return target.then;
      return () => fakeSelf;
    },
  });
}
const fakeSelf = fakeDb();

/**
 * Only the connection needs faking. The table exports are schema descriptors,
 * and drizzle's `eq(table.col, value)` / `and(...)` builders work perfectly
 * well on the real ones — nothing executes against them because the fake db
 * never reads them. Re-exporting the whole module with just `db` swapped keeps
 * this robust against the transitive import graph (pause.ts, access.ts and
 * friends pull in tables this test never names).
 */
const realDb = await import("@nnact/db");
mock.module("@nnact/db", {
  namedExports: { ...realDb, db: fakeSelf },
});

mock.module("../src/routes/org.js", {
  namedExports: { resolveOrgId: async () => ORG },
});

mock.module("../src/growth/access.js", {
  namedExports: {
    requireGrowthRead: async () => ({ orgId: ORG, role: "dispatcher" }),
    requireGrowthWrite: async () => ({ orgId: ORG, role: "dispatcher" }),
    canManageSenderIdentities: () => true,
  },
});

const { growthCampaignRoutes } = await import("../src/routes/growth-campaigns.js");

async function buildApp() {
  const app = Fastify();
  await app.register(fjwt, { secret: "growth-list-shape-test-secret" });
  await app.register(growthCampaignRoutes, { prefix: "/growth" });
  await app.ready();
  return app;
}

function auth(app: ReturnType<typeof Fastify>) {
  return app.jwt.sign({ aud: AUTH_AUDIENCES.staff, userId: USER, orgId: ORG, role: "dispatcher" });
}

test("GET /growth/campaigns returns a bare array, not an envelope", async (t) => {
  currentRows = [ROW];
  const app = await buildApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/growth/campaigns",
    headers: { authorization: `Bearer ${auth(app)}` },
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body), `expected a bare array, received ${JSON.stringify(body)}`);
  assert.equal(body.length, 1);
  assert.equal(body[0].id, CAMPAIGN);
  assert.ok(!("campaigns" in body), "list must not be wrapped in a `campaigns` key");
});

test("GET /growth/campaigns returns [] (not an object) when nothing matches", async (t) => {
  currentRows = [];
  const app = await buildApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "GET",
    url: "/growth/campaigns",
    headers: { authorization: `Bearer ${auth(app)}` },
  });

  assert.equal(res.statusCode, 200);
  // An empty envelope here would still break every `.map`/`.length` on the
  // client, so the empty case is asserted separately.
  assert.deepEqual(res.json(), []);
});

// The recipient table and the outbound log were wrapped the same way as the
// campaign list and would have thrown the identical error on the detail page.
for (const [label, url] of [
  ["recipients", "/growth/campaigns/33333333-3333-3333-3333-333333333333/recipients"],
  ["outbound log", "/growth/campaigns/33333333-3333-3333-3333-333333333333/outbound"],
] as const) {
  test(`GET ${label} returns a bare array, not an envelope`, async (t) => {
    currentRows = [{ id: "row-1" }];
    const app = await buildApp();
    t.after(() => app.close());

    const res = await app.inject({
      method: "GET",
      url,
      headers: { authorization: `Bearer ${auth(app)}` },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(Array.isArray(body), `expected a bare array for ${label}, received ${JSON.stringify(body)}`);
    assert.equal(body.length, 1);
  });
}
