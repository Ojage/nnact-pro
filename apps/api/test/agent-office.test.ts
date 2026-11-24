// Agent Office API: RBAC, ingest and redaction, status derivation, the kill
// switch audit trail, retry rules, reveal auditing, retention, and SSE.
// Needs a migrated Postgres in DATABASE_URL; skipped when none answers.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request as httpRequest, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";

process.env.AGENT_OFFICE_ENABLED = "true";
process.env.NODE_ENV = "test";

const { buildServer } = await import("../src/server.js");
const { db, closeDb, orgs, agentAuditLog, agentHeartbeats, agentLeases, agentLogLines, agentOfficeEvents, agentRunSteps, agentRuns, agentControls } =
  await import("@nnact/db");
const { purgeAgentOffice } = await import("../src/agent-office/retention.js");
const { redactLine } = await import("../src/agent-office/redact.js");
const { eq, and, inArray, sql } = await import("drizzle-orm");

// Skip unless a migrated Postgres answers at DATABASE_URL.
let reachable = false;
try {
  await Promise.race([
    db.execute(sql`select 1 from agent_office_events limit 1`),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3_000)),
  ]);
  reachable = true;
} catch {
  reachable = false;
}

const ORG = randomUUID();
const OTHER_ORG = randomUUID();
const app = buildServer();
let baseUrl = "";

function staff(role: "owner" | "dispatcher" | "secretary" | "technician", orgId = ORG) {
  return { authorization: `Bearer ${app.jwt.sign({ aud: "staff", userId: `user-${role}`, orgId, role, name: `Test ${role}` })}` };
}

function agent(agentId: string, orgId = ORG) {
  return {
    authorization: `Bearer ${app.jwt.sign({ aud: "agent", agent_id: agentId, orgId, scope: "agent-runs:write", scopes: ["agent-runs:write"] })}`,
  };
}

async function createRun(agentId: string, task: string, orgId = ORG, extra: Partial<typeof agentRuns.$inferInsert> = {}) {
  const [run] = await db
    .insert(agentRuns)
    .values({ orgId, agentId, task, state: "running", input: { text: "Bonjour, my fridge at +237 650 12 34 56 is broken" }, ...extra })
    .returning();
  return run!;
}

describe("agent office", { skip: reachable ? false : "no migrated Postgres in DATABASE_URL" }, () => {
  before(async () => {
    await db.insert(orgs).values([
      { id: ORG, name: "Agent Office test org", slug: `ao-${ORG.slice(0, 8)}` },
      { id: OTHER_ORG, name: "Other test org", slug: `ao-${OTHER_ORG.slice(0, 8)}` },
    ]);
    await app.listen({ port: 0, host: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    await db.delete(agentControls).where(inArray(agentControls.agentId, ["intake-agent", "quoting-agent"]));
  });

  after(async () => {
    await app.close();
    await db.delete(agentRuns).where(inArray(agentRuns.orgId, [ORG, OTHER_ORG]));
    await db.delete(agentAuditLog).where(eq(agentAuditLog.orgId, ORG));
    await db.delete(agentControls).where(inArray(agentControls.agentId, ["intake-agent", "quoting-agent"]));
    await db.delete(orgs).where(inArray(orgs.id, [ORG, OTHER_ORG]));
  });

  test("only an owner's staff session gets in", async () => {
    for (const [headers, expected] of [
      [{}, 401],
      [agent("intake-agent"), 401],
      [staff("technician"), 403],
      [staff("secretary"), 403],
      [staff("dispatcher"), 403],
      [staff("owner"), 200],
    ] as const) {
      const res = await app.inject({ method: "GET", url: "/api/agent-office/overview", headers });
      assert.equal(res.statusCode, expected, `${JSON.stringify(headers).slice(0, 40)} -> ${res.statusCode}`);
    }
    const pause = await app.inject({ method: "POST", url: "/api/agent-office/agents/intake-agent/pause", headers: staff("dispatcher"), payload: { reason: "dispatcher tries" } });
    assert.equal(pause.statusCode, 403);
  });

  test("the flag hides every route", async () => {
    process.env.AGENT_OFFICE_ENABLED = "false";
    try {
      const res = await app.inject({ method: "GET", url: "/api/agent-office/overview", headers: staff("owner") });
      assert.equal(res.statusCode, 404);
    } finally {
      process.env.AGENT_OFFICE_ENABLED = "true";
    }
  });

  test("the overview lists every registry agent, vacant ones included", async () => {
    const res = await app.inject({ method: "GET", url: "/api/agent-office/overview", headers: staff("owner") });
    const body = res.json() as { agents: Array<{ id: string; stage: string; activity: number[] }> };
    assert.equal(body.agents.length, 8);
    assert.equal(body.agents.find((room) => room.id === "payments-agent")?.stage, "planned");
    assert.equal(body.agents[0]!.activity.length, 24);
  });

  test("status follows heartbeats: working, then offline when stale, paused over all", async () => {
    const run = await createRun("intake-agent", "agent.extract");
    const beat = await app.inject({
      method: "POST",
      url: "/api/agent/platform/heartbeat",
      headers: agent("intake-agent"),
      payload: {
        instanceId: "test-1",
        status: "working",
        version: "test",
        current: { runId: run.id, task: "agent.extract", label: "Drafting job from WhatsApp", stepName: "extract", stepIndex: 2, stepCount: 4 },
      },
    });
    assert.equal(beat.statusCode, 204);
    let rooms = (await app.inject({ method: "GET", url: "/api/agent-office/overview", headers: staff("owner") })).json().agents;
    let intake = rooms.find((room: { id: string }) => room.id === "intake-agent");
    assert.equal(intake.status, "working");
    assert.equal(intake.current.label, "Drafting job from WhatsApp");
    assert.equal(intake.current.stepIndex, 2);

    await db
      .update(agentHeartbeats)
      .set({ lastSeenAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(agentHeartbeats.agentId, "intake-agent"));
    rooms = (await app.inject({ method: "GET", url: "/api/agent-office/overview", headers: staff("owner") })).json().agents;
    intake = rooms.find((room: { id: string }) => room.id === "intake-agent");
    assert.equal(intake.status, "offline");
    assert.equal(intake.current, null);
  });

  test("an agent cannot report on another agent's or another org's run", async () => {
    const mine = await createRun("intake-agent", "agent.extract");
    const foreign = await createRun("intake-agent", "agent.extract", OTHER_ORG);
    const asQuoting = await app.inject({
      method: "PUT",
      url: `/api/agent/platform/runs/${mine.id}/steps/1`,
      headers: agent("quoting-agent"),
      payload: { name: "extract", label: "Extract", status: "running" },
    });
    assert.equal(asQuoting.statusCode, 404);
    const otherOrg = await app.inject({
      method: "PUT",
      url: `/api/agent/platform/runs/${foreign.id}/steps/1`,
      headers: agent("intake-agent"),
      payload: { name: "extract", label: "Extract", status: "running" },
    });
    assert.equal(otherOrg.statusCode, 404);
    const staffToken = await app.inject({ method: "POST", url: "/api/agent/platform/logs", headers: staff("owner"), payload: { lines: [{ level: "info", message: "x" }] } });
    assert.equal(staffToken.statusCode, 401);
  });

  test("steps and logs are redacted before they are stored", async () => {
    const run = await createRun("intake-agent", "agent.extract");
    const step = await app.inject({
      method: "PUT",
      url: `/api/agent/platform/runs/${run.id}/steps/1`,
      headers: agent("intake-agent"),
      payload: {
        name: "receive",
        label: "Receive message",
        status: "completed",
        summary: 'Customer said "my fridge has been leaking since Monday" from +237 650 12 34 56',
        fields: { customerName: "Amina Fon", language: "fr", chars: 48 },
      },
    });
    assert.equal(step.statusCode, 204);
    const logs = await app.inject({
      method: "POST",
      url: "/api/agent/platform/logs",
      headers: agent("intake-agent"),
      payload: {
        lines: [
          { level: "info", message: "reply sent to amina@example.com via 237650123456", runId: run.id },
          { level: "warn", message: "provider retry api_key=sk-ant-abcdefghijklmnopqrstuv", fields: { phone: "650123456", attempt: 2 } },
        ],
      },
    });
    assert.equal(logs.statusCode, 202);

    const [stored] = await db.select().from(agentRunSteps).where(eq(agentRunSteps.runId, run.id));
    assert.ok(stored);
    assert.doesNotMatch(stored.summary ?? "", /leaking|650|Amina/);
    assert.match(stored.summary ?? "", /\[text\]/);
    assert.match(stored.summary ?? "", /customerName=\[redacted\]/);
    assert.match(stored.summary ?? "", /language=fr/);

    const lines = await db.select().from(agentLogLines).where(eq(agentLogLines.agentId, "intake-agent"));
    const text = lines.map((line) => line.message).join("\n");
    assert.doesNotMatch(text, /amina@example\.com|650123456|sk-ant-/);
    assert.match(text, /\[email\]/);
    assert.match(text, /phone=\[redacted\]/);
    // A run-scoped line lands under the org; a process-level line has none.
    assert.equal(lines.find((line) => line.runId === run.id)?.orgId, ORG);

    const detail = await app.inject({ method: "GET", url: `/api/agent-office/runs/${run.id}`, headers: staff("owner") });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().steps[0].label, "Receive message");
    const otherOwner = await app.inject({ method: "GET", url: `/api/agent-office/runs/${run.id}`, headers: staff("owner", OTHER_ORG) });
    assert.equal(otherOwner.statusCode, 404);
  });

  test("redaction leaves dates, ids and counts alone", () => {
    const line = redactLine("run 2026-11-24 took 1795483842440 ms for job 42", { attempt: 3 });
    assert.equal(line, "run 2026-11-24 took 1795483842440 ms for job 42 attempt=3");
  });

  test("pause and resume need a reason and leave an audit trail", async () => {
    const missing = await app.inject({ method: "POST", url: "/api/agent-office/agents/quoting-agent/pause", headers: staff("owner"), payload: {} });
    assert.equal(missing.statusCode, 400);
    const short = await app.inject({ method: "POST", url: "/api/agent-office/agents/quoting-agent/pause", headers: staff("owner"), payload: { reason: "no" } });
    assert.equal(short.statusCode, 400);

    const paused = await app.inject({
      method: "POST",
      url: "/api/agent-office/agents/quoting-agent/pause",
      headers: staff("owner"),
      payload: { reason: "Price book under review" },
    });
    assert.deepEqual(paused.json(), { ok: true, changed: true });
    const again = await app.inject({
      method: "POST",
      url: "/api/agent-office/agents/quoting-agent/pause",
      headers: staff("owner"),
      payload: { reason: "Price book under review" },
    });
    assert.deepEqual(again.json(), { ok: true, changed: false });

    const rooms = (await app.inject({ method: "GET", url: "/api/agent-office/overview", headers: staff("owner") })).json().agents;
    assert.equal(rooms.find((room: { id: string }) => room.id === "quoting-agent").status, "paused");

    await app.inject({ method: "POST", url: "/api/agent-office/agents/quoting-agent/resume", headers: staff("owner"), payload: { reason: "Review finished" } });
    const detail = (await app.inject({ method: "GET", url: "/api/agent-office/agents/quoting-agent", headers: staff("owner") })).json();
    assert.deepEqual(
      detail.controlHistory.map((entry: { action: string; reason: string; actorName: string }) => `${entry.action}:${entry.reason}:${entry.actorName}`),
      ["resume:Review finished:Test owner", "pause:Price book under review:Test owner"],
    );
    assert.equal(detail.agent.enabled, true);
  });

  test("retry only re-queues failed runs of idempotent tasks", async () => {
    const [lease] = await db
      .insert(agentLeases)
      .values({ agentId: "quoting-agent", orgId: ORG, leaseKey: `test-${randomUUID()}`, state: "dead", task: "agent.quote", expiresAt: new Date(), attempts: 3 })
      .returning();
    const quote = await createRun("quoting-agent", "agent.quote", ORG, { state: "failed", error: "provider_timeout: slow", leaseId: lease!.id });
    const followup = await createRun("intake-agent", "agent.followup", ORG, { state: "failed", error: "x", leaseId: lease!.id });
    const running = await createRun("quoting-agent", "agent.quote", ORG, { leaseId: lease!.id });

    const refused = await app.inject({ method: "POST", url: `/api/agent-office/runs/${followup.id}/retry`, headers: staff("owner") });
    assert.equal(refused.statusCode, 409);
    assert.match(refused.json().error, /not safe/);
    assert.equal((await app.inject({ method: "POST", url: `/api/agent-office/runs/${running.id}/retry`, headers: staff("owner") })).statusCode, 409);

    const listed = (await app.inject({ method: "GET", url: "/api/agent-office/agents/quoting-agent/runs", headers: staff("owner") })).json();
    assert.equal(listed.runs.find((run: { id: string }) => run.id === quote.id).retryable, true);

    const ok = await app.inject({ method: "POST", url: `/api/agent-office/runs/${quote.id}/retry`, headers: staff("owner") });
    assert.equal(ok.statusCode, 200);
    const [after] = await db.select().from(agentLeases).where(eq(agentLeases.id, lease!.id));
    assert.equal(after!.state, "pending");
    assert.equal(after!.attempts, 0);
    const audits = await db.select().from(agentAuditLog).where(and(eq(agentAuditLog.runId, quote.id), eq(agentAuditLog.action, "retry")));
    assert.equal(audits.length, 1);
    await db.delete(agentLeases).where(eq(agentLeases.id, lease!.id));
  });

  test("revealing raw content is audit-logged and never cached", async () => {
    const run = await createRun("intake-agent", "agent.extract");
    const res = await app.inject({ method: "POST", url: `/api/agent-office/runs/${run.id}/reveal`, headers: staff("owner") });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["cache-control"], "no-store");
    assert.match(JSON.stringify(res.json().input), /\+237 650 12 34 56/);
    const audits = await db.select().from(agentAuditLog).where(and(eq(agentAuditLog.runId, run.id), eq(agentAuditLog.action, "reveal")));
    assert.equal(audits.length, 1);
    assert.equal(audits[0]!.actorUserId, "user-owner");
    const forbidden = await app.inject({ method: "POST", url: `/api/agent-office/runs/${run.id}/reveal`, headers: staff("dispatcher") });
    assert.equal(forbidden.statusCode, 403);
  });

  test("runs page with a stable cursor", async () => {
    const created = [];
    for (let index = 0; index < 30; index += 1) created.push(await createRun("triage-agent", "agent.triage", ORG, { state: "completed" }));
    const first = (await app.inject({ method: "GET", url: "/api/agent-office/agents/triage-agent/runs", headers: staff("owner") })).json();
    assert.equal(first.runs.length, 25);
    assert.ok(first.nextCursor);
    const second = (
      await app.inject({ method: "GET", url: `/api/agent-office/agents/triage-agent/runs?cursor=${encodeURIComponent(first.nextCursor)}`, headers: staff("owner") })
    ).json();
    assert.equal(second.runs.length, 5);
    assert.equal(second.nextCursor, null);
    const ids = new Set([...first.runs, ...second.runs].map((run: { id: string }) => run.id));
    assert.equal(ids.size, 30);
  });

  test("retention purges old telemetry and keeps recent rows", async () => {
    const run = await createRun("intake-agent", "agent.extract");
    const old = new Date(Date.now() - 40 * 86_400_000);
    await db.insert(agentLogLines).values([
      { agentId: "intake-agent", level: "info", message: "old", createdAt: old },
      { agentId: "intake-agent", level: "info", message: "fresh" },
    ]);
    await db.insert(agentRunSteps).values({ orgId: ORG, agentId: "intake-agent", runId: run.id, seq: 9, name: "old", label: "Old", createdAt: old });
    await db.insert(agentOfficeEvents).values({ agentId: "intake-agent", type: "agent", payload: {}, createdAt: old });
    const result = await purgeAgentOffice({ telemetryDays: 14, eventHours: 24, heartbeatDays: 7 });
    assert.equal(result.skipped, undefined);
    assert.ok(result.logs >= 1 && result.steps >= 1 && result.events >= 1);
    const messages = (await db.select().from(agentLogLines).where(eq(agentLogLines.agentId, "intake-agent"))).map((line) => line.message);
    assert.ok(messages.includes("fresh"));
    assert.ok(!messages.includes("old"));
  });

  test("the stream needs an owner and resumes from Last-Event-ID", async () => {
    const denied = await openStream(staff("technician"));
    assert.equal(denied.response.statusCode, 403);
    denied.close();

    const live = await openStream(staff("owner"));
    assert.equal(live.response.statusCode, 200);
    assert.match(String(live.response.headers["content-type"]), /text\/event-stream/);
    await postLog("first line for the stream");
    const firstEvent = await live.next((event) => event.data.type === "log" && /first line/.test(event.data.line.message));
    live.close();

    // While disconnected, two more lines arrive.
    await postLog("missed line one");
    await postLog("missed line two");
    const resumed = await openStream({ ...staff("owner"), "last-event-id": String(firstEvent.id) });
    const replayed = await resumed.next((event) => event.data.type === "log" && /missed line two/.test(event.data.line.message));
    assert.ok(resumed.seen.some((event) => event.data.type === "log" && /missed line one/.test(event.data.line.message)));
    assert.ok(replayed.id > firstEvent.id);
    resumed.close();
  });
});

// Outside the suite, so the pool closes even when the suite is skipped.
after(async () => {
  await closeDb();
});

async function postLog(message: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/agent/platform/logs",
    headers: agent("intake-agent"),
    payload: { lines: [{ level: "info", message }] },
  });
  assert.equal(res.statusCode, 202);
}

interface StreamEvent {
  id: number;
  data: { type: string; line?: { message: string }; [key: string]: unknown } & Record<string, any>;
}

function openStream(headers: Record<string, string>) {
  return new Promise<{
    response: IncomingMessage;
    seen: StreamEvent[];
    next: (match: (event: StreamEvent) => boolean, timeoutMs?: number) => Promise<StreamEvent>;
    close: () => void;
  }>((resolve, reject) => {
    const req = httpRequest(`${baseUrl}/api/agent-office/stream`, { headers }, (response) => {
      const seen: StreamEvent[] = [];
      const waiters: Array<{ match: (event: StreamEvent) => boolean; done: (event: StreamEvent) => void }> = [];
      let buffer = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        buffer += chunk;
        let split = buffer.indexOf("\n\n");
        while (split >= 0) {
          const block = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const id = /^id: (\d+)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (id && data) {
            const event = { id: Number(id), data: JSON.parse(data) };
            seen.push(event);
            for (const waiter of [...waiters]) {
              if (waiter.match(event)) {
                waiters.splice(waiters.indexOf(waiter), 1);
                waiter.done(event);
              }
            }
          }
          split = buffer.indexOf("\n\n");
        }
      });
      resolve({
        response,
        seen,
        next: (match, timeoutMs = 8_000) =>
          new Promise((done, fail) => {
            const found = seen.find(match);
            if (found) return done(found);
            const timer = setTimeout(() => fail(new Error("no matching stream event")), timeoutMs);
            waiters.push({ match, done: (event) => (clearTimeout(timer), done(event)) });
          }),
        close: () => req.destroy(),
      });
    });
    req.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code !== "ECONNRESET") reject(error);
    });
    req.end();
  });
}
