import { sql } from "drizzle-orm";
import {
  db,
  estimateOptionLineItems,
  estimateOptions,
  estimates,
  jobs,
  orgs,
} from "@nnact/db";
import { mergeBusinessSettings } from "@nnact/shared";
import { defaultEstimateExpiresAt, estimateNumber } from "./estimates.js";
import { buildPricingSnapshot } from "./pricing.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface EstimateCreationLine {
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost?: number;
  unit?: string | null;
}

/**
 * The single creation path for customer-facing estimates. Quote approval
 * promotes reviewed proposal lines through this function; no ranges, scores,
 * or provenance are carried into the estimate or its documents.
 */
export async function createEstimateInOrg(
  tx: Tx,
  input: { orgId: string; jobId: string; lines: EstimateCreationLine[]; scope?: string | null; subtotalCents?: number },
) {
  const [job] = await tx.select().from(jobs).where(sql`${jobs.orgId} = ${input.orgId} and ${jobs.id} = ${input.jobId}`).limit(1);
  if (!job) return null;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"estimate-number:" + input.orgId}))`);
  const [org] = await tx.select({ businessSettings: orgs.businessSettings }).from(orgs).where(sql`${orgs.id} = ${input.orgId}`).limit(1);
  const settings = mergeBusinessSettings(org?.businessSettings);
  const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(estimates).where(sql`${estimates.orgId} = ${input.orgId}`);
  const subtotal = input.subtotalCents ?? input.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const pricing = buildPricingSnapshot(settings, subtotal);
  const [estimate] = await tx.insert(estimates).values({
    orgId: input.orgId,
    jobId: job.id,
    number: estimateNumber(count, settings.numbering.estimatePrefix, settings.numbering.estimateNextNumber),
    total: pricing.total,
    pricing,
    expiresAt: defaultEstimateExpiresAt(settings.estimate.expirationDays),
    status: "draft",
    scope: input.scope ?? null,
  }).returning();
  const optionLabels = settings.estimate.approvalMode === "single_option"
    ? [settings.estimate.singleOptionLabel || "Recommended solution"]
    : settings.estimate.optionLabels;
  const options = await tx.insert(estimateOptions).values(optionLabels.map((label, position) => ({
    orgId: input.orgId,
    estimateId: estimate.id,
    label,
    position,
    total: pricing.total,
    pricing,
  }))).returning();
  if (input.lines.length) {
    await tx.insert(estimateOptionLineItems).values(options.flatMap((option) => input.lines.map((line) => ({
      orgId: input.orgId,
      optionId: option.id,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      unitCost: line.unitCost ?? 0,
      unit: line.unit ?? null,
    }))));
  }
  return estimate;
}
