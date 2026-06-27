import type { FastifyInstance } from "fastify";
import { eq, and, sql } from "drizzle-orm";
import { db, jobs, invoices, reviews } from "@ofp/db";
import { resolveOrgId } from "./org.js";

// Owner dashboard numbers: pipeline by status, revenue collected, A/R, ratings.
export async function reportRoutes(app: FastifyInstance) {
  app.get("/summary", async (req) => {
    const orgId = await resolveOrgId(req);

    const byStatus = await db
      .select({ status: jobs.status, count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(eq(jobs.orgId, orgId))
      .groupBy(jobs.status);

    const [revenue] = await db
      .select({ cents: sql<number>`coalesce(sum(total),0)::int` })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.status, "paid")));

    const [receivable] = await db
      .select({ cents: sql<number>`coalesce(sum(total),0)::int` })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.status, "sent")));

    const [rating] = await db
      .select({ avg: sql<number>`coalesce(avg(rating),0)::float`, count: sql<number>`count(*)::int` })
      .from(reviews)
      .where(eq(reviews.orgId, orgId));

    return {
      jobsByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.count])),
      revenueCollectedCents: revenue.cents,
      accountsReceivableCents: receivable.cents,
      rating: { average: rating.avg, count: rating.count },
    };
  });
}
