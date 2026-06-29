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
import { buildDeliveryRequest, attemptDelivery, backoffMs, MAX_ATTEMPTS } from "./delivery.js";

// Canonical event vocabulary lives in the SDK so emitter and receivers share one
// contract; re-exported for internal callers.
export { PLUGIN_EVENTS, type PluginEventKind } from "@ofp/plugin-sdk";

interface InstallRow {
  installId: string;
  webhookUrl: string | null;
  manifestWebhook: string | null;
  secret: string;
  events: string[];
  transform: string;
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
        transform: plugins.transform,
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

  // First attempt happens inline so notifications are instant. On failure we set
  // next_attempt_at; the retry worker (plugins/retry.ts) takes it from there.
  const { headers, body } = buildDeliveryRequest({
    transform: install.transform,
    kind,
    orgId,
    payload,
    secret: install.secret,
  });
  const res = await attemptDelivery(url, headers, body);
  await db
    .update(pluginEvents)
    .set(
      res.ok
        ? { status: "delivered", attempts: 1, responseStatus: res.status, deliveredAt: new Date(), error: null }
        : {
            status: 1 >= MAX_ATTEMPTS ? "dead" : "failed",
            attempts: 1,
            responseStatus: res.status,
            error: res.error,
            nextAttemptAt: 1 >= MAX_ATTEMPTS ? null : new Date(Date.now() + backoffMs(1)),
          },
    )
    .where(eq(pluginEvents.id, evt.id));
}
