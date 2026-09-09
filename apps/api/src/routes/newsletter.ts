import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, desc, ilike, or, sql } from "drizzle-orm";
import { db, newsletterSubscribers } from "@nnact/db";
import { resolveOrgId } from "./org.js";

const querySchema = z.object({
  skip: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 0)),
  take: z.string().optional().transform((v) => (v ? Math.min(parseInt(v, 10), 200) : 50)),
  search: z.string().optional(),
  status: z.enum(["subscribed", "unsubscribed", "bounced"]).optional(),
});

function buildConditions(orgId: string, search?: string, status?: string) {
  const conditions = [eq(newsletterSubscribers.orgId, orgId)];
  if (status) conditions.push(eq(newsletterSubscribers.status, status as "subscribed" | "unsubscribed" | "bounced"));
  if (search) {
    conditions.push(
      or(
        ilike(newsletterSubscribers.email, `%${search}%`),
        ilike(newsletterSubscribers.name ?? "", `%${search}%`),
      )!,
    );
  }
  return and(...conditions);
}

export async function newsletterAdminRoutes(app: FastifyInstance) {
  // List newsletter subscribers with pagination, search, and filter
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const { skip, take, search, status } = querySchema.parse(req.query);
    const where = buildConditions(orgId, search, status);

    const rows = await db
      .select()
      .from(newsletterSubscribers)
      .where(where)
      .orderBy(desc(newsletterSubscribers.createdAt))
      .limit(take)
      .offset(skip);

    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(newsletterSubscribers)
      .where(where);

    return { subscribers: rows, total: Number(total) };
  });

  // Export all subscribers as CSV
  app.get("/export", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { search, status } = querySchema.parse(req.query);
    const where = buildConditions(orgId, search, status);

    const rows = await db
      .select()
      .from(newsletterSubscribers)
      .where(where)
      .orderBy(desc(newsletterSubscribers.createdAt));

    const csvHeader = "id,email,name,phone,channels,source,status,verifiedAt,unsubscribedAt,createdAt\n";
    const csvRows = rows
      .map((r) =>
        [
          r.id,
          r.email,
          r.name ?? "",
          r.phone ?? "",
          Array.isArray(r.channels) ? r.channels.join(";") : String(r.channels),
          r.source,
          r.status,
          r.verifiedAt?.toISOString() ?? "",
          r.unsubscribedAt?.toISOString() ?? "",
          r.createdAt.toISOString(),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");

    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", `attachment; filename="newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv"`);
    return reply.send(csvHeader + csvRows);
  });

  // Update subscriber status (manual unsubscribe/resubscribe)
  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };

    const bodySchema = z.object({
      status: z.enum(["subscribed", "unsubscribed", "bounced"]).optional(),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [existing] = await db
      .select()
      .from(newsletterSubscribers)
      .where(and(eq(newsletterSubscribers.orgId, orgId), eq(newsletterSubscribers.id, id)));

    if (!existing) return reply.code(404).send({ error: "not found" });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.status) {
      updates.status = parsed.data.status;
      if (parsed.data.status === "unsubscribed") {
        updates.unsubscribedAt = new Date();
      } else if (parsed.data.status === "subscribed") {
        updates.unsubscribedAt = null;
      }
    }

    const [updated] = await db
      .update(newsletterSubscribers)
      .set(updates)
      .where(and(eq(newsletterSubscribers.orgId, orgId), eq(newsletterSubscribers.id, id)))
      .returning();

    return updated;
  });
}