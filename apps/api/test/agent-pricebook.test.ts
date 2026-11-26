// Price Book Agent: staleness, exact alias matching against supplier bill
// lines, and pending observations whose price comes only from the bill line.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";

process.env.NODE_ENV = "test";

const { buildServer } = await import("../src/server.js");
const { db, closeDb, orgs, priceBookCategories, priceBookItems, priceObservations, supplierBills, supplierBillLines } = await import("@nnact/db");
const { eq, sql } = await import("drizzle-orm");

let reachable = false;
try {
  await Promise.race([db.execute(sql`select 1 from price_observations limit 1`), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3_000))]);
  reachable = true;
} catch {
  reachable = false;
}

const ORG = randomUUID();
const app = buildServer();
const ids = { category: randomUUID(), relay: randomUUID(), gas: randomUUID(), fresh: randomUUID(), bill: randomUUID(), lineRelay: randomUUID(), lineOther: randomUUID() };
const token = (scopes: string[], agentId = "pricebook-agent") => ({
  authorization: `Bearer ${app.jwt.sign({ aud: "agent", agent_id: agentId, orgId: ORG, scope: scopes[0], scopes })}`,
});
const READ = () => token(["price-book:read"]);
const WRITE = () => token(["price-observations:create"]);

describe("price book agent", { skip: reachable ? false : "no migrated Postgres in DATABASE_URL" }, () => {
  before(async () => {
    await app.ready();
    await db.insert(orgs).values({ id: ORG, name: "Price book test org" });
    await db.insert(priceBookCategories).values({ id: ids.category, orgId: ORG, name: "Refrigeration parts", freshnessDays: 30 });
    await db.insert(priceBookItems).values([
      { id: ids.relay, orgId: ORG, categoryId: ids.category, canonicalName: "Start relay", aliases: { en: ["PTC relay"], fr: ["relais de démarrage"] } },
      { id: ids.gas, orgId: ORG, categoryId: ids.category, canonicalName: "R600a gas" },
      { id: ids.fresh, orgId: ORG, categoryId: ids.category, canonicalName: "Thermostat" },
    ]);
    const old = new Date(Date.now() - 90 * 86_400_000);
    await db.insert(priceObservations).values([
      { orgId: ORG, itemId: ids.relay, amountCents: 300_000, observedAt: old },
      { orgId: ORG, itemId: ids.fresh, amountCents: 800_000, observedAt: new Date() },
    ]);
    await db.insert(supplierBills).values({
      id: ids.bill,
      orgId: ORG,
      number: `B-${ORG.slice(0, 6)}`,
      supplierName: "Molyko Spares",
      issueDate: new Date(Date.now() - 5 * 86_400_000),
      subTotalCents: 900_000,
      totalCents: 900_000,
    });
    await db.insert(supplierBillLines).values([
      { id: ids.lineRelay, orgId: ORG, billId: ids.bill, description: "Relais de démarrage", quantity: 2, unitPriceCents: 350_000, amountCents: 700_000 },
      { id: ids.lineOther, orgId: ORG, billId: ids.bill, description: "Transport", quantity: 1, unitPriceCents: 200_000, amountCents: 200_000 },
    ]);
  });

  after(async () => {
    await app.close();
    await db.delete(orgs).where(eq(orgs.id, ORG)).catch(() => undefined);
  });

  test("freshness lists stale and never-priced items and matches bill lines by alias", async () => {
    const res = await app.inject({ method: "GET", url: "/api/agent/pricebook/freshness", headers: READ() });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    const staleIds = body.stale.map((item: { itemId: string }) => item.itemId).sort();
    assert.deepEqual(staleIds, [ids.relay, ids.gas].sort());
    assert.deepEqual(body.matches, [
      { itemId: ids.relay, billLineId: ids.lineRelay, description: "Relais de démarrage", unitPriceCents: 350_000, issueDate: body.matches[0].issueDate },
    ]);
  });

  test("a proposal takes its price from the bill line and stays pending", async () => {
    const res = await app.inject({ method: "POST", url: "/api/agent/pricebook/observations", headers: WRITE(), payload: { itemId: ids.relay, billLineId: ids.lineRelay, amountCents: 1 } });
    assert.equal(res.statusCode, 201);
    const [row] = await db.select().from(priceObservations).where(eq(priceObservations.id, res.json().id));
    assert.equal(row!.amountCents, 350_000, "the agent cannot set the price");
    assert.equal(row!.status, "pending");
    assert.equal(row!.source, "receipt");
    assert.equal(row!.shopName, "Molyko Spares");

    const again = await app.inject({ method: "POST", url: "/api/agent/pricebook/observations", headers: WRITE(), payload: { itemId: ids.relay, billLineId: ids.lineRelay } });
    assert.equal(again.statusCode, 200);
    assert.equal(again.json().created, false);
    const listed = (await app.inject({ method: "GET", url: "/api/agent/pricebook/freshness", headers: READ() })).json();
    assert.deepEqual(listed.matches, [], "a proposed line is not offered again");
  });

  test("a bill line that does not name the item is refused", async () => {
    const res = await app.inject({ method: "POST", url: "/api/agent/pricebook/observations", headers: WRITE(), payload: { itemId: ids.gas, billLineId: ids.lineOther } });
    assert.equal(res.statusCode, 422);
  });

  test("scopes are enforced per endpoint and per agent", async () => {
    assert.equal((await app.inject({ method: "GET", url: "/api/agent/pricebook/freshness", headers: WRITE() })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: "/api/agent/pricebook/observations", headers: READ(), payload: { itemId: ids.relay, billLineId: ids.lineRelay } })).statusCode, 403);
    assert.equal((await app.inject({ method: "GET", url: "/api/agent/pricebook/freshness", headers: token(["price-book:read"], "quoting-agent") })).statusCode, 403);
  });
});

after(async () => {
  await closeDb();
});
