import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, max, or, sql } from "drizzle-orm";
import { db, jobs, users, orgs, jobStatusHistory, customers } from "@nnact/db";
import { JOB_STATUS, mergeBusinessSettings } from "@nnact/shared";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";
import { safeEmitEvent } from "../plugins/bus.js";
import { safeNotifyUser } from "../notify-user.js";
import { technicianJobPatchAllowed, verifiedClaims } from "../operational-authorization.js";
import { jobNumber, jobStatusLabel, nextJobStatus, type JobRole } from "../job-lifecycle.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

const createBody = z.object({
  customerId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(JOB_STATUS).optional(),
  scheduledAt: z.string().datetime().optional(),
  total: z.number().int().nonnegative().optional(),
  laborCostCents: z.number().int().nonnegative().optional().default(0),
});

export const jobPatchBody = z.object({
  status: z.enum(JOB_STATUS).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  total: z.number().int().nonnegative().optional(),
  laborCostCents: z.number().int().nonnegative().optional(),
  cancelReason: z.string().trim().min(1).max(500).optional(),
});

const importJobRow = z.object({
  /** Optional pre-created customer id. */
  customerId: z.string().uuid().optional(),
  /** Create-or-lookup customer describing the paper record. */
  customer: z
    .object({
      name: z.string().trim().min(1),
      phone: z.string().trim().optional(),
      email: z.string().trim().optional(),
    })
    .optional(),
  title: z.string().trim().min(1, "title is required"),
  description: z.string().trim().optional(),
  /** YYYY-MM-DD date the historical job was (originally) done on. */
  date: z.string().trim().optional(),
  status: z.enum(JOB_STATUS).optional().default("completed"),
  total: z.number().int().nonnegative().optional().default(0),
});

const importJobsBody = z.object({
  jobs: z.array(importJobRow).min(1).max(500),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseImportDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return undefined;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  if (Number.isNaN(dt.getTime())) return undefined;
  return dt;
}

function officeRole(role: string): role is "owner" | "dispatcher" {
  return role === "owner" || role === "dispatcher";
}

/**
 * Allocate the next per-org work-order number under an advisory lock so two
 * concurrent creates cannot collide. Walks the highest existing numeric suffix
 * (collision-proof across deletions) and never goes below the configured start.
 */
async function allocateNumberInOrg(tx: Tx, orgId: string): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'job-number:' + orgId}))`);
  const [{ maxNum }] = await tx
    .select({ maxNum: max(jobs.number) })
    .from(jobs)
    .where(eq(jobs.orgId, orgId));
  const [org] = await tx
    .select({ businessSettings: orgs.businessSettings })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1);
  const settings = mergeBusinessSettings(org?.businessSettings);
  const parsed = typeof maxNum === "string" ? Number(maxNum.match(/(\d+)\s*$/)?.[1]) : NaN;
  const highest = Number.isFinite(parsed) ? parsed : settings.numbering.jobNextNumber - 1;
  const next = Math.max(highest + 1, settings.numbering.jobNextNumber);
  return jobNumber(
    next - settings.numbering.jobNextNumber,
    settings.numbering.jobPrefix,
    settings.numbering.jobNextNumber,
  );
}

export async function jobRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;

    const { skip, take } = req.query as { skip?: string; take?: string };
    const s = skip ? parseInt(skip, 10) : 0;
    const t = take ? Math.min(parseInt(take, 10) || 50, 200) : 50;
    const scope = claims.role === "technician"
      ? and(eq(jobs.orgId, orgId), eq(jobs.assignedTo, claims.userId))
      : eq(jobs.orgId, orgId);
    return db.select().from(jobs).where(scope).orderBy(desc(jobs.createdAt)).limit(t).offset(s);
  });

  app.get("/:id/history", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    return db
      .select()
      .from(jobStatusHistory)
      .where(and(eq(jobStatusHistory.orgId, orgId), eq(jobStatusHistory.jobId, id)))
      .orderBy(desc(jobStatusHistory.createdAt));
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const scope = claims.role === "technician"
      ? and(eq(jobs.orgId, orgId), eq(jobs.id, id), eq(jobs.assignedTo, claims.userId))
      : and(eq(jobs.orgId, orgId), eq(jobs.id, id));
    const [row] = await db.select().from(jobs).where(scope).limit(1);
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeRole(claims.role)) {
      return reply.code(403).send({ error: "only owners and dispatchers may create jobs" });
    }

    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { scheduledAt, ...rest } = parsed.data;

    const row = await db.transaction(async (tx) => {
      const number = await allocateNumberInOrg(tx, orgId);
      const [created] = await tx
        .insert(jobs)
        .values({
          orgId,
          ...rest,
          number,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        })
        .returning();
      await tx.insert(jobStatusHistory).values({
        orgId,
        jobId: created.id,
        fromStatus: null,
        toStatus: created.status,
        changedBy: claims.userId,
        reason: "job created",
      });
      return created;
    });

    if (!row) return reply.code(500).send({ error: "failed to create job" });

    safeEmitActivity(orgId, "job.created", `Created job ${row.number ?? ""}: ${row.title}`, {
      customerId: row.customerId,
      jobId: row.id,
    });
    void safeEmitEvent(orgId, "job.created", { id: row.id, title: row.title, number: row.number, customerId: row.customerId, status: row.status });
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;

    const { id } = req.params as { id: string };
    const parsed = jobPatchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [before] = await db
      .select({ id: jobs.id, status: jobs.status, assignedTo: jobs.assignedTo, title: jobs.title })
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, id)))
      .limit(1);
    if (!before) return reply.code(404).send({ error: "not found" });

    const isTechnician = claims.role === "technician";
    if (isTechnician) {
      if (!technicianJobPatchAllowed(parsed.data as Record<string, unknown>)) {
        return reply.code(403).send({
          error: "technicians may only start or complete their assigned jobs",
        });
      }
      if (before.assignedTo !== claims.userId) {
        return reply.code(403).send({ error: "job is not assigned to this technician" });
      }
    }

    const next = parsed.data.status;
    if (next !== undefined && next !== before.status) {
      if (!nextJobStatus(before.status, next, claims.role as JobRole)) {
        return reply.code(409).send({
          error: "invalid job status transition",
          currentStatus: before.status,
          requestedStatus: next,
        });
      }
      if (next === "canceled") {
        if (!parsed.data.cancelReason) {
          return reply.code(400).send({ error: "a cancel reason is required when canceling a job" });
        }
      }
    }

    if (parsed.data.assignedTo !== undefined && parsed.data.assignedTo !== before.assignedTo) {
      if (parsed.data.assignedTo !== null) {
        const [target] = await db
          .select({ id: users.id, active: users.active })
          .from(users)
          .where(and(eq(users.orgId, orgId), eq(users.id, parsed.data.assignedTo)))
          .limit(1);
        if (!target || !target.active) {
          return reply.code(400).send({ error: "assignedTo must be an active team member in this organization" });
        }
      }
    }

    const { scheduledAt, cancelReason: _cancelReason, ...rest } = parsed.data;
    const [row] = await db
      .update(jobs)
      .set({
        ...rest,
        ...(scheduledAt !== undefined
          ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }
          : {}),
      })
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });

    if (parsed.data.status) {
      await db.insert(jobStatusHistory).values({
        orgId,
        jobId: row.id,
        fromStatus: before.status,
        toStatus: row.status,
        changedBy: claims.userId,
        reason: parsed.data.cancelReason ?? null,
      });

      const label = jobStatusLabel(parsed.data.status);
      safeEmitActivity(orgId, "job.status_changed", `Job marked ${label}: ${row.title}`, {
        customerId: row.customerId,
        jobId: row.id,
      });
      void safeEmitEvent(orgId, "job.status_changed", {
        id: row.id,
        customerId: row.customerId,
        status: row.status,
      });
      if (row.assignedTo) {
        void safeNotifyUser(orgId, row.assignedTo, {
          type: "job.status_changed",
          title: `Job ${label}`,
          body: row.title,
          link: `/jobs/${row.id}`,
          jobId: row.id,
        });
      }
    }

    if (
      parsed.data.assignedTo !== undefined &&
      parsed.data.assignedTo &&
      parsed.data.assignedTo !== before.assignedTo
    ) {
      void safeNotifyUser(orgId, parsed.data.assignedTo, {
        type: "job.assigned",
        title: "Job assigned to you",
        body: row.title,
        link: `/jobs/${row.id}`,
        jobId: row.id,
      });
      void safeEmitEvent(orgId, "job.assigned", {
        id: row.id,
        technicianId: parsed.data.assignedTo,
      });
    }

    return row;
  });

  /**
   * Bulk-backfill historical paper jobs. Each row references an existing
   * customer id, or describes a customer by phone/email/name so the import can
   * reuse or create one. Job numbers are allocated per org inside the same
   * advisory lock as normal creation, and each created job gets a status
   * history entry so the timeline stays truthful.
   */
  app.post("/import", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeRole(claims.role)) {
      return reply.code(403).send({ error: "only owners and dispatchers may import jobs" });
    }

    const parsed = importJobsBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const created: typeof jobs.$inferSelect[] = [];
    const skipped: Array<{ index: number; reason: string }> = [];
    const rows = parsed.data.jobs;

    await db.transaction(async (tx) => {
      // Warm the customer lookup cache once for the whole batch.
      const allCustomers = await tx
        .select()
        .from(customers)
        .where(eq(customers.orgId, orgId));
      const byId = new Map<string, typeof customers.$inferSelect>(allCustomers.map((c) => [c.id, c]));
      const byPhone = new Map<string, typeof customers.$inferSelect>();
      const byEmail = new Map<string, typeof customers.$inferSelect>();
      const byName = new Map<string, typeof customers.$inferSelect>();
      for (const c of allCustomers) {
        if (c.phone) byPhone.set(c.phone.trim().toLowerCase(), c);
        if (c.email) byEmail.set(c.email.trim().toLowerCase(), c);
        if (c.name) byName.set(c.name.trim().toLowerCase(), c);
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        let customerId = row.customerId ?? null;

        if (row.customerId) {
          const known = byId.get(row.customerId);
          if (!known) {
            skipped.push({ index: i, reason: "customer not found in this organization" });
            continue;
          }
        } else if (row.customer) {
          const { phone, email, name } = row.customer;
          const phoneKey = phone ? phone.trim().toLowerCase() : "";
          const emailKey = email ? email.trim().toLowerCase() : "";
          const nameKey = name.trim().toLowerCase();
          const match =
            (phoneKey && byPhone.get(phoneKey)) ||
            (emailKey && EMAIL_RE.test(emailKey) && byEmail.get(emailKey)) ||
            byName.get(nameKey);

          if (match) {
            customerId = match.id;
          } else {
            if (email && !EMAIL_RE.test(email)) {
              skipped.push({ index: i, reason: "invalid email, customer not created" });
              continue;
            }
            const [next] = await tx
              .insert(customers)
              .values({
                orgId,
                name: name.trim(),
                phone: phone?.trim() ? phone.trim() : null,
                email: email?.trim() ? email.trim() : null,
              })
              .returning();
            byId.set(next.id, next);
            if (next.phone) byPhone.set(next.phone.trim().toLowerCase(), next);
            if (next.email) byEmail.set(next.email.trim().toLowerCase(), next);
            if (next.name) byName.set(next.name.trim().toLowerCase(), next);
            customerId = next.id;
          }
        } else {
          skipped.push({ index: i, reason: "no customer reference provided" });
          continue;
        }
        if (!customerId) {
          skipped.push({ index: i, reason: "could not resolve a customer" });
          continue;
        }

        const jobDate = parseImportDate(row.date);
        if (row.date && !jobDate) {
          skipped.push({ index: i, reason: "invalid date, expected YYYY-MM-DD" });
          continue;
        }

        const number = await allocateNumberInOrg(tx, orgId);
        const [job] = await tx
          .insert(jobs)
          .values({
            orgId,
            customerId,
            number,
            title: row.title,
            description: row.description?.trim() || null,
            status: row.status,
            source: "staff",
            preferredDate: jobDate ? jobDate.toISOString().slice(0, 10) : null,
            scheduledAt: jobDate,
            createdAt: jobDate,
            updatedAt: jobDate,
            total: row.total,
          })
          .returning();
        await tx.insert(jobStatusHistory).values({
          orgId,
          jobId: job.id,
          fromStatus: null,
          toStatus: job.status,
          changedBy: claims.userId,
          reason: "imported historical job",
        });
        created.push(job);
      }
    });

    if (created.length > 0) {
      safeEmitActivity(orgId, "job.created", `Imported ${created.length} historical job${created.length === 1 ? "" : "s"}`, {
        customerId: created[0].customerId,
      });
      void safeEmitEvent(orgId, "job.import", {
        count: created.length,
        skipped: skipped.length,
      });
    }

    return { created, skipped };
  });
}