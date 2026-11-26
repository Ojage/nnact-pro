import { and, isNull, ne, type SQL } from "drizzle-orm";
import { jobs } from "@nnact/db";

/**
 * AI drafts are a separate office review queue. They must not appear in the
 * normal job list, counters, reports, customer portal, or technician app.
 * Rejected drafts are kept only in that review queue for audit.
 */
export function visibleJobsWhere<T extends SQL | undefined>(condition?: T): SQL | undefined {
  const visible = and(ne(jobs.status, "draft"), isNull(jobs.agentRejectedAt));
  return condition ? and(visible, condition) : visible;
}

export function isHiddenDraftJob(job: { status: string; agentRejectedAt?: Date | string | null }): boolean {
  return job.status === "draft" || Boolean(job.agentRejectedAt);
}
