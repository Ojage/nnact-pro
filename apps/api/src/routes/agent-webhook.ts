import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, eq, gte } from "drizzle-orm";
import { db, agentMedia, conversations, messages } from "@nnact/db";
import { normalizePhone } from "@nnact/shared";
import { detectLanguage, detectSafetyFlags, notifySafetyFlag } from "../agent/intake.js";
import { storeAgentMedia } from "../agent/media-storage.js";
import { downloadWhatsappMedia, getWhatsappConfig, verifyWhatsappSignature } from "../agent/whatsapp.js";
import type { AgentMessageMediaRef } from "@nnact/db";

const orgParam = z.string().uuid();
const MAX_PER_SENDER_PER_HOUR = 20;

interface WhatsAppMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string; mime_type?: string };
  audio?: { id?: string; mime_type?: string };
}

/** Meta sends the same event on retries: dedupe on the WhatsApp message id. */
export async function whatsappWebhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  const paths = ["/agent/webhooks/whatsapp/:orgId", "/webhooks/whatsapp/:orgId"];

  for (const path of paths) {
    app.get(path, async (req, reply) => {
      const orgId = orgParam.parse((req.params as { orgId: string }).orgId);
      const query = req.query as Record<string, string | undefined>;
      const mode = query["hub.mode"];
      const challenge = query["hub.challenge"];
      const token = query["hub.verify_token"];
      const config = await getWhatsappConfig(orgId);
      if (!config || mode !== "subscribe" || !challenge || token !== config.verifyToken) {
        return reply.code(403).send({ error: "verification failed" });
      }
      return reply.type("text/plain").send(challenge);
    });

    app.post(path, async (req, reply) => {
      const orgId = orgParam.parse((req.params as { orgId: string }).orgId);
      const config = await getWhatsappConfig(orgId);
      if (!config) return reply.code(501).send({ error: "whatsapp is not configured for this organization" });
      const raw = req.body as Buffer;
      try {
        const header = req.headers["x-hub-signature-256"];
        verifyWhatsappSignature(raw, typeof header === "string" ? header : undefined, config.appSecret);
      } catch {
        return reply.code(401).send({ error: "signature mismatch" });
      }

      let payload: unknown;
      try {
        payload = JSON.parse(raw.toString("utf8"));
      } catch {
        return reply.code(400).send({ error: "invalid_json" });
      }

      const root = payload as { object?: string; entry?: unknown[] };
      if (root.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) {
        return reply.code(200).send({ received: true, ignored: "unsupported object" });
      }

      let accepted = 0;
      let duplicates = 0;
      let limited = 0;
      for (const rawEntry of root.entry) {
        const entry = rawEntry as { changes?: unknown[] };
        for (const rawChange of entry.changes ?? []) {
          const change = rawChange as { field?: string; value?: Record<string, unknown> };
          if (change.field !== "messages" || !change.value) continue;
          const value = change.value as {
            metadata?: { phone_number_id?: string; display_phone_number?: string };
            contacts?: { wa_id?: string; profile?: { name?: string } }[];
            messages?: WhatsAppMessage[];
          };
          if (value.metadata?.phone_number_id !== config.phoneNumberId) continue;

          for (const message of value.messages ?? []) {
            const externalId = typeof message.id === "string" ? message.id : "";
            const participantPhone = normalizePhone(message.from ?? "");
            if (!externalId || !participantPhone) continue;

            const hourAgo = new Date(Date.now() - 3_600_000);
            const [{ value: recent }] = await db
              .select({ value: count() })
              .from(messages)
              .where(and(eq(messages.orgId, orgId), eq(messages.fromAddress, participantPhone), gte(messages.createdAt, hourAgo)));
            if (recent >= MAX_PER_SENDER_PER_HOUR) {
              limited += 1;
              continue;
            }

            const [conversation] = await db
              .insert(conversations)
              .values({
                orgId,
                channel: "whatsapp",
                externalId: participantPhone,
                participantPhone,
                displayName: value.contacts?.[0]?.profile?.name ?? null,
                language: "en",
              })
              .onConflictDoNothing()
              .returning();
            const row = conversation ?? (
              await db
                .select()
                .from(conversations)
                .where(and(eq(conversations.orgId, orgId), eq(conversations.externalId, participantPhone)))
                .limit(1)
            )[0];
            if (!row) continue;

            const text = message.text?.body ?? message.image?.caption ?? "";
            const language = detectLanguage(text);
            const safetyFlags = detectSafetyFlags(text);
            const sentAt = message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date();
            const [stored] = await db
              .insert(messages)
              .values({
                orgId,
                conversationId: row.id,
                externalId,
                direction: "inbound",
                fromAddress: participantPhone,
                toAddress: value.metadata?.display_phone_number ?? config.phoneNumberId,
                text: text || null,
                language,
                safetyFlags,
                rawPayload: value as Record<string, unknown>,
                sentAt: Number.isNaN(sentAt.getTime()) ? new Date() : sentAt,
              })
              .onConflictDoNothing()
              .returning();
            if (!stored) {
              duplicates += 1;
              continue;
            }
            accepted += 1;

            const mediaRefs: AgentMessageMediaRef[] = [];
            const mediaRequests: { id?: string; kind: "image" | "audio"; contentType?: string; fileName?: string | null }[] = [
              { id: message.image?.id, kind: "image", contentType: message.image?.mime_type ?? "image/jpeg", fileName: null },
              { id: message.audio?.id, kind: "audio", contentType: message.audio?.mime_type ?? "audio/ogg", fileName: null },
            ];
            for (const mediaRequest of mediaRequests) {
              if (!mediaRequest.id) continue;
              try {
                const downloaded = await downloadWhatsappMedia(mediaRequest.id, config);
                const saved = await storeAgentMedia({
                  orgId,
                  messageId: stored.id,
                  kind: mediaRequest.kind,
                  buffer: downloaded.buffer,
                  contentType: downloaded.contentType,
                  fileName: downloaded.fileName ?? mediaRequest.fileName,
                });
                const expiresAt = new Date(Date.now() + config.mediaRetentionDays * 86_400_000);
                await db.insert(agentMedia).values({
                  orgId,
                  messageId: stored.id,
                  kind: mediaRequest.kind,
                  objectKey: saved.objectKey,
                  contentType: downloaded.contentType,
                  fileName: downloaded.fileName ?? mediaRequest.fileName ?? null,
                  byteSize: saved.byteSize,
                  waMediaId: mediaRequest.id,
                  sha256: saved.sha256,
                  expiresAt,
                });
                mediaRefs.push({
                  id: saved.objectKey,
                  kind: mediaRequest.kind,
                  contentType: downloaded.contentType,
                  fileName: downloaded.fileName ?? mediaRequest.fileName ?? null,
                  waMediaId: mediaRequest.id,
                });
              } catch (error) {
                console.error(`[agent] WhatsApp media download failed: ${(error as Error).message}`);
              }
            }
            if (mediaRefs.length) {
              await db.update(messages).set({ media: mediaRefs }).where(eq(messages.id, stored.id));
            }
            await db
              .update(conversations)
              .set({
                language,
                displayName: value.contacts?.[0]?.profile?.name ?? row.displayName,
                lastMessageAt: new Date(),
                lastCustomerMessageAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(conversations.id, row.id));
            if (safetyFlags.length) {
              void notifySafetyFlag({
                orgId,
                conversationId: row.id,
                messageId: stored.id,
                flags: safetyFlags,
                customerLabel: value.contacts?.[0]?.profile?.name ?? participantPhone,
              });
            }
          }
        }
      }
      return reply.code(200).send({ received: true, accepted, duplicates, limited });
    });
  }
}
