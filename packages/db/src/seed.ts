// Minimal seed: one org, an owner, two customers, one scheduled job with an
// invoice. Enough to render a non-empty dashboard. Idempotent-ish: skips if an
// org named "Demo HVAC" already exists.
import { db, orgs, users, customers, jobs, invoices } from "./index.js";
import { eq } from "drizzle-orm";

async function main() {
  const existing = await db.select().from(orgs).where(eq(orgs.name, "Demo HVAC"));
  if (existing.length) {
    console.log("seed: Demo HVAC already exists, skipping");
    return;
  }

  const [org] = await db.insert(orgs).values({ name: "Demo HVAC" }).returning();
  await db.insert(users).values({
    orgId: org.id,
    email: "owner@demo.test",
    name: "Dana Owner",
    role: "owner",
  });

  const [alice, bob] = await db
    .insert(customers)
    .values([
      { orgId: org.id, name: "Alice Johnson", email: "alice@example.com", phone: "555-0101" },
      { orgId: org.id, name: "Bob Smith", phone: "555-0102" },
    ])
    .returning();

  const [job] = await db
    .insert(jobs)
    .values({
      orgId: org.id,
      customerId: alice.id,
      title: "AC tune-up",
      status: "scheduled",
      scheduledAt: new Date(Date.now() + 86_400_000),
      total: 18900,
    })
    .returning();

  await db.insert(invoices).values({
    orgId: org.id,
    jobId: job.id,
    number: "INV-1001",
    status: "sent",
    total: 18900,
  });

  console.log(`seed: created org ${org.id} with customers ${alice.id}, ${bob.id}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
