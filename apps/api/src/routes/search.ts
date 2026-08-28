import type { FastifyInstance } from "fastify";
import { and, eq, ilike, or } from "drizzle-orm";
import {
  db,
  jobs,
  customers,
  invoices,
  estimates,
  appointments,
  equipment,
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
        invoices: [],
        estimates: [],
        appointments: [],
        equipment: [],
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

    const [jobResults, customerResults, invoiceResults, estimateResults, appointmentResults, equipmentResults, repairBrain] =
      await Promise.all([
        db
          .select({ id: jobs.id, title: jobs.title, status: jobs.status })
          .from(jobs)
          .where(and(eq(jobs.orgId, orgId), ilike(jobs.title, term)))
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
      invoices: invoiceResults,
      estimates: estimateResults,
      appointments: appointmentResults.map((row) => ({
        id: row.id,
        jobTitle: row.jobTitle,
        startsAt: row.startsAt.toISOString(),
      })),
      equipment: equipmentMapped,
      repairBrain,
    };
  });
}
