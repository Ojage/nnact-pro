import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@nnact/db";
import {
  priceBookCategories,
  priceBookItems,
  priceBookRates,
  priceObservations,
  quoteProposalLines,
  quoteProposals,
} from "@nnact/db";
import {
  PRICE_BOOK_DEFAULT_FRESHNESS_DAYS,
  type PricedCandidateDTO,
  type PriceBookCategoryDTO,
  type PriceBookItemDTO,
  type PriceBookRateDTO,
  type PriceObservationDTO,
  type QuoteProposalDTO,
} from "@nnact/shared";
import { currentRange, proposalTotals, validateSelections } from "./pricing.js";
import type { ObservationLike } from "./pricing.js";

export function categoryDTO(row: typeof priceBookCategories.$inferSelect): PriceBookCategoryDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    freshnessDays: row.freshnessDays,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

export function itemDTO(row: typeof priceBookItems.$inferSelect): PriceBookItemDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    categoryId: row.categoryId,
    canonicalName: row.canonicalName,
    unit: row.unit,
    aliases: row.aliases,
    catalogItemId: row.catalogItemId,
    suggested: row.suggested,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

export function observationDTO(row: typeof priceObservations.$inferSelect): PriceObservationDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    itemId: row.itemId,
    amountCents: row.amountCents,
    shopName: row.shopName,
    area: row.area,
    source: row.source,
    status: row.status,
    observedAt: row.observedAt.toISOString(),
    jobId: row.jobId,
    recordedBy: row.recordedBy,
    confidence: row.confidence,
    receiptMediaRef: row.receiptMediaRef,
    createdAt: row.createdAt.toISOString(),
  };
}

export function rateDTO(row: typeof priceBookRates.$inferSelect): PriceBookRateDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    kind: row.kind,
    key: row.key,
    amountCents: row.amountCents,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function pricedCandidates(
  orgId: string,
  now: Date = new Date(),
): Promise<PricedCandidateDTO[]> {
  const [items, categories, rates, observations] = await Promise.all([
    db.select().from(priceBookItems).where(and(eq(priceBookItems.orgId, orgId), eq(priceBookItems.active, true))),
    db.select().from(priceBookCategories).where(eq(priceBookCategories.orgId, orgId)),
    db.select().from(priceBookRates).where(and(eq(priceBookRates.orgId, orgId), eq(priceBookRates.active, true))),
    db.select().from(priceObservations).where(eq(priceObservations.orgId, orgId)),
  ]);

  const freshness = new Map(categories.map((category) => [category.id, category.freshnessDays]));
  const byItem = new Map<string, ObservationLike[]>();
  for (const observation of observations) {
    const list = byItem.get(observation.itemId) ?? [];
    list.push(observation);
    byItem.set(observation.itemId, list);
  }

  const itemCandidates: PricedCandidateDTO[] = items.map((item) => ({
    itemId: item.id,
    rateId: null,
    kind: "part",
    name: item.canonicalName,
    unit: item.unit,
    aliases: item.aliases,
    observationIds: (byItem.get(item.id) ?? [])
      .filter((obs) => obs.id && obs.status === "confirmed" && obs.amountCents > 0)
      .map((obs) => obs.id!),
    range: currentRange(byItem.get(item.id) ?? [], now, freshness.get(item.categoryId) ?? PRICE_BOOK_DEFAULT_FRESHNESS_DAYS),
  }));

  const rateCandidates: PricedCandidateDTO[] = rates.map((rate) => ({
    itemId: null,
    rateId: rate.id,
    kind: rate.kind === "labor" ? "labor" : rate.kind === "transport" ? "transport" : "diagnostic",
    name: `${rate.kind}: ${rate.key}`,
    unit: "visit",
    aliases: { en: [], fr: [] },
    observationIds: [],
    range: {
      lowCents: rate.amountCents > 0 ? rate.amountCents : null,
      highCents: rate.amountCents > 0 ? rate.amountCents : null,
      weightedCents: rate.amountCents > 0 ? rate.amountCents : null,
      confidence: rate.amountCents > 0 ? 100 : 0,
      basis: rate.amountCents > 0 ? "fresh" : "none",
      observationCount: 1,
    },
  }));

  return [...itemCandidates, ...rateCandidates];
}

export function candidatePrices(candidates: PricedCandidateDTO[]) {
  return new Map(candidates.map((candidate) => [candidate.itemId ?? candidate.rateId ?? "", candidate]));
}

export interface PricedLineInsert {
  orgId: string;
  proposalId: string;
  kind: "part" | "labor" | "transport" | "diagnostic";
  itemId: string | null;
  rateId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPriceLowCents: number | null;
  unitPriceHighCents: number | null;
  lineLowCents: number | null;
  lineHighCents: number | null;
  confidence: number;
  source: { candidateId: string; source: "price_book_item" | "rate_table"; observationIds: string[]; note: string | null };
  needsManualPrice: boolean;
  stale: boolean;
}

/**
 * The model only chooses ids and quantities. Every price here comes from the
 * supplied price-book/rate table snapshot; unknown ids are hard failures.
 */
export function priceSelections(input: {
  orgId: string;
  proposalId: string;
  draft: { lines: { candidateId: string; kind: "part" | "labor" | "transport" | "diagnostic"; quantity: number; reason?: string; needsManualPrice: boolean }[] };
  candidates: PricedCandidateDTO[];
}): PricedLineInsert[] {
  const validation = validateSelections(input.draft, input.candidates);
  if (!validation.valid) throw new Error(validation.errors.join("; "));
  const prices = candidatePrices(input.candidates);
  return input.draft.lines.map((selection) => {
    const candidate = prices.get(selection.candidateId)!;
    const range = candidate.range;
    const unknown = range.lowCents === null || range.highCents === null || range.weightedCents === null;
    const needsManualPrice = selection.needsManualPrice || unknown || range.lowCents === 0 || range.highCents === 0;
    const low = unknown || needsManualPrice ? null : range.lowCents;
    const high = unknown || needsManualPrice ? null : range.highCents;
    return {
      orgId: input.orgId,
      proposalId: input.proposalId,
      kind: selection.kind,
      itemId: candidate.itemId,
      rateId: candidate.rateId,
      description: candidate.name,
      quantity: selection.quantity,
      unit: candidate.unit,
      unitPriceLowCents: low,
      unitPriceHighCents: high,
      lineLowCents: low === null ? null : low * selection.quantity,
      lineHighCents: high === null ? null : high * selection.quantity,
      confidence: range.confidence,
      source: {
        candidateId: selection.candidateId,
        source: candidate.rateId ? "rate_table" : "price_book_item",
        observationIds: candidate.observationIds,
        note: selection.reason || null,
      },
      needsManualPrice,
      stale: range.basis === "stale" || range.basis === "none",
    };
  });
}

export async function proposalDTO(orgId: string, id: string): Promise<QuoteProposalDTO | null> {
  const [proposal] = await db
    .select()
    .from(quoteProposals)
    .where(and(eq(quoteProposals.orgId, orgId), eq(quoteProposals.id, id)))
    .limit(1);
  if (!proposal) return null;
  const lines = await db
    .select()
    .from(quoteProposalLines)
    .where(and(eq(quoteProposalLines.orgId, orgId), eq(quoteProposalLines.proposalId, id)))
    .orderBy(quoteProposalLines.createdAt);
  return {
    id: proposal.id,
    orgId: proposal.orgId,
    jobId: proposal.jobId,
    status: proposal.status,
    agentRunId: proposal.agentRunId,
    lowCents: proposal.lowCents,
    highCents: proposal.highCents,
    confidence: proposal.confidence,
    assumptions: proposal.assumptions,
    missingInformation: proposal.missingInformation,
    model: proposal.model,
    reviewedBy: proposal.reviewedBy,
    reviewedAt: proposal.reviewedAt?.toISOString() ?? null,
    createdAt: proposal.createdAt.toISOString(),
    lines: lines.map((line) => ({
      id: line.id,
      proposalId: line.proposalId,
      kind: line.kind,
      itemId: line.itemId,
      rateId: line.rateId,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceLowCents: line.unitPriceLowCents,
      unitPriceHighCents: line.unitPriceHighCents,
      lineLowCents: line.lineLowCents,
      lineHighCents: line.lineHighCents,
      finalUnitPriceCents: line.finalUnitPriceCents,
      confidence: line.confidence,
      source: line.source,
      needsManualPrice: line.needsManualPrice,
      stale: line.stale,
      createdAt: line.createdAt.toISOString(),
    })),
  };
}

export async function proposalsForOrg(orgId: string, status?: "draft" | "approved" | "rejected" | "superseded") {
  const rows = await db
    .select()
    .from(quoteProposals)
    .where(status ? and(eq(quoteProposals.orgId, orgId), eq(quoteProposals.status, status)) : eq(quoteProposals.orgId, orgId))
    .orderBy(desc(quoteProposals.createdAt));
  const details = await Promise.all(rows.map((row) => proposalDTO(orgId, row.id)));
  return details.filter((detail): detail is QuoteProposalDTO => detail !== null);
}

export async function hasProposalForJob(orgId: string, jobId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: quoteProposals.id })
    .from(quoteProposals)
    .where(and(eq(quoteProposals.orgId, orgId), eq(quoteProposals.jobId, jobId)))
    .limit(1);
  return Boolean(row);
}

export async function observationIdsForItem(orgId: string, itemId: string): Promise<string[]> {
  const rows = await db
    .select({ id: priceObservations.id })
    .from(priceObservations)
    .where(and(eq(priceObservations.orgId, orgId), eq(priceObservations.itemId, itemId)))
    .orderBy(desc(priceObservations.observedAt))
    .limit(20);
  return rows.map((row) => row.id);
}

export function totalsFromLines(lines: PricedLineInsert[]) {
  return proposalTotals(lines);
}

export async function deleteObservations(ids: string[]) {
  if (!ids.length) return;
  await db.delete(priceObservations).where(inArray(priceObservations.id, ids));
}
