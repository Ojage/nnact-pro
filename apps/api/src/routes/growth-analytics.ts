import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveOrgId } from "./org.js";
import { requireGrowthRead } from "../growth/access.js";
import { computeGrowthAnalytics } from "../growth/analytics.js";
import { computeGrowthFunnel } from "../growth/funnel-analytics.js";
import { computeSenderHealth } from "../growth/sender-health.js";
import { isColdSendingEnabled } from "../growth/transport-policy.js";

export async function growthAnalyticsRoutes(app: FastifyInstance) {
  app.get("/analytics/overview", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const periodDays = z.coerce.number().int().min(1).max(365).parse((req.query as { days?: string }).days ?? 30);
    const overview = await computeGrowthAnalytics(orgId, periodDays);
    return {
      ...overview,
      coldTransportReady: isColdSendingEnabled(process.env),
    };
  });

  app.get("/analytics/funnel", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const periodDays = z.coerce.number().int().min(1).max(365).parse((req.query as { days?: string }).days ?? 30);
    const stages = await computeGrowthFunnel(orgId, periodDays);
    return { periodDays, stages, coldTransportReady: isColdSendingEnabled(process.env) };
  });

  app.get("/analytics/sender-health", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const senders = await computeSenderHealth(orgId);
    return { senders, coldTransportReady: isColdSendingEnabled(process.env) };
  });
}
