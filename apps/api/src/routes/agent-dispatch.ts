// Dispatch Agent endpoints (ADR 0055). Suggestions only: nothing here assigns
// a job, books an appointment or notifies a technician.
//
// Agent side (scoped agent tokens):
//   POST /agent/dispatch/jobs/:jobId/rank          deterministic top 3 + fallback reasons
//   POST /agent/dispatch/suggestions               store a suggestion (server re-ranks)
//   POST /agent/dispatch/suggestions/:id/compare   record what the dispatcher actually did
// Staff side (owner or dispatcher):
//   GET  /dispatch/suggestions/jobs/:jobId         the job's current, visible suggestion
//   POST /dispatch/suggestions/:id/outcome         accepted / changed / ignored after assigning
//   POST /dispatch/suggestions/:id/reject          reject with a reason
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, dispatchSuggestions, jobs } from "@nnact/db";
import {
  AGENT_SCOPES,
  dispatchComparisonRequestSchema,
  dispatchOutcomeRequestSchema,
  dispatchRejectRequestSchema,
  dispatchSuggestionWriteSchema,
  isAgentClaims,
  requireAgentScope,
  type AgentScope,
  type DispatchRankedCandidate,
  type DispatchSuggestionDTO,
} from "@nnact/shared";
import { appendEvent } from "../agent-office/events.js";
import { buildRankingInput, dispatchAgentEnabled, dispatchShadowMode, loadEligibleJob } from "../dispatch/input.js";
import { rankDispatchTechnicians } from "../dispatch/ranking.js";
import type { StaffJwtClaims } from "../auth.js";
import { verifiedClaims } from "../operational-authorization.js";

const AGENT = "dispatch-agent";
const UUID = z.string().uuid();

async function agentClaims(req: FastifyRequest, reply: FastifyReply, scopes: AgentScope[]) {
  try {
    await req.jwtVerify();
  } catch {
    await reply.code(401).send({ error: "agent session required" });
    return null;
  }
  const claims = req.user;
  if (!isAgentClaims(claims) || !scopes.every((scope) => requireAgentScope(claims, AGENT, scope))) {
    await reply.code(isAgentClaims(claims) ? 403 : 401).send({ error: "dispatch agent token required" });
    return null;
  }
  return claims;
}

async function dispatcher(req: FastifyRequest, reply: FastifyReply) {
  const claims = (await verifiedClaims(req, reply)) as StaffJwtClaims | null;
  if (!claims || reply.sent) return null;
  if (claims.role !== "owner" && claims.role !== "dispatcher") {
    await reply.code(403).send({ error: "only dispatchers and owners can act on dispatch suggestions" });
    return null;
  }
  return claims;
}

function toDTO(row: typeof dispatchSuggestions.$inferSelect): DispatchSuggestionDTO {
  return {
    id: row.id,
    jobId: row.jobId,
    state: row.state,
    shadow: row.shadow === 1,
    fingerprint: row.fingerprint,
    candidates: row.candidates,
    causes: row.causes,
    confidence: row.confidence,
    actualTechnicianId: row.actualTechnicianId,
    outcomeReason: row.outcomeReason,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The agent may only reword reasons. Ids, ranks, scores and factors must match
 * what the server computes now; anything else is refused.
 */
export function mergeAgentReasons(
  server: Array<Omit<DispatchRankedCandidate, "reasonSource">>,
  submitted: DispatchRankedCandidate[],
): DispatchRankedCandidate[] | null {
  if (server.length !== submitted.length) return null;
  const byId = new Map(submitted.map((candidate) => [candidate.technicianId, candidate]));
  const merged: DispatchRankedCandidate[] = [];
  for (const expected of server) {
    const got = byId.get(expected.technicianId);
    if (!got || got.rank !== expected.rank || Math.abs(got.score - expected.score) > 1e-9) return null;
    const modelReason = got.reasonSource === "model" ? got.reasons[0]?.trim() : undefined;
    merged.push({
      ...expected,
      reasons: modelReason ? [modelReason.slice(0, 240)] : expected.reasons,
      reasonSource: modelReason ? "model" : "fallback",
    });
  }
  return merged;
}

export async function agentDispatchRoutes(app: FastifyInstance) {
  app.post("/agent/dispatch/jobs/:jobId/rank", async (req, reply) => {
    const claims = await agentClaims(req, reply, [AGENT_SCOPES.jobsRead, AGENT_SCOPES.techniciansRead]);
    if (!claims) return;
    const jobId = UUID.safeParse((req.params as { jobId?: string }).jobId);
    if (!jobId.success) return reply.code(400).send({ error: "invalid job id" });
    const job = await loadEligibleJob(claims.orgId, jobId.data);
    if (!job) return reply.code(404).send({ error: "job is not open for dispatch suggestions" });
    const ranked = rankDispatchTechnicians(await buildRankingInput(job));
    // The model sees ids, names, factors and the area text: no phone numbers or customer details.
    return { job: { ...job, customerId: null }, fingerprint: job.fingerprint, candidates: ranked.candidates, causes: ranked.causes };
  });

  app.post("/agent/dispatch/suggestions", async (req, reply) => {
    const claims = await agentClaims(req, reply, [AGENT_SCOPES.dispatchSuggestionsCreate]);
    if (!claims) return;
    const parsed = dispatchSuggestionWriteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    const job = await loadEligibleJob(claims.orgId, body.jobId);
    if (!job) return reply.code(409).send({ error: "job is no longer open for suggestions" });
    if (job.fingerprint !== body.fingerprint) return reply.code(409).send({ error: "job changed since it was ranked" });
    const ranked = rankDispatchTechnicians(await buildRankingInput(job));
    const candidates = mergeAgentReasons(ranked.candidates, body.candidates);
    if (!candidates) return reply.code(422).send({ error: "candidates do not match the server ranking" });

    const shadow = dispatchShadowMode();
    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(dispatchSuggestions)
        .where(and(eq(dispatchSuggestions.orgId, claims.orgId), eq(dispatchSuggestions.jobId, job.jobId), eq(dispatchSuggestions.current, 1)))
        .limit(1);
      if (existing && existing.fingerprint === job.fingerprint) return { row: existing, created: false };
      if (existing) {
        await tx.update(dispatchSuggestions).set({ current: 0, updatedAt: new Date() }).where(eq(dispatchSuggestions.id, existing.id));
      }
      const [inserted] = await tx
        .insert(dispatchSuggestions)
        .values({
          orgId: claims.orgId,
          jobId: job.jobId,
          runId: body.runId,
          state: shadow ? "shadow" : "shown",
          current: 1,
          shadow: shadow ? 1 : 0,
          fingerprint: job.fingerprint,
          candidates,
          causes: ranked.causes,
          confidence: candidates[0]?.confidence ?? 0,
        })
        .returning();
      return { row: inserted!, created: true };
    });
    if (row.created && !shadow) await appendEvent({ orgId: claims.orgId, agentId: AGENT, type: "approvals" });
    return reply.code(row.created ? 201 : 200).send(toDTO(row.row));
  });

  app.post("/agent/dispatch/suggestions/:id/compare", async (req, reply) => {
    const claims = await agentClaims(req, reply, [AGENT_SCOPES.dispatchSuggestionsCreate, AGENT_SCOPES.jobsRead]);
    if (!claims) return;
    const id = UUID.safeParse((req.params as { id?: string }).id);
    const body = dispatchComparisonRequestSchema.safeParse({ ...(req.body as object), suggestionId: id.success ? id.data : "" });
    if (!id.success || !body.success) return reply.code(400).send({ error: "invalid comparison" });
    const [suggestion] = await db
      .select()
      .from(dispatchSuggestions)
      .where(and(eq(dispatchSuggestions.id, id.data), eq(dispatchSuggestions.orgId, claims.orgId)))
      .limit(1);
    if (!suggestion) return reply.code(404).send({ error: "suggestion not found" });
    if (!["shadow", "shown"].includes(suggestion.state)) return reply.code(200).send(toDTO(suggestion));
    // The assignment must really be on the job; the agent cannot claim one.
    const [job] = await db.select({ assignedTo: jobs.assignedTo }).from(jobs).where(eq(jobs.id, suggestion.jobId)).limit(1);
    if (job?.assignedTo !== body.data.actualTechnicianId) return reply.code(409).send({ error: "the job is not assigned to that technician" });
    const top = suggestion.candidates.find((candidate) => candidate.rank === 1)?.technicianId;
    const state = top === body.data.actualTechnicianId ? "accepted" : "changed";
    const [updated] = await db
      .update(dispatchSuggestions)
      .set({ state, actualTechnicianId: body.data.actualTechnicianId, decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(dispatchSuggestions.id, suggestion.id))
      .returning();
    await appendEvent({ orgId: claims.orgId, agentId: AGENT, type: "approvals" });
    return toDTO(updated!);
  });

  app.get("/dispatch/suggestions/jobs/:jobId", async (req, reply) => {
    const claims = await dispatcher(req, reply);
    if (!claims) return;
    const jobId = UUID.safeParse((req.params as { jobId?: string }).jobId);
    if (!jobId.success) return reply.code(400).send({ error: "invalid job id" });
    if (!dispatchAgentEnabled() || dispatchShadowMode()) return { suggestion: null };
    const [row] = await db
      .select()
      .from(dispatchSuggestions)
      .where(
        and(
          eq(dispatchSuggestions.orgId, claims.orgId),
          eq(dispatchSuggestions.jobId, jobId.data),
          eq(dispatchSuggestions.current, 1),
          eq(dispatchSuggestions.state, "shown"),
        ),
      )
      .limit(1);
    return { suggestion: row ? toDTO(row) : null };
  });

  app.post("/dispatch/suggestions/:id/outcome", async (req, reply) => {
    const claims = await dispatcher(req, reply);
    if (!claims) return;
    const id = UUID.safeParse((req.params as { id?: string }).id);
    const body = dispatchOutcomeRequestSchema.safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: "invalid outcome" });
    const [row] = await db
      .update(dispatchSuggestions)
      .set({
        state: body.data.state,
        actualTechnicianId: body.data.actualTechnicianId,
        outcomeReason: body.data.reason,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(dispatchSuggestions.id, id.data), eq(dispatchSuggestions.orgId, claims.orgId), sql`${dispatchSuggestions.state} in ('shadow', 'shown')`))
      .returning();
    if (!row) return reply.code(404).send({ error: "no open suggestion with that id" });
    await appendEvent({ orgId: claims.orgId, agentId: AGENT, type: "approvals" });
    return toDTO(row);
  });

  app.post("/dispatch/suggestions/:id/reject", async (req, reply) => {
    const claims = await dispatcher(req, reply);
    if (!claims) return;
    const id = UUID.safeParse((req.params as { id?: string }).id);
    const body = dispatchRejectRequestSchema.safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: "a reason is required" });
    const [row] = await db
      .update(dispatchSuggestions)
      .set({ state: "rejected", outcomeReason: body.data.reason, decidedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(dispatchSuggestions.id, id.data), eq(dispatchSuggestions.orgId, claims.orgId), sql`${dispatchSuggestions.state} in ('shadow', 'shown')`))
      .returning();
    if (!row) return reply.code(404).send({ error: "no open suggestion with that id" });
    await appendEvent({ orgId: claims.orgId, agentId: AGENT, type: "approvals" });
    return toDTO(row);
  });
}
