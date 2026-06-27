// Unified activity-log emitter. Callers go through this so the schema is
// written consistently. Never throws — the originating action (billing,
// scheduling) must not fail just because logging missed a beat.
//
// Canonical `kind` vocabulary (mirrors packages/db/src/schema.ts comment):
//   job.created, line_item.added, line_item.removed, invoice.created,
//   payment.received, appointment.scheduled, note.added
//
// Pass either customerId or jobId (or both). If only jobId is given the
// emitter auto-resolves the customerId via a cheap select, so the customer
// timeline page stays complete without callers having to re-look it up.
import { eq } from "drizzle-orm";
import { db, activities, jobs } from "@ofp/db";

export interface ActivityRefs {
  customerId?: string | null;
  jobId?: string | null;
}

export async function safeEmitActivity(
  orgId: string,
  kind: string,
  summary: string,
  refs: ActivityRefs = {},
): Promise<void> {
  try {
    let { customerId, jobId } = refs;
    if (jobId && !customerId) {
      const [job] = await db
        .select({ customerId: jobs.customerId })
        .from(jobs)
        .where(eq(jobs.id, jobId));
      if (job) customerId = job.customerId;
    }
    await db.insert(activities).values({
      orgId,
      customerId: customerId ?? null,
      jobId: jobId ?? null,
      kind,
      summary,
    });
  } catch (err) {
    // ponytail: activity logging is best-effort; never block the user-visible
    // action on a side-channel write. Ceiling: if/when audit-grade guarantees
    // are required, swap to a transactional outbox + worker consumer.
    console.error(`[activities] emit failed (kind=${kind}):`, err);
  }
}
