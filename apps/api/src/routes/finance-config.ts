import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, expenseCategories, costCenters } from "@nnact/db";
import type { ExpenseCategoryDTO, CostCenterDTO } from "@nnact/shared";
import { resolveOrgId } from "./org.js";
import { verifiedClaims } from "../operational-authorization.js";
import { isOfficeRole } from "../finance-utils.js";

const categoryBody = z.object({
  name: z.string().trim().min(1).max(80),
});

const costCenterBody = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().min(1).max(20).optional(),
  description: z.string().trim().max(300).optional().nullable(),
});

function toCategory(row: typeof expenseCategories.$inferSelect): ExpenseCategoryDTO {
  return { id: row.id, name: row.name };
}

function toCostCenter(row: typeof costCenters.$inferSelect): CostCenterDTO {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
  };
}

export async function financeConfigRoutes(app: FastifyInstance) {
  // ── Expense categories ────────────────────────────────────────────────
  app.get("/finance/expense-categories", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const rows = await db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.orgId, orgId))
      .orderBy(expenseCategories.name);
    return rows.map(toCategory);
  });

  app.post("/finance/expense-categories", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const parsed = categoryBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [existing] = await db
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(and(eq(expenseCategories.orgId, orgId), eq(expenseCategories.name, parsed.data.name)))
      .limit(1);
    if (existing) return reply.code(409).send({ error: `category "${parsed.data.name}" already exists` });

    const [row] = await db
      .insert(expenseCategories)
      .values({ orgId, name: parsed.data.name, createdBy: claims.userId })
      .returning();
    return reply.code(201).send(toCategory(row));
  });

  app.patch("/finance/expense-categories/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const parsed = categoryBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [row] = await db
      .update(expenseCategories)
      .set({ name: parsed.data.name })
      .where(and(eq(expenseCategories.orgId, orgId), eq(expenseCategories.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return toCategory(row);
  });

  app.delete("/finance/expense-categories/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const [row] = await db
      .delete(expenseCategories)
      .where(and(eq(expenseCategories.orgId, orgId), eq(expenseCategories.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return { ok: true };
  });

  // ── Cost centers ──────────────────────────────────────────────────────
  app.get("/finance/cost-centers", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const rows = await db
      .select()
      .from(costCenters)
      .where(eq(costCenters.orgId, orgId))
      .orderBy(costCenters.name);
    return rows.map(toCostCenter);
  });

  app.post("/finance/cost-centers", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const parsed = costCenterBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [existing] = await db
      .select({ id: costCenters.id })
      .from(costCenters)
      .where(and(eq(costCenters.orgId, orgId), eq(costCenters.name, parsed.data.name)))
      .limit(1);
    if (existing) return reply.code(409).send({ error: `cost center "${parsed.data.name}" already exists` });

    const [row] = await db
      .insert(costCenters)
      .values({ orgId, name: parsed.data.name, code: parsed.data.code ?? null, description: parsed.data.description ?? null, createdBy: claims.userId })
      .returning();
    return reply.code(201).send(toCostCenter(row));
  });

  app.patch("/finance/cost-centers/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const parsed = costCenterBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [row] = await db
      .update(costCenters)
      .set({ name: parsed.data.name, code: parsed.data.code ?? null, description: parsed.data.description ?? null })
      .where(and(eq(costCenters.orgId, orgId), eq(costCenters.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return toCostCenter(row);
  });

  app.delete("/finance/cost-centers/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const [row] = await db
      .delete(costCenters)
      .where(and(eq(costCenters.orgId, orgId), eq(costCenters.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return { ok: true };
  });
}