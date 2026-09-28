/**
 * HTTP mapping for POST /growth/campaigns/:id/run.
 * Run with: node --import tsx --experimental-test-module-mocks --test test/growth-campaign-run.route.test.ts
 */
import assert from "node:assert/strict";
import { test, mock } from "node:test";
import Fastify from "fastify";
import fjwt from "@fastify/jwt";
import { AUTH_AUDIENCES } from "@nnact/shared";

const ORG = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const CAMPAIGN = "33333333-3333-3333-3333-333333333333";

const runCampaignSend = mock.fn();

mock.module("../src/growth/outbound.js", {
  // namedExports rather than exports: the latter is only honoured by the Node 24
  // module-mocks API, and CI runs Node 22 where it silently mocks nothing.
  namedExports: {
    runCampaignSend: (...args: unknown[]) => runCampaignSend(...args),
    isWithinQuietHours: () => false,
    isStepDue: () => true,
  },
});

const { growthCampaignRoutes } = await import("../src/routes/growth-campaigns.js");

function staffToken(app: ReturnType<typeof Fastify>) {
  return app.jwt.sign({
    aud: AUTH_AUDIENCES.staff,
    userId: USER,
    orgId: ORG,
    role: "dispatcher",
  });
}

async function buildApp() {
  const app = Fastify();
  await app.register(fjwt, { secret: "growth-route-test-secret" });
  await app.register(growthCampaignRoutes, { prefix: "/growth" });
  await app.ready();
  return app;
}

test("POST /growth/campaigns/:id/run surfaces cold transport refusal over HTTP", async (t) => {
  runCampaignSend.mock.mockImplementationOnce(async () => ({
    sent: 0,
    suppressed: 0,
    blocked: 0,
    skipped: 0,
    failed: 0,
    duplicates: 0,
    processed: 0,
    outcomes: [],
    refusal: {
      code: "cold_transport_not_configured",
      message: "Cold outreach transport is not configured.",
    },
  }));

  const app = await buildApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: `/growth/campaigns/${CAMPAIGN}/run`,
    headers: { authorization: `Bearer ${staffToken(app)}` },
    payload: {},
  });

  assert.equal(res.statusCode, 409);
  const body = res.json() as { error: string; message: string };
  assert.equal(body.error, "cold_transport_not_configured");
  assert.match(body.message, /not configured/i);
});

test("POST /growth/campaigns/:id/run surfaces project pause refusal over HTTP", async (t) => {
  runCampaignSend.mock.mockImplementationOnce(async () => ({
    sent: 0,
    suppressed: 0,
    blocked: 0,
    skipped: 0,
    failed: 0,
    duplicates: 0,
    processed: 0,
    outcomes: [],
    refusal: {
      code: "growth_paused",
      message: "Growth sending is paused for this organisation.",
    },
  }));

  const app = await buildApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: `/growth/campaigns/${CAMPAIGN}/run`,
    headers: { authorization: `Bearer ${staffToken(app)}` },
    payload: {},
  });

  assert.equal(res.statusCode, 409);
  const body = res.json() as { error: string };
  assert.equal(body.error, "growth_paused");
});
