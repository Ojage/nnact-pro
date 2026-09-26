// Growth Intelligence — Project Knowledge, competitors, sectors, Autopilot, inbox.

import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  db,
  growthAutopilotDecisions,
  growthAutopilotSettings,
  growthCompetitorAnalyses,
  growthCompetitors,
  growthInboxMessages,
  growthInboxThreadNotes,
  growthInboxThreads,
  growthKnowledgeDocuments,
  growthKnowledgeFacts,
  growthKnowledgeIngestRuns,
  growthProspects,
  growthReplyDrafts,
  growthSectors,
  growthSenderIdentities,
  users,
} from "@nnact/db";
import {
  GROWTH_AUTOPILOT_MODES,
  GROWTH_COMPETITOR_CLASSIFICATION,
  GROWTH_COMPETITOR_REVIEW_STATUS,
  GROWTH_KNOWLEDGE_CATEGORY,
} from "@nnact/shared";
import { resolveOrgId } from "./org.js";
import {
  requireGrowthOwner,
  requireGrowthRead,
  requireGrowthWrite,
} from "../growth/access.js";
import { runAutopilotCycle } from "../growth/autopilot-cycle.js";
import { runAutopilotSimulation } from "../growth/autopilot-sim.js";
import { getGrowthDeploymentReadiness, growthDeploymentReady } from "../growth/env-readiness.js";
import {
  buildComparisonSummary,
  suggestCompetitorsFromWebsite,
} from "../growth/competitors-intel.js";
import {
  autopilotSettingsDto,
  ensureAutopilotSettings,
  ensureDefaultSectors,
  factToDto,
  persistFactProposals,
  recordFactRevision,
} from "../growth/intelligence-store.js";
import { ingestDocumentText, ingestWebsite } from "../growth/knowledge-ingest.js";
import { knowledgeFactKey } from "../growth/knowledge.js";
import { growthStructuredText } from "../growth/ai-text.js";
import { classifyInboundReply, REPLY_DRAFT_SYSTEM } from "../growth/reply-assist.js";
import { filterQuotableFacts } from "../growth/knowledge.js";

const uuid = z.string().uuid();
const trimmed = z.string().trim().min(1);

export async function growthIntelligenceRoutes(app: FastifyInstance) {
  app.get("/ops/deployment", async (req, reply) => {
    const claims = await requireGrowthOwner(req, reply);
    if (!claims) return;
    const items = getGrowthDeploymentReadiness(process.env);
    return {
      ready: growthDeploymentReady(items),
      items,
      schedulerEnabled: process.env.GROWTH_SCHEDULER_ENABLED === "true",
      inboundWebhookPath: "/api/v1/growth/webhooks/inbound/:orgId",
    };
  });

  app.get("/intelligence/overview", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    await ensureAutopilotSettings(orgId);
    await ensureDefaultSectors(orgId);
    const settings = await ensureAutopilotSettings(orgId);

    const [pending] = await db
      .select({ n: count() })
      .from(growthKnowledgeFacts)
      .where(and(eq(growthKnowledgeFacts.orgId, orgId), eq(growthKnowledgeFacts.status, "PENDING")));
    const [contradictions] = await db
      .select({ n: count() })
      .from(growthKnowledgeFacts)
      .where(and(eq(growthKnowledgeFacts.orgId, orgId), isNotNull(growthKnowledgeFacts.contradictionGroup)));
    const [suggested] = await db
      .select({ n: count() })
      .from(growthCompetitors)
      .where(and(eq(growthCompetitors.orgId, orgId), eq(growthCompetitors.reviewStatus, "SUGGESTED")));
    const [sectorsActive] = await db
      .select({ n: count() })
      .from(growthSectors)
      .where(and(eq(growthSectors.orgId, orgId), eq(growthSectors.isActive, true), eq(growthSectors.excluded, false)));
    const [humanThreads] = await db
      .select({ n: count() })
      .from(growthInboxThreads)
      .where(and(eq(growthInboxThreads.orgId, orgId), eq(growthInboxThreads.needsHumanReply, true)));

    return {
      pendingKnowledgeFacts: Number(pending?.n ?? 0),
      contradictions: Number(contradictions?.n ?? 0),
      suggestedCompetitors: Number(suggested?.n ?? 0),
      autopilotMode: settings.mode,
      autopilotPaused: settings.paused,
      sectorsActive: Number(sectorsActive?.n ?? 0),
      threadsNeedingHuman: Number(humanThreads?.n ?? 0),
      coldTransportReady: autopilotSettingsDto(settings).coldTransportReady,
    };
  });

  // ── Project Knowledge ─────────────────────────────────────────────────────

  app.get("/knowledge/facts", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const status = typeof (req.query as { status?: string }).status === "string"
      ? (req.query as { status: string }).status
      : undefined;
    const rows = await db
      .select()
      .from(growthKnowledgeFacts)
      .where(
        status
          ? and(eq(growthKnowledgeFacts.orgId, orgId), eq(growthKnowledgeFacts.status, status))
          : eq(growthKnowledgeFacts.orgId, orgId),
      )
      .orderBy(desc(growthKnowledgeFacts.updatedAt))
      .limit(500);
    return rows.map(factToDto);
  });

  app.post("/knowledge/facts", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const body = z
      .object({
        category: z.enum(GROWTH_KNOWLEDGE_CATEGORY),
        subject: trimmed.max(2000),
        supportingPassage: z.string().trim().max(8000).optional(),
      })
      .parse(req.body);
    const factKey = knowledgeFactKey(body.category, body.subject);
    const [row] = await db
      .insert(growthKnowledgeFacts)
      .values({
        orgId,
        factKey,
        category: body.category,
        subject: body.subject,
        supportingPassage: body.supportingPassage,
        sourceType: "MANUAL_ENTRY",
        provenance: "MANUAL",
        status: "PENDING",
        manuallyCorrected: true,
        confidence: 100,
        createdBy: claims.userId,
      })
      .returning();
    return factToDto(row!);
  });

  app.patch("/knowledge/facts/:id", async (req, reply) => {
    const claims = await requireGrowthOwner(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const id = uuid.parse((req.params as { id: string }).id);
    const body = z
      .object({
        action: z.enum(["APPROVE", "EDIT", "REJECT", "OBSOLETE"]),
        subject: z.string().trim().max(2000).optional(),
        rejectedReason: z.string().trim().max(2000).optional(),
      })
      .parse(req.body);

    const [existing] = await db
      .select()
      .from(growthKnowledgeFacts)
      .where(and(eq(growthKnowledgeFacts.orgId, orgId), eq(growthKnowledgeFacts.id, id)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: "fact not found" });

    let newStatus = existing.status;
    let newSubject = existing.subject;
    if (body.action === "APPROVE") newStatus = "APPROVED";
    if (body.action === "REJECT") newStatus = "REJECTED";
    if (body.action === "OBSOLETE") newStatus = "OBSOLETE";
    if (body.action === "EDIT" && body.subject) {
      newSubject = body.subject;
      newStatus = existing.status === "APPROVED" ? "APPROVED" : "PENDING";
    }

    const [updated] = await db
      .update(growthKnowledgeFacts)
      .set({
        subject: newSubject,
        status: newStatus,
        manuallyCorrected: true,
        approvedBy: body.action === "APPROVE" ? claims.userId : existing.approvedBy,
        approvedAt: body.action === "APPROVE" ? new Date() : existing.approvedAt,
        rejectedReason: body.action === "REJECT" ? body.rejectedReason ?? "Rejected by reviewer" : existing.rejectedReason,
        lastReviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(growthKnowledgeFacts.id, id))
      .returning();

    await recordFactRevision({
      orgId,
      factId: id,
      action: body.action,
      previousSubject: existing.subject,
      newSubject,
      previousStatus: existing.status,
      newStatus,
      note: body.rejectedReason,
      changedBy: claims.userId,
    });
    return factToDto(updated!);
  });

  app.post("/knowledge/ingest/website", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { website } = z.object({ website: trimmed.max(500) }).parse(req.body);

    const [run] = await db
      .insert(growthKnowledgeIngestRuns)
      .values({
        orgId,
        sourceType: "WEBSITE",
        sourceUrl: website,
        status: "PARTIAL",
        extractor: "claude_structured",
        createdBy: claims.userId,
      })
      .returning();

    const result = await ingestWebsite(orgId, website);
    if (result.error) {
      await db
        .update(growthKnowledgeIngestRuns)
        .set({
          status: "FAILED",
          error: result.error,
          missingCategories: result.missingCategories,
          finishedAt: new Date(),
        })
        .where(eq(growthKnowledgeIngestRuns.id, run!.id));
      return reply.code(502).send({
        error: result.error,
        missingCategories: result.missingCategories,
        runId: run!.id,
      });
    }

    const { created, skipped } = await persistFactProposals(orgId, result.proposals, run!.id, claims.userId);
    await db
      .update(growthKnowledgeIngestRuns)
      .set({
        status: "COMPLETED",
        factsSeen: result.proposals.length,
        factsCreated: created,
        factsSkipped: skipped,
        missingCategories: result.missingCategories,
        finishedAt: new Date(),
      })
      .where(eq(growthKnowledgeIngestRuns.id, run!.id));

    const serviceFacts = result.proposals.filter((p) => p.category === "SERVICE_AREA" || p.category === "INDUSTRIES_SERVED");
    const areas = serviceFacts.map((f) => f.subject);
    const industries = result.proposals.filter((p) => p.category === "INDUSTRIES_SERVED").map((p) => p.subject);
    const suggestions = suggestCompetitorsFromWebsite(website, areas, industries);
    for (const s of suggestions) {
      const domain = s.websiteDomain || null;
      if (domain) {
        const [dup] = await db
          .select({ id: growthCompetitors.id })
          .from(growthCompetitors)
          .where(and(eq(growthCompetitors.orgId, orgId), eq(growthCompetitors.websiteDomain, domain)))
          .limit(1);
        if (dup) continue;
      }
      await db.insert(growthCompetitors).values({
        orgId,
        name: s.name,
        websiteDomain: domain,
        classification: s.classification,
        reviewStatus: s.reviewStatus,
        geography: s.geography,
        evidenceSummary: s.evidenceSummary,
        sourceUrls: s.sourceUrls,
        createdBy: claims.userId,
      });
    }

    return {
      runId: run!.id,
      pagesFetched: result.pagesFetched,
      factsCreated: created,
      factsSkipped: skipped,
      missingCategories: result.missingCategories,
      competitorsSuggested: suggestions.length,
    };
  });

  app.get("/knowledge/ingest/runs", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const rows = await db
      .select()
      .from(growthKnowledgeIngestRuns)
      .where(eq(growthKnowledgeIngestRuns.orgId, orgId))
      .orderBy(desc(growthKnowledgeIngestRuns.startedAt))
      .limit(50);
    return rows.map((r) => ({
      id: r.id,
      sourceType: r.sourceType,
      sourceUrl: r.sourceUrl,
      sourceTitle: r.sourceTitle,
      status: r.status,
      extractor: r.extractor,
      factsSeen: r.factsSeen,
      factsCreated: r.factsCreated,
      factsSkipped: r.factsSkipped,
      missingCategories: r.missingCategories ?? [],
      error: r.error,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    }));
  });

  app.post("/knowledge/documents", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const body = z
      .object({
        title: trimmed.max(240),
        filename: trimmed.max(240),
        mime: trimmed.max(120),
        textContent: z.string().min(1).max(500_000),
        approvedForKnowledge: z.boolean().optional(),
      })
      .parse(req.body);
    const [doc] = await db
      .insert(growthKnowledgeDocuments)
      .values({
        orgId,
        title: body.title,
        filename: body.filename,
        mime: body.mime,
        sizeBytes: Buffer.byteLength(body.textContent),
        textContent: body.textContent,
        approvedForKnowledge: body.approvedForKnowledge ?? false,
        createdBy: claims.userId,
      })
      .returning();
    return doc;
  });

  app.post("/knowledge/documents/:id/ingest", async (req, reply) => {
    const claims = await requireGrowthOwner(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const id = uuid.parse((req.params as { id: string }).id);
    const [doc] = await db
      .select()
      .from(growthKnowledgeDocuments)
      .where(and(eq(growthKnowledgeDocuments.orgId, orgId), eq(growthKnowledgeDocuments.id, id)))
      .limit(1);
    if (!doc) return reply.code(404).send({ error: "document not found" });
    if (!doc.approvedForKnowledge) {
      return reply.code(403).send({ error: "document must be approved for knowledge extraction" });
    }
    const [run] = await db
      .insert(growthKnowledgeIngestRuns)
      .values({
        orgId,
        sourceType: "INTERNAL_DOCUMENT",
        sourceTitle: doc.title,
        status: "COMPLETED",
        extractor: "deterministic_lines",
        createdBy: claims.userId,
        finishedAt: new Date(),
      })
      .returning();
    const proposals = ingestDocumentText(orgId, { id: doc.id, title: doc.title, text: doc.textContent ?? "" });
    const { created, skipped } = await persistFactProposals(orgId, proposals, run!.id, claims.userId);
    return { runId: run!.id, factsCreated: created, factsSkipped: skipped };
  });

  // ── Competitors ───────────────────────────────────────────────────────────

  app.get("/competitors", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const rows = await db.select().from(growthCompetitors).where(eq(growthCompetitors.orgId, orgId)).orderBy(desc(growthCompetitors.updatedAt));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      websiteDomain: r.websiteDomain,
      classification: r.classification,
      reviewStatus: r.reviewStatus,
      geography: r.geography,
      services: r.services,
      targetCustomers: r.targetCustomers,
      positioning: r.positioning,
      visibleOffers: r.visibleOffers,
      evidenceSummary: r.evidenceSummary,
      sourceUrls: r.sourceUrls ?? [],
      reviewNotes: r.reviewNotes,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  });

  app.patch("/competitors/:id", async (req, reply) => {
    const claims = await requireGrowthOwner(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const id = uuid.parse((req.params as { id: string }).id);
    const body = z
      .object({
        reviewStatus: z.enum(GROWTH_COMPETITOR_REVIEW_STATUS).optional(),
        classification: z.enum(GROWTH_COMPETITOR_CLASSIFICATION).optional(),
        reviewNotes: z.string().trim().max(4000).optional(),
      })
      .parse(req.body);
    const [row] = await db
      .update(growthCompetitors)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(growthCompetitors.orgId, orgId), eq(growthCompetitors.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/competitors/analyze", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const approved = await db
      .select()
      .from(growthCompetitors)
      .where(and(eq(growthCompetitors.orgId, orgId), eq(growthCompetitors.reviewStatus, "APPROVED")));
    const facts = await db
      .select()
      .from(growthKnowledgeFacts)
      .where(and(eq(growthKnowledgeFacts.orgId, orgId), eq(growthKnowledgeFacts.status, "APPROVED")));
    const quotable = filterQuotableFacts(facts);
    const advantages = quotable.slice(0, 5).map((f) => f.subject);
    const gaps = ["Document maintenance-plan ROI with approved case studies", "Add verified pricing bands where published"];
    const { summary, comparison } = buildComparisonSummary(approved, advantages, gaps);
    const [last] = await db
      .select({ version: growthCompetitorAnalyses.version })
      .from(growthCompetitorAnalyses)
      .where(eq(growthCompetitorAnalyses.orgId, orgId))
      .orderBy(desc(growthCompetitorAnalyses.version))
      .limit(1);
    const version = (last?.version ?? 0) + 1;
    const [row] = await db
      .insert(growthCompetitorAnalyses)
      .values({
        orgId,
        version,
        summary,
        comparison,
        sourceCompetitorIds: approved.map((c) => c.id),
        generatedBy: "growth_intelligence",
      })
      .returning();
    return row;
  });

  // ── Sectors ───────────────────────────────────────────────────────────────

  app.get("/sectors", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    await ensureDefaultSectors(orgId);
    const rows = await db.select().from(growthSectors).where(eq(growthSectors.orgId, orgId)).orderBy(growthSectors.name);
    return rows.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      isActive: s.isActive,
      pinned: s.pinned,
      excluded: s.excluded,
      paused: s.paused,
      services: s.services ?? [],
      equipmentTypes: s.equipmentTypes ?? [],
      hypotheses: (s.hypotheses as { text: string; supported: boolean }[]) ?? [],
      decisionMakers: s.decisionMakers,
      prospectCriteria: s.prospectCriteria,
      offerTemplate: s.offerTemplate,
      callToAction: s.callToAction,
      allocationWeight: s.allocationWeight,
      manualAllocationOverride: s.manualAllocationOverride,
      minSampleSize: s.minSampleSize,
      observationDays: s.observationDays,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));
  });

  app.patch("/sectors/:id", async (req, reply) => {
    const claims = await requireGrowthOwner(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const id = uuid.parse((req.params as { id: string }).id);
    const body = z
      .object({
        pinned: z.boolean().optional(),
        excluded: z.boolean().optional(),
        paused: z.boolean().optional(),
        manualAllocationOverride: z.number().int().min(0).max(100).nullable().optional(),
      })
      .parse(req.body);
    const [row] = await db
      .update(growthSectors)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(growthSectors.orgId, orgId), eq(growthSectors.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  // ── Autopilot ─────────────────────────────────────────────────────────────

  app.get("/autopilot/settings", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const row = await ensureAutopilotSettings(orgId);
    return autopilotSettingsDto(row);
  });

  app.patch("/autopilot/settings", async (req, reply) => {
    const claims = await requireGrowthOwner(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    await ensureAutopilotSettings(orgId);
    const body = z
      .object({
        mode: z.enum(GROWTH_AUTOPILOT_MODES).optional(),
        dailySendCap: z.number().int().min(1).max(5000).optional(),
        explorationPercent: z.number().int().min(0).max(50).optional(),
        approvedSectorIds: z.array(uuid).optional(),
        approvedSenderIds: z.array(uuid).optional(),
      })
      .parse(req.body);
    const [row] = await db
      .update(growthAutopilotSettings)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(growthAutopilotSettings.orgId, orgId))
      .returning();
    return autopilotSettingsDto(row!);
  });

  app.post("/autopilot/pause", async (req, reply) => {
    const claims = await requireGrowthOwner(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    await ensureAutopilotSettings(orgId);
    const [row] = await db
      .update(growthAutopilotSettings)
      .set({ paused: true, pausedAt: new Date(), pausedBy: claims.userId, updatedAt: new Date() })
      .where(eq(growthAutopilotSettings.orgId, orgId))
      .returning();
    return autopilotSettingsDto(row!);
  });

  app.post("/autopilot/resume", async (req, reply) => {
    const claims = await requireGrowthOwner(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const [row] = await db
      .update(growthAutopilotSettings)
      .set({ paused: false, pausedAt: null, pausedBy: null, updatedAt: new Date() })
      .where(eq(growthAutopilotSettings.orgId, orgId))
      .returning();
    return autopilotSettingsDto(row!);
  });

  app.post("/autopilot/run-cycle", async (req, reply) => {
    const claims = await requireGrowthOwner(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    await ensureDefaultSectors(orgId);
    await ensureAutopilotSettings(orgId);
    return runAutopilotCycle(orgId);
  });

  app.post("/autopilot/simulate", async (req, reply) => {
    const claims = await requireGrowthOwner(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    await ensureDefaultSectors(orgId);
    const body = z
      .object({ dailyCapacity: z.number().int().min(1).max(5000).optional() })
      .safeParse(req.body ?? {});
    return runAutopilotSimulation(orgId, claims.userId, body.success ? body.data.dailyCapacity : undefined);
  });

  app.get("/autopilot/decisions", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const rows = await db
      .select({
        decision: growthAutopilotDecisions,
        sectorName: growthSectors.name,
      })
      .from(growthAutopilotDecisions)
      .leftJoin(growthSectors, eq(growthAutopilotDecisions.sectorId, growthSectors.id))
      .where(eq(growthAutopilotDecisions.orgId, orgId))
      .orderBy(desc(growthAutopilotDecisions.createdAt))
      .limit(100);
    return rows.map(({ decision, sectorName }) => ({
      id: decision.id,
      sectorId: decision.sectorId,
      sectorName,
      cycleId: decision.cycleId,
      previousAllocation: decision.previousAllocation,
      newAllocation: decision.newAllocation,
      reasoning: decision.reasoning,
      inputs: decision.inputs as Record<string, unknown>,
      createdAt: decision.createdAt.toISOString(),
    }));
  });

  // ── Unified inbox ─────────────────────────────────────────────────────────

  app.get("/inbox/threads", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const rows = await db
      .select({
        thread: growthInboxThreads,
        companyName: growthProspects.companyName,
        senderEmail: growthSenderIdentities.email,
        senderDisplayName: growthSenderIdentities.displayName,
      })
      .from(growthInboxThreads)
      .innerJoin(growthProspects, eq(growthInboxThreads.prospectId, growthProspects.id))
      .leftJoin(growthSenderIdentities, eq(growthInboxThreads.senderIdentityId, growthSenderIdentities.id))
      .where(eq(growthInboxThreads.orgId, orgId))
      .orderBy(desc(growthInboxThreads.lastMessageAt))
      .limit(200);
    return rows.map(({ thread, companyName, senderEmail, senderDisplayName }) => ({
      id: thread.id,
      prospectId: thread.prospectId,
      companyName,
      contactDetailId: thread.contactDetailId,
      campaignId: thread.campaignId,
      senderIdentityId: thread.senderIdentityId,
      senderEmail,
      senderDisplayName,
      subject: thread.subject,
      lastMessageAt: thread.lastMessageAt.toISOString(),
      needsHumanReply: thread.needsHumanReply,
      verificationRequestedAt: thread.verificationRequestedAt?.toISOString() ?? null,
    }));
  });

  app.get("/inbox/threads/:id", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const id = uuid.parse((req.params as { id: string }).id);
    const messages = await db
      .select()
      .from(growthInboxMessages)
      .where(and(eq(growthInboxMessages.orgId, orgId), eq(growthInboxMessages.threadId, id)))
      .orderBy(growthInboxMessages.createdAt);
    return messages.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      direction: m.direction as "INBOUND" | "OUTBOUND",
      fromEmail: m.fromEmail,
      toEmail: m.toEmail,
      subject: m.subject,
      bodyText: m.bodyText,
      intent: m.intent,
      createdAt: m.createdAt.toISOString(),
    }));
  });

  app.post("/inbox/threads/:id/inbound", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const threadId = uuid.parse((req.params as { id: string }).id);
    const body = z.object({ bodyText: trimmed.max(20_000), fromEmail: z.string().email().optional() }).parse(req.body);
    const [thread] = await db
      .select()
      .from(growthInboxThreads)
      .where(and(eq(growthInboxThreads.orgId, orgId), eq(growthInboxThreads.id, threadId)))
      .limit(1);
    if (!thread) return reply.code(404).send({ error: "thread not found" });

    const classification = classifyInboundReply(body.bodyText);
    const [sender] = thread.senderIdentityId
      ? await db.select().from(growthSenderIdentities).where(eq(growthSenderIdentities.id, thread.senderIdentityId)).limit(1)
      : [];

    const [msg] = await db
      .insert(growthInboxMessages)
      .values({
        orgId,
        threadId,
        direction: "INBOUND",
        fromEmail: body.fromEmail ?? "prospect@example.com",
        toEmail: sender?.email ?? "outreach@nnact.com",
        subject: thread.subject,
        bodyText: body.bodyText,
        intent: classification.intent,
        classifiedAt: new Date(),
      })
      .returning();

    await db
      .update(growthInboxThreads)
      .set({
        lastMessageAt: new Date(),
        needsHumanReply: classification.requiresHuman,
        verificationRequestedAt: classification.verificationRequested ? new Date() : thread.verificationRequestedAt,
      })
      .where(eq(growthInboxThreads.id, threadId));

    return {
      message: msg,
      classification,
      sender: sender
        ? { displayName: sender.displayName, email: sender.email, roleTitle: sender.roleTitle }
        : null,
    };
  });

  app.post("/inbox/threads/:id/draft-reply", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const threadId = uuid.parse((req.params as { id: string }).id);
    const { language } = z.object({ language: z.enum(["EN", "FR"]).default("EN") }).parse(req.body ?? {});

    const [thread] = await db
      .select()
      .from(growthInboxThreads)
      .where(and(eq(growthInboxThreads.orgId, orgId), eq(growthInboxThreads.id, threadId)))
      .limit(1);
    if (!thread) return reply.code(404).send({ error: "thread not found" });

    const messages = await db
      .select()
      .from(growthInboxMessages)
      .where(eq(growthInboxMessages.threadId, threadId))
      .orderBy(desc(growthInboxMessages.createdAt))
      .limit(20);
    const lastInbound = messages.find((m) => m.direction === "INBOUND");
    const classification = lastInbound ? classifyInboundReply(lastInbound.bodyText) : { intent: "OTHER" as const, requiresHuman: false, verificationRequested: false };

    const [sender] = thread.senderIdentityId
      ? await db.select().from(growthSenderIdentities).where(eq(growthSenderIdentities.id, thread.senderIdentityId)).limit(1)
      : [];

    if (classification.requiresHuman || classification.verificationRequested) {
      const [draft] = await db
        .insert(growthReplyDrafts)
        .values({
          orgId,
          threadId,
          inboundMessageId: lastInbound?.id,
          language,
          draftText: "",
          requiresHuman: true,
          humanRouteReason: classification.humanRouteReason ?? "Human review required",
          contextSources: messages.map((m) => ({ id: m.id, direction: m.direction, excerpt: m.bodyText.slice(0, 200) })),
          createdBy: claims.userId,
        })
        .returning();
      return {
        draft: {
          id: draft!.id,
          requiresHuman: true,
          humanRouteReason: draft!.humanRouteReason,
          sender: sender ? { displayName: sender.displayName, email: sender.email } : null,
          messageHistory: messages,
        },
      };
    }

    const facts = await db
      .select()
      .from(growthKnowledgeFacts)
      .where(and(eq(growthKnowledgeFacts.orgId, orgId), eq(growthKnowledgeFacts.status, "APPROVED")));
    const quotable = filterQuotableFacts(facts).slice(0, 15);

    const ai = await growthStructuredText(orgId, {
      system: REPLY_DRAFT_SYSTEM,
      prompt: JSON.stringify({
        language,
        sender: sender ? { name: sender.displayName, email: sender.email, title: sender.roleTitle } : null,
        thread: messages.map((m) => ({ direction: m.direction, body: m.bodyText })),
        approvedFacts: quotable.map((f) => ({ category: f.category, subject: f.subject, source: f.sourceUrl })),
      }),
      task: "growth_reply_draft",
    });

    const draftText = ai.content.trim() || "Thank you for your message. I will confirm the details and follow up shortly.";
    const [draft] = await db
      .insert(growthReplyDrafts)
      .values({
        orgId,
        threadId,
        inboundMessageId: lastInbound?.id,
        language,
        draftText,
        requiresHuman: false,
        knowledgeFactIds: quotable.map((f) => f.id),
        contextSources: [{ provider: ai.provider, facts: quotable.length, messages: messages.length }],
        createdBy: claims.userId,
      })
      .returning();

    return {
      draft: {
        id: draft!.id,
        draftText: draft!.draftText,
        requiresHuman: false,
        knowledgeFactIds: draft!.knowledgeFactIds,
        contextSources: draft!.contextSources,
      },
    };
  });

  app.post("/inbox/threads", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const body = z
      .object({
        prospectId: uuid,
        contactDetailId: uuid.optional(),
        campaignId: uuid.optional(),
        senderIdentityId: uuid.optional(),
        subject: z.string().trim().max(500).optional(),
      })
      .parse(req.body);
    const [thread] = await db
      .insert(growthInboxThreads)
      .values({ orgId, ...body })
      .returning();
    return thread;
  });

  app.patch("/inbox/threads/:id", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const id = uuid.parse((req.params as { id: string }).id);
    const body = z
      .object({
        needsHumanReply: z.boolean().optional(),
        subject: z.string().trim().max(500).optional(),
      })
      .parse(req.body ?? {});
    const [thread] = await db
      .update(growthInboxThreads)
      .set({
        ...(body.needsHumanReply !== undefined ? { needsHumanReply: body.needsHumanReply } : {}),
        ...(body.subject !== undefined ? { subject: body.subject } : {}),
      })
      .where(and(eq(growthInboxThreads.orgId, orgId), eq(growthInboxThreads.id, id)))
      .returning();
    if (!thread) return reply.code(404).send({ error: "thread not found" });
    return thread;
  });

  app.get("/inbox/threads/:id/notes", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const threadId = uuid.parse((req.params as { id: string }).id);
    const rows = await db
      .select({
        id: growthInboxThreadNotes.id,
        body: growthInboxThreadNotes.body,
        assignedTo: growthInboxThreadNotes.assignedTo,
        createdBy: growthInboxThreadNotes.createdBy,
        createdAt: growthInboxThreadNotes.createdAt,
        authorName: users.name,
      })
      .from(growthInboxThreadNotes)
      .leftJoin(users, eq(users.id, growthInboxThreadNotes.createdBy))
      .where(and(eq(growthInboxThreadNotes.orgId, orgId), eq(growthInboxThreadNotes.threadId, threadId)))
      .orderBy(desc(growthInboxThreadNotes.createdAt))
      .limit(100);
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      assignedTo: r.assignedTo,
      createdBy: r.createdBy,
      authorName: r.authorName,
      createdAt: r.createdAt.toISOString(),
    }));
  });

  app.post("/inbox/threads/:id/notes", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const threadId = uuid.parse((req.params as { id: string }).id);
    const body = z
      .object({
        body: trimmed.max(4000),
        assignedTo: uuid.optional(),
      })
      .parse(req.body);

    const [thread] = await db
      .select({ id: growthInboxThreads.id })
      .from(growthInboxThreads)
      .where(and(eq(growthInboxThreads.orgId, orgId), eq(growthInboxThreads.id, threadId)))
      .limit(1);
    if (!thread) return reply.code(404).send({ error: "thread not found" });

    const [note] = await db
      .insert(growthInboxThreadNotes)
      .values({
        orgId,
        threadId,
        body: body.body,
        assignedTo: body.assignedTo ?? null,
        createdBy: claims.userId,
      })
      .returning();
    return reply.code(201).send({
      id: note!.id,
      body: note!.body,
      assignedTo: note!.assignedTo,
      createdAt: note!.createdAt.toISOString(),
    });
  });
}
