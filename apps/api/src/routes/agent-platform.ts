import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, agentRuns, conversations, messages } from "@nnact/db";
import {
  AGENT_SCOPES,
  isAgentClaims,
  requireAgentScope,
  type AgentJwtClaims,
  type AgentScope,
} from "@nnact/shared";

const uuid = z.string().uuid();
const json = z.record(z.unknown());

const createRunBody = z.object({
  orgId: uuid,
  task: z.string().trim().min(1).max(200),
  input: json,
  conversationId: uuid.optional(),
  messageId: uuid.optional(),
  jobId: uuid.optional(),
  promptVersion: z.string().trim().max(120).optional(),
});

const updateRunBody = z.object({
  orgId: uuid,
  state: z.enum(["completed", "failed", "skipped"]),
  output: json.optional(),
  provider: z.string().trim().max(120).optional(),
  model: z.string().trim().max(120).optional(),
  costCents: z.number().int().nonnegative().optional(),
  error: z.string().trim().max(4000).optional(),
  jobId: uuid.optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  promptVersion: z.string().trim().max(120).optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  outcome: z.string().trim().max(200).optional(),
});

const transcriptBody = z.object({
  orgId: uuid,
  transcript: z.string().max(100_000),
});

const createMessageBody = z.object({
  orgId: uuid,
  conversationId: uuid,
  externalId: z.string().trim().max(200).optional(),
  direction: z.enum(["inbound", "outbound"]),
  fromAddress: z.string().trim().max(200).optional(),
  toAddress: z.string().trim().max(200).optional(),
  text: z.string().max(20_000).optional(),
  transcript: z.string().max(100_000).optional(),
  followUpIndex: z.number().int().nonnegative().optional(),
  sentAt: z.string().datetime().optional(),
});

const updateConversationBody = z.object({
  orgId: uuid,
  needsTemplate: z.boolean().optional(),
  followUpCount: z.number().int().nonnegative().optional(),
  state: z.enum(["open", "awaiting_customer", "needs_choice", "needs_template", "closed"]).optional(),
  lastMessageAt: z.string().datetime().optional(),
});

const runParams = z.object({ runId: uuid });
const messageParams = z.object({ messageId: uuid });
const conversationParams = z.object({ conversationId: uuid });

async function authorizeAgent(
  req: FastifyRequest,
  reply: FastifyReply,
  scope: AgentScope,
): Promise<AgentJwtClaims | null> {
  try {
    await req.jwtVerify();
    if (!isAgentClaims(req.user)) {
      await reply.code(401).send({ error: "agent session required" });
      return null;
    }
    const claims = req.user;
    if (!requireAgentScope(claims, claims.agent_id ?? claims.agentId ?? "", scope)) {
      await reply.code(403).send({ error: `agent needs ${scope}` });
      return null;
    }
    return claims;
  } catch {
    if (!reply.sent) await reply.code(401).send({ error: "agent session required" });
    return null;
  }
}

async function ensureOrg(claims: AgentJwtClaims, orgId: string, reply: FastifyReply): Promise<boolean> {
  if (claims.orgId === orgId) return true;
  await reply.code(403).send({ error: "agent token is for another organization" });
  return false;
}

export async function agentPlatformRoutes(app: FastifyInstance) {
  app.post("/runs", async (req, reply) => {
    const claims = await authorizeAgent(req, reply, AGENT_SCOPES.agentRunsWrite);
    if (!claims || reply.sent) return;
    const parsed = createRunBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    if (!(await ensureOrg(claims, body.orgId, reply))) return;

    const [row] = await db
      .insert(agentRuns)
      .values({
        orgId: body.orgId,
        conversationId: body.conversationId,
        messageId: body.messageId,
        jobId: body.jobId,
        state: "running",
        task: body.task,
        input: body.input,
        attempts: 1,
        agentId: claims.agent_id ?? claims.agentId ?? null,
        promptVersion: body.promptVersion,
      })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/runs/:runId", async (req, reply) => {
    const claims = await authorizeAgent(req, reply, AGENT_SCOPES.agentRunsWrite);
    if (!claims || reply.sent) return;
    const params = runParams.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });
    const parsed = updateRunBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    if (!(await ensureOrg(claims, body.orgId, reply))) return;

    const [row] = await db
      .update(agentRuns)
      .set({
        state: body.state,
        output: body.output,
        provider: body.provider,
        model: body.model,
        costCents: body.costCents,
        error: body.error,
        jobId: body.jobId,
        latencyMs: body.latencyMs,
        promptVersion: body.promptVersion,
        inputTokens: body.inputTokens,
        outputTokens: body.outputTokens,
        outcome: body.outcome,
        completedAt: new Date(),
      })
      .where(and(eq(agentRuns.id, params.data.runId), eq(agentRuns.orgId, body.orgId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "run not found" });
    return row;
  });

  app.patch("/messages/:messageId/transcript", async (req, reply) => {
    const claims = await authorizeAgent(req, reply, AGENT_SCOPES.messagesWrite);
    if (!claims || reply.sent) return;
    const params = messageParams.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });
    const parsed = transcriptBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    if (!(await ensureOrg(claims, body.orgId, reply))) return;

    const [row] = await db
      .update(messages)
      .set({ transcript: body.transcript })
      .where(and(eq(messages.id, params.data.messageId), eq(messages.orgId, body.orgId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "message not found" });
    return row;
  });

  app.post("/messages", async (req, reply) => {
    const claims = await authorizeAgent(req, reply, AGENT_SCOPES.messagesWrite);
    if (!claims || reply.sent) return;
    const parsed = createMessageBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    if (!(await ensureOrg(claims, body.orgId, reply))) return;

    const [row] = await db
      .insert(messages)
      .values({
        orgId: body.orgId,
        conversationId: body.conversationId,
        externalId: body.externalId,
        direction: body.direction,
        fromAddress: body.fromAddress,
        toAddress: body.toAddress,
        text: body.text,
        transcript: body.transcript,
        followUpIndex: body.followUpIndex,
        sentAt: body.sentAt ? new Date(body.sentAt) : undefined,
      })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/conversations/:conversationId", async (req, reply) => {
    const claims = await authorizeAgent(req, reply, AGENT_SCOPES.conversationsWrite);
    if (!claims || reply.sent) return;
    const params = conversationParams.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });
    const parsed = updateConversationBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    if (!(await ensureOrg(claims, body.orgId, reply))) return;

    const [row] = await db
      .update(conversations)
      .set({
        needsTemplate: body.needsTemplate,
        followUpCount: body.followUpCount,
        state: body.state,
        lastMessageAt: body.lastMessageAt ? new Date(body.lastMessageAt) : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(conversations.id, params.data.conversationId), eq(conversations.orgId, body.orgId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "conversation not found" });
    return row;
  });
}
