// Webhook retry worker. Re-delivers plugin_events that failed (or never landed)
// with exponential backoff, then dead-letters once MAX_ATTEMPTS is exhausted.
// Called on each background-worker tick. Idempotent and never throws.
import { and, eq, inArray, lt, lte, or, isNull } from "drizzle-orm";
import { db, plugins, pluginInstalls, pluginEvents } from "@ofp/db";
import { buildDeliveryRequest, attemptDelivery, backoffMs, MAX_ATTEMPTS } from "./delivery.js";

// Statuses eligible for (re)delivery: a transient failure, or a row that was
// journaled but whose first attempt never recorded a result (process crash).
const RETRYABLE = ["failed", "pending"];
const BATCH = 100;

export interface RetrySummary {
  due: number;
  delivered: number;
  dead: number;
}

export async function retryDueDeliveries(now: Date = new Date()): Promise<RetrySummary> {
  const summary: RetrySummary = { due: 0, delivered: 0, dead: 0 };
  try {
    const rows = await db
      .select({
        id: pluginEvents.id,
        kind: pluginEvents.kind,
        orgId: pluginEvents.orgId,
        payload: pluginEvents.payload,
        attempts: pluginEvents.attempts,
        installWebhook: pluginInstalls.webhookUrl,
        manifestWebhook: plugins.webhookUrl,
        secret: pluginInstalls.webhookSecret,
        transform: plugins.transform,
        enabled: pluginInstalls.enabled,
      })
      .from(pluginEvents)
      .innerJoin(pluginInstalls, eq(pluginEvents.installId, pluginInstalls.id))
      .innerJoin(plugins, eq(pluginInstalls.pluginId, plugins.id))
      .where(
        and(
          inArray(pluginEvents.status, RETRYABLE),
          lt(pluginEvents.attempts, MAX_ATTEMPTS),
          or(isNull(pluginEvents.nextAttemptAt), lte(pluginEvents.nextAttemptAt, now)),
        ),
      )
      .limit(BATCH);

    summary.due = rows.length;

    for (const row of rows) {
      const url = row.installWebhook ?? row.manifestWebhook;
      // Install was disabled or lost its URL since the event was queued — stop.
      if (!row.enabled || !url) {
        await db
          .update(pluginEvents)
          .set({ status: "skipped", error: !url ? "no webhook url" : "install disabled", nextAttemptAt: null })
          .where(eq(pluginEvents.id, row.id));
        continue;
      }

      const attempts = row.attempts + 1;
      const { headers, body } = buildDeliveryRequest({
        transform: row.transform,
        kind: row.kind,
        orgId: row.orgId,
        payload: row.payload,
        secret: row.secret,
      });
      const res = await attemptDelivery(url, headers, body);

      if (res.ok) {
        summary.delivered++;
        await db
          .update(pluginEvents)
          .set({ status: "delivered", attempts, responseStatus: res.status, deliveredAt: now, error: null, nextAttemptAt: null })
          .where(eq(pluginEvents.id, row.id));
      } else if (attempts >= MAX_ATTEMPTS) {
        summary.dead++;
        await db
          .update(pluginEvents)
          .set({ status: "dead", attempts, responseStatus: res.status, error: res.error, nextAttemptAt: null })
          .where(eq(pluginEvents.id, row.id));
      } else {
        await db
          .update(pluginEvents)
          .set({ status: "failed", attempts, responseStatus: res.status, error: res.error, nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)) })
          .where(eq(pluginEvents.id, row.id));
      }
    }
  } catch (err) {
    console.error("[plugin-retry] sweep failed:", err);
  }
  return summary;
}
