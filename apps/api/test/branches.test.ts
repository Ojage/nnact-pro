// Branches foundation: every org has a default Main Branch (database trigger),
// users see only the branches they may use, and the org comes from the session.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";

process.env.NODE_ENV = "test";

const { buildServer } = await import("../src/server.js");
const { db, closeDb, orgs, users, branches, branchMemberships } = await import("@nnact/db");
const { eq, sql } = await import("drizzle-orm");

let reachable = false;
try {
  await Promise.race([db.execute(sql`select 1 from branches limit 1`), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3_000))]);
  reachable = true;
} catch {
  reachable = false;
}

const ORG = randomUUID();
const OTHER = randomUUID();
const ids = { owner: randomUUID(), tech: randomUUID(), clerk: randomUUID() };
const app = buildServer();
const session = (userId: string, role: string, orgId = ORG) => ({
  authorization: `Bearer ${app.jwt.sign({ aud: "staff", userId, orgId, role })}`,
});

describe("branches", { skip: reachable ? false : "no migrated Postgres in DATABASE_URL" }, () => {
  let north = "";
  before(async () => {
    await app.ready();
    await db.insert(orgs).values([
      { id: ORG, name: "Branch test org", shortName: "BTEST" },
      { id: OTHER, name: "Other org", shortName: "OTHER" },
    ]);
    await db.insert(users).values([
      { id: ids.owner, orgId: ORG, email: `o-${ORG}@t.test`, name: "Owner", role: "owner", branchAccess: "specific" },
      { id: ids.tech, orgId: ORG, email: `t-${ORG}@t.test`, name: "Tech", role: "technician" },
      { id: ids.clerk, orgId: ORG, email: `c-${ORG}@t.test`, name: "Clerk", role: "secretary", branchAccess: "specific" },
    ]);
    const [row] = await db.insert(branches).values({ orgId: ORG, publicId: "buea-north", name: "North" }).returning();
    north = row!.publicId;
    await db.insert(branchMemberships).values({ userId: ids.clerk, branchId: row!.id });
  });

  after(async () => {
    await app.close();
    await db.delete(orgs).where(eq(orgs.id, ORG));
    await db.delete(orgs).where(eq(orgs.id, OTHER));
  });

  test("a new organization gets exactly one default Main Branch", async () => {
    const rows = await db.select().from(branches).where(eq(branches.orgId, OTHER));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.name, "Main Branch");
    assert.equal(rows[0]!.isDefault, true);
    assert.match(rows[0]!.publicId, /^[a-z][a-z0-9-]{5,29}$/);
  });

  test("owners and 'all' users see every branch, default first", async () => {
    for (const [userId, role] of [
      [ids.owner, "owner"],
      [ids.tech, "technician"],
    ] as const) {
      const res = await app.inject({ method: "GET", url: "/api/branches/me", headers: session(userId, role) });
      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.org.name, "Branch test org");
      assert.equal(body.org.shortName, "BTEST");
      assert.match(body.org.publicId, /^[0-9]{12}$/);
      assert.equal(body.requestedBranchId, null);
      assert.deepEqual(body.branches.map((branch: { name: string }) => branch.name), ["Main Branch", "North"]);
      assert.equal(body.activeBranchId, body.branches[0].id);
      assert.equal(body.canAddBranch, false);
      assert.equal(res.headers["cache-control"], "no-store");
    }
  });

  test("a requested branch is used only when the user may work in it", async () => {
    const allowed = (await app.inject({
      method: "GET",
      url: `/api/branches/me?branch=${north}`,
      headers: session(ids.owner, "owner"),
    })).json();
    assert.equal(allowed.requestedBranchId, north);
    assert.equal(allowed.activeBranchId, north);

    const denied = (await app.inject({
      method: "GET",
      url: "/api/branches/me?branch=unknown-branch",
      headers: session(ids.owner, "owner"),
    })).json();
    assert.equal(denied.requestedBranchId, "unknown-branch");
    assert.equal(denied.activeBranchId, denied.branches[0].id);
  });

  test("a 'specific' user sees only their branches, never the others", async () => {
    const body = (await app.inject({ method: "GET", url: "/api/branches/me", headers: session(ids.clerk, "secretary") })).json();
    assert.deepEqual(body.branches.map((branch: { id: string }) => branch.id), [north]);
    assert.equal(body.activeBranchId, north);

    const [defaultBranch] = (await db.select().from(branches).where(eq(branches.orgId, ORG))).filter((branch) => branch.isDefault);
    const denied = (await app.inject({
      method: "GET",
      url: `/api/branches/me?branch=${defaultBranch!.publicId}`,
      headers: session(ids.clerk, "secretary"),
    })).json();
    assert.equal(denied.activeBranchId, north);
  });

  test("the organization comes from the session, and agent tokens are refused", async () => {
    const other = (await app.inject({ method: "GET", url: "/api/branches/me", headers: session(ids.owner, "owner", OTHER) })).json();
    assert.equal(other.org.name, "Other org");
    assert.ok(!other.branches.some((branch: { id: string }) => branch.id === north));
    const agent = await app.inject({
      method: "GET",
      url: "/api/branches/me",
      headers: { authorization: `Bearer ${app.jwt.sign({ aud: "agent", agent_id: "intake-agent", orgId: ORG, scope: "agent-runs:write" })}` },
    });
    assert.equal(agent.statusCode, 401);
  });
});

after(async () => {
  await closeDb();
});
