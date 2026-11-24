import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  jobs,
  orgs,
  priceBookCategories,
  priceBookItems,
  priceObservations,
  sourcingSuggestions,
  supplierContacts,
  supplierMessages,
} from "@nnact/db";
import {
  AGENT_SCOPES,
  isAgentClaims,
  normalizePhone,
  renderSmsTemplate,
  requireAgentScope,
  sourcingOutcomeRequestSchema,
  sourcingRejectRequestSchema,
  sourcingSupplierMessageWriteSchema,
  sourcingSuggestionWriteSchema,
  supplierContactWriteSchema,
  type AgentScope,
  type SourcingCandidate,
  type SourcingSuggestionDTO,
} from "@nnact/shared";
import { appendEvent } from "../agent-office/events.js";
import type { StaffJwtClaims } from "../auth.js";
import { verifiedClaims } from "../operational-authorization.js";
import { currentRange, proposalTotals } from "../price-book/pricing.js";
import { staleItems } from "./agent-pricebook.js";
import { sendSmsTemplate } from "../sms/templates.js";

const AGENT = "sourcing-agent";
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
    await reply.code(isAgentClaims(claims) ? 403 : 401).send({ error: "sourcing agent token required" });
    return null;
  }
  return claims;
}

async function reviewer(req: FastifyRequest, reply: FastifyReply) {
  const claims = (await verifiedClaims(req, reply)) as StaffJwtClaims | null;
  if (!claims || reply.sent) return null;
  if (claims.role !== "owner" && claims.role !== "dispatcher") {
    await reply.code(403).send({ error: "only dispatchers and owners can act on sourcing suggestions" });
    return null;
  }
  return claims;
}

function toDTO(row: typeof sourcingSuggestions.$inferSelect): SourcingSuggestionDTO {
  return {
    id: row.id,
    jobId: row.jobId,
    state: row.state,
    shadow: row.shadow === 1,
    fingerprint: row.fingerprint,
    lowCents: row.lowCents,
    highCents: row.highCents,
    confidence: row.confidence,
    rationale: row.rationale,
    assumptions: row.assumptions,
    missingInformation: row.missingInformation,
    createdAt: row.createdAt.toISOString(),
  };
}

async function candidatesForOrg(orgId: string): Promise<SourcingCandidate[]> {
  const [items, stale] = await Promise.all([
    db
      .select({
        id: priceBookItems.id,
        canonicalName: priceBookItems.canonicalName,
        unit: priceBookItems.unit,
        freshnessDays: priceBookCategories.freshnessDays,
      })
      .from(priceBookItems)
      .innerJoin(priceBookCategories, eq(priceBookCategories.id, priceBookItems.categoryId))
      .where(and(eq(priceBookItems.orgId, orgId), eq(priceBookItems.active, true), eq(priceBookCategories.active, true)))
      .limit(100),
    staleItems(orgId),
  ]);
  if (items.length === 0) return [];
  const observations = await db
    .select({
      itemId: priceObservations.itemId,
      amountCents: priceObservations.amountCents,
      status: priceObservations.status,
      source: priceObservations.source,
      observedAt: priceObservations.observedAt,
      confidence: priceObservations.confidence,
    })
    .from(priceObservations)
    .where(and(eq(priceObservations.orgId, orgId), inArray(priceObservations.itemId, items.map((item) => item.id))));
  const staleIds = new Set(stale.map((item) => item.itemId));
  return items.map((item) => {
    const range = currentRange(
      observations.filter((observation) => observation.itemId === item.id),
      new Date(),
      item.freshnessDays,
    );
    return {
      itemId: item.id,
      description: item.canonicalName,
      unit: item.unit,
      range,
      stale: staleIds.has(item.id),
    };
  });
}

export async function agentSourcingRoutes(app: FastifyInstance) {
  app.post("/agent/sourcing/jobs/:jobId/context", async (req, reply) => {
    const claims = await agentClaims(req, reply, [AGENT_SCOPES.priceBookRead]);
    if (!claims) return;
    const id = UUID.safeParse((req.params as { jobId?: string }).jobId);
    if (!id.success) return reply.code(400).send({ error: "invalid job id" });
    const [job] = await db
      .select({ id: jobs.id, title: jobs.title, description: jobs.description, status: jobs.status, updatedAt: jobs.updatedAt })
      .from(jobs)
      .where(and(eq(jobs.orgId, claims.orgId), eq(jobs.id, id.data)))
      .limit(1);
    if (!job) return reply.code(404).send({ error: "job not found" });
    const suppliers = await db
      .select({ id: supplierContacts.id, name: supplierContacts.name, area: supplierContacts.area })
      .from(supplierContacts)
      .where(and(eq(supplierContacts.orgId, claims.orgId), eq(supplierContacts.active, true)))
      .limit(100);
    return {
      job: { id: job.id, title: job.title, description: job.description, status: job.status },
      fingerprint: job.updatedAt.toISOString(),
      candidates: await candidatesForOrg(claims.orgId),
      suppliers,
    };
  });

  app.post("/agent/sourcing/suggestions", async (req, reply) => {
    const claims = await agentClaims(req, reply, [AGENT_SCOPES.sourcingSuggestionsCreate]);
    if (!claims) return;
    const parsed = sourcingSuggestionWriteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    const [job] = await db
      .select({ id: jobs.id, updatedAt: jobs.updatedAt })
      .from(jobs)
      .where(and(eq(jobs.orgId, claims.orgId), eq(jobs.id, body.jobId)))
      .limit(1);
    if (!job) return reply.code(409).send({ error: "job not found" });
    if (job.updatedAt.toISOString() !== body.fingerprint) return reply.code(409).send({ error: "job changed since sourcing" });

    const candidates = await candidatesForOrg(claims.orgId);
    const byId = new Map(candidates.map((candidate) => [candidate.itemId, candidate]));
    const lines = body.lines.map((line) => {
      const candidate = byId.get(line.itemId);
      if (!candidate) return null;
      const low = candidate.range.lowCents === null ? null : candidate.range.lowCents * line.quantity;
      const high = candidate.range.highCents === null ? null : candidate.range.highCents * line.quantity;
      return {
        id: crypto.randomUUID(),
        itemId: line.itemId,
        description: line.description.slice(0, 240),
        quantity: line.quantity,
        unit: line.unit,
        unitPriceLowCents: candidate.range.lowCents,
        unitPriceHighCents: candidate.range.highCents,
        lineLowCents: low,
        lineHighCents: high,
        supplierContactId: line.supplierContactId ?? null,
        source: candidate.range.basis,
        confidence: candidate.range.confidence,
        needsManualPrice: candidate.range.lowCents === null,
        stale: candidate.stale,
      };
    });
    if (lines.some((line) => line === null)) return reply.code(422).send({ error: "lines must use current Price Book candidates" });
    const typedLines = lines.filter((line) => line !== null);
    const totals = proposalTotals(typedLines);
    if (typedLines.some((line) => line.supplierContactId)) {
      const contactIds = [...new Set(typedLines.map((line) => line.supplierContactId).filter((value): value is string => Boolean(value)))];
      const contacts = await db
        .select({ id: supplierContacts.id })
        .from(supplierContacts)
        .where(and(eq(supplierContacts.orgId, claims.orgId), inArray(supplierContacts.id, contactIds)));
      if (contacts.length !== contactIds.length) return reply.code(422).send({ error: "unknown supplier contact" });
    }

    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(sourcingSuggestions)
        .where(and(eq(sourcingSuggestions.orgId, claims.orgId), eq(sourcingSuggestions.jobId, body.jobId), eq(sourcingSuggestions.current, 1)))
        .limit(1);
      if (existing && existing.fingerprint === body.fingerprint) return { row: existing, created: false };
      if (existing) {
        await tx.update(sourcingSuggestions).set({ current: 0, updatedAt: new Date() }).where(eq(sourcingSuggestions.id, existing.id));
      }
      const [inserted] = await tx
        .insert(sourcingSuggestions)
        .values({
          orgId: claims.orgId,
          jobId: body.jobId,
          runId: body.runId,
          state: "shown",
          current: 1,
          shadow: 0,
          fingerprint: body.fingerprint,
          lowCents: totals.lowCents,
          highCents: totals.highCents,
          lines: typedLines,
          confidence: Math.round(body.confidence * 100),
          rationale: body.rationale,
          assumptions: body.assumptions,
          missingInformation: body.missingInformation,
        })
        .returning();
      return { row: inserted!, created: true };
    });
    if (row.created) await appendEvent({ orgId: claims.orgId, agentId: AGENT, type: "approvals" });
    return reply.code(row.created ? 201 : 200).send(toDTO(row.row));
  });

  app.get("/agent/sourcing/suppliers", async (req, reply) => {
    const claims = await agentClaims(req, reply, [AGENT_SCOPES.supplierMessagesTemplatedSend]);
    if (!claims) return;
    const rows = await db
      .select({ id: supplierContacts.id, name: supplierContacts.name, area: supplierContacts.area })
      .from(supplierContacts)
      .where(and(eq(supplierContacts.orgId, claims.orgId), eq(supplierContacts.active, true)))
      .limit(100);
    return { suppliers: rows };
  });

  app.post("/agent/sourcing/supplier-messages", async (req, reply) => {
    const claims = await agentClaims(req, reply, [AGENT_SCOPES.supplierMessagesTemplatedSend, AGENT_SCOPES.sourcingSuggestionsCreate]);
    if (!claims) return;
    const parsed = sourcingSupplierMessageWriteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    const [suggestion] = await db
      .select()
      .from(sourcingSuggestions)
      .where(and(eq(sourcingSuggestions.orgId, claims.orgId), eq(sourcingSuggestions.id, body.suggestionId)))
      .limit(1);
    const [contact] = await db
      .select()
      .from(supplierContacts)
      .where(and(eq(supplierContacts.orgId, claims.orgId), eq(supplierContacts.id, body.supplierContactId), eq(supplierContacts.active, true)))
      .limit(1);
    if (!suggestion || !contact) return reply.code(404).send({ error: "suggestion or supplier contact not found" });
    const selectedLines = suggestion.lines.filter(
      (line) =>
        (body.lineIds.length === 0 || body.lineIds.includes(line.id)) &&
        (!line.supplierContactId || line.supplierContactId === contact.id),
    );
    if (selectedLines.length === 0) return reply.code(422).send({ error: "no lines match that supplier" });
    const itemsText = selectedLines
      .map((line) => `${line.description} x${line.quantity} ${line.unit}`)
      .join("; ")
      .slice(0, 240);
    const [org] = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, claims.orgId)).limit(1);
    const bodyText = renderSmsTemplate("supplier_stock_check", {
      companyName: org?.name ?? "NNACT Pro",
      supplierName: contact.name,
      items: itemsText,
      contactPhone: contact.phoneE164 ?? contact.phone,
    });
    const [existing] = await db
      .select()
      .from(supplierMessages)
      .where(
        and(
          eq(supplierMessages.orgId, claims.orgId),
          eq(supplierMessages.suggestionId, body.suggestionId),
          eq(supplierMessages.supplierContactId, body.supplierContactId),
          eq(supplierMessages.templateSlug, "supplier_stock_check"),
        ),
      )
      .limit(1);
    if (existing) return { message: existing, created: false };

    let status = "sent";
    let error: string | null = null;
    try {
      await sendSmsTemplate("supplier_stock_check", contact.phoneE164 ?? contact.phone, {
        companyName: org?.name ?? "NNACT Pro",
        supplierName: contact.name,
        items: itemsText,
        contactPhone: contact.phoneE164 ?? contact.phone,
      });
    } catch (sendError) {
      status = "failed";
      error = sendError instanceof Error ? sendError.message.slice(0, 500) : String(sendError);
    }
    const [message] = await db
      .insert(supplierMessages)
      .values({
        orgId: claims.orgId,
        suggestionId: body.suggestionId,
        supplierContactId: body.supplierContactId,
        runId: body.runId,
        lineIds: selectedLines.map((line) => line.id),
        templateSlug: "supplier_stock_check",
        toPhone: contact.phoneE164 ?? contact.phone,
        body: bodyText,
        status,
        error,
        sentAt: status === "sent" ? new Date() : null,
      })
      .returning();
    await appendEvent({ orgId: claims.orgId, agentId: AGENT, type: "approvals" });
    return reply.code(201).send({ message: message!, created: true });
  });

  app.post("/sourcing/suppliers", async (req, reply) => {
    const claims = await reviewer(req, reply);
    if (!claims) return;
    const parsed = supplierContactWriteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const phone = normalizePhone(parsed.data.phone);
    const [row] = await db
      .insert(supplierContacts)
      .values({
        orgId: claims.orgId,
        name: parsed.data.name,
        phone: parsed.data.phone,
        phoneE164: phone,
        email: parsed.data.email,
        area: parsed.data.area,
      })
      .onConflictDoNothing()
      .returning();
    return reply.code(row ? 201 : 200).send({ contact: row ?? null, created: Boolean(row) });
  });

  app.get("/sourcing/suggestions/jobs/:jobId", async (req, reply) => {
    const claims = await reviewer(req, reply);
    if (!claims) return;
    const id = UUID.safeParse((req.params as { jobId?: string }).jobId);
    if (!id.success) return reply.code(400).send({ error: "invalid job id" });
    const [row] = await db
      .select()
      .from(sourcingSuggestions)
      .where(
        and(
          eq(sourcingSuggestions.orgId, claims.orgId),
          eq(sourcingSuggestions.jobId, id.data),
          eq(sourcingSuggestions.current, 1),
          eq(sourcingSuggestions.state, "shown"),
        ),
      )
      .limit(1);
    return { suggestion: row ? { ...toDTO(row), lines: row.lines } : null };
  });

  for (const action of ["outcome", "reject"] as const) {
    app.post(`/sourcing/suggestions/:id/${action}`, async (req, reply) => {
      const claims = await reviewer(req, reply);
      if (!claims) return;
      const id = UUID.safeParse((req.params as { id?: string }).id);
      const parsed = action === "outcome" ? sourcingOutcomeRequestSchema.safeParse(req.body) : sourcingRejectRequestSchema.safeParse(req.body);
      if (!id.success || !parsed.success) return reply.code(400).send({ error: action === "reject" ? "a reason is required" : "invalid outcome" });
      const patch: { state: "rejected" | "accepted" | "changed" | "ignored"; outcomeReason: string | null } =
        action === "reject"
          ? { state: "rejected", outcomeReason: (parsed.data as { reason: string }).reason }
          : {
              state: (parsed.data as { state: "accepted" | "changed" | "ignored" }).state,
              outcomeReason: (parsed.data as { reason?: string }).reason ?? null,
            };
      const [row] = await db
        .update(sourcingSuggestions)
        .set({ ...patch, decidedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(sourcingSuggestions.id, id.data),
            eq(sourcingSuggestions.orgId, claims.orgId),
            sql`${sourcingSuggestions.state} = 'shown'`,
          ),
        )
        .returning();
      if (!row) return reply.code(404).send({ error: "no open suggestion with that id" });
      await appendEvent({ orgId: claims.orgId, agentId: AGENT, type: "approvals" });
      return toDTO(row);
    });
  }
}
