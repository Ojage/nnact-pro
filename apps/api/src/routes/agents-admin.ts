import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { agentControls, agentDeadLetters, agentLeases, agentRuns, db } from "@nnact/db";
import { AGENT_IDS, AGENT_REGISTRY, isAgentId } from "@nnact/shared";
import { verifiedClaims } from "../operational-authorization.js";

const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    costCapCents: z.number().int().min(0).nullable().optional(),
    maxAttempts: z.number().int().min(1).max(10).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one control is required" });

function dayAgo(): Date {
  return new Date(Date.now() - 86_400_000);
}

function defaultCostCap(agentId: (typeof AGENT_IDS)[number]): number {
  const configured = Number(process.env[AGENT_REGISTRY[agentId].costCapEnv] ?? 200);
  return Number.isSafeInteger(configured) && configured >= 0 ? configured : 200;
}

async function requireOwner(req: FastifyRequest, reply: FastifyReply) {
  const claims = await verifiedClaims(req, reply);
  if (!claims) return null;
  if (claims.role !== "owner") {
    await reply.code(403).send({ error: "only owners can manage agents" });
    return null;
  }
  return claims;
}

function resolveAgentId(req: FastifyRequest, reply: FastifyReply) {
  const raw = (req.params as { agentId?: string }).agentId;
  if (!raw || !isAgentId(raw)) {
    void reply.code(400).send({ error: "unknown agent id" });
    return null;
  }
  return raw;
}

export async function agentAdminRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    if (!(await requireOwner(req, reply)) || reply.sent) return;
    const since = dayAgo();
    const [controls, runStats, leaseStats, deadLetterStats] = await Promise.all([
      db.select().from(agentControls).where(inArray(agentControls.agentId, [...AGENT_IDS])),
      db
        .select({
          agentId: agentRuns.agentId,
          runs: sql<number>`count(*)::int`,
          spendCents: sql<number>`coalesce(sum(${agentRuns.costCents}), 0)::int`,
        })
        .from(agentRuns)
        .where(and(inArray(agentRuns.agentId, [...AGENT_IDS]), gte(agentRuns.createdAt, since)))
        .groupBy(agentRuns.agentId),
      db
        .select({ agentId: agentLeases.agentId, active: sql<number>`count(*)::int` })
        .from(agentLeases)
        .where(and(inArray(agentLeases.agentId, [...AGENT_IDS]), eq(agentLeases.state, "leased"), gte(agentLeases.expiresAt, new Date())))
        .groupBy(agentLeases.agentId),
      db
        .select({ agentId: agentDeadLetters.agentId, count: sql<number>`count(*)::int` })
        .from(agentDeadLetters)
        .where(inArray(agentDeadLetters.agentId, [...AGENT_IDS]))
        .groupBy(agentDeadLetters.agentId),
    ]);

    const controlMap = new Map(controls.map((control) => [control.agentId as (typeof AGENT_IDS)[number], control]));
    const runMap = new Map(runStats.filter((row) => row.agentId).map((row) => [row.agentId as (typeof AGENT_IDS)[number], row]));
    const leaseMap = new Map(leaseStats.map((row) => [row.agentId as (typeof AGENT_IDS)[number], row.active]));
    const deadLetterMap = new Map(deadLetterStats.map((row) => [row.agentId as (typeof AGENT_IDS)[number], row.count]));

    return {
      agents: AGENT_IDS.map((agentId) => {
        const definition = AGENT_REGISTRY[agentId];
        const control = controlMap.get(agentId);
        return {
          id: agentId,
          displayName: definition.displayName,
          autonomyTier: definition.autonomyTier,
          scopes: definition.scopes,
          tasks: definition.tasks,
          never: definition.neverList,
          costCapEnv: definition.costCapEnv,
          costCapCents: control?.costCapCents ?? defaultCostCap(agentId),
          maxAttempts: control?.maxAttempts ?? 3,
          enabled: control?.enabled ?? true,
          runs24h: runMap.get(agentId)?.runs ?? 0,
          spendCents24h: runMap.get(agentId)?.spendCents ?? 0,
          activeLeases: leaseMap.get(agentId) ?? 0,
          deadLetters: deadLetterMap.get(agentId) ?? 0,
          updatedAt: control?.updatedAt ?? null,
        };
      }),
    };
  });

  app.get("/:agentId/runs", async (req, reply) => {
    if (!(await requireOwner(req, reply)) || reply.sent) return;
    const agentId = resolveAgentId(req, reply);
    if (!agentId || reply.sent) return;
    return {
      runs: await db
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.agentId, agentId))
        .orderBy(desc(agentRuns.createdAt))
        .limit(100),
    };
  });

  app.get("/:agentId/dead-letters", async (req, reply) => {
    if (!(await requireOwner(req, reply)) || reply.sent) return;
    const agentId = resolveAgentId(req, reply);
    if (!agentId || reply.sent) return;
    return {
      deadLetters: await db
        .select()
        .from(agentDeadLetters)
        .where(eq(agentDeadLetters.agentId, agentId))
        .orderBy(desc(agentDeadLetters.createdAt))
        .limit(100),
    };
  });

  app.patch("/:agentId", async (req, reply) => {
    if (!(await requireOwner(req, reply)) || reply.sent) return;
    const agentId = resolveAgentId(req, reply);
    if (!agentId || reply.sent) return;
    const patch = patchSchema.parse(req.body);
    const values: typeof agentControls.$inferInsert = {
      agentId,
      updatedAt: new Date(),
    };
    if (patch.enabled !== undefined) values.enabled = patch.enabled;
    if (patch.costCapCents !== undefined) values.costCapCents = patch.costCapCents;
    if (patch.maxAttempts !== undefined) values.maxAttempts = patch.maxAttempts;
    const set: Partial<typeof agentControls.$inferInsert> = { updatedAt: values.updatedAt };
    if (patch.enabled !== undefined) set.enabled = patch.enabled;
    if (patch.costCapCents !== undefined) set.costCapCents = patch.costCapCents;
    if (patch.maxAttempts !== undefined) set.maxAttempts = patch.maxAttempts;
    const [control] = await db
      .insert(agentControls)
      .values(values)
      .onConflictDoUpdate({ target: agentControls.agentId, set })
      .returning();
    return { control };
  });
}
