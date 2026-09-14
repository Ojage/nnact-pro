import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db, pettyCashFunds, pettyCashTransactions, users } from "@nnact/db";
import type { PettyCashFundDTO, PettyCashTransactionDTO, PettyCashKind } from "@nnact/shared";
import { PETTY_CASH_KIND } from "@nnact/shared";
import { resolveOrgId } from "./org.js";
import { verifiedClaims } from "../operational-authorization.js";
import { isOfficeRole, officeWriter } from "../finance-utils.js";
import { validateOrgIds } from "../finance-validate.js";
import { safeEmitActivity } from "../activities.js";

const createFund = z.object({
  name: z.string().trim().min(1).max(120),
  custodianId: z.string().uuid().optional().nullable(),
  openingBalanceCents: z.number().int().nonnegative().max(999_999_999).default(0),
});

const patchFund = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  custodianId: z.string().uuid().optional().nullable(),
});

const depositBody = z.object({
  amountCents: z.number().int().positive().max(999_999_999),
  description: z.string().trim().max(1000).optional().nullable(),
});

const expenseBody = z.object({
  amountCents: z.number().int().positive().max(999_999_999),
  categoryId: z.string().uuid().optional().nullable(),
  costCenterId: z.string().uuid().optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
});

const closeBody = z.object({
  /** Remainder returned to the main float. Defaults to current balance. */
  returnAmountCents: z.number().int().nonnegative().optional(),
  description: z.string().trim().max(1000).optional().nullable(),
});

type FundRow = typeof pettyCashFunds.$inferSelect;

async function hydrateFunds(orgId: string, rows: FundRow[]): Promise<PettyCashFundDTO[]> {
  if (!rows.length) return [];
  const custodianIds = new Set(rows.map((r) => r.custodianId).filter(Boolean) as string[]);
  const custodians = custodianIds.size
    ? await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.orgId, orgId), inArray(users.id, [...custodianIds])))
    : [];
  const map = new Map(custodians.map((c) => [c.id, c.name]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    custodianId: r.custodianId,
    custodianName: r.custodianId ? map.get(r.custodianId) ?? null : null,
    openingBalanceCents: r.openingBalanceCents,
    currentBalanceCents: r.currentBalanceCents,
    status: r.status,
    closedAt: r.closedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

async function findFund(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(pettyCashFunds)
    .where(and(eq(pettyCashFunds.orgId, orgId), eq(pettyCashFunds.id, id)))
    .limit(1);
  return row;
}

export async function financePettyCashRoutes(app: FastifyInstance) {
  app.get("/finance/petty-cash", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeWriter(claims.role)) return reply.code(403).send({ error: "office role required" });
    const rows = await db
      .select()
      .from(pettyCashFunds)
      .where(eq(pettyCashFunds.orgId, orgId))
      .orderBy(pettyCashFunds.createdAt);
    return hydrateFunds(orgId, rows);
  });

  app.post("/finance/petty-cash", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeWriter(claims.role)) return reply.code(403).send({ error: "office role required" });
    const parsed = createFund.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const validated = await validateOrgIds(orgId, { employeeId: parsed.data.custodianId });
    if (!validated.ok) return reply.code(400).send({ error: validated.error });

    const [fund] = await db
      .insert(pettyCashFunds)
      .values({
        orgId,
        name: parsed.data.name,
        custodianId: parsed.data.custodianId ?? null,
        openingBalanceCents: parsed.data.openingBalanceCents,
        currentBalanceCents: parsed.data.openingBalanceCents,
      })
      .returning();
    if (parsed.data.openingBalanceCents > 0) {
      await db.insert(pettyCashTransactions).values({
        orgId,
        fundId: fund.id,
        kind: "DEPOSIT",
        amountCents: parsed.data.openingBalanceCents,
        description: "Opening balance",
        createdBy: claims.userId,
      });
    }
    safeEmitActivity(orgId, "petty_cash.fund_created", `Created petty cash fund ${fund.name}`, {});
    const [dto] = await hydrateFunds(orgId, [fund]);
    return reply.code(201).send(dto);
  });

  app.patch("/finance/petty-cash/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeWriter(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const parsed = patchFund.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const fund = await findFund(orgId, id);
    if (!fund) return reply.code(404).send({ error: "not found" });
    if (fund.status !== "active") return reply.code(409).send({ error: "fund is closed" });
    const validated = await validateOrgIds(orgId, { employeeId: parsed.data.custodianId });
    if (!validated.ok) return reply.code(400).send({ error: validated.error });
    const [row] = await db
      .update(pettyCashFunds)
      .set({ name: parsed.data.name, custodianId: parsed.data.custodianId })
      .where(and(eq(pettyCashFunds.orgId, orgId), eq(pettyCashFunds.id, id)))
      .returning();
    const [dto] = await hydrateFunds(orgId, [row]);
    return dto;
  });

  app.get("/finance/petty-cash/:id/transactions", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeWriter(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const fund = await findFund(orgId, id);
    if (!fund) return reply.code(404).send({ error: "fund not found" });
    const rows = await db
      .select()
      .from(pettyCashTransactions)
      .where(and(eq(pettyCashTransactions.orgId, orgId), eq(pettyCashTransactions.fundId, id)))
      .orderBy(desc(pettyCashTransactions.happenedAt));
    const dto: PettyCashTransactionDTO[] = rows.map((r) => ({
      id: r.id,
      fundId: r.fundId,
      kind: r.kind as PettyCashKind,
      amountCents: r.amountCents,
      categoryId: r.categoryId,
      costCenterId: r.costCenterId,
      description: r.description,
      happenedAt: r.happenedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
    return dto;
  });

  app.post("/finance/petty-cash/:id/deposit", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const parsed = depositBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const result = await db.transaction(async (tx) => {
      const [fund] = await tx
        .select()
        .from(pettyCashFunds)
        .where(and(eq(pettyCashFunds.orgId, orgId), eq(pettyCashFunds.id, id)))
        .for("update");
      if (!fund) return { kind: "not-found" as const };
      if (fund.status !== "active") return { kind: "closed" as const };
      const [txn] = await tx
        .insert(pettyCashTransactions)
        .values({
          orgId,
          fundId: id,
          kind: "TOP_UP",
          amountCents: parsed.data.amountCents,
          description: parsed.data.description ?? "Top-up",
          createdBy: claims.userId,
        })
        .returning();
      const [updated] = await tx
        .update(pettyCashFunds)
        .set({ currentBalanceCents: fund.currentBalanceCents + parsed.data.amountCents, version: fund.version + 1 })
        .where(eq(pettyCashFunds.id, id))
        .returning();
      return { kind: "ok" as const, fund: updated, txn };
    });
    if (result.kind === "not-found") return reply.code(404).send({ error: "fund not found" });
    if (result.kind === "closed") return reply.code(409).send({ error: "fund is closed" });
    safeEmitActivity(orgId, "petty_cash.deposit", `Topped up petty cash fund by ${result.txn.amountCents}`, {});
    const [dto] = await hydrateFunds(orgId, [result.fund]);
    return dto;
  });

  app.post("/finance/petty-cash/:id/expense", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const parsed = expenseBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const validated = await validateOrgIds(orgId, { categoryId: parsed.data.categoryId, costCenterId: parsed.data.costCenterId });
    if (!validated.ok) return reply.code(400).send({ error: validated.error });

    const result = await db.transaction(async (tx) => {
      const [fund] = await tx
        .select()
        .from(pettyCashFunds)
        .where(and(eq(pettyCashFunds.orgId, orgId), eq(pettyCashFunds.id, id)))
        .for("update");
      if (!fund) return { kind: "not-found" as const };
      if (fund.status !== "active") return { kind: "closed" as const };
      if (parsed.data.amountCents > fund.currentBalanceCents) {
        return { kind: "short" as const, balance: fund.currentBalanceCents };
      }
      const [txn] = await tx
        .insert(pettyCashTransactions)
        .values({
          orgId,
          fundId: id,
          kind: "EXPENSE",
          amountCents: parsed.data.amountCents,
          categoryId: parsed.data.categoryId ?? null,
          costCenterId: parsed.data.costCenterId ?? null,
          description: parsed.data.description ?? null,
          createdBy: claims.userId,
        })
        .returning();
      const [updated] = await tx
        .update(pettyCashFunds)
        .set({ currentBalanceCents: fund.currentBalanceCents - parsed.data.amountCents, version: fund.version + 1 })
        .where(eq(pettyCashFunds.id, id))
        .returning();
      return { kind: "ok" as const, fund: updated, txn };
    });
    if (result.kind === "not-found") return reply.code(404).send({ error: "fund not found" });
    if (result.kind === "closed") return reply.code(409).send({ error: "fund is closed" });
    if (result.kind === "short") return reply.code(422).send({ error: `fund only has ${result.balance} available`, code: "insufficient_funds" });
    safeEmitActivity(orgId, "petty_cash.expense", `Petty cash expense of ${result.txn.amountCents} (${result.txn.description ?? "no description"})`, {});
    const [dto] = await hydrateFunds(orgId, [result.fund]);
    return dto;
  });

  app.post("/finance/petty-cash/:id/close", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const parsed = closeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const result = await db.transaction(async (tx) => {
      const [fund] = await tx
        .select()
        .from(pettyCashFunds)
        .where(and(eq(pettyCashFunds.orgId, orgId), eq(pettyCashFunds.id, id)))
        .for("update");
      if (!fund) return { kind: "not-found" as const };
      if (fund.status !== "active") return { kind: "already-closed" as const };
      const returned = parsed.data.returnAmountCents ?? fund.currentBalanceCents;
      if (returned < 0 || returned > fund.currentBalanceCents) {
        return { kind: "invalid-return" as const, balance: fund.currentBalanceCents };
      }
      if (returned > 0) {
        await tx.insert(pettyCashTransactions).values({
          orgId,
          fundId: id,
          kind: "CLOSEOUT",
          amountCents: returned,
          description: parsed.data.description ?? "Fund closeout",
          createdBy: claims.userId,
        });
      }
      const [updated] = await tx
        .update(pettyCashFunds)
        .set({
          currentBalanceCents: fund.currentBalanceCents - returned,
          status: "closed",
          closedAt: new Date(),
          version: fund.version + 1,
        })
        .where(eq(pettyCashFunds.id, id))
        .returning();
      return { kind: "ok" as const, fund: updated };
    });
    if (result.kind === "not-found") return reply.code(404).send({ error: "fund not found" });
    if (result.kind === "already-closed") return reply.code(409).send({ error: "fund already closed" });
    if (result.kind === "invalid-return") return reply.code(422).send({ error: `return amount exceeds fund balance of ${result.balance}` });
    safeEmitActivity(orgId, "petty_cash.closed", `Closed petty cash fund ${result.fund.name}`, {});
    const [dto] = await hydrateFunds(orgId, [result.fund]);
    return dto;
  });
}