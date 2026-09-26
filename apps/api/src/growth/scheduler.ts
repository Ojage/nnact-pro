// The growth scheduler.
//
// Finds campaigns that are due and runs them through the same executor the
// manual Run button uses, so a scheduled send and a clicked send are not two
// different code paths with two different sets of rules.
//
// The API can run more than one replica, which makes two things a problem:
//
//   1. The daily cap is read-then-send. Without a lock, two replicas can each
//      read "49 sent today" and each send, quietly exceeding the cap. The
//      advisory lock below makes the read and the send a single tick.
//   2. Without the lock both replicas would do the same work twice. The
//      per-recipient idempotency key would stop the second attempt from
//      sending, so this is wasted effort rather than a duplicate email — but
//      the lock avoids it.
//
// pg_try_advisory_lock is session-scoped and non-blocking, which suits a tick:
// the instance that gets the lock does the work, the others move on. The lock
// is released at the end of the tick.

import { eq, inArray, lte, or, and, sql } from "drizzle-orm";
import { db, growthCampaigns } from "@nnact/db";
import { runCampaignSend } from "./outbound.js";

/** Arbitrary but stable key so only this scheduler contends for this lock. */
const ADVISORY_LOCK_KEY = 8_147_230_551_002_001n;

export interface SchedulerResult {
  ranCampaigns: number;
  sent: number;
  suppressed: number;
  blocked: number;
  skipped: number;
  failed: number;
  /** Campaigns that were due but refused, with the reason. */
  refusals: { campaignId: string; code: string; message: string }[];
  /** True when another replica held the lock and this tick did nothing. */
  lockUnavailable: boolean;
}

export interface TickOptions {
  /** Per-campaign recipient budget for this tick. */
  limit?: number;
  now?: Date;
  /** Maximum campaigns to process in one tick. */
  maxCampaigns?: number;
}

/** Returns the org ids that have a campaign due to run. */
export async function findDueCampaigns(now: Date, maxCampaigns: number) {
  // Distinct orgs that have a campaign in a sendable state and are due.
  const due = await db
    .selectDistinct({ orgId: growthCampaigns.orgId })
    .from(growthCampaigns)
    .where(
      and(
        inArray(growthCampaigns.status, ["SCHEDULED", "RUNNING"]),
        or(
          sql`${growthCampaigns.scheduledStartAt} is null`,
          lte(growthCampaigns.scheduledStartAt, now),
        ),
      ),
    )
    .limit(maxCampaigns);
  return due.map((d) => d.orgId);
}

export async function tickGrowthCampaigns(options: TickOptions = {}): Promise<SchedulerResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 100;
  const maxCampaigns = options.maxCampaigns ?? 25;

  const result: SchedulerResult = {
    ranCampaigns: 0,
    sent: 0,
    suppressed: 0,
    blocked: 0,
    skipped: 0,
    failed: 0,
    refusals: [],
    lockUnavailable: false,
  };

  // One replica at a time. If the lock is held elsewhere, this tick is a no-op.
  const lockRows = await db.execute<{ locked: boolean }>(
    sql`select pg_try_advisory_lock(${ADVISORY_LOCK_KEY}::bigint) as locked`,
  );
  const locked = Boolean((lockRows as unknown as { locked: boolean }[])?.[0]?.locked);
  if (!locked) {
    result.lockUnavailable = true;
    return result;
  }

  try {
    const orgIds = await findDueCampaigns(now, maxCampaigns);
    for (const orgId of orgIds) {
      const campaigns = await db
        .select({ id: growthCampaigns.id })
        .from(growthCampaigns)
        .where(
          and(
            eq(growthCampaigns.orgId, orgId),
            inArray(growthCampaigns.status, ["SCHEDULED", "RUNNING"]),
            or(
              sql`${growthCampaigns.scheduledStartAt} is null`,
              lte(growthCampaigns.scheduledStartAt, now),
            ),
          ),
        )
        .limit(maxCampaigns);

      for (const campaign of campaigns) {
        const run = await runCampaignSend({ orgId, campaignId: campaign.id, limit, now });
        if (run.refusal) {
          result.refusals.push({
            campaignId: campaign.id,
            code: run.refusal.code,
            message: run.refusal.message,
          });
          continue;
        }
        result.ranCampaigns += 1;
        result.sent += run.sent;
        result.suppressed += run.suppressed;
        result.blocked += run.blocked;
        result.skipped += run.skipped;
        result.failed += run.failed;
      }
    }
    return result;
  } finally {
    await db.execute(sql`select pg_advisory_unlock(${ADVISORY_LOCK_KEY}::bigint)`);
  }
}

export interface StartedScheduler {
  stop: () => void;
}

/**
 * Starts the interval tick. Returns a handle so tests and graceful shutdown can
 * stop it. The interval is unref'd so a pending tick never holds the process
 * open during shutdown.
 */
export function startGrowthScheduler(intervalMs: number, options: TickOptions = {}): StartedScheduler {
  const timer = setInterval(() => {
    void tickGrowthCampaigns(options).catch((error: unknown) => {
      // A tick failure must not kill the interval; log and try again next time.
      console.error("[growth] scheduler tick failed", error);
    });
  }, intervalMs);
  timer.unref?.();
  return {
    stop: () => clearInterval(timer),
  };
}
