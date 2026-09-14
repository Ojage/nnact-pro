// Comeback module shared helpers: org policy access, concurrency-safe case
// numbering, comeback-job number allocation, and small DTO assembly. Money is
// integer cents; all role logic goes through `isOfficeRole`/`verifiedClaims`.

import { sql, eq, max } from "drizzle-orm";
import { db, orgs, jobs } from "@nnact/db";
import type { BusinessSettings, ComebackSettings } from "@nnact/shared";
import { mergeBusinessSettings, DEFAULT_COMEBACK_SETTINGS } from "@nnact/shared";
import { isOfficeRole } from "./finance-utils.js";
import { jobNumber } from "./job-lifecycle.js";

export type CbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export { isOfficeRole };

/** Load the merged org business settings (comeback policy included). */
export async function orgSettings(orgId: string): Promise<BusinessSettings> {
  const [org] = await db
    .select({ businessSettings: orgs.businessSettings })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1);
  return mergeBusinessSettings(org?.businessSettings);
}

export async function orgComebackSettings(orgId: string): Promise<ComebackSettings> {
  const settings = await orgSettings(orgId);
  return settings.comeback ?? DEFAULT_COMEBACK_SETTINGS;
}

/** e.g. NNACT/RET/2026/000123 */
export function comebackSeqNumber(prefix: string, year: number, seq: number, nextNumber: number): string {
  return `${prefix}/${year}/${String(nextNumber + seq).padStart(6, "0")}`;
}

/**
 * Reserve + materialize an org-scoped, advisory-lock-guarded comeback case
 * number (mirrors the finance `withFinanceNumber` pattern).
 */
export async function withComebackNumber<T>(
  orgId: string,
  lockKey: string,
  countRows: (tx: CbTx) => Promise<number>,
  settings: BusinessSettings,
  fn: (tx: CbTx, number: string) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`comeback-number:${orgId}:${lockKey}`}))`,
    );
    const count = await countRows(tx);
    const { comebackPrefix, comebackNextNumber } = settings.numbering;
    const number = comebackSeqNumber(
      comebackPrefix,
      new Date().getUTCFullYear(),
      count,
      comebackNextNumber,
    );
    return fn(tx, number);
  });
}

/**
 * Allocate the next per-org work-order number for a comeback visit under the
 * same advisory lock + collision-proof walk as the jobs route, so comeback
 * jobs share one numbering stream with regular jobs.
 */
export async function allocateComebackJobNumberTx(tx: CbTx, orgId: string): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'job-number:' + orgId}))`);
  const settings = await orgSettings(orgId);
  const [{ maxNum }] = await tx
    .select({ maxNum: max(jobs.number) })
    .from(jobs)
    .where(eq(jobs.orgId, orgId));
  const parsed = typeof maxNum === "string" ? Number(maxNum.match(/(\d+)\s*$/)?.[1]) : NaN;
  const highest = Number.isFinite(parsed) ? parsed : settings.numbering.jobNextNumber - 1;
  const next = Math.max(highest + 1, settings.numbering.jobNextNumber);
  return jobNumber(next - settings.numbering.jobNextNumber, settings.numbering.jobPrefix, settings.numbering.jobNextNumber);
}