import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  InboundWebhookError,
  normalizeInboundPayload,
  verifyGrowthInboundSignature,
} from "../growth/inbound-webhook.js";
import { processInboundEmail } from "../growth/inbound-process.js";

const orgParam = z.string().uuid();

export async function growthInboundWebhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  app.post("/growth/webhooks/inbound/:orgId", async (req, reply) => {
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

    let email;
    try {
      email = normalizeInboundPayload(json);
    } catch (error) {
      if (error instanceof InboundWebhookError) {
        return reply.code(error.statusCode).send({ error: error.code, message: error.message });
      }
      throw error;
    }

    const result = await processInboundEmail(orgId, email, raw.toString("utf8"));
    if (result.status === "duplicate") return reply.code(200).send({ received: true, duplicate: true });
    if (result.status === "ignored") return reply.code(200).send({ received: true, ignored: result.reason });
    return reply.code(200).send({ received: true, threadId: result.threadId, messageId: result.messageId });
  });
}
