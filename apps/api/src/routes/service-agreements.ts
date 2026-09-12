import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, sql, count } from "drizzle-orm";
import {
  db,
  serviceAgreements,
  serviceAgreementAssets,
  servicePlans,
  serviceLocations,
  serviceVisits,
  customers,
  equipment,
  liveAgreementStatuses,
  type AgreementSnapshot,
} from "@nnact/db";
import {
  AGREEMENT_STATUS,
  AGREEMENT_PAYMENT_STATUS,
  BILLING_FREQUENCIES,
  RENEWAL_TYPES,
  VISIT_TYPES,
  MAINTENANCE_FREQUENCIES,
  type AgreementStatus,
  type VisitType,
  type ServiceAgreementDTO,
  type ServiceLocationDTO,
  type ServiceAgreementAssetDTO,
} from "@nnact/shared";
import { resolveOrgId } from "./org.js";

const AGREEMENT_PREFIX = "NNACT-SVC";
const VISIT_PREFIX = "VISIT";

function padSeq(n: number): string {
  return String(n).padStart(6, "0");
}

async function nextAgreementNumber(orgId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const rows = await db
    .select({ c: count() })
    .from(serviceAgreements)
    .where(
      and(
        eq(serviceAgreements.orgId, orgId),
        sql`${serviceAgreements.agreementNumber} like ${`${AGREEMENT_PREFIX}-${year}-%`}`,
      ),
    );
  return `${AGREEMENT_PREFIX}-${year}-${padSeq((rows[0]?.c ?? 0) + 1)}`;
}

async function nextVisitNumber(orgId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const rows = await db
    .select({ c: count() })
    .from(serviceVisits)
    .where(
      and(
        eq(serviceVisits.orgId, orgId),
        sql`${serviceVisits.visitNumber} like ${`${VISIT_PREFIX}-${year}-%`}`,
      ),
    );
  return `${VISIT_PREFIX}-${year}-${padSeq((rows[0]?.c ?? 0) + 1)}`;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function intervalMonths(frequency: string): number {
  switch (frequency) {
    case "monthly":
      return 1;
    case "bi_monthly":
      return 2;
    case "quarterly":
      return 3;
    case "every_4_months":
      return 4;
    case "semi_annual":
      return 6;
    case "annual":
      return 12;
    default:
      return 12;
  }
}

async function generateVisits(orgId: string, agreementId: string, startsAt: Date, snapshot: AgreementSnapshot) {
  const visitsIncluded = Math.max(0, snapshot.visitsPerTerm || 0);
  if (visitsIncluded === 0) return;
  const monthsPerVisit = intervalMonths(snapshot.maintenanceFrequency);
  const due = new Date(startsAt);
  const visitType = (VISIT_TYPES as readonly string[]).includes(snapshot.primaryVisitType)
    ? (snapshot.primaryVisitType as VisitType)
    : "preventive";

  for (let i = 1; i <= visitsIncluded; i += 1) {
    await db.insert(serviceVisits).values({
      orgId,
      agreementId,
      visitNumber: await nextVisitNumber(orgId),
      title: `${snapshot.planName} — Service ${i}/${visitsIncluded}`,
      visitType,
      status: "scheduled",
      scheduledAt: due,
      dueAt: new Date(due),
      activities: snapshot.activities ?? [],
    });
    due.setUTCMonth(due.getUTCMonth() + monthsPerVisit);
  }
}

function snapshotFromPlan(p: typeof servicePlans.$inferSelect): AgreementSnapshot {
  return {
    planId: p.id,
    planName: p.name,
    priceCents: p.priceCents,
    billingFrequency: p.billingFrequency,
    setupFeeCents: p.setupFeeCents,
    termMonths: p.termMonths,
    autoRenew: p.autoRenew,
    renewalType: p.renewalType,
    renewalReminders: p.renewalReminders,
    maintenanceFrequency: p.maintenanceFrequency,
    visitsPerTerm: p.visitsPerTerm,
    primaryVisitType: p.primaryVisitType,
    activities: p.activities,
    maxCoveredAssets: p.maxCoveredAssets,
    schedulingPriority: p.schedulingPriority,
    targetResponseHours: p.targetResponseHours,
    emergencyCalloutAllowance: p.emergencyCalloutAllowance,
    emergencyCalloutCoverage: p.emergencyCalloutCoverage,
    partsPolicy: p.partsPolicy,
    partsDiscountPercent: p.partsDiscountPercent,
    partsAllowanceCents: p.partsAllowanceCents,
    consumablesPolicy: p.consumablesPolicy,
    transportIncluded: p.transportIncluded,
    benefits: p.benefits,
  };
}

const createAgreementBody = z.object({
  customerId: z.string().uuid(),
  planId: z.string().uuid().nullable().optional(),
  planName: z.string().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  termMonths: z.number().int().positive().nullable().optional(),
  priceCents: z.number().int().nonnegative().nullable().optional(),
  billingFrequency: z.enum(BILLING_FREQUENCIES).nullable().optional(),
  setupFeeCents: z.number().int().nonnegative().nullable().optional(),
  autoRenew: z.boolean().nullable().optional(),
  renewalType: z.enum(RENEWAL_TYPES).nullable().optional(),
  visitsIncluded: z.number().int().nonnegative().nullable().optional(),
  visitsCompleted: z.number().int().nonnegative().nullable().optional(),
  maintenanceFrequency: z.enum(MAINTENANCE_FREQUENCIES).nullable().optional(),
  primaryVisitType: z.enum(VISIT_TYPES).nullable().optional(),
  activities: z.array(z.string()).nullable().optional(),
  serviceLocationId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(AGREEMENT_STATUS).optional(),
  autoActivate: z.boolean().default(false),
});

const patchAgreementBody = z.object({
  status: z.enum(AGREEMENT_STATUS).optional(),
  paymentStatus: z.enum(AGREEMENT_PAYMENT_STATUS).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  priceCents: z.number().int().nonnegative().optional(),
  visitsIncluded: z.number().int().nonnegative().optional(),
  visitsCompleted: z.number().int().nonnegative().optional(),
  serviceLocationId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  autoRenew: z.boolean().optional(),
  renewalType: z.enum(RENEWAL_TYPES).optional(),
});

const createAssetBody = z.object({
  equipmentId: z.string().uuid(),
  notes: z.string().nullable().optional(),
});

const locationBody = z.object({
  customerId: z.string().uuid(),
  name: z.string().min(1),
  address: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().default(true),
});

const patchLocationBody = locationBody.partial();

function equipmentLabel(e: { type: string; make: string | null; model: string | null }): string {
  return [e.type, e.make, e.model].filter((v): v is string => Boolean(v)).join(" ");
}

export async function serviceAgreementRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const { customerId, status } = req.query as { customerId?: string; status?: string };

    const conds = [eq(serviceAgreements.orgId, orgId)];
    if (customerId) conds.push(eq(serviceAgreements.customerId, customerId));
    if (status) conds.push(eq(serviceAgreements.status, status as AgreementStatus));

    const rows = await db
      .select({
        agreement: serviceAgreements,
        customerName: customers.name,
        locationName: serviceLocations.name,
      })
      .from(serviceAgreements)
      .innerJoin(customers, eq(customers.id, serviceAgreements.customerId))
      .leftJoin(serviceLocations, eq(serviceLocations.id, serviceAgreements.serviceLocationId))
      .where(and(...conds))
      .orderBy(desc(serviceAgreements.createdAt));

    return rows.map((r) => ({
      ...r.agreement,
      customerName: r.customerName,
      locationName: r.locationName ?? null,
    })) as unknown as ServiceAgreementDTO[];
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createAgreementBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const data = parsed.data;

    let snapshot: AgreementSnapshot;
    let planName: string;
    let planId: string | null = data.planId ?? null;

    if (data.planId) {
      const [plan] = await db
        .select()
        .from(servicePlans)
        .where(and(eq(servicePlans.orgId, orgId), eq(servicePlans.id, data.planId)));
      if (!plan) return reply.code(400).send({ error: "plan not found in this organization" });
      snapshot = snapshotFromPlan(plan);
      planName = plan.name;
    } else {
      if (!data.planName) return reply.code(400).send({ error: "planName is required for a custom agreement" });
      planName = data.planName;
      snapshot = {
        planId: null,
        planName,
        priceCents: data.priceCents ?? 0,
        billingFrequency: data.billingFrequency ?? "annual",
        setupFeeCents: data.setupFeeCents ?? 0,
        termMonths: data.termMonths ?? 12,
        autoRenew: data.autoRenew ?? false,
        renewalType: data.renewalType ?? "manual",
        renewalReminders: [30],
        maintenanceFrequency: data.maintenanceFrequency ?? "quarterly",
        visitsPerTerm: data.visitsIncluded ?? 0,
        primaryVisitType: data.primaryVisitType ?? "preventive",
        activities: data.activities ?? [],
        maxCoveredAssets: null,
        schedulingPriority: "standard",
        targetResponseHours: null,
        emergencyCalloutAllowance: 0,
        emergencyCalloutCoverage: "priority_diagnosis_only",
        partsPolicy: "not_included",
        partsDiscountPercent: 0,
        partsAllowanceCents: 0,
        consumablesPolicy: "not_included",
        transportIncluded: false,
        benefits: [],
      };
    }

    const startsAt = data.startsAt ? new Date(data.startsAt) : new Date();
    const termMonths = data.termMonths ?? snapshot.termMonths;
    const endsAt = addMonths(startsAt, termMonths);
    const requestedStatus = data.status ?? "draft";
    const autoActivate = data.autoActivate ?? requestedStatus === "active";

    const agreementNumber = await nextAgreementNumber(orgId);
    const [agreement] = await db
      .insert(serviceAgreements)
      .values({
        orgId,
        agreementNumber,
        customerId: data.customerId,
        planId,
        planName,
        planSnapshot: snapshot,
        status: autoActivate ? "active" : requestedStatus,
        paymentStatus: "unpaid",
        startsAt,
        endsAt,
        autoRenew: snapshot.autoRenew,
        renewalType: snapshot.renewalType,
        visitsIncluded: data.visitsIncluded ?? snapshot.visitsPerTerm,
        visitsCompleted: data.visitsCompleted ?? 0,
        priceCents: data.priceCents ?? snapshot.priceCents,
        billingFrequency: snapshot.billingFrequency,
        serviceLocationId: data.serviceLocationId,
        notes: data.notes,
      } as unknown as typeof serviceAgreements.$inferInsert)
      .returning();

    if (autoActivate || requestedStatus === "active" || requestedStatus === "pending_approval") {
      await generateVisits(orgId, agreement.id, startsAt, snapshot);
    }

    return reply.code(201).send(agreement);
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [agreement] = await db
      .select()
      .from(serviceAgreements)
      .where(and(eq(serviceAgreements.orgId, orgId), eq(serviceAgreements.id, id)));
    if (!agreement) return reply.code(404).send({ error: "not found" });
    const result: Record<string, unknown> = { ...agreement };
    const [customerRow] = await db
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, agreement.customerId));
    result.customerName = customerRow?.name ?? null;
    if (agreement.serviceLocationId) {
      const [loc] = await db
        .select({ name: serviceLocations.name })
        .from(serviceLocations)
        .where(eq(serviceLocations.id, agreement.serviceLocationId));
      result.locationName = loc?.name ?? null;
    }
    return result;
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchAgreementBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [existing] = await db
      .select()
      .from(serviceAgreements)
      .where(and(eq(serviceAgreements.orgId, orgId), eq(serviceAgreements.id, id)));
    if (!existing) return reply.code(404).send({ error: "not found" });

    const patch: Record<string, unknown> = { ...parsed.data };
    if (typeof parsed.data.startsAt === "string") {
      const s = new Date(parsed.data.startsAt);
      patch.startsAt = s;
      patch.endsAt = addMonths(s, existing.planSnapshot.termMonths ?? 12);
    }

    const wasLive = (liveAgreementStatuses as readonly string[]).includes(existing.status);
    const willBeLive = (parsed.data.status ?? existing.status) === "active";

    const [row] = await db
      .update(serviceAgreements)
      .set(patch)
      .where(and(eq(serviceAgreements.orgId, orgId), eq(serviceAgreements.id, id)))
      .returning();

    const shouldGenerate = !wasLive && willBeLive && (row.visitsIncluded ?? 0) > 0;
    if (shouldGenerate) {
      const existingVisits = await db
        .select({ c: count() })
        .from(serviceVisits)
        .where(eq(serviceVisits.agreementId, id));
      if ((existingVisits[0]?.c ?? 0) === 0) {
        await generateVisits(orgId, id, row.startsAt, row.planSnapshot);
      }
    }

    return row;
  });

  app.post("/:id/activate", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(serviceAgreements)
      .where(and(eq(serviceAgreements.orgId, orgId), eq(serviceAgreements.id, id)));
    if (!existing) return reply.code(404).send({ error: "not found" });
    const [row] = await db
      .update(serviceAgreements)
      .set({ status: "active" })
      .where(eq(serviceAgreements.id, id))
      .returning();
    if ((row.visitsIncluded ?? 0) > 0) {
      const existingVisits = await db
        .select({ c: count() })
        .from(serviceVisits)
        .where(eq(serviceVisits.agreementId, id));
      if ((existingVisits[0]?.c ?? 0) === 0) {
        await generateVisits(orgId, id, row.startsAt, row.planSnapshot);
      }
    }
    return row;
  });

  app.get("/:id/assets", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const rows = await db
      .select({
        asset: serviceAgreementAssets,
        equipmentType: equipment.type,
        equipmentMake: equipment.make,
        equipmentModel: equipment.model,
        equipmentSerial: equipment.serialNumber,
        equipmentStatus: equipment.status,
      })
      .from(serviceAgreementAssets)
      .innerJoin(equipment, eq(equipment.id, serviceAgreementAssets.equipmentId))
      .where(and(eq(serviceAgreementAssets.orgId, orgId), eq(serviceAgreementAssets.agreementId, id)))
      .orderBy(serviceAgreementAssets.createdAt);

    return rows.map((r) => ({
      ...r.asset,
      equipmentName: equipmentLabel({
        type: r.equipmentType,
        make: r.equipmentMake,
        model: r.equipmentModel,
      }),
      equipmentModel: r.equipmentModel,
      equipmentSerial: r.equipmentSerial,
      status: r.equipmentStatus,
    })) as unknown as ServiceAgreementAssetDTO[];
  });

  app.post("/:id/assets", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = createAssetBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [agreement] = await db
      .select()
      .from(serviceAgreements)
      .where(and(eq(serviceAgreements.orgId, orgId), eq(serviceAgreements.id, id)));
    if (!agreement) return reply.code(404).send({ error: "agreement not found" });

    const [asset] = await db
      .select()
      .from(equipment)
      .where(and(eq(equipment.orgId, orgId), eq(equipment.id, parsed.data.equipmentId)));
    if (!asset) return reply.code(404).send({ error: "equipment not found" });
    if (asset.customerId !== agreement.customerId) {
      return reply.code(400).send({ error: "equipment belongs to a different customer" });
    }

    const [row] = await db
      .insert(serviceAgreementAssets)
      .values({
        orgId,
        agreementId: id,
        equipmentId: parsed.data.equipmentId,
        notes: parsed.data.notes,
      })
      .returning();
    return reply.code(201).send(row);
  });

  app.delete("/:id/assets/:assetId", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id, assetId } = req.params as { id: string; assetId: string };
    const [row] = await db
      .delete(serviceAgreementAssets)
      .where(
        and(
          eq(serviceAgreementAssets.orgId, orgId),
          eq(serviceAgreementAssets.agreementId, id),
          eq(serviceAgreementAssets.id, assetId),
        ),
      )
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return { ok: true };
  });

  app.get("/:id/visits", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    return db
      .select()
      .from(serviceVisits)
      .where(and(eq(serviceVisits.orgId, orgId), eq(serviceVisits.agreementId, id)))
      .orderBy(desc(serviceVisits.dueAt));
  });

  app.get("/locations", async (req) => {
    const orgId = await resolveOrgId(req);
    const { customerId } = req.query as { customerId?: string };
    const conds = [eq(serviceLocations.orgId, orgId)];
    if (customerId) conds.push(eq(serviceLocations.customerId, customerId));
    const rows = await db
      .select()
      .from(serviceLocations)
      .where(and(...conds))
      .orderBy(serviceLocations.name);
    return rows as unknown as ServiceLocationDTO[];
  });

  app.post("/locations", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = locationBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .insert(serviceLocations)
      .values({ orgId, ...parsed.data })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/locations/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchLocationBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .update(serviceLocations)
      .set(parsed.data)
      .where(and(eq(serviceLocations.orgId, orgId), eq(serviceLocations.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });
}