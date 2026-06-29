// Shared webhook delivery primitive, used by both the initial send (bus.ts) and
// the retry worker (retry.ts). Keeps the request-shaping and the HTTP attempt in
// one place so a delivery and a re-delivery are byte-identical.
import { signWebhook } from "./crypto.js";
import { isNotifyTransform, toNotificationDelivery } from "./notify-transform.js";

const DELIVERY_TIMEOUT_MS = 8_000;

// Retry policy. A delivery is attempted immediately by the bus; if it fails the
// worker re-attempts with exponential backoff until MAX_ATTEMPTS, then dead-letters.
export const MAX_ATTEMPTS = Number(process.env.PLUGIN_MAX_ATTEMPTS ?? 6);
const BASE_MS = Number(process.env.PLUGIN_RETRY_BASE_MS ?? 30_000);
const CAP_MS = Number(process.env.PLUGIN_RETRY_CAP_MS ?? 3_600_000); // 1h ceiling

/** Delay before the next attempt, given how many attempts have been made (>=1). */
export function backoffMs(attempts: number): number {
  return Math.min(CAP_MS, BASE_MS * 2 ** Math.max(0, attempts - 1));
}

export interface DeliveryParams {
  transform: string;
  kind: string;
  orgId: string;
  payload: Record<string, unknown>;
  secret: string;
}

/**
 * Build the headers + body for a delivery. Native notifiers get their target's
 * shape (unsigned — the secret URL is the credential); everything else gets the
 * HMAC-signed OFP event envelope.
 */
export function buildDeliveryRequest(p: DeliveryParams): { headers: Record<string, string>; body: string } {
  if (isNotifyTransform(p.transform)) {
    return toNotificationDelivery(p.transform, p.kind, p.payload);
  }
  const body = JSON.stringify({ kind: p.kind, orgId: p.orgId, data: p.payload, ts: Date.now() });
  return {
    headers: {
      "content-type": "application/json",
      "x-ofp-event": p.kind,
      "x-ofp-signature": signWebhook(p.secret, body),
    },
    body,
  };
}

export interface AttemptResult {
  ok: boolean;
  status: number | null; // null = transport error (timeout/DNS/refused), no HTTP response
  error: string | null;
}

/** POST a prepared request. Never throws — transport failures come back as ok:false. */
export async function attemptDelivery(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<AttemptResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    return { ok: res.ok, status: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: null, error: (e as Error).message };
  }
}
