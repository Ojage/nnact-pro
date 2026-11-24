// Agent Office: owner-only monitoring and controls for every NNACT agent.
// Agent tokens, technicians, secretaries and dispatchers are refused:
// only a staff session with the owner role passes.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { agentControlActionSchema, isAgentId, type AgentId, type AgentOfficeEvent } from "@nnact/shared";
import { retryRun, revealRun, setAgentEnabled, type Actor } from "../agent-office/actions.js";
import { MAX_STREAMS_PER_USER, MAX_STREAMS_TOTAL, latestEventId, officeBroadcaster, type Subscriber } from "../agent-office/events.js";
import { startRetentionTimer } from "../agent-office/retention.js";
import { buildDetail, buildOverview, getRunDetail, listRuns, recentLogs } from "../agent-office/service.js";
import {
  restartAgentProcess,
  startAgentProcess,
  startDefaultAgentProcesses,
  stopAllAgentProcesses,
} from "../agent-office/supervisor.js";
import type { StaffJwtClaims } from "../auth.js";
import { verifiedClaims } from "../operational-authorization.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEEP_ALIVE_MS = 15_000;
const runParams = z.object({ runId: z.string().regex(UUID) });

async function requireOwner(req: FastifyRequest, reply: FastifyReply): Promise<Actor | null> {
  const claims = (await verifiedClaims(req, reply)) as StaffJwtClaims | null;
  if (!claims || reply.sent) return null;
  // The development fallback identity has no real organization to read from.
  if (!UUID.test(claims.orgId)) {
    await reply.code(401).send({ error: "sign in to view the Agent Office" });
    return null;
  }
  if (claims.role !== "owner") {
    await reply.code(403).send({ error: "only owners can open the Agent Office" });
    return null;
  }
  return { orgId: claims.orgId, userId: claims.userId, name: (claims as { name?: string }).name ?? null };
}

function agentParam(req: FastifyRequest, reply: FastifyReply): AgentId | null {
  const raw = (req.params as { agentId?: string }).agentId;
  if (!isAgentId(raw)) {
    void reply.code(404).send({ error: "unknown agent" });
    return null;
  }
  return raw;
}

async function startManagedAgent(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
  mode: "start" | "restart",
) {
  const actor = await requireOwner(req, reply);
  if (!actor) return;
  const agentId = agentParam(req, reply);
  if (!agentId) return;

  const result =
    mode === "restart"
      ? await restartAgentProcess(agentId, app.log)
      : await startAgentProcess(agentId, app.log);
  if (!result.ok) {
    await reply.code(400).send({ error: result.error ?? "could not start agent" });
    return;
  }

  const reason = `${mode === "restart" ? "Restarted" : "Started"} from Agent Office by ${actor.name ?? actor.userId}`;
  await setAgentEnabled(agentId, true, reason, actor);
  return { ok: true as const, pid: result.pid, started: result.started };
}

function parseCursor(req: FastifyRequest): number | null {
  const header = req.headers["last-event-id"];
  const raw = (Array.isArray(header) ? header[0] : header) ?? (req.query as { lastEventId?: string }).lastEventId;
  if (!raw || !/^\d{1,18}$/.test(raw)) return null;
  return Number(raw);
}

let retentionStarted = false;

export async function agentOfficeRoutes(app: FastifyInstance) {
  if (!retentionStarted && process.env.NODE_ENV !== "test") {
    retentionStarted = true;
    const stop = startRetentionTimer((message) => app.log.info(message));
    void startDefaultAgentProcesses(app.log).catch((error: unknown) => {
      app.log.error(`[agents] could not start default workers: ${error instanceof Error ? error.message : String(error)}`);
    });
    app.addHook("onClose", async () => {
      stop();
      officeBroadcaster.stop();
      await stopAllAgentProcesses();
      retentionStarted = false;
    });
  }

  app.get("/overview", async (req, reply) => {
    const actor = await requireOwner(req, reply);
    if (!actor) return;
    return buildOverview(actor.orgId);
  });

  app.get("/agents/:agentId", async (req, reply) => {
    const actor = await requireOwner(req, reply);
    if (!actor) return;
    const agentId = agentParam(req, reply);
    if (!agentId) return;
    return buildDetail(actor.orgId, agentId);
  });

  app.get("/agents/:agentId/runs", async (req, reply) => {
    const actor = await requireOwner(req, reply);
    if (!actor) return;
    const agentId = agentParam(req, reply);
    if (!agentId) return;
    const cursor = (req.query as { cursor?: string }).cursor ?? null;
    return listRuns(actor.orgId, agentId, cursor);
  });

  app.get("/agents/:agentId/logs", async (req, reply) => {
    const actor = await requireOwner(req, reply);
    if (!actor) return;
    const agentId = agentParam(req, reply);
    if (!agentId) return;
    const limit = Number((req.query as { limit?: string }).limit ?? 500);
    return { lines: await recentLogs(actor.orgId, agentId, Number.isFinite(limit) ? limit : 500) };
  });

  app.get("/runs/:runId", async (req, reply) => {
    const actor = await requireOwner(req, reply);
    if (!actor) return;
    const params = runParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "run not found" });
    const detail = await getRunDetail(actor.orgId, params.data.runId);
    if (!detail) return reply.code(404).send({ error: "run not found" });
    return detail;
  });

  for (const action of ["pause", "resume"] as const) {
    app.post(`/agents/:agentId/${action}`, async (req, reply) => {
      const actor = await requireOwner(req, reply);
      if (!actor) return;
      const agentId = agentParam(req, reply);
      if (!agentId) return;
      const parsed = agentControlActionSchema.safeParse(req.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "a reason is required" });
      const result = await setAgentEnabled(agentId, action === "resume", parsed.data.reason, actor);
      return { ok: true as const, changed: result.changed };
    });
  }

  app.post("/agents/:agentId/start", async (req, reply) => startManagedAgent(app, req, reply, "start"));

  app.post("/agents/:agentId/restart", async (req, reply) => startManagedAgent(app, req, reply, "restart"));

  app.post("/runs/:runId/retry", async (req, reply) => {
    const actor = await requireOwner(req, reply);
    if (!actor) return;
    const params = runParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "run not found" });
    const result = await retryRun(params.data.runId, actor);
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return result;
  });

  app.post("/runs/:runId/reveal", async (req, reply) => {
    const actor = await requireOwner(req, reply);
    if (!actor) return;
    const params = runParams.safeParse(req.params);
    if (!params.success) return reply.code(404).send({ error: "run not found" });
    const revealed = await revealRun(params.data.runId, actor);
    if (!revealed) return reply.code(404).send({ error: "run not found" });
    reply.header("cache-control", "no-store");
    return revealed;
  });

  /**
   * Server-Sent Events. EventSource cannot set headers, so the page connects
   * with `withCredentials` and the httpOnly session cookie authenticates it
   * (the cookie hook turns it into the usual bearer header). No token ever
   * goes in the URL. Reconnects resume from Last-Event-ID.
   */
  app.get("/stream", async (req, reply) => {
    const actor = await requireOwner(req, reply);
    if (!actor) return;
    if (officeBroadcaster.count(actor.userId) >= MAX_STREAMS_PER_USER || officeBroadcaster.count() >= MAX_STREAMS_TOTAL) {
      return reply.code(429).header("retry-after", "30").send({ error: "too many live connections; close another Agent Office tab" });
    }
    const cursor = parseCursor(req) ?? (await latestEventId());

    reply.hijack();
    const raw = reply.raw;
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(reply.getHeaders())) if (value !== undefined) headers[key] = String(value);
    raw.writeHead(200, {
      ...headers,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    raw.write("retry: 5000\n\n");

    const send = (id: number, event: AgentOfficeEvent) => {
      raw.write(`id: ${id}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    const subscriber: Subscriber = { orgId: actor.orgId, userId: actor.userId, cursor, send };
    const keepAlive = setInterval(() => raw.write(": keep-alive\n\n"), KEEP_ALIVE_MS);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(keepAlive);
      officeBroadcaster.remove(subscriber);
    };
    req.raw.on("close", close);
    try {
      await officeBroadcaster.add(subscriber);
      if (closed) officeBroadcaster.remove(subscriber);
    } catch {
      close();
      raw.end();
    }
  });
}
