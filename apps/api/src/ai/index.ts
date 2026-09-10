// AI admin routes — settings, provider configuration + probing, health, run
// history, usage metering, the reserve pool, and one-shot manual triggers. All
// staff-authenticated and org-scoped. API keys are never returned once stored.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AI_PROVIDERS, AI_SLOTS, AI_RUN_STATES } from "@nnact/shared";
import type { AiProviderId } from "@nnact/shared";
import { verifiedClaims } from "../operational-authorization.js";
import { resolveOrgId } from "../routes/org.js";
import { createAutomationEngine } from "./engine.js";

const providerParam = z.object({ provider: z.string() });
const providerBody = z.object({
  enabled: z.boolean().optional(),
  apiKey: z.string().min(1).max(2000).optional().nullable(),
  defaultTextModel: z.string().nullable().optional(),
  defaultImageModel: z.string().nullable().optional(),
  timeoutMs: z.number().int().min(1_000).max(120_000).optional(),
  priority: z.number().int().min(0).max(999).optional(),
  options: z.record(z.unknown()).optional(),
});

const settingsBody = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(["AUTO_PUBLISH_WITH_GUARDRAILS", "DRAFT_ONLY", "RESERVE_ONLY"]).optional(),
  timezone: z.string().min(1).max(64).optional(),
  morningTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  eveningTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  enabledDays: z.array(z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"])).optional(),
  channels: z.array(z.enum(["WEBSITE", "LINKEDIN"])).optional(),
  textProviderOrder: z.array(z.enum(AI_PROVIDERS)).optional(),
  imageProvider: z.enum(AI_PROVIDERS).nullable().optional(),
  reviewProvider: z.enum(AI_PROVIDERS).nullable().optional(),
  reserveEnabled: z.boolean().optional(),
  reserveTarget: z.number().int().min(0).max(50).optional(),
  qualityThreshold: z.number().min(0).max(100).optional(),
  catchUpWindowMinutes: z.number().int().min(0).max(60 * 24).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  maxImagesPerSlot: z.number().int().min(0).max(10).optional(),
  maxAiCallsPerSlot: z.number().int().min(0).max(200).optional(),
  dailyBudgetCents: z.number().int().min(0).optional(),
  monthlyBudgetCents: z.number().int().min(0).optional(),
});

const triggerBody = z.object({
  isoDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.enum(AI_SLOTS),
});

const runQuery = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
  state: z.enum(AI_RUN_STATES).optional(),
});

async function staffGate(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  return Boolean(await verifiedClaims(request, reply));
}

export async function aiRoutes(app: FastifyInstance) {
  const engine = createAutomationEngine();

  app.get("/settings", async (req, reply) => {
    if (!(await staffGate(req, reply))) return;
    return engine.settings(await resolveOrgId(req));
  });

  app.put("/settings", async (req, reply) => {
    if (!(await staffGate(req, reply))) return;
    return engine.saveSettings(await resolveOrgId(req), settingsBody.parse(req.body));
  });

  app.get("/providers", async (req, reply) => {
    if (!(await staffGate(req, reply))) return;
    return engine.listProviders(await resolveOrgId(req));
  });

  app.get("/providers/:provider", async (req, reply) => {
    if (!(await staffGate(req, reply))) return;
    const orgId = await resolveOrgId(req);
    const { provider } = providerParam.parse(req.params);
    if (!AI_PROVIDERS.includes(provider as AiProviderId)) return reply.code(400).send({ error: "unknown provider" });
    const row = (await engine.listProviders(orgId)).find((r) => r.provider === provider);
    if (!row) return reply.code(404).send({ error: "provider not configured" });
    return row;
  });

  app.put("/providers/:provider", async (req, reply) => {
    if (!(await staffGate(req, reply))) return;
    const orgId = await resolveOrgId(req);
    const { provider } = providerParam.parse(req.params);
    if (!AI_PROVIDERS.includes(provider as AiProviderId)) return reply.code(400).send({ error: "unknown provider" });
    return engine.saveProvider(orgId, provider as AiProviderId, providerBody.parse(req.body));
  });

  app.post("/providers/:provider/probe", async (req, reply) => {
    if (!(await staffGate(req, reply))) return;
    const orgId = await resolveOrgId(req);
    const { provider } = providerParam.parse(req.params);
    if (!AI_PROVIDERS.includes(provider as AiProviderId)) return reply.code(400).send({ error: "unknown provider" });
    const probe = await engine.probeProvider(orgId, provider as AiProviderId);
    return { provider: probe.provider, status: probe.status, lastError: probe.lastError, latencyMs: probe.latencyMs };
  });

  app.get("/health", async (req, reply) => {
    if (!(await staffGate(req, reply))) return;
    return engine.health(await resolveOrgId(req));
  });

  app.get("/runs", async (req, reply) => {
    if (!(await staffGate(req, reply))) return;
    const orgId = await resolveOrgId(req);
    const q = runQuery.parse(req.query);
    return engine.listRuns(orgId, { orgId, skip: q.skip, take: q.take, state: q.state });
  });

  app.get<{ Params: { id: string } }>("/runs/:id", async (req, reply) => {
    if (!(await staffGate(req, reply))) return;
    const orgId = await resolveOrgId(req);
    const run = await engine.getRun(orgId, req.params.id);
    if (!run) return reply.code(404).send({ error: "run not found" });
    return run;
  });

  app.post("/trigger", async (req, reply) => {
    if (!(await staffGate(req, reply))) return;
    const orgId = await resolveOrgId(req);
    const body = triggerBody.parse(req.body);
    try {
      // Fire-and-forget: reply 202 immediately; the run row + tray poll track it.
      const outcome = await engine.runNowQueued(orgId, body.isoDate, body.slot);
      return reply.code(202).send({ ...outcome, async: true });
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      return reply.code(err.statusCode ?? 422).send({ error: err.message });
    }
  });

  app.get("/usage", async (req, reply) => {
    if (!(await staffGate(req, reply))) return;
    return engine.usage(await resolveOrgId(req));
  });

  app.get("/reserve", async (req, reply) => {
    if (!(await staffGate(req, reply))) return;
    return engine.reserve(await resolveOrgId(req));
  });
}