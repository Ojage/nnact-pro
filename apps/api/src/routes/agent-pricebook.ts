// Price Book Agent endpoints. The agent keeps prices fresh by proposing
// pending observations from real purchases (supplier bill lines) for a person
// to confirm. It never writes a price of its own: the server takes the amount,
// shop and date from the bill line, and the observation stays `pending` until
// someone confirms it through the existing Price Book screens.
//
//   GET  /agent/pricebook/freshness      stale items, and bill lines that match them
//   POST /agent/pricebook/observations   propose one pending observation from a bill line
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, priceBookCategories, priceBookItems, priceObservations, supplierBillLines, supplierBills } from "@nnact/db";
import { AGENT_SCOPES, isAgentClaims, requireAgentScope, type AgentScope } from "@nnact/shared";
import { appendEvent } from "../agent-office/events.js";
import { matchItemByName } from "../price-book/pricing.js";

const AGENT = "pricebook-agent";
const LOOKBACK_DAYS = 120;

async function agentClaims(req: FastifyRequest, reply: FastifyReply, scope: AgentScope) {
  try {
    await req.jwtVerify();
  } catch {
    await reply.code(401).send({ error: "agent session required" });
    return null;
  }
  const claims = req.user;
  if (!isAgentClaims(claims) || !requireAgentScope(claims, AGENT, scope)) {
    await reply.code(isAgentClaims(claims) ? 403 : 401).send({ error: "price book agent token required" });
    return null;
  }
  return claims;
}

export interface StaleItem {
  itemId: string;
  name: string;
  category: string;
  freshnessDays: number;
  lastObservedAt: string | null;
  daysStale: number | null;
}

export interface BillLineMatch {
  itemId: string;
  billLineId: string;
  description: string;
  unitPriceCents: number;
  issueDate: string;
}

/** Items whose newest confirmed price is older than their category allows, or that have none. */
export async function staleItems(orgId: string, now = new Date()): Promise<StaleItem[]> {
  const rows = await db
    .select({
      itemId: priceBookItems.id,
      name: priceBookItems.canonicalName,
      category: priceBookCategories.name,
      freshnessDays: priceBookCategories.freshnessDays,
      lastObservedAt: sql<Date | null>`(select max(o.observed_at) from price_observations o where o.item_id = ${priceBookItems.id} and o.status = 'confirmed')`,
    })
    .from(priceBookItems)
    .innerJoin(priceBookCategories, eq(priceBookCategories.id, priceBookItems.categoryId))
    .where(and(eq(priceBookItems.orgId, orgId), eq(priceBookItems.active, true), eq(priceBookCategories.active, true)));
  return rows
    .map((row) => {
      const last = row.lastObservedAt ? new Date(row.lastObservedAt) : null;
      const ageDays = last ? Math.floor((now.getTime() - last.getTime()) / 86_400_000) : null;
      return {
        itemId: row.itemId,
        name: row.name,
        category: row.category,
        freshnessDays: row.freshnessDays,
        lastObservedAt: last ? last.toISOString() : null,
        daysStale: ageDays === null ? null : ageDays - row.freshnessDays,
      };
    })
    .filter((item) => item.daysStale === null || item.daysStale > 0)
    .sort((a, b) => (b.daysStale ?? Number.MAX_SAFE_INTEGER) - (a.daysStale ?? Number.MAX_SAFE_INTEGER));
}

/**
 * Supplier bill lines newer than each stale item's last price whose
 * description matches the item's name or aliases exactly (after the same
 * normalization the Price Book uses), and that were not proposed before.
 */
export async function matchBillLines(orgId: string, stale: readonly StaleItem[], now = new Date()): Promise<BillLineMatch[]> {
  if (stale.length === 0) return [];
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  const [items, lines, proposed] = await Promise.all([
    db
      .select({ id: priceBookItems.id, canonicalName: priceBookItems.canonicalName, aliases: priceBookItems.aliases })
      .from(priceBookItems)
      .where(inArray(priceBookItems.id, stale.map((item) => item.itemId))),
    db
      .select({
        id: supplierBillLines.id,
        description: supplierBillLines.description,
        unitPriceCents: supplierBillLines.unitPriceCents,
        issueDate: supplierBills.issueDate,
      })
      .from(supplierBillLines)
      .innerJoin(supplierBills, eq(supplierBills.id, supplierBillLines.billId))
      .where(and(eq(supplierBills.orgId, orgId), gte(supplierBills.issueDate, since)))
      .orderBy(desc(supplierBills.issueDate))
      .limit(500),
    db
      .select({ ref: priceObservations.receiptMediaRef })
      .from(priceObservations)
      .where(and(eq(priceObservations.orgId, orgId), sql`${priceObservations.receiptMediaRef} like 'bill-line:%'`)),
  ]);
  const done = new Set(proposed.map((row) => row.ref));
  const lastBy = new Map(stale.map((item) => [item.itemId, item.lastObservedAt ? new Date(item.lastObservedAt) : null]));
  const matches: BillLineMatch[] = [];
  for (const line of lines) {
    if (done.has(`bill-line:${line.id}`) || line.unitPriceCents <= 0) continue;
    const item = matchItemByName(items, line.description);
    if (!item) continue;
    const last = lastBy.get(item.id);
    if (last && line.issueDate <= last) continue;
    matches.push({
      itemId: item.id,
      billLineId: line.id,
      description: line.description.slice(0, 200),
      unitPriceCents: line.unitPriceCents,
      issueDate: line.issueDate.toISOString(),
    });
  }
  return matches;
}

const proposeBody = z.object({ itemId: z.string().uuid(), billLineId: z.string().uuid(), runId: z.string().uuid().optional() });

export async function agentPricebookRoutes(app: FastifyInstance) {
  app.get("/agent/pricebook/freshness", async (req, reply) => {
    const claims = await agentClaims(req, reply, AGENT_SCOPES.priceBookRead);
    if (!claims) return;
    const stale = await staleItems(claims.orgId);
    const matches = await matchBillLines(claims.orgId, stale);
    return { stale, matches };
  });

  app.post("/agent/pricebook/observations", async (req, reply) => {
    const claims = await agentClaims(req, reply, AGENT_SCOPES.priceObservationsCreate);
    if (!claims) return;
    const parsed = proposeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { itemId, billLineId } = parsed.data;
    const [item] = await db
      .select({ id: priceBookItems.id, canonicalName: priceBookItems.canonicalName, aliases: priceBookItems.aliases })
      .from(priceBookItems)
      .where(and(eq(priceBookItems.id, itemId), eq(priceBookItems.orgId, claims.orgId), eq(priceBookItems.active, true)))
      .limit(1);
    const [line] = await db
      .select({
        id: supplierBillLines.id,
        description: supplierBillLines.description,
        unitPriceCents: supplierBillLines.unitPriceCents,
        issueDate: supplierBills.issueDate,
        supplierName: supplierBills.supplierName,
      })
      .from(supplierBillLines)
      .innerJoin(supplierBills, eq(supplierBills.id, supplierBillLines.billId))
      .where(and(eq(supplierBillLines.id, billLineId), eq(supplierBills.orgId, claims.orgId)))
      .limit(1);
    if (!item || !line) return reply.code(404).send({ error: "item or bill line not found" });
    // Code enforces the match the agent claims.
    if (!matchItemByName([item], line.description)) return reply.code(422).send({ error: "the bill line does not name this item" });
    if (line.unitPriceCents <= 0) return reply.code(422).send({ error: "the bill line has no unit price" });

    const ref = `bill-line:${line.id}`;
    const [existing] = await db
      .select({ id: priceObservations.id })
      .from(priceObservations)
      .where(and(eq(priceObservations.orgId, claims.orgId), eq(priceObservations.receiptMediaRef, ref)))
      .limit(1);
    if (existing) return reply.code(200).send({ id: existing.id, created: false });

    const [row] = await db
      .insert(priceObservations)
      .values({
        orgId: claims.orgId,
        itemId: item.id,
        amountCents: line.unitPriceCents,
        shopName: line.supplierName.slice(0, 200),
        observedAt: line.issueDate,
        confidence: 70,
        source: "receipt",
        status: "pending",
        receiptMediaRef: ref,
      })
      .returning({ id: priceObservations.id });
    await appendEvent({ orgId: claims.orgId, agentId: AGENT, type: "approvals" });
    return reply.code(201).send({ id: row!.id, created: true });
  });
}
