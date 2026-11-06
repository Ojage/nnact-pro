/**
 * POST /api/ai/trigger body contract.
 *
 * The mobile "Run morning" button sent `{ slot }` only. The route's
 * triggerBody requires `isoDate` as a YYYY-MM-DD string alongside `slot`, so
 * every tap failed with:
 *
 *   invalid_type: expected string, received undefined
 *
 * This pins the required fields and the date format so the client cannot
 * regress to sending a partial body again.
 *
 * Run with: node --import tsx --experimental-test-module-mocks --test test/ai-trigger.route.test.ts
 */
import assert from "node:assert/strict";
import { test, mock } from "node:test";
import Fastify from "fastify";
import fjwt from "@fastify/jwt";
import { AUTH_AUDIENCES } from "@nnact/shared";

const ORG = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";

/** Args the engine's runNowQueued was called with. */
const triggered: { isoDate?: string; slot?: string } = {};

/**
 * What the engine reports back. Overridden per test to simulate a slot that
 * already has a run the executor cannot claim.
 */
let outcome: { runId: string; state: string; queued: boolean; reason?: string } = {
  runId: "run-1",
  state: "QUEUED",
  queued: true,
};

const SETTINGS = {
  orgId: ORG,
  enabled: true,
  mode: "DRAFT_ONLY",
  killSwitch: false,
  reserveEnabled: false,
  reserveTarget: 0,
  qualityThreshold: 70,
  dailyBudgetCents: 0,
  monthlyBudgetCents: 0,
  maxAiCallsPerSlot: 0,
  lastMorningRunAt: null,
  nextMorningRunAt: null,
};

mock.module("../src/routes/org.js", {
  namedExports: { resolveOrgId: async () => ORG },
});

mock.module("../src/ai/engine.js", {
  namedExports: {
    createAutomationEngine: () => ({
      runNowQueued: async (_orgId: string, isoDate: string, slot: string) => {
        triggered.isoDate = isoDate;
        triggered.slot = slot;
        return outcome;
      },
      settings: async () => SETTINGS,
      usage: async () => ({}),
      reserve: async () => ({}),
      listRuns: async () => ({ items: [], total: 0 }),
      getRun: async () => null,
      cancelRun: async () => ({}),
      retryRun: async () => ({}),
    }),
  },
});

const { aiRoutes } = await import("../src/ai/index.js");

async function buildApp() {
  const app = Fastify();
  await app.register(fjwt, { secret: "ai-trigger-test-secret" });
  await app.register(aiRoutes, { prefix: "/api/ai" });
  await app.ready();
  return app;
}

function auth(app: ReturnType<typeof Fastify>) {
  return app.jwt.sign({ aud: AUTH_AUDIENCES.staff, userId: USER, orgId: ORG, role: "owner" });
}

test("POST /api/ai/trigger accepts isoDate + slot and queues the run", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  outcome = { runId: "run-1", state: "SCHEDULED", queued: true };

  const res = await app.inject({
    method: "POST",
    url: "/api/ai/trigger",
    headers: { authorization: `Bearer ${auth(app)}` },
    payload: { isoDate: "2026-03-14", slot: "MORNING" },
  });

  assert.equal(res.statusCode, 202);
  assert.deepEqual(triggered, { isoDate: "2026-03-14", slot: "MORNING" });
});

test("POST /api/ai/trigger rejects a body without isoDate", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  delete triggered.isoDate;
  const res = await app.inject({
    method: "POST",
    url: "/api/ai/trigger",
    headers: { authorization: `Bearer ${auth(app)}` },
    payload: { slot: "MORNING" },
  });

  assert.notEqual(res.statusCode, 202);
  assert.equal(triggered.isoDate, undefined);
});

test("POST /api/ai/trigger rejects a body without slot", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  delete triggered.slot;
  const res = await app.inject({
    method: "POST",
    url: "/api/ai/trigger",
    headers: { authorization: `Bearer ${auth(app)}` },
    payload: { isoDate: "2026-03-14" },
  });

  assert.notEqual(res.statusCode, 202);
  assert.equal(triggered.slot, undefined);
});

test("POST /api/ai/trigger rejects a non ISO-8601 date", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  delete triggered.isoDate;
  const res = await app.inject({
    method: "POST",
    url: "/api/ai/trigger",
    headers: { authorization: `Bearer ${auth(app)}` },
    payload: { isoDate: "14/03/2026", slot: "MORNING" },
  });

  assert.notEqual(res.statusCode, 202);
  assert.equal(triggered.isoDate, undefined);
});

// `ensureRun` returns the existing run for a (date, slot) rather than creating
// a second one, so pressing "Generate now" on a slot that already ran resolves
// to that run. When it is in a state the executor cannot claim, nothing happens
// — but the route used to answer 202 anyway, so the UI told the operator to
// watch a live run in the tray that would never appear. These pin the fix: a
// slot that did not start must not report that it did.

test("a slot that cannot be claimed answers 409, not 202", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  outcome = { runId: "run-9", state: "PUBLISHED", queued: false, reason: "already_published" };

  const res = await app.inject({
    method: "POST",
    url: "/api/ai/trigger",
    headers: { authorization: `Bearer ${auth(app)}` },
    payload: { isoDate: "2026-09-30", slot: "MORNING" },
  });

  assert.equal(res.statusCode, 409, "a no-op must not be reported as a queued run");
  const body = res.json();
  assert.equal(body.queued, false);
  assert.equal(body.runId, "run-9");
  assert.equal(body.error, "already_published", "`error` is the machine-readable code the client reads");
  assert.match(body.message, /already published/i);
});

test("a slot that is already running answers 409 and says so", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  outcome = { runId: "run-10", state: "GENERATING", queued: false, reason: "already_running" };

  const res = await app.inject({
    method: "POST",
    url: "/api/ai/trigger",
    headers: { authorization: `Bearer ${auth(app)}` },
    payload: { isoDate: "2026-09-30", slot: "MORNING" },
  });

  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error, "already_running");
  assert.match(res.json().message, /already running/i);
});

test("a terminal run points the operator at Retry", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  outcome = { runId: "run-11", state: "CANCELLED", queued: false, reason: "not_claimable" };

  const res = await app.inject({
    method: "POST",
    url: "/api/ai/trigger",
    headers: { authorization: `Bearer ${auth(app)}` },
    payload: { isoDate: "2026-09-30", slot: "MORNING" },
  });

  assert.equal(res.statusCode, 409);
  assert.match(res.json().message, /Retry/, "the remedy differs from the already-published case");
});

test("a genuinely queued run still answers 202 with queued true", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  outcome = { runId: "run-12", state: "SCHEDULED", queued: true };

  const res = await app.inject({
    method: "POST",
    url: "/api/ai/trigger",
    headers: { authorization: `Bearer ${auth(app)}` },
    payload: { isoDate: "2026-09-30", slot: "MORNING" },
  });

  assert.equal(res.statusCode, 202);
  assert.equal(res.json().queued, true);
  assert.equal(res.json().async, true);
});
