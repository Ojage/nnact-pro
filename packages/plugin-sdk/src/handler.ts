// Framework-agnostic webhook handler. Hands you a function that takes the raw
// request body + the `x-ofp-signature` header and returns the HTTP status your
// endpoint should reply with — verifying the signature (and rejecting replays)
// before your `onEvent` ever sees the payload.
import { verifyWebhook } from "./webhook.js";
import type { PluginEventEnvelope } from "./events.js";

export interface WebhookHandlerOptions {
  /** The install's webhook signing secret (whsec_…). */
  secret: string;
  /** Your handler. Throwing yields a 500 so OFP records the delivery as failed. */
  onEvent: (event: PluginEventEnvelope) => void | Promise<void>;
  /** Replay tolerance in ms (default 5 min). 0 disables the time check. */
  toleranceMs?: number;
}

export interface WebhookResult {
  ok: boolean;
  status: number;
  error?: string;
}

export function createWebhookHandler(opts: WebhookHandlerOptions) {
  return async (rawBody: string, signatureHeader: string | undefined): Promise<WebhookResult> => {
    if (!signatureHeader) return { ok: false, status: 401, error: "missing signature" };
    if (!verifyWebhook(opts.secret, rawBody, signatureHeader, opts.toleranceMs)) {
      return { ok: false, status: 401, error: "invalid signature" };
    }
    let event: PluginEventEnvelope;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return { ok: false, status: 400, error: "invalid json" };
    }
    try {
      await opts.onEvent(event);
    } catch (e) {
      return { ok: false, status: 500, error: (e as Error).message };
    }
    return { ok: true, status: 200 };
  };
}
