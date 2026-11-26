// NNACT agents worker. Runs one agent-kit loop per selected agent: work is
// found in the database, leased, and done through the API with that agent's
// own scoped token. The kill switch (agent_controls, set from the Agent
// Office) and the per-agent daily cost cap are checked before every lease.
import { and, eq, isNull, lt } from "drizzle-orm";
import { createAgentLoop, createStructuredAgentLogger, type AgentLoop, type AgentWorkContext } from "@nnact/agent-kit";
import { db, agentMedia, orgs } from "@nnact/db";
import { AGENT_ID, type AgentId } from "@nnact/shared";
import { deleteAgentMedia } from "../../api/src/agent/media-storage.js";
import { compareAssignments, processDispatchJob } from "./agents/dispatch/handler.js";
import { processIntakeMessage } from "./agents/intake/handler.js";
import { processQuoteJob } from "./agents/quoting/handler.js";
import { legacyAgentId, resolveSelectedAgentIds } from "./lib/runtime.js";
import { AgentPlatformApi, tokenForAgent } from "./platform/api.js";
import { createDbCostGuard, createDbKillSwitch } from "./platform/controls.js";
import { DbAgentLeaseStore } from "./platform/lease-store.js";
import { AgentOffice } from "./platform/office.js";
import { enqueueWorkForAgent } from "./platform/work-source.js";
import { extraHandlers } from "./agents/registry.js";

const POLL_MS = Number(process.env.AGENT_POLL_MS ?? 15_000);
const API_URL = (process.env.AGENT_API_URL ?? "http://api:3001").replace(/\/$/, "");
const MAX_ATTEMPTS = 3;
const LEASE_TTL_MS = 120_000;
const RENEW_EVERY_MS = 30_000;

const store = new DbAgentLeaseStore();
const killSwitch = createDbKillSwitch();
const costGuard = createDbCostGuard();
const logger = createStructuredAgentLogger();

export type AgentHandler = (api: AgentPlatformApi, office: AgentOffice, context: AgentWorkContext) => Promise<void>;

const HANDLERS: Partial<Record<AgentId, AgentHandler>> = {
  [AGENT_ID.intake]: (api, office, context) =>
    processIntakeMessage(api, office, String(context.lease.payload.messageId ?? context.lease.leaseKey), context.lease.id),
  [AGENT_ID.quoting]: (api, office, context) => processQuoteJob(api, office, String(context.lease.payload.jobId ?? context.lease.leaseKey), context.lease.id),
  [AGENT_ID.dispatch]: (api, office, context) => processDispatchJob(api, office, context.orgId, String(context.lease.payload.jobId), context.lease.id),
  ...extraHandlers,
};

interface Worker {
  agentId: AgentId;
  api: AgentPlatformApi;
  office: AgentOffice;
  loop: AgentLoop;
}

function createWorker(agentId: AgentId): Worker {
  const handler = HANDLERS[agentId];
  if (!handler) throw new Error(`no worker for ${agentId}`);
  const api = new AgentPlatformApi({ apiUrl: API_URL, tokenFor: tokenForAgent(agentId, legacyAgentId(agentId)) });
  const office = new AgentOffice(agentId, api);
  const loop = createAgentLoop({
    agentId,
    store,
    logger,
    killSwitch,
    costGuard,
    pollIntervalMs: POLL_MS,
    maxAttempts: MAX_ATTEMPTS,
    leaseTtlMs: LEASE_TTL_MS,
    renewEveryMs: RENEW_EVERY_MS,
    onError(error: unknown, context) {
      console.error(`[agent] ${context.agentId} ${context.phase} failed:`, error);
      if (context.phase === "work") void office.setStatus("error");
    },
    async work(context) {
      office.useOrg(context.orgId);
      await handler(api, office, context);
      return {};
    },
  });
  return { agentId, api, office, loop };
}

async function sweepExpiredMedia(): Promise<void> {
  const expired = await db
    .select()
    .from(agentMedia)
    .where(and(isNull(agentMedia.attachedAt), lt(agentMedia.expiresAt, new Date())))
    .limit(100);
  for (const media of expired) {
    try {
      await deleteAgentMedia(media.objectKey);
    } catch {
      await db.delete(agentMedia).where(eq(agentMedia.id, media.id));
    }
  }
}

async function main(): Promise<void> {
  const selected = resolveSelectedAgentIds();
  const workers = selected.map(createWorker);
  // Heartbeats need an org for the token; on a single-tenant install the first org is it.
  const [firstOrg] = await db.select({ id: orgs.id }).from(orgs).limit(1);
  const ticking = new Set<AgentId>();

  async function tick(worker: Worker): Promise<void> {
    if (ticking.has(worker.agentId)) return;
    ticking.add(worker.agentId);
    try {
      if (await killSwitch(worker.agentId)) return;
      await enqueueWorkForAgent(worker.agentId, { store, limit: 50, maxAttempts: MAX_ATTEMPTS });
      if (worker.agentId === AGENT_ID.dispatch) await compareAssignments(worker.api);
      await worker.loop.tick();
    } finally {
      ticking.delete(worker.agentId);
    }
  }

  for (const worker of workers) {
    if (firstOrg) worker.office.useOrg(firstOrg.id);
    worker.office.start();
    setInterval(() => {
      void tick(worker).catch((error) => console.error(`[agent] ${worker.agentId} tick failed:`, error));
    }, Math.max(1, POLL_MS)).unref();
    void tick(worker).catch((error) => console.error(`[agent] ${worker.agentId} initial tick failed:`, error));
  }

  if (selected.includes(AGENT_ID.intake)) {
    await sweepExpiredMedia();
    setInterval(() => {
      void sweepExpiredMedia().catch((error) => console.error("[agent] media sweep failed:", error));
    }, 3_600_000).unref();
  }

  const shutdown = async () => {
    for (const worker of workers) {
      worker.loop.stop();
      worker.office.stop();
    }
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());

  console.log(`[agent] workers started: ${selected.join(", ")} (poll ${POLL_MS}ms, max attempts ${MAX_ATTEMPTS})`);
  // Keep the process alive: the tick timers are unref'd so tests can exit.
  setInterval(() => undefined, 1 << 30);
}

void main().catch((error) => {
  console.error("[agent] startup failed:", error);
  process.exitCode = 1;
});
