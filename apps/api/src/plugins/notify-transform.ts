// Native notifier transforms. First-party notifier plugins (Slack/Discord/ntfy)
// don't speak the OFP event envelope — they want a human-readable message in
// their own shape. These pure helpers turn an event into the right delivery
// request so the bus can POST it directly to the user's incoming webhook.
//
// Pure + deterministic (no Date.now, no signing) → unit-testable.
import { formatMoney } from "@ofp/shared";

export type NotifyTransform = "slack" | "discord" | "ntfy";

export interface DeliveryRequest {
  headers: Record<string, string>;
  body: string;
}

/** Is this plugin a native notifier (vs the default signed-envelope delivery)? */
export function isNotifyTransform(t: string): t is NotifyTransform {
  return t === "slack" || t === "discord" || t === "ntfy";
}

const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** A short human-readable line describing the event. */
export function formatNotification(kind: string, data: Record<string, unknown>): string {
  switch (kind) {
    case "job.created":
      return `🆕 New job: ${str(data.title) || "untitled"}`;
    case "job.updated":
      return `✏️ Job updated: ${str(data.title) || str(data.id)}`;
    case "invoice.created":
      return `🧾 Invoice ${str(data.number)} created — ${formatMoney(num(data.total))}`;
    case "invoice.paid":
      return `✅ Invoice ${str(data.number)} paid — ${formatMoney(num(data.total))}`;
    case "payment.received":
      return `💵 Payment ${formatMoney(num(data.amount))} (${str(data.method) || "manual"}) on ${str(data.number)}`;
    case "customer.created":
      return `👤 New customer: ${str(data.name) || str(data.id)}`;
    case "estimate.accepted":
      return `📝 Estimate accepted — ${formatMoney(num(data.total))}`;
    default:
      return `OpenFieldPro: ${kind}`;
  }
}

/** Short title for channels that support one (ntfy). */
export function titleFor(kind: string): string {
  return `OpenFieldPro · ${kind}`;
}

/**
 * Build the delivery request body+headers for a native notifier target. The URL
 * is the user's own incoming webhook (Slack/Discord) or ntfy topic endpoint, so
 * no OFP signature is attached — the secret URL is the credential.
 */
export function toNotificationDelivery(
  transform: NotifyTransform,
  kind: string,
  data: Record<string, unknown>,
): DeliveryRequest {
  const message = formatNotification(kind, data);
  switch (transform) {
    case "slack":
      return { headers: { "content-type": "application/json" }, body: JSON.stringify({ text: message }) };
    case "discord":
      return { headers: { "content-type": "application/json" }, body: JSON.stringify({ content: message }) };
    case "ntfy":
      return {
        headers: { "content-type": "text/plain", Title: titleFor(kind) },
        body: message,
      };
  }
}
