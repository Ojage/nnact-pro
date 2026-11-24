// Dispatch Agent endpoints: deterministic ranking with hard constraints, the
// agent may only reword reasons, shadow mode hides suggestions, comparisons
// are checked against the real assignment. Needs a migrated Postgres.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DISPATCH_AGENT_ENABLED = "true";

const { buildServer } = await import("../src/server.js");
const { db, closeDb, orgs, users, customers, jobs, appointments, technicianProfiles, technicianSkills, dispatchSuggestions } = await import("@nnact/db");
const { eq, sql } = await import("drizzle-orm");
const { mergeAgentReasons } = await import("../src/routes/agent-dispatch.js");

let reachable = false;
try {
  await Promise.race([db.execute(sql`select 1 from dispatch_suggestions limit 1`), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3_000))]);
  reachable = true;
} catch {
  reachable = false;
}

const ORG = randomUUID();
const app = buildServer();
const ids = { alex: randomUUID(), bea: randomUUID(), cal: randomUUID(), dee: randomUUID(), sec: randomUUID(), customer: randomUUID(), job: randomUUID() };

const agentToken = (agentId = "dispatch-agent", scopes = ["jobs:read", "technicians:read", "dispatch-suggestions:create"]) => ({
  authorization: `Bearer ${app.jwt.sign({ aud: "agent", agent_id: agentId, orgId: ORG, scope: scopes[0], scopes })}`,
});
const staff = (role: string) => ({ authorization: `Bearer ${app.jwt.sign({ aud: "staff", userId: ids.sec, orgId: ORG, role })}` });

describe("dispatch agent", { skip: reachable ? false : "no migrated Postgres in DATABASE_URL" }, () => {
  before(async () => {
    await app.ready();
    await db.insert(orgs).values({ id: ORG, name: "Dispatch test org" });
    await db.insert(users).values([
      { id: ids.alex, orgId: ORG, email: `alex-${ORG}@t.test`, name: "Alex", role: "technician" },
      { id: ids.bea, orgId: ORG, email: `bea-${ORG}@t.test`, name: "Bea", role: "technician" },
      { id: ids.cal, orgId: ORG, email: `cal-${ORG}@t.test`, name: "Cal", role: "technician" },
      { id: ids.dee, orgId: ORG, email: `dee-${ORG}@t.test`, name: "Dee", role: "technician", active: false },
      { id: ids.sec, orgId: ORG, email: `sec-${ORG}@t.test`, name: "Sec", role: "secretary" },
    ]);
    await db.insert(technicianProfiles).values([
      { orgId: ORG, userId: ids.alex, homeArea: "Molyko", maxDailyVisits: 4 },
      { orgId: ORG, userId: ids.bea, homeArea: "Buea Town", maxDailyVisits: 4 },
      { orgId: ORG, userId: ids.cal, homeArea: "Molyko", maxDailyVisits: 1 },
    ]);
    await db.insert(technicianSkills).values({ orgId: ORG, userId: ids.alex, kind: "skill", name: "refrigeration" });
    await db.insert(customers).values({ id: ids.customer, orgId: ORG, name: "Test customer" });
    const visit = new Date(Date.now() + 2 * 86_400_000);
    visit.setHours(10, 0, 0, 0);
    await db.insert(jobs).values({
      id: ids.job,
      orgId: ORG,
      customerId: ids.customer,
      title: "Fridge not cooling",
      status: "scheduled",
      serviceCategory: "refrigeration",
      neighborhood: "Molyko",
      scheduledAt: visit,
    });
    // Cal is already booked that day (cap 1); Bea overlaps the visit window.
    const other = randomUUID();
    await db.insert(jobs).values({ id: other, orgId: ORG, customerId: ids.customer, title: "Other", status: "scheduled" });
    await db.insert(appointments).values([
      { orgId: ORG, jobId: other, technicianId: ids.cal, startsAt: new Date(visit.getTime() + 5 * 3_600_000), endsAt: new Date(visit.getTime() + 6 * 3_600_000) },
      { orgId: ORG, jobId: other, technicianId: ids.bea, startsAt: new Date(visit.getTime() + 30 * 60_000), endsAt: new Date(visit.getTime() + 90 * 60_000) },
    ]);
  });

  after(async () => {
    await app.close();
    await db.delete(orgs).where(eq(orgs.id, ORG)).catch(() => undefined);
  });

  test("ranking applies hard constraints and explains who was left out", async () => {
    const res = await app.inject({ method: "POST", url: `/api/agent/dispatch/jobs/${ids.job}/rank`, headers: agentToken() });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.deepEqual(body.candidates.map((candidate: { name: string }) => candidate.name), ["Alex"]);
    assert.equal(body.candidates[0].rank, 1);
    assert.ok(body.causes.some((cause: string) => /Bea is already booked/.test(cause)));
    assert.ok(body.causes.some((cause: string) => /Cal is at the daily visit cap/.test(cause)));
    assert.ok(!JSON.stringify(body).includes("Dee"), "inactive staff are never candidates");
    assert.equal(body.job.customerId, null, "the agent never sees the customer id");
  });

  test("other agents and staff cannot use the agent endpoints", async () => {
    const quoting = await app.inject({ method: "POST", url: `/api/agent/dispatch/jobs/${ids.job}/rank`, headers: agentToken("quoting-agent", ["jobs:read"]) });
    assert.equal(quoting.statusCode, 403);
    const owner = await app.inject({ method: "POST", url: `/api/agent/dispatch/jobs/${ids.job}/rank`, headers: staff("owner") });
    assert.equal(owner.statusCode, 401);
  });

  test("a suggestion keeps server ranks and scores; the agent may only reword", async () => {
    const ranked = (await app.inject({ method: "POST", url: `/api/agent/dispatch/jobs/${ids.job}/rank`, headers: agentToken() })).json();
    const runId = randomUUID();
    const tampered = await app.inject({
      method: "POST",
      url: "/api/agent/dispatch/suggestions",
      headers: agentToken(),
      payload: {
        jobId: ids.job,
        runId,
        fingerprint: ranked.fingerprint,
        candidates: [{ ...ranked.candidates[0], score: 999, reasonSource: "model" }],
        causes: [],
        confidence: 0.9,
      },
    });
    assert.equal(tampered.statusCode, 422);

    const invented = await app.inject({
      method: "POST",
      url: "/api/agent/dispatch/suggestions",
      headers: agentToken(),
      payload: {
        jobId: ids.job,
        runId,
        fingerprint: ranked.fingerprint,
        candidates: [{ ...ranked.candidates[0], technicianId: ids.dee, reasonSource: "model" }],
        causes: [],
        confidence: 0.9,
      },
    });
    assert.equal(invented.statusCode, 422);

    const ok = await app.inject({
      method: "POST",
      url: "/api/agent/dispatch/suggestions",
      headers: agentToken(),
      payload: {
        jobId: ids.job,
        runId,
        fingerprint: ranked.fingerprint,
        candidates: [{ ...ranked.candidates[0], reasons: ["Lives in Molyko and fixes fridges."], reasonSource: "model" }],
        causes: ["model-supplied causes are ignored"],
        confidence: 0.99,
      },
    });
    assert.equal(ok.statusCode, 201);
    const suggestion = ok.json();
    assert.equal(suggestion.state, "shadow");
    assert.equal(suggestion.candidates[0].reasons[0], "Lives in Molyko and fixes fridges.");
    assert.equal(suggestion.confidence, ranked.candidates[0].confidence, "confidence comes from the server");
    assert.ok(!suggestion.causes.includes("model-supplied causes are ignored"));

    const again = await app.inject({
      method: "POST",
      url: "/api/agent/dispatch/suggestions",
      headers: agentToken(),
      payload: { jobId: ids.job, runId, fingerprint: ranked.fingerprint, candidates: [{ ...ranked.candidates[0], reasonSource: "fallback" }], causes: [], confidence: 0.5 },
    });
    assert.equal(again.statusCode, 200, "same fingerprint returns the current suggestion");
  });

  test("shadow suggestions are hidden from dispatchers", async () => {
    const res = await app.inject({ method: "GET", url: `/api/dispatch/suggestions/jobs/${ids.job}`, headers: staff("dispatcher") });
    assert.deepEqual(res.json(), { suggestion: null });
    const secretary = await app.inject({ method: "GET", url: `/api/dispatch/suggestions/jobs/${ids.job}`, headers: staff("secretary") });
    assert.equal(secretary.statusCode, 403);
  });

  test("comparison is checked against the job's real assignment", async () => {
    const [suggestion] = await db.select().from(dispatchSuggestions).where(eq(dispatchSuggestions.jobId, ids.job));
    const lie = await app.inject({
      method: "POST",
      url: `/api/agent/dispatch/suggestions/${suggestion!.id}/compare`,
      headers: agentToken(),
      payload: { actualTechnicianId: ids.alex },
    });
    assert.equal(lie.statusCode, 409, "job is not assigned yet");

    await db.update(jobs).set({ assignedTo: ids.bea }).where(eq(jobs.id, ids.job));
    const changed = await app.inject({
      method: "POST",
      url: `/api/agent/dispatch/suggestions/${suggestion!.id}/compare`,
      headers: agentToken(),
      payload: { actualTechnicianId: ids.bea },
    });
    assert.equal(changed.statusCode, 200);
    assert.equal(changed.json().state, "changed");
    // An assigned job is no longer open for ranking.
    const closed = await app.inject({ method: "POST", url: `/api/agent/dispatch/jobs/${ids.job}/rank`, headers: agentToken() });
    assert.equal(closed.statusCode, 404);
  });

  test("merge refuses reordered or rescored candidates", () => {
    const base = { technicianId: ids.alex, name: "Alex", rank: 1, score: 30, confidence: 0.7, factors: [], reasons: ["fallback"] };
    assert.equal(mergeAgentReasons([base], [{ ...base, rank: 2, reasonSource: "model" }]), null);
    assert.equal(mergeAgentReasons([base], []), null);
    assert.equal(mergeAgentReasons([base], [{ ...base, reasons: [], reasonSource: "model" }])?.[0]?.reasonSource, "fallback");
  });
});

after(async () => {
  await closeDb();
});
