// DB helpers for Growth Intelligence — settings bootstrap and fact persistence.

import { and, eq } from "drizzle-orm";
import {
  db,
  growthAutopilotSettings,
  growthKnowledgeFactRevisions,
  growthKnowledgeFacts,
  growthKnowledgeIngestRuns,
  growthSectors,
} from "@nnact/db";
import { DEFAULT_GROWTH_SECTORS } from "./sectors-default.js";
import { shouldSkipRefresh } from "./knowledge.js";
import type { ExtractedFactProposal } from "./knowledge-ingest.js";
import { isColdSendingEnabled } from "./transport-policy.js";

export async function ensureAutopilotSettings(orgId: string) {
  const [existing] = await db
    .select()
    .from(growthAutopilotSettings)
    .where(eq(growthAutopilotSettings.orgId, orgId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(growthAutopilotSettings)
    .values({ orgId, mode: "OBSERVE", paused: false })
    .returning();
  return created!;
}

export async function ensureDefaultSectors(orgId: string) {
  const existing = await db.select({ id: growthSectors.id }).from(growthSectors).where(eq(growthSectors.orgId, orgId)).limit(1);
  if (existing.length) return;
  for (const seed of DEFAULT_GROWTH_SECTORS) {
    await db.insert(growthSectors).values({
      orgId,
      slug: seed.slug,
      name: seed.name,
      services: seed.services,
      equipmentTypes: seed.equipmentTypes,
      decisionMakers: seed.decisionMakers,
      hypotheses: seed.hypotheses,
    });
  }
}

export function autopilotSettingsDto(row: typeof growthAutopilotSettings.$inferSelect) {
  return {
    mode: row.mode,
    paused: row.paused,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    dailySendCap: row.dailySendCap,
    dailyBudgetCents: row.dailyBudgetCents,
    explorationPercent: row.explorationPercent,
    approvedSectorIds: row.approvedSectorIds ?? [],
    approvedSenderIds: row.approvedSenderIds ?? [],
    lastCycleAt: row.lastCycleAt?.toISOString() ?? null,
    coldTransportReady: isColdSendingEnabled(process.env),
  };
}

export function factToDto(row: typeof growthKnowledgeFacts.$inferSelect) {
  return {
    id: row.id,
    factKey: row.factKey,
    category: row.category,
    subject: row.subject,
    supportingPassage: row.supportingPassage,
    sourceType: row.sourceType,
    sourceUrl: row.sourceUrl,
    sourceDocumentId: row.sourceDocumentId,
    sourceTitle: row.sourceTitle,
    extractedAt: row.extractedAt?.toISOString() ?? null,
    confidence: row.confidence,
    provenance: row.provenance,
    status: row.status,
    manuallyCorrected: row.manuallyCorrected,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    rejectedReason: row.rejectedReason,
    lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
    contradictionGroup: row.contradictionGroup,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function persistFactProposals(
  orgId: string,
  proposals: ExtractedFactProposal[],
  runId: string,
  userId: string | null,
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (const proposal of proposals) {
    const [existing] = await db
      .select()
      .from(growthKnowledgeFacts)
      .where(and(eq(growthKnowledgeFacts.orgId, orgId), eq(growthKnowledgeFacts.factKey, proposal.factKey)))
      .limit(1);
    if (existing && shouldSkipRefresh(existing)) {
      skipped += 1;
      continue;
    }
    if (existing) {
      await db
        .update(growthKnowledgeFacts)
        .set({
          subject: proposal.subject,
          supportingPassage: proposal.supportingPassage,
          sourceType: proposal.sourceType,
          sourceUrl: proposal.sourceUrl,
          sourceTitle: proposal.sourceTitle,
          confidence: proposal.confidence,
          provenance: proposal.provenance,
          status: proposal.status,
          extractedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(growthKnowledgeFacts.id, existing.id));
      skipped += 1;
      continue;
    }
    await db.insert(growthKnowledgeFacts).values({
      orgId,
      factKey: proposal.factKey,
      category: proposal.category,
      subject: proposal.subject,
      supportingPassage: proposal.supportingPassage,
      sourceType: proposal.sourceType,
      sourceUrl: proposal.sourceUrl,
      sourceTitle: proposal.sourceTitle,
      confidence: proposal.confidence,
      provenance: proposal.provenance,
      status: proposal.status,
      extractedAt: new Date(),
      createdBy: userId,
    });
    created += 1;
  }
  await db
    .update(growthKnowledgeIngestRuns)
    .set({ factsCreated: created, factsSkipped: skipped, finishedAt: new Date() })
    .where(and(eq(growthKnowledgeIngestRuns.orgId, orgId), eq(growthKnowledgeIngestRuns.id, runId)));
  return { created, skipped };
}

export async function recordFactRevision(input: {
  orgId: string;
  factId: string;
  action: string;
  previousSubject?: string | null;
  newSubject?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  note?: string | null;
  changedBy: string | null;
}) {
  await db.insert(growthKnowledgeFactRevisions).values({
    orgId: input.orgId,
    factId: input.factId,
    action: input.action,
    previousSubject: input.previousSubject,
    newSubject: input.newSubject,
    previousStatus: input.previousStatus,
    newStatus: input.newStatus,
    note: input.note,
    changedBy: input.changedBy,
  });
}
