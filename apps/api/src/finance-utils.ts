// Finance module shared helpers: concurrency-safe org numbering, role guards,
// business-settings access, and small DTO assembly utilities used by the
// finance route modules. Money is integer cents everywhere — no floats.

import { sql, eq, and, inArray } from "drizzle-orm";
import { db, orgs, users } from "@nnact/db";
import type { BusinessSettings } from "@nnact/shared";
import { mergeBusinessSettings } from "@nnact/shared";

export type FinanceTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function isOfficeRole(role: string): boolean {
  return role === "owner" || role === "dispatcher";
}

export async function orgBusinessSettingsTx(
  tx: FinanceTx,
  orgId: string,
): Promise<BusinessSettings> {
  const [org] = await tx
    .select({ businessSettings: orgs.businessSettings })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1);
  return mergeBusinessSettings(org?.businessSettings);
}

/** e.g. NNACT/EXP/2026/000123 */
export function financeSeqNumber(
  prefix: string,
  year: number,
  seq: number,
  nextNumber: number,
): string {
  return `${prefix}/${year}/${String(nextNumber + seq).padStart(6, "0")}`;
}

/**
 * Reserve + materialize an org-scoped, advisory-lock-guarded finance number in
 * one transaction (mirrors the invoice/estimate numbering pattern). The
 * transaction serializes on `finance-number:{orgId}:{lockKey}` so two
 * concurrent creates can never observe the same count.
 */
export async function withFinanceNumber<T>(
  orgId: string,
  lockKey: string,
  countRows: (tx: FinanceTx) => Promise<number>,
  selectNumbering: (
    settings: BusinessSettings,
  ) => { prefix: string; nextNumber: number },
  fn: (tx: FinanceTx, number: string) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`finance-number:${orgId}:${lockKey}`}))`,
    );
    const settings = await orgBusinessSettingsTx(tx, orgId);
    const { prefix, nextNumber } = selectNumbering(settings);
    const count = await countRows(tx);
    const number = financeSeqNumber(
      prefix,
      new Date().getUTCFullYear(),
      count,
      nextNumber,
    );
    return fn(tx, number);
  });
}

/** Map of user-id → name for a set of ids (empty array → empty map). */
export async function userNameMap(
  orgId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map();
  if (ids.length <= 500) {
    const rows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.orgId, orgId), inArray(users.id, ids)));
    return new Map(rows.map((r) => [r.id, r.name]));
  }
  const map = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.orgId, orgId), inArray(users.id, chunk)));
    for (const r of rows) map.set(r.id, r.name);
  }
  return map;
}