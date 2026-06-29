// Plugin event bus. Domain code calls `safeEmitEvent` at meaningful moments
// (job created, invoice paid…). The bus fans the event out to every ENABLED
// install in the org whose manifest subscribes to that event kind, journaling
// each delivery in `plugin_events` and POSTing an HMAC-signed payload to the
// install's webhook.
//
// Mirrors `safeEmitActivity`: fire-and-forget, never throws. A flaky third-party
// integration must never break the user-visible action that triggered it.
import { and, eq } from "drizzle-orm";
import { db, plugins, pluginInstalls, pluginEvents } from "@ofp/db";
import { signWebhook } from "./crypto.js";

// Canonical event vocabulary. Keep manifest `events` arrays drawn from this set.
export const PLUGIN_EVENTS = [
  "job.created",
  "job.updated",
  "invoice.created",
  "invoice.paid",
  "payment.received",
  "customer.created",
  "estimate.accepted",
] as const;
export type PluginEventKind = (typeof PLUGIN_EVENTS)[number];

const DELIVERY_TIMEOUT_MS = 8_000;

interface InstallRow {
  installId: string;
  webhookUrl: string | null;
  manifestWebhook: string | null;
  secret: string;
  events: string[];
}

/**
 * Publish a domain event to all subscribed, enabled installs in `orgId`.
 * Fire-and-forget — callers do not await delivery. Never throws.
 */
export async function safeEmitEvent(
  orgId: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const installs: InstallRow[] = await db
      .select({
        installId: pluginInstalls.id,
        webhookUrl: pluginInstalls.webhookUrl,
        manifestWebhook: plugins.webhookUrl,
        secret: pluginInstalls.webhookSecret,
        events: plugins.events,
      })
      .from(pluginInstalls)
      .innerJoin(plugins, eq(pluginInstalls.pluginId, plugins.id))
      .where(and(eq(pluginInstalls.orgId, orgId), eq(pluginInstalls.enabled, true)));

    // ponytail: subscription filter runs in JS — the install set per org is
    // small. Ceiling: thousands of installs/org. Upgrade: filter with a
    // `kind = ANY(plugins.events)` SQL predicate.
    await Promise.all(
      installs
        .filter((i) => i.events.includes(kind))
        .map((i) => deliver(orgId, i, kind, payload)),
    );
  } catch (err) {
    console.error(`[plugin-bus] emit failed (kind=${kind}):`, err);
  }
}

async function deliver(
  orgId: string,
  install: InstallRow,
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // Journal first so there is a record even if delivery never lands.
  const [evt] = await db
    .insert(pluginEvents)
    .values({ orgId, installId: install.installId, kind, payload, status: "pending" })
    .returning({ id: pluginEvents.id });

  const url = install.webhookUrl ?? install.manifestWebhook;
  if (!url) {
    await db
      .update(pluginEvents)
      .set({ status: "skipped", error: "no webhook url configured" })
      .where(eq(pluginEvents.id, evt.id));
    return;
  }

  const body = JSON.stringify({ kind, orgId, data: payload, ts: Date.now() });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ofp-event": kind,
        "x-ofp-signature": signWebhook(install.secret, body),
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    await db
      .update(pluginEvents)
      .set({
        status: res.ok ? "delivered" : "failed",
        attempts: 1,
        responseStatus: res.status,
        deliveredAt: res.ok ? new Date() : null,
        error: res.ok ? null : `HTTP ${res.status}`,
      })
      .where(eq(pluginEvents.id, evt.id));
  } catch (e) {
    await db
      .update(pluginEvents)
      .set({ status: "failed", attempts: 1, error: (e as Error).message })
      .where(eq(pluginEvents.id, evt.id));
  }
}
