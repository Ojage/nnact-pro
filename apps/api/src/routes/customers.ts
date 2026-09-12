import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, customers, properties } from "@nnact/db";
import { resolveOrgId } from "./org.js";
import { verifiedClaims } from "../operational-authorization.js";

const createBody = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

const patchBody = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const importRow = z.object({
  name: z.string().trim().min(1, "name is required"),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

const importBody = z.object({
  customers: z.array(importRow).min(1).max(500),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function officeRole(role: string): role is "owner" | "dispatcher" {
  return role === "owner" || role === "dispatcher";
}

export async function customerRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const { skip, take } = req.query as { skip?: string; take?: string };
    const s = skip ? parseInt(skip, 10) : 0;
    const t = take ? parseInt(take, 10) : 50;
    return db
      .select()
      .from(customers)
      .where(eq(customers.orgId, orgId))
      .orderBy(desc(customers.createdAt))
      .limit(t)
      .offset(s);
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, id)));
    if (!row) return reply.code(404).send({ error: "not found" });

    const [site] = await db
      .select({ address: properties.address })
      .from(properties)
      .where(and(eq(properties.orgId, orgId), eq(properties.customerId, id)))
      .limit(1);

    return { ...row, primaryAddress: site?.address ?? null };
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .insert(customers)
      .values({ orgId, ...parsed.data })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .update(customers)
      .set(parsed.data)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  /**
   * Bulk-import customers from paper records. Skips rows whose normalized
   * phone/email already belongs to an existing customer in the org; returns a
   * per-row result so the UI can surface exactly what was skipped and why.
   */
  app.post("/import", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeRole(claims.role)) {
      return reply.code(403).send({ error: "only owners and dispatchers may import customers" });
    }

    const parsed = importBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    // Load existing contacts once so dedupe is a set lookup.
    const existing = await db
      .select({ phone: customers.phone, email: customers.email })
      .from(customers)
      .where(eq(customers.orgId, orgId));

    const norm = (v: string | null | undefined) => (v ? v.trim().toLowerCase() : "");
    const phones = new Set(existing.map((c) => norm(c.phone)).filter(Boolean));
    const emails = new Set(existing.map((c) => norm(c.email)).filter(Boolean));

    const created = [];
    const skipped: Array<{ index: number; reason: string }> = [];
    const rowData = parsed.data.customers;

    for (let i = 0; i < rowData.length; i++) {
      const row = rowData[i];
      const phone = norm(row.phone);
      const email = norm(row.email);
      if (row.email && !EMAIL_RE.test(row.email)) {
        skipped.push({ index: i, reason: "invalid email" });
        continue;
      }
      if (phone && phones.has(phone)) {
        skipped.push({ index: i, reason: "phone already exists" });
        continue;
      }
      if (email && emails.has(email)) {
        skipped.push({ index: i, reason: "email already exists" });
        continue;
      }
      const [next] = await db
        .insert(customers)
        .values({
          orgId,
          name: row.name,
          email: row.email?.trim() ? row.email.trim() : null,
          phone: row.phone?.trim() ? row.phone.trim() : null,
          notes: row.notes?.trim() ? row.notes.trim() : null,
        })
        .returning();
      created.push(next);
      if (phone) phones.add(phone);
      if (email) emails.add(email);
    }

    return { created, skipped };
  });
}
