import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { InboundWebhookError, verifyGrowthInboundSignature } from "../growth/inbound-webhook.js";
import {
  isPermanentBounce,
  processDeliverabilityEvent,
  type DeliverabilityEventKind,
  type NormalizedDeliverabilityEvent,
} from "../growth/deliverability.js";

const orgParam = z.string().uuid();

/** Accepts a Resend-style or generic JSON deliverability payload. */
function normalizeDeliverabilityPayload(json: unknown): NormalizedDeliverabilityEvent {
  if (!json || typeof json !== "object") {
    throw new InboundWebhookError("invalid payload", "invalid_payload");
  }
  const rec = json as Record<string, unknown>;
  const data = (rec.data && typeof rec.data === "object" ? rec.data : rec) as Record<string, unknown>;

  const externalId = String(data.id ?? data.event_id ?? rec.id ?? "");
  if (!externalId) throw new InboundWebhookError("missing event id", "missing_event_id");

  const to = data.to;
  const recipient = Array.isArray(to) ? to[0] : (data.email ?? data.recipient ?? to);
  const email = typeof recipient === "string" ? recipient : "";
  if (!email.includes("@")) {
    throw new InboundWebhookError("missing recipient address", "missing_recipient");
  }

  const type = String(data.type ?? data.event ?? rec.type ?? "").toLowerCase();
  let kind: DeliverabilityEventKind;
  if (type.includes("complaint") || type.includes("spam")) {
    kind = "COMPLAINT";
  } else if (type.includes("bounce") || type.includes("bounced") || type.includes("failed")) {
    kind = "HARD_BOUNCE";
  } else {
    throw new InboundWebhookError(`unsupported event type "${type}"`, "unsupported_event");
  }

  const bounce = data.bounce;
  const reasonRaw = (bounce && typeof bounce === "object" ? (bounce as Record<string, unknown>).message : undefined)
    ?? data.reason
    ?? data.error
    ?? data.message;
  const reason = reasonRaw == null ? undefined : String(reasonRaw);

  const tags = data.tags;
  const campaignIdRaw = (tags && typeof tags === "object" ? (tags as Record<string, unknown>).campaign_id : undefined)
    ?? data.campaign_id;
  const campaignId = typeof campaignIdRaw === "string" && campaignIdRaw ? campaignIdRaw : null;

  return {
    provider: String(rec.source ?? data.provider ?? "unknown"),
    externalId,
    kind,
    email,
    reason,
    campaignId,
    // A complaint is always actionable. A bounce is only actionable when it is
    // permanent — soft bounces are retried by the ESP and must not suppress.
    isPermanent: kind === "COMPLAINT" || isPermanentBounce(reason),
  };
}

export async function growthDeliverabilityWebhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  app.post("/growth/webhooks/deliverability/:orgId", async (req, reply) => {
    const orgId = orgParam.parse((req.params as { orgId: string }).orgId);
    const secret = process.env.GROWTH_INBOUND_WEBHOOK_SECRET ?? "";
    const signature = req.headers["x-growth-webhook-signature"];
    const raw = req.body as Buffer;

    try {
      verifyGrowthInboundSignature(raw, typeof signature === "string" ? signature : undefined, secret);
    } catch (error) {
      if (error instanceof InboundWebhookError) {
        return reply.code(error.statusCode).send({ error: error.code, message: error.message });
      }
      throw error;
    }

    let json: unknown;
    try {
      json = JSON.parse(raw.toString("utf8"));
    } catch {
      return reply.code(400).send({ error: "invalid_json" });
    }

    let event: NormalizedDeliverabilityEvent;
    try {
      event = normalizeDeliverabilityPayload(json);
    } catch (error) {
      if (error instanceof InboundWebhookError) {
        return reply.code(error.statusCode).send({ error: error.code, message: error.message });
      }
      throw error;
    }

    const result = await processDeliverabilityEvent(orgId, event, raw.toString("utf8"));
    if (result.status === "duplicate") return reply.code(200).send({ received: true, duplicate: true });
    if (result.status === "ignored") return reply.code(200).send({ received: true, ignored: result.reason });
    return reply.code(200).send({
      received: true,
      kind: event.kind,
      suppressed: result.suppressed,
      recipientsStopped: result.recipientsStopped,
    });
  });
}
