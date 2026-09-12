import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  servicePlans,
  serviceCategories,
  serviceChecklists,
  serviceAgreements,
  liveAgreementStatuses,
} from "@nnact/db";
import {
  SERVICE_PLAN_STATUS,
  PLAN_TYPES,
  TARGET_CUSTOMER_TYPES,
  PRICING_MODELS,
  BILLING_FREQUENCIES,
  MAINTENANCE_FREQUENCIES,
  RENEWAL_TYPES,
  SCHEDULE_PRIORITIES,
  VISIT_TYPES,
  PARTS_POLICIES,
  CONSUMABLES_POLICIES,
  EMERGENCY_CALLOUT_COVERAGES,
  type ServiceCategoryDTO,
  type ServiceChecklistDTO,
} from "@nnact/shared";
import { resolveOrgId } from "./org.js";

type PlanInsert = typeof servicePlans.$inferInsert;
function planValues(orgId: string, data: Record<string, unknown>): PlanInsert {
  return { orgId, ...data } as unknown as PlanInsert;
}

const capacityScope = z.enum([
  "ac_capacity",
  "generator_capacity",
  "cold_room_size",
  "refrigeration_capacity",
  "other",
]);

const benefitConfigBody = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  details: z.string().nullable().optional(),
  custom: z.boolean().optional(),
});

const capacityLimitBody = z.object({
  scope: capacityScope,
  label: z.string(),
  max: z.number().int().nonnegative(),
  unit: z.string(),
});

const checklistItemsBody = z
  .array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      required: z.boolean().optional(),
    }),
  )
  .default([]);

const planBody = z.object({
  status: z.enum(SERVICE_PLAN_STATUS).default("draft"),
  planType: z.enum(PLAN_TYPES).default("standard"),
  name: z.string().min(1),
  code: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  coverageCategories: z.array(z.string().min(1)).default([]),
  coverageEquipmentTypes: z.array(z.string().min(1)).default([]),
  targetCustomerType: z.enum(TARGET_CUSTOMER_TYPES).default("residential"),
  maxCoveredAssets: z.number().int().positive().nullable().optional(),
  capacityLimits: z.array(capacityLimitBody).default([]),
  pricingModel: z.enum(PRICING_MODELS).default("fixed"),
  priceCents: z.number().int().nonnegative().default(0),
  billingFrequency: z.enum(BILLING_FREQUENCIES).default("annual"),
  setupFeeCents: z.number().int().nonnegative().default(0),
  termMonths: z.number().int().positive().default(12),
  autoRenew: z.boolean().default(false),
  renewalType: z.enum(RENEWAL_TYPES).default("manual"),
  renewalReminders: z.array(z.number().int().positive()).default([30]),
  maintenanceFrequency: z.enum(MAINTENANCE_FREQUENCIES).default("quarterly"),
  visitsPerTerm: z.number().int().nonnegative().default(4),
  primaryVisitType: z.enum(VISIT_TYPES).default("preventive"),
  activities: z.array(z.string().min(1)).default([]),
  checklistId: z.string().uuid().nullable().optional(),
  schedulingPriority: z.enum(SCHEDULE_PRIORITIES).default("standard"),
  targetResponseHours: z.number().int().positive().nullable().optional(),
  emergencyCalloutAllowance: z.number().int().min(-1).default(0),
  emergencyCalloutCoverage: z.enum(EMERGENCY_CALLOUT_COVERAGES).default("priority_diagnosis_only"),
  partsPolicy: z.enum(PARTS_POLICIES).default("not_included"),
  partsDiscountPercent: z.number().int().min(0).max(100).default(0),
  partsAllowanceCents: z.number().int().nonnegative().default(0),
  consumablesPolicy: z.enum(CONSUMABLES_POLICIES).default("not_included"),
  transportIncluded: z.boolean().default(false),
  benefits: z.array(benefitConfigBody).default([]),
});

const patchPlanBody = planBody.partial();

const categoryBody = z.object({
  name: z.string().min(1),
  code: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int().nonnegative().default(0),
  active: z.boolean().default(true),
});

const patchCategoryBody = categoryBody.partial();

const checklistBody = z.object({
  name: z.string().min(1),
  categoryId: z.string().uuid().nullable().optional(),
  items: checklistItemsBody,
  active: z.boolean().default(true),
});

const patchChecklistBody = checklistBody.partial();

export async function servicePlanRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const plans = await db
      .select()
      .from(servicePlans)
      .where(eq(servicePlans.orgId, orgId))
      .orderBy(desc(servicePlans.createdAt));

    const counts = await db
      .select({ planId: serviceAgreements.planId, c: count() })
      .from(serviceAgreements)
      .where(and(eq(serviceAgreements.orgId, orgId), inArray(serviceAgreements.status, [...liveAgreementStatuses])))
      .groupBy(serviceAgreements.planId);

    const byPlan = new Map<string, number>(counts.map((r) => [r.planId!, r.c]));
    return plans.map((p) => ({ ...p, activeAgreementCount: byPlan.get(p.id) ?? 0 }));
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = planBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .insert(servicePlans)
      .values(planValues(orgId, parsed.data))
      .returning();
    return reply.code(201).send(row);
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(servicePlans)
      .where(and(eq(servicePlans.orgId, orgId), eq(servicePlans.id, id)));
    if (!row) return reply.code(404).send({ error: "not found" });
    const counts = await db
      .select({ c: count() })
      .from(serviceAgreements)
      .where(
        and(eq(serviceAgreements.orgId, orgId), eq(serviceAgreements.planId, id), inArray(serviceAgreements.status, [...liveAgreementStatuses])),
      );
    return { ...row, activeAgreementCount: counts[0]?.c ?? 0 };
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchPlanBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .update(servicePlans)
      .set(planValues(orgId, parsed.data))
      .where(and(eq(servicePlans.orgId, orgId), eq(servicePlans.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/:id/duplicate", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [source] = await db
      .select()
      .from(servicePlans)
      .where(and(eq(servicePlans.orgId, orgId), eq(servicePlans.id, id)));
    if (!source) return reply.code(404).send({ error: "not found" });
    const { id: _srcId, createdAt: _createdAt, updatedAt: _updatedAt, version: _version, ...rest } = source;
    const [row] = await db
      .insert(servicePlans)
      .values({ ...rest, name: `${rest.name} (copy)`, status: "draft" })
      .returning();
    return reply.code(201).send(row);
  });

  app.post("/:id/archive", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .update(servicePlans)
      .set({ status: "archived" })
      .where(and(eq(servicePlans.orgId, orgId), eq(servicePlans.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.get("/categories", async (req) => {
    const orgId = await resolveOrgId(req);
    const rows = await db
      .select()
      .from(serviceCategories)
      .where(eq(serviceCategories.orgId, orgId))
      .orderBy(serviceCategories.sortOrder);
    return rows as unknown as ServiceCategoryDTO[];
  });

  app.post("/categories", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = categoryBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .insert(serviceCategories)
      .values({ orgId, ...parsed.data })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/categories/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchCategoryBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .update(serviceCategories)
      .set(parsed.data)
      .where(and(eq(serviceCategories.orgId, orgId), eq(serviceCategories.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.get("/checklists", async (req) => {
    const orgId = await resolveOrgId(req);
    const rows = await db
      .select()
      .from(serviceChecklists)
      .where(eq(serviceChecklists.orgId, orgId))
      .orderBy(serviceChecklists.createdAt);
    return rows as unknown as ServiceChecklistDTO[];
  });

  app.post("/checklists", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = checklistBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .insert(serviceChecklists)
      .values({ orgId, ...parsed.data })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/checklists/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchChecklistBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .update(serviceChecklists)
      .set(parsed.data)
      .where(and(eq(serviceChecklists.orgId, orgId), eq(serviceChecklists.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });
}