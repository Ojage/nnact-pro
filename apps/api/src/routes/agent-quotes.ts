import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@nnact/db";
import { agentRuns, jobs, quoteProposalLines, quoteProposals } from "@nnact/db";
import {
  AGENT_ID,
  AGENT_SCOPES,
  isAgentClaims,
  quoteProposalDraftSchema,
  requireAgentScope,
  type AgentJwtClaims,
  type AgentScope,
} from "@nnact/shared";
import { verifiedClaims } from "../operational-authorization.js";
import { createEstimateInOrg } from "../estimate-creation.js";
import { pricedCandidates, priceSelections, proposalDTO, totalsFromLines } from "../price-book/service.js";

const uuid = z.string().uuid();

async function agentSession(req: FastifyRequest, reply: FastifyReply): Promise<AgentJwtClaims | null> {
  try {
    await req.jwtVerify();
    if (isAgentClaims(req.user)) return req.user;
  } catch {
    // handled below
  }
  await reply.code(401).send({ error: "agent session required" });
  return null;
}

function requireQuoteScopes(claims: AgentJwtClaims, scopes: readonly AgentScope[]): boolean {
  return scopes.every((scope) => requireAgentScope(claims, AGENT_ID.quoting, scope));
}

async function officeSession(req: FastifyRequest, reply: FastifyReply) {
  const claims = await verifiedClaims(req, reply);
  if (!claims || reply.sent) return null;
  if (claims.role !== "owner" && claims.role !== "dispatcher") {
    await reply.code(403).send({ error: "only owners and dispatchers may review quote proposals" });
    return null;
  }
  return claims;
}

const proposalBody = z.object({
  orgId: uuid,
  jobId: uuid,
  runId: uuid.optional(),
  model: z.string().trim().max(120).nullable().optional(),
  draft: quoteProposalDraftSchema,
});

const approvalLine = z.object({
  lineId: uuid,
  quantity: z.number().int().positive().max(1000),
  unitPriceCents: z.number().int().positive(),
});

const approvalBody = z.object({ lines: z.array(approvalLine).min(1).max(30) });

export async function agentQuoteRoutes(app: FastifyInstance) {
  // Minimal job read: no customer name, phone, email or precise street address.
  app.get("/agent/quotes/jobs", async (req, reply) => {
    const claims = await agentSession(req, reply);
    if (!claims) return;
    if (!requireQuoteScopes(claims, [AGENT_SCOPES.jobsRead, AGENT_SCOPES.priceBookRead])) {
      return reply.code(403).send({ error: "quote worker needs jobs:read and price-book:read" });
    }
    const rows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        description: jobs.description,
        status: jobs.status,
        serviceAddress: jobs.serviceAddress,
        createdAt: jobs.createdAt,
      })
      .from(jobs)
      .where(and(eq(jobs.orgId, claims.orgId), inArray(jobs.status, ["lead", "scheduled", "in_progress"])))
      .orderBy(jobs.createdAt)
      .limit(100);
    return rows.map((job) => {
      const parts = (job.serviceAddress ?? "").split(",").map((part) => part.trim()).filter(Boolean);
      return {
        id: job.id,
        title: job.title,
        description: job.description,
        status: job.status,
        serviceArea: parts.slice(-2).join(", ") || null,
        createdAt: job.createdAt.toISOString(),
      };
    });
  });

  app.get("/agent/quotes/candidates", async (req, reply) => {
    const claims = await agentSession(req, reply);
    if (!claims) return;
    if (!requireQuoteScopes(claims, [AGENT_SCOPES.priceBookRead, AGENT_SCOPES.jobsRead])) {
      return reply.code(403).send({ error: "quote worker needs price-book:read" });
    }
    return pricedCandidates(claims.orgId);
  });

  app.post("/agent/quotes/proposals", async (req, reply) => {
    const claims = await agentSession(req, reply);
    if (!claims) return;
    if (!requireQuoteScopes(claims, [AGENT_SCOPES.quoteProposalsCreate, AGENT_SCOPES.priceBookRead, AGENT_SCOPES.jobsRead])) {
      return reply.code(403).send({ error: "quote worker is missing a required scope" });
    }
    const parsed = proposalBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    if (body.orgId !== claims.orgId) return reply.code(403).send({ error: "agent token is for another organization" });
    const [job] = await db
      .select({ id: jobs.id, status: jobs.status })
      .from(jobs)
      .where(and(eq(jobs.id, body.jobId), eq(jobs.orgId, claims.orgId)))
      .limit(1);
    if (!job || !["lead", "scheduled", "in_progress"].includes(job.status)) {
      return reply.code(404).send({ error: "eligible job not found" });
    }

    const candidates = await pricedCandidates(claims.orgId);
    let lines;
    try {
      lines = priceSelections({
        orgId: claims.orgId,
        proposalId: "pending",
        draft: body.draft,
        candidates,
      });
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
    const totals = totalsFromLines(lines);
    const confidence = Math.round(body.draft.confidence * 100);

    const created = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: quoteProposals.id })
        .from(quoteProposals)
        .where(and(eq(quoteProposals.orgId, claims.orgId), eq(quoteProposals.jobId, body.jobId)))
        .limit(1);
      if (existing) return null;
      const [proposal] = await tx
        .insert(quoteProposals)
        .values({
          orgId: claims.orgId,
          jobId: body.jobId,
          status: "draft",
          agentRunId: body.runId ?? null,
          lowCents: totals.lowCents,
          highCents: totals.highCents,
          confidence,
          assumptions: body.draft.assumptions,
          missingInformation: body.draft.missingInformation,
          model: body.model ?? null,
        })
        .returning();
      await tx.insert(quoteProposalLines).values(lines.map((line) => ({ ...line, proposalId: proposal.id })));
      if (body.runId) {
        await tx
          .update(agentRuns)
          .set({ output: { proposalId: proposal.id }, completedAt: new Date(), state: "completed" })
          .where(and(eq(agentRuns.id, body.runId), eq(agentRuns.orgId, claims.orgId)));
      }
      return proposal;
    });
    if (!created) return reply.code(409).send({ error: "a proposal already exists for this job" });
    return reply.code(201).send(await proposalDTO(claims.orgId, created.id));
  });
}

/** Approval is the only path from an internal proposal to a customer estimate. */
export async function quoteApprovalRoutes(app: FastifyInstance) {
  app.post("/quotes/proposals/:id/approve", async (req, reply) => {
    const claims = await officeSession(req, reply);
    if (!claims) return;
    const { id } = req.params as { id: string };
    const parsed = approvalBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const result = await db.transaction(async (tx) => {
      const [proposal] = await tx
        .select()
        .from(quoteProposals)
        .where(and(eq(quoteProposals.orgId, claims.orgId), eq(quoteProposals.id, id), eq(quoteProposals.status, "draft")))
        .limit(1);
      if (!proposal) return null;
      const lines = await tx
        .select()
        .from(quoteProposalLines)
        .where(and(eq(quoteProposalLines.orgId, claims.orgId), eq(quoteProposalLines.proposalId, id)));
      const byLine = new Map(parsed.data.lines.map((line) => [line.lineId, line]));
      const finalLines = lines.map((line) => {
        const choice = byLine.get(line.id);
        const quantity = choice?.quantity ?? line.quantity;
        const unitPrice = choice?.unitPriceCents ?? line.unitPriceLowCents ?? 0;
        return { line, quantity, unitPrice };
      });
      if (finalLines.some((line) => line.unitPrice <= 0)) {
        throw Object.assign(new Error("every line needs a reviewed point price"), { statusCode: 400 });
      }
      const [approved] = await tx
        .update(quoteProposals)
        .set({ status: "approved", reviewedBy: claims.userId, reviewedAt: new Date(), updatedAt: new Date() })
        .where(eq(quoteProposals.id, id))
        .returning();
      for (const item of finalLines) {
        await tx
          .update(quoteProposalLines)
          .set({ finalUnitPriceCents: item.unitPrice, quantity: item.quantity })
          .where(eq(quoteProposalLines.id, item.line.id));
      }
      const estimate = await createEstimateInOrg(tx, {
        orgId: claims.orgId,
        jobId: proposal.jobId,
        lines: finalLines.map((item) => ({
          description: item.line.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: 0,
          unit: item.line.unit,
        })),
      });
      return { approved, estimate };
    });
    if (!result) return reply.code(404).send({ error: "draft proposal not found" });
    return { proposal: await proposalDTO(claims.orgId, result.approved.id), estimate: result.estimate };
  });

  app.post("/quotes/proposals/:id/reject", async (req, reply) => {
    const claims = await officeSession(req, reply);
    if (!claims) return;
    const { id } = req.params as { id: string };
    const [row] = await db
      .update(quoteProposals)
      .set({ status: "rejected", reviewedBy: claims.userId, reviewedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(quoteProposals.orgId, claims.orgId), eq(quoteProposals.id, id), eq(quoteProposals.status, "draft")))
      .returning();
    if (!row) return reply.code(404).send({ error: "draft proposal not found" });
    return proposalDTO(claims.orgId, row.id);
  });
}
