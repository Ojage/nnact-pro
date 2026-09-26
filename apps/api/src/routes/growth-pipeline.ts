// Stage 4 — opportunities, meetings, and conversion to customers/jobs/estimates/agreements.

import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  db,
  customers,
  growthMeetings,
  growthOpportunities,
  growthProspects,
  jobs,
  serviceAgreements,
} from "@nnact/db";
import { resolveOrgId } from "./org.js";
import { requireGrowthRead, requireGrowthWrite } from "../growth/access.js";

const uuid = z.string().uuid();
const trimmed = z.string().trim().min(1);

const OPPORTUNITY_STAGES = [
  "LEAD",
  "QUALIFIED",
  "MEETING_SCHEDULED",
  "SITE_ASSESSMENT",
  "ESTIMATE_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;

export async function growthPipelineRoutes(app: FastifyInstance) {
  app.get("/opportunities", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const stage = (req.query as { stage?: string }).stage;
    const rows = await db
      .select({
        opp: growthOpportunities,
        companyName: growthProspects.companyName,
      })
      .from(growthOpportunities)
      .innerJoin(growthProspects, eq(growthOpportunities.prospectId, growthProspects.id))
      .where(
        stage
          ? and(eq(growthOpportunities.orgId, orgId), eq(growthOpportunities.stage, stage as never))
          : eq(growthOpportunities.orgId, orgId),
      )
      .orderBy(desc(growthOpportunities.updatedAt))
      .limit(200);
    return rows.map(({ opp, companyName }) => ({
      id: opp.id,
      prospectId: opp.prospectId,
      companyName,
      stage: opp.stage,
      title: opp.title,
      notes: opp.notes,
      linkedCustomerId: opp.linkedCustomerId,
      linkedJobId: opp.linkedJobId,
      linkedEstimateId: opp.linkedEstimateId,
      linkedServiceAgreementId: opp.linkedServiceAgreementId,
      lostReason: opp.lostReason,
      wonAt: opp.wonAt?.toISOString() ?? null,
      createdAt: opp.createdAt.toISOString(),
      updatedAt: opp.updatedAt.toISOString(),
    }));
  });

  app.post("/opportunities", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const body = z
      .object({
        prospectId: uuid,
        title: trimmed.max(240),
        notes: z.string().trim().max(4000).optional(),
        threadId: uuid.optional(),
        campaignId: uuid.optional(),
        recipientId: uuid.optional(),
      })
      .parse(req.body);
    const [row] = await db
      .insert(growthOpportunities)
      .values({ orgId, ...body, createdBy: claims.userId })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/opportunities/:id", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const id = uuid.parse((req.params as { id: string }).id);
    const body = z
      .object({
        stage: z.enum(OPPORTUNITY_STAGES).optional(),
        notes: z.string().trim().max(4000).optional(),
        lostReason: z.string().trim().max(2000).optional(),
      })
      .parse(req.body);
    const [row] = await db
      .update(growthOpportunities)
      .set({
        ...body,
        wonAt: body.stage === "WON" ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(growthOpportunities.orgId, orgId), eq(growthOpportunities.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/opportunities/:id/convert/customer", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const id = uuid.parse((req.params as { id: string }).id);
    const [opp] = await db
      .select()
      .from(growthOpportunities)
      .where(and(eq(growthOpportunities.orgId, orgId), eq(growthOpportunities.id, id)))
      .limit(1);
    if (!opp) return reply.code(404).send({ error: "not found" });

    const [prospect] = await db
      .select()
      .from(growthProspects)
      .where(and(eq(growthProspects.orgId, orgId), eq(growthProspects.id, opp.prospectId)))
      .limit(1);
    if (!prospect) return reply.code(404).send({ error: "prospect not found" });

    let customerId = opp.linkedCustomerId ?? prospect.linkedCustomerId;
    if (!customerId) {
      const [customer] = await db
        .insert(customers)
        .values({
          orgId,
          name: prospect.companyName,
          company: prospect.companyName,
          notes: prospect.notes,
        })
        .returning({ id: customers.id });
      customerId = customer!.id;
      await db
        .update(growthProspects)
        .set({ linkedCustomerId: customerId, lifecycle: "ENGAGED", updatedAt: new Date() })
        .where(eq(growthProspects.id, prospect.id));
    }

    const [updated] = await db
      .update(growthOpportunities)
      .set({ linkedCustomerId: customerId, stage: "QUALIFIED", updatedAt: new Date() })
      .where(eq(growthOpportunities.id, id))
      .returning();
    return { opportunity: updated, customerId };
  });

  app.post("/opportunities/:id/link/job", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const id = uuid.parse((req.params as { id: string }).id);
    const { jobId } = z.object({ jobId: uuid }).parse(req.body);
    const [job] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId)))
      .limit(1);
    if (!job) return reply.code(404).send({ error: "job not found" });
    const [row] = await db
      .update(growthOpportunities)
      .set({ linkedJobId: jobId, stage: "SITE_ASSESSMENT", updatedAt: new Date() })
      .where(and(eq(growthOpportunities.orgId, orgId), eq(growthOpportunities.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/opportunities/:id/link/estimate", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const id = uuid.parse((req.params as { id: string }).id);
    const { estimateId } = z.object({ estimateId: uuid }).parse(req.body);
    const [row] = await db
      .update(growthOpportunities)
      .set({ linkedEstimateId: estimateId, stage: "ESTIMATE_SENT", updatedAt: new Date() })
      .where(and(eq(growthOpportunities.orgId, orgId), eq(growthOpportunities.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/opportunities/:id/link/service-agreement", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const id = uuid.parse((req.params as { id: string }).id);
    const { serviceAgreementId } = z.object({ serviceAgreementId: uuid }).parse(req.body);
    const [agreement] = await db
      .select({ id: serviceAgreements.id })
      .from(serviceAgreements)
      .where(and(eq(serviceAgreements.orgId, orgId), eq(serviceAgreements.id, serviceAgreementId)))
      .limit(1);
    if (!agreement) return reply.code(404).send({ error: "service agreement not found" });
    const [row] = await db
      .update(growthOpportunities)
      .set({
        linkedServiceAgreementId: serviceAgreementId,
        stage: "WON",
        wonAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(growthOpportunities.orgId, orgId), eq(growthOpportunities.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.get("/meetings", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const rows = await db
      .select()
      .from(growthMeetings)
      .where(eq(growthMeetings.orgId, orgId))
      .orderBy(desc(growthMeetings.scheduledAt))
      .limit(200);
    return rows.map((m) => ({
      ...m,
      scheduledAt: m.scheduledAt.toISOString(),
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }));
  });

  app.post("/meetings", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const body = z
      .object({
        opportunityId: uuid,
        prospectId: uuid,
        scheduledAt: z.string().datetime(),
        location: z.string().trim().max(500).optional(),
        notes: z.string().trim().max(4000).optional(),
      })
      .parse(req.body);
    const [meeting] = await db
      .insert(growthMeetings)
      .values({
        orgId,
        opportunityId: body.opportunityId,
        prospectId: body.prospectId,
        scheduledAt: new Date(body.scheduledAt),
        location: body.location,
        notes: body.notes,
        createdBy: claims.userId,
      })
      .returning();
    await db
      .update(growthOpportunities)
      .set({ stage: "MEETING_SCHEDULED", updatedAt: new Date() })
      .where(and(eq(growthOpportunities.orgId, orgId), eq(growthOpportunities.id, body.opportunityId)));
    return reply.code(201).send(meeting);
  });
}
