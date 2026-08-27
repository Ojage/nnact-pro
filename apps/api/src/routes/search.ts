import type { FastifyInstance } from "fastify";
import { eq, and, ilike } from "drizzle-orm";
import { db, jobs, customers, invoices } from "@nnact/db";
import { resolveOrgId } from "./org.js";

// ponytail: flat text search, no full-text index. Ceiling: slow on large datasets.
// Upgrade: use PostgreSQL tsvector column + GIN index.
export async function searchRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const { q } = req.query as { q?: string };
    if (!q || q.trim().length < 2) return { jobs: [], customers: [], invoices: [] };

    const term = `%${q.trim()}%`;

    const [jobResults, customerResults, invoiceResults] = await Promise.all([
      db
        .select({ id: jobs.id, title: jobs.title })
        .from(jobs)
        .where(and(eq(jobs.orgId, orgId), ilike(jobs.title, term)))
        .limit(5),
      db
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(and(eq(customers.orgId, orgId), ilike(customers.name, term)))
        .limit(5),
      db
        .select({ id: invoices.id, number: invoices.number })
        .from(invoices)
        .where(and(eq(invoices.orgId, orgId), ilike(invoices.number, term)))
        .limit(5),
    ]);

    return { jobs: jobResults, customers: customerResults, invoices: invoiceResults };
  });
}
