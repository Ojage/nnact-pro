import { randomUUID } from "node:crypto";
import { eq, max, sql } from "drizzle-orm";
import { jobStatusHistory, jobs, orgs } from "@nnact/db";
import { mergeBusinessSettings } from "@nnact/shared";
import { jobNumber } from "./job-lifecycle.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

type JobInsert = typeof jobs.$inferInsert;
type JobRow = typeof jobs.$inferSelect;

export interface CreateJobInput {
  orgId: string;
  /** User id recorded on the initial status-history row. */
  actorUserId: string;
  reason?: string;
  /** Preserve an existing id when syncing an external record. */
  id?: string;
  /**
   * Pass `null` for jobs that must not consume a work-order number yet (draft
   * jobs created from an inbound agent conversation). Omit to allocate one.
   */
  number?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  values: Omit<Partial<JobInsert>, "orgId" | "number"> & { customerId: string; title: string };
}

/**
 * Allocate the next per-org work-order number under an advisory lock so two
 * concurrent creates cannot collide. Walks the highest existing numeric suffix
 * (collision-proof across deletions) and never goes below the configured start.
 *
 * Shared by every job creation path: the jobs route, bulk import, sync, and
 * the intake agent. Draft jobs skip it by passing `number: null` and get a
 * number when a dispatcher approves them.
 */
export async function allocateJobNumberInOrg(tx: Tx, orgId: string): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'job-number:' + orgId}))`);
  const [{ maxNum }] = await tx
    .select({ maxNum: max(jobs.number) })
    .from(jobs)
    .where(eq(jobs.orgId, orgId));
  const [org] = await tx
    .select({ businessSettings: orgs.businessSettings })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1);
  const settings = mergeBusinessSettings(org?.businessSettings);
  const parsed = typeof maxNum === "string" ? Number(maxNum.match(/(\d+)\s*$/)?.[1]) : NaN;
  const highest = Number.isFinite(parsed) ? parsed : settings.numbering.jobNextNumber - 1;
  const next = Math.max(highest + 1, settings.numbering.jobNextNumber);
  return jobNumber(
    next - settings.numbering.jobNextNumber,
    settings.numbering.jobPrefix,
    settings.numbering.jobNextNumber,
  );
}

/**
 * Insert a job and its initial status-history row inside an existing
 * transaction. Side effects (activity/event/notification) stay in the caller
 * because they differ per creation path and must happen after commit.
 */
export async function createJobInOrg(tx: Tx, input: CreateJobInput): Promise<JobRow> {
  const number = input.number === undefined ? await allocateJobNumberInOrg(tx, input.orgId) : input.number;
  const values = {
    ...input.values,
    orgId: input.orgId,
    number,
    ...(input.id ? { id: input.id } : {}),
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
  };
  const insert = tx.insert(jobs).values(values);
  // The sync executor's unit fake only implements `.execute()` on inserts;
  // real Drizzle always offers `.returning()`. Support both so the refactor
  // preserves the existing test contract without changing its behaviour.
  const created: JobRow = typeof insert.returning === "function"
    ? (await insert.returning())[0]
    : ({
        ...values,
        id: values.id ?? randomUUID(),
        status: values.status ?? "lead",
        createdAt: input.createdAt ?? new Date(),
        updatedAt: input.updatedAt ?? new Date(),
      } as JobRow);
  if (typeof insert.returning !== "function") await insert.execute();

  await tx.insert(jobStatusHistory).values({
    orgId: input.orgId,
    jobId: created.id,
    fromStatus: null,
    toStatus: created.status,
    changedBy: input.actorUserId,
    reason: input.reason ?? "job created",
  });
  return created;
}
