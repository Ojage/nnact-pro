import type { FastifyInstance } from "fastify";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import {
  db,
  jobs,
  customers,
  invoices,
  estimates,
  appointments,
  equipment,
  users,
  servicePlans,
} from "@nnact/db";
import { resolveOrgId } from "./org.js";
import { searchRepairBrain } from "../repair-brain.js";

// ponytail: flat text search, no full-text index. Ceiling: slow on large datasets.
export async function searchRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const { q } = req.query as { q?: string };
    if (!q || q.trim().length < 2) {
      return {
        jobs: [],
        customers: [],
        team: [],
        invoices: [],
        estimates: [],
        appointments: [],
        equipment: [],
        servicePlans: [],
        repairBrain: {
          models: [],
          faults: [],
          parts: [],
          procedures: [],
          documents: [],
          repairHistory: [],
        },
      };
    }

    const term = `%${q.trim()}%`;

    const [jobResults, customerResults, teamResults, invoiceResults, estimateResults, appointmentResults, equipmentResults, servicePlanResults, repairBrain] =
      await Promise.all([
        db
          .select({ id: jobs.id, title: jobs.title, number: jobs.number, status: jobs.status })
          .from(jobs)
          .where(
            and(
              eq(jobs.orgId, orgId),
              or(ilike(jobs.title, term), ilike(jobs.number, term)),
            ),
          )
          .limit(6),
        db
          .select({
            id: customers.id,
            name: customers.name,
            email: customers.email,
            phone: customers.phone,
          })
          .from(customers)
          .where(
            and(
              eq(customers.orgId, orgId),
              or(ilike(customers.name, term), ilike(customers.email, term), ilike(customers.phone, term)),
            ),
          )
          .limit(6),
        db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
          })
          .from(users)
          .where(
            and(
              eq(users.orgId, orgId),
              eq(users.active, true),
              or(ilike(users.name, term), ilike(users.email, term)),
            ),
          )
          .limit(6),
        db
          .select({ id: invoices.id, number: invoices.number, status: invoices.status })
          .from(invoices)
          .where(and(eq(invoices.orgId, orgId), ilike(invoices.number, term)))
          .limit(6),
        db
          .select({ id: estimates.id, number: estimates.number, status: estimates.status })
          .from(estimates)
          .where(and(eq(estimates.orgId, orgId), ilike(estimates.number, term)))
          .limit(6),
        db
          .select({
            id: appointments.id,
            jobId: appointments.jobId,
            jobTitle: jobs.title,
            startsAt: appointments.startsAt,
          })
          .from(appointments)
          .innerJoin(jobs, eq(appointments.jobId, jobs.id))
          .where(and(eq(appointments.orgId, orgId), ilike(jobs.title, term)))
          .limit(6),
        db
          .select({
            id: equipment.id,
            label: equipment.type,
            make: equipment.make,
            model: equipment.model,
            serialNumber: equipment.serialNumber,
          })
          .from(equipment)
          .where(
            and(
              eq(equipment.orgId, orgId),
              or(
                ilike(equipment.type, term),
                ilike(equipment.make, term),
                ilike(equipment.model, term),
                ilike(equipment.serialNumber, term),
              ),
            ),
          )
          .limit(6),
        db
          .select({ id: servicePlans.id, name: servicePlans.name })
          .from(servicePlans)
          .where(
            and(
              eq(servicePlans.orgId, orgId),
              sql`${servicePlans.status} <> 'archived'`,
              ilike(servicePlans.name, term),
            ),
          )
          .limit(6),
        searchRepairBrain(orgId, q, 5),
      ]);

    const equipmentMapped = equipmentResults.map((row) => ({
      id: row.id,
      label: [row.make, row.model].filter(Boolean).join(" ") || row.label,
      serialNumber: row.serialNumber,
    }));

    return {
      jobs: jobResults,
      customers: customerResults,
      team: teamResults,
      invoices: invoiceResults,
      estimates: estimateResults,
      appointments: appointmentResults.map((row) => ({
        id: row.id,
        jobId: row.jobId,
        jobTitle: row.jobTitle,
        startsAt: row.startsAt.toISOString(),
      })),
      equipment: equipmentMapped,
      servicePlans: servicePlanResults,
      repairBrain,
    };
  });
}
