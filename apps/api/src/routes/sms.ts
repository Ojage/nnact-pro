import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { cameroonCarrier, cameroonCarrierLabel, isValidCameroonMobile, normalizePhone } from "@nnact/shared";
import { verifiedClaims } from "../operational-authorization.js";
import { etechKeysSettingsStore } from "../sms/etech-keys-store.js";
import { etechKeysService } from "../sms/etech-keys.js";
import { sendTestSms, isSmsConfigured } from "../sms/sms.js";
import { SmsError } from "../sms/types.js";

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80).default("default"),
  baseUrl: z.string().trim().min(1).max(300).optional(),
  legacyBaseUrl: z.string().trim().min(1).max(300).optional(),
  username: z.string().trim().max(120).nullable().optional(),
  password: z.string().trim().max(320).nullable().optional(),
  apiKey: z.string().trim().max(320).nullable().optional(),
  senderId: z.string().trim().max(80).nullable().optional(),
  isActive: z.boolean().optional(),
});

const testSchema = z.object({
  to: z.string().trim().min(1).max(40),
  message: z.string().trim().min(1).max(160).optional(),
});

function mask(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

export async function smsAdminRoutes(app: FastifyInstance) {
  async function requireOwner(req: Parameters<typeof verifiedClaims>[0], reply: Parameters<typeof verifiedClaims>[1]) {
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return null;
    if (claims.role !== "owner") {
      reply.code(403).send({ error: "only owners can manage SMS settings" });
      return null;
    }
    return claims;
  }

  app.get("/sms/settings", async (req, reply) => {
    const claims = await requireOwner(req, reply);
    if (!claims) return;

    const rows = await etechKeysSettingsStore.findAll();
    return {
      configured: isSmsConfigured(),
      provider: "etechkeys",
      settings: rows.map((row) => ({
        id: row.id,
        name: row.name,
        baseUrl: row.baseUrl,
        legacyBaseUrl: row.legacyBaseUrl,
        username: row.username,
        usernameMasked: mask(row.username),
        passwordMasked: mask(row.password),
        apiKeyMasked: mask(row.apiKey),
        senderId: row.senderId,
        isActive: row.isActive,
        providerType: row.providerType,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    };
  });

  app.post("/sms/settings", async (req, reply) => {
    const claims = await requireOwner(req, reply);
    if (!claims) return;

    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const existing = await etechKeysSettingsStore.findActive();
    if (existing) {
      const updated = await etechKeysSettingsStore.update(existing.id, parsed.data);
      etechKeysService.resetTokenCache();
      return { id: updated!.id, ok: true };
    }

    const row = await etechKeysSettingsStore.create(parsed.data);
    etechKeysService.resetTokenCache();
    return reply.code(201).send({ id: row.id, ok: true });
  });

  app.patch<{ Params: { id: string } }>("/sms/settings/:id", async (req, reply) => {
    const claims = await requireOwner(req, reply);
    if (!claims) return;

    const parsed = settingsSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const row = await etechKeysSettingsStore.findById(req.params.id);
    if (!row) return reply.code(404).send({ error: "settings not found" });

    const updated = await etechKeysSettingsStore.update(req.params.id, parsed.data);
    etechKeysService.resetTokenCache();
    return { id: updated!.id, ok: true };
  });

  app.post("/sms/providers/etechkeys/refresh", async (req, reply) => {
    const claims = await requireOwner(req, reply);
    if (!claims) return;
    await etechKeysService.onModuleInit();
    return { ok: true, configured: isSmsConfigured() };
  });

  app.post("/sms/test", async (req, reply) => {
    const claims = await requireOwner(req, reply);
    if (!claims) return;

    const parsed = testSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "A phone number is required." });
    }

    const { to, message } = parsed.data;
    const normalized = normalizePhone(to);
    if (!isValidCameroonMobile(normalized)) {
      return reply.code(400).send({
        error: "Enter a valid Cameroon mobile number (MTN, Orange or Camtel), e.g. 670 12 34 56.",
      });
    }

    const active = await etechKeysSettingsStore.resolve();
    const hasAuth = Boolean((active.username && active.password) || active.apiKey);
    if (!hasAuth || !active.isActive) {
      return reply.code(400).send({ error: "SMS is not configured yet. Save provider credentials first." });
    }

    await etechKeysService.onModuleInit();
    const body = message ?? `This is a test message from ${active.senderId ?? "NNACT"}. If you received this, SMS is working end to end.`;

    try {
      const result = await sendTestSms(normalized, body);
      const carrier = cameroonCarrier(normalized);
      return {
        ok: true,
        provider: result.provider,
        to: normalized,
        carrier,
        carrierLabel: carrier ? cameroonCarrierLabel(carrier) : null,
        smsId: result.id ?? null,
        creditsUsed: result.creditsUsed ?? null,
        message: body,
      };
    } catch (error) {
      if (error instanceof SmsError) return reply.code(error.statusCode).send({ error: error.message });
      return reply.code(502).send({ error: error instanceof Error ? error.message : "Failed to send test SMS." });
    }
  });
}