import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";

process.env.NODE_ENV = "test";

const { buildServer } = await import("../src/server.js");
const {
  db,
  closeDb,
  customers,
  invoices,
  jobs,
  orgs,
  paymentReminders,
  payments,
  priceBookCategories,
  priceBookItems,
  priceObservations,
  sourcingSuggestions,
  supplierContacts,
  triageSuggestions,
  users,
} = await import("@nnact/db");
const { eq, sql } = await import("drizzle-orm");

let reachable = false;
try {
  await Promise.race([
    db.execute(sql`select 1 from triage_suggestions limit 1`),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3_000)),
  ]);
  reachable = true;
} catch {
  reachable = false;
}

const ORG = randomUUID();
const app = buildServer();
const ids = {
  owner: randomUUID(),
  customer: randomUUID(),
  job: randomUUID(),
  invoice: randomUUID(),
  category: randomUUID(),
  item: randomUUID(),
  supplier: randomUUID(),
};

const agentToken = (agentId: string, scopes: string[]) => ({
  authorization: `Bearer ${app.jwt.sign({ aud: "agent", agent_id: agentId, orgId: ORG, scope: scopes[0], scopes })}`,
});
const staff = (role = "owner") => ({ authorization: `Bearer ${app.jwt.sign({ aud: "staff", userId: ids.owner, orgId: ORG, role })}` });

describe("agent triage, sourcing and payments", { skip: reachable ? false : "no migrated Postgres in DATABASE_URL" }, () => {
  before(async () => {
    await app.ready();
    await db.insert(orgs).values({ id: ORG, name: "Agent workflows test org" });
    await db.insert(users).values({
      id: ids.owner,
      orgId: ORG,
      email: `owner-${ORG}@t.test`,
      name: "Owner",
      role: "owner",
    });
    await db.insert(customers).values({ id: ids.customer, orgId: ORG, name: "No Phone Customer" });
    await db.insert(jobs).values({
      id: ids.job,
      orgId: ORG,
      customerId: ids.customer,
      title: "Fridge not cooling",
      description: "Compressor runs but the cabinet stays warm.",
      status: "scheduled",
      serviceCategory: "refrigeration",
      neighborhood: "Molyko",
    });
    await db.insert(priceBookCategories).values({
      id: ids.category,
      orgId: ORG,
      name: "Refrigeration parts",
      freshnessDays: 30,
    });
    await db.insert(priceBookItems).values({
      id: ids.item,
      orgId: ORG,
      categoryId: ids.category,
      canonicalName: "Start relay",
    });
    await db.insert(priceObservations).values({
      orgId: ORG,
      itemId: ids.item,
      amountCents: 125_000,
      status: "confirmed",
      source: "manual",
      observedAt: new Date(),
    });
    await db.insert(supplierContacts).values({
      id: ids.supplier,
      orgId: ORG,
      name: "Molyko Spares",
      phone: "670000000",
      area: "Molyko",
    });
    await db.insert(invoices).values({
      id: ids.invoice,
      orgId: ORG,
      jobId: ids.job,
      number: `INV-${ORG.slice(0, 6)}`,
      status: "sent",
      total: 125_000,
      dueAt: new Date(Date.now() - 3 * 86_400_000),
    });
  });

  after(async () => {
    await app.close();
    await db.delete(orgs).where(eq(orgs.id, ORG)).catch(() => undefined);
  });

  test("triage suggestions are drafted, repriced by nobody, and reviewed by staff", async () => {
    const contextRes = await app.inject({
      method: "POST",
      url: `/api/agent/triage/jobs/${ids.job}/context`,
      headers: agentToken("triage-agent", ["jobs:read"]),
      payload: {},
    });
    assert.equal(contextRes.statusCode, 200);
    const context = contextRes.json() as { fingerprint: string };

    const invalid = await app.inject({
      method: "POST",
      url: "/api/agent/triage/suggestions",
      headers: agentToken("triage-agent", ["triage-suggestions:create"]),
      payload: {
        jobId: ids.job,
        fingerprint: context.fingerprint,
        symptoms: ["cabinet warm"],
        likelyFaults: [{ name: "failed relay", likelihood: 0.7 }],
        priority: "critical",
        rationale: "Symptoms point to the start circuit.",
        missingInformation: [],
        confidence: 0.7,
      },
    });
    assert.equal(invalid.statusCode, 400);

    const payload = {
      jobId: ids.job,
      runId: ids.triageRun,
      fingerprint: context.fingerprint,
      symptoms: ["cabinet warm"],
      likelyFaults: [{ name: "failed relay", likelihood: 0.7 }],
      priority: "high",
      rationale: "Symptoms point to the start circuit.",
      missingInformation: ["Ask whether the compressor clicks"],
      confidence: 0.7,
    };
    const created = await app.inject({
      method: "POST",
      url: "/api/agent/triage/suggestions",
      headers: agentToken("triage-agent", ["triage-suggestions:create"]),
      payload,
    });
    assert.equal(created.statusCode, 201);
    const suggestionId = created.json().id as string;
    const repeated = await app.inject({
      method: "POST",
      url: "/api/agent/triage/suggestions",
      headers: agentToken("triage-agent", ["triage-suggestions:create"]),
      payload,
    });
    assert.equal(repeated.statusCode, 200);
    assert.equal(repeated.json().id, suggestionId);

    const forbidden = await app.inject({
      method: "POST",
      url: "/api/agent/triage/suggestions",
      headers: agentToken("quoting-agent", ["jobs:read"]),
      payload,
    });
    assert.equal(forbidden.statusCode, 403);

    const rejected = await app.inject({
      method: "POST",
      url: `/api/triage/suggestions/${suggestionId}/reject`,
      headers: staff(),
      payload: { reason: "Technician already diagnosed this on site." },
    });
    assert.equal(rejected.statusCode, 200);
    assert.equal(rejected.json().state, "rejected");
    const [row] = await db.select().from(triageSuggestions).where(eq(triageSuggestions.id, suggestionId));
    assert.equal(row!.state, "rejected", "the suggestion never touches the job record");
    const [job] = await db.select().from(jobs).where(eq(jobs.id, ids.job));
    assert.equal(job!.status, "scheduled");
  });

  test("sourcing suggestions use server prices and stay separate from purchase actions", async () => {
    const contextRes = await app.inject({
      method: "POST",
      url: `/api/agent/sourcing/jobs/${ids.job}/context`,
      headers: agentToken("sourcing-agent", ["price-book:read"]),
      payload: {},
    });
    assert.equal(contextRes.statusCode, 200);
    const context = contextRes.json() as {
      fingerprint: string;
      candidates: Array<{ itemId: string; range: { lowCents: number | null } }>;
      suppliers: Array<{ id: string }>;
    };
    assert.equal(context.candidates[0]?.itemId, ids.item);
    assert.equal(context.suppliers[0]?.id, ids.supplier);

    const invented = await app.inject({
      method: "POST",
      url: "/api/agent/sourcing/suggestions",
      headers: agentToken("sourcing-agent", ["sourcing-suggestions:create"]),
      payload: {
        jobId: ids.job,
        fingerprint: context.fingerprint,
        lines: [{ itemId: randomUUID(), description: "Invented part", quantity: 1, unit: "piece" }],
        confidence: 0.8,
        rationale: "Should work.",
        assumptions: [],
        missingInformation: [],
      },
    });
    assert.equal(invented.statusCode, 422);

    const created = await app.inject({
      method: "POST",
      url: "/api/agent/sourcing/suggestions",
      headers: agentToken("sourcing-agent", ["sourcing-suggestions:create"]),
      payload: {
        jobId: ids.job,
        fingerprint: context.fingerprint,
        lines: [{ itemId: ids.item, description: "Start relay", quantity: 2, unit: "piece", supplierContactId: ids.supplier }],
        confidence: 0.8,
        rationale: "Schedule the common failure part.",
        assumptions: ["Compressor circuit is the likely fault"],
        missingInformation: ["Confirm part number"],
      },
    });
    assert.equal(created.statusCode, 201);
    const suggestionId = created.json().id as string;
    const [row] = await db.select().from(sourcingSuggestions).where(eq(sourcingSuggestions.id, suggestionId));
    const line = (row!.lines as Array<{ lineLowCents: number | null }>)[0]!;
    assert.equal(line.lineLowCents, 2 * context.candidates[0]!.range.lowCents!);
    assert.equal(row!.lowCents, line.lineLowCents);

    const rejected = await app.inject({
      method: "POST",
      url: `/api/sourcing/suggestions/${suggestionId}/reject`,
      headers: staff(),
      payload: { reason: " customer already has the part " },
    });
    assert.equal(rejected.statusCode, 200);
    assert.equal(rejected.json().state, "rejected");
  });

  test("payment reminders are idempotent and never record payments", async () => {
    const dueRes = await app.inject({
      method: "POST",
      url: "/api/agent/payments/due-invoices",
      headers: agentToken("payments-agent", ["invoices:read"]),
      payload: { limit: 50 },
    });
    assert.equal(dueRes.statusCode, 200);
    const due = (dueRes.json() as { invoices: Array<{ invoiceId: string; dueAt: string; balanceCents: number }> }).invoices.find(
      (invoice) => invoice.invoiceId === ids.invoice,
    );
    assert.ok(due, "the due invoice is visible to the payments agent");
    assert.equal(due.balanceCents, 125_000);

    const payload = {
      invoiceId: ids.invoice,
      dueAt: due.dueAt,
      balanceCents: due.balanceCents,
    };
    const created = await app.inject({
      method: "POST",
      url: "/api/agent/payments/reminders",
      headers: agentToken("payments-agent", ["invoices:read", "payment-reminders:send"]),
      payload,
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().created, true);
    assert.equal(created.json().reminder.status, "skipped", "no valid phone means no SMS is sent");
    const reminderId = created.json().reminder.id as string;

    const repeated = await app.inject({
      method: "POST",
      url: "/api/agent/payments/reminders",
      headers: agentToken("payments-agent", ["invoices:read", "payment-reminders:send"]),
      payload,
    });
    assert.equal(repeated.statusCode, 200);
    assert.equal(repeated.json().created, false);
    assert.equal(repeated.json().reminder.id, reminderId);

    const changed = await app.inject({
      method: "POST",
      url: "/api/agent/payments/reminders",
      headers: agentToken("payments-agent", ["invoices:read", "payment-reminders:send"]),
      payload: { ...payload, balanceCents: 1 },
    });
    assert.equal(changed.statusCode, 409, "the agent cannot invent a different balance");

    const forbidden = await app.inject({
      method: "POST",
      url: "/api/agent/payments/reminders",
      headers: agentToken("quoting-agent", ["jobs:read"]),
      payload,
    });
    assert.equal(forbidden.statusCode, 403);

    const [reminder] = await db.select().from(paymentReminders).where(eq(paymentReminders.id, reminderId));
    assert.equal(reminder!.balanceCents, 125_000);
    const paid = await db.select().from(payments).where(eq(payments.invoiceId, ids.invoice));
    assert.equal(paid.length, 0, "a reminder never records a payment");
    const listed = await app.inject({
      method: "GET",
      url: `/api/payments/reminders/invoices/${ids.invoice}`,
      headers: staff(),
    });
    assert.equal(listed.statusCode, 200);
    assert.equal(listed.json().reminders.length, 1);
  });
});

after(async () => {
  await closeDb();
});
