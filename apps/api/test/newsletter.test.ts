import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { eq } from "drizzle-orm";
import { db, newsletterSubscribers, orgs } from "@nnact/db";
import { buildServer } from "../src/server.js";

const passingProbes = {
  postgres: async () => {},
  uploads: async () => {},
  migrations: async () => {},
};

function buildTestApp() {
  return buildServer({
    healthProbes: passingProbes,
  });
}

// The public newsletter endpoints resolve the organization from DEFAULT_ORG_ID,
// and newsletter_subscribers.org_id is a foreign key onto orgs, so the test
// needs a real organization row rather than a placeholder identifier.
const DEFAULT_ORG_ID = "11111111-1111-4111-8111-111111111111";

// The newsletter rate limiter is a module-level fixed window (5 requests/hour)
// keyed by request.ip. Every app.inject() would otherwise share the 127.0.0.1
// bucket and trip the limit part way through this file, so each test is given
// its own client IP. Fastify only honours x-forwarded-for when trustProxy is
// enabled, hence the TRUST_PROXY override below.
let ipCounter = 0;
function clientIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter % 250}`;
}

type TestApp = ReturnType<typeof buildTestApp>;
type InjectOptions = Parameters<TestApp["inject"]>[0];

function injectNewsletter(app: TestApp, options: InjectOptions) {
  return app.inject({
    ...options,
    headers: { ...options.headers, "x-forwarded-for": clientIp() },
  });
}

// Subscribe fires a fire-and-forget confirmation email. Leaving ambient SMTP
// credentials in place makes these tests dial a real mail server (and leaves the
// connection open, so the test process never exits), so SMTP is disabled for the
// duration of the file and restored afterwards.
const SMTP_ENV_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "SMTP_FROM_NEWSLETTER",
];
const savedSmtpEnv = new Map<string, string | undefined>();

before(async () => {
  for (const key of SMTP_ENV_KEYS) {
    savedSmtpEnv.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.DEFAULT_ORG_ID = DEFAULT_ORG_ID;
  process.env.TRUST_PROXY = "true";
  await db
    .insert(orgs)
    .values({ id: DEFAULT_ORG_ID, name: "Newsletter Test Org" })
    .onConflictDoNothing();
});

after(async () => {
  await db.delete(newsletterSubscribers).where(eq(newsletterSubscribers.orgId, DEFAULT_ORG_ID));
  await db.delete(orgs).where(eq(orgs.id, DEFAULT_ORG_ID));
  // This file is the only one that talks to the real pool directly, and the
  // Fastify onClose hook does not own it, so the client is closed here or the
  // test process hangs on an open connection.
  await db.$client.end();
  for (const [key, value] of savedSmtpEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete process.env.DEFAULT_ORG_ID;
  delete process.env.TRUST_PROXY;
});

test("POST /api/v1/public/default/newsletter/subscribe returns 201 with valid email", async () => {
  const app = buildTestApp();
  await app.ready();

  const res = await injectNewsletter(app, {
    method: "POST",
    url: "/api/v1/public/default/newsletter/subscribe",
    payload: { email: "test@example.com", name: "Test User" },
  });

  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.ok(body.subscriberId);
  assert.equal(body.email, "test@example.com");
  assert.equal(body.name, "Test User");
  assert.deepEqual(body.channels, ["email"]);
  await app.close();
});

test("POST /api/v1/public/default/newsletter/subscribe returns 201 with optional phone and whatsapp channel", async () => {
  const app = buildTestApp();
  await app.ready();

  const res = await injectNewsletter(app, {
    method: "POST",
    url: "/api/v1/public/default/newsletter/subscribe",
    payload: { email: "test2@example.com", phone: "+237651385746", channels: ["email", "whatsapp"], source: "home_cta" },
  });

  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.ok(body.subscriberId);
  assert.equal(body.email, "test2@example.com");
  assert.deepEqual(body.channels, ["email", "whatsapp"]);
  await app.close();
});

test("POST /api/v1/public/default/newsletter/subscribe returns 400 with invalid email", async () => {
  const app = buildTestApp();
  await app.ready();

  const res = await injectNewsletter(app, {
    method: "POST",
    url: "/api/v1/public/default/newsletter/subscribe",
    payload: { email: "not-an-email" },
  });

  assert.equal(res.statusCode, 400);
  await app.close();
});

test("POST /api/v1/public/default/newsletter/subscribe returns 400 when email is missing", async () => {
  const app = buildTestApp();
  await app.ready();

  const res = await injectNewsletter(app, {
    method: "POST",
    url: "/api/v1/public/default/newsletter/subscribe",
    payload: { name: "Test User" },
  });

  assert.equal(res.statusCode, 400);
  await app.close();
});

test("POST /api/v1/public/default/newsletter/subscribe upserts existing subscriber (reactivates)", async () => {
  const app = buildTestApp();
  await app.ready();

  // First subscribe
  const first = await injectNewsletter(app, {
    method: "POST",
    url: "/api/v1/public/default/newsletter/subscribe",
    payload: { email: "upsert@example.com", name: "Original" },
  });
  assert.equal(first.statusCode, 201);
  const firstId = first.json().subscriberId;

  // Subscribe again with different name
  const second = await injectNewsletter(app, {
    method: "POST",
    url: "/api/v1/public/default/newsletter/subscribe",
    payload: { email: "upsert@example.com", name: "Updated Name" },
  });
  assert.equal(second.statusCode, 201);
  const secondBody = second.json();
  assert.equal(secondBody.subscriberId, firstId);
  assert.equal(secondBody.name, "Updated Name");
  await app.close();
});

test("POST /api/v1/public/default/newsletter/unsubscribe returns 200", async () => {
  const app = buildTestApp();
  await app.ready();

  // First subscribe
  await injectNewsletter(app, {
    method: "POST",
    url: "/api/v1/public/default/newsletter/subscribe",
    payload: { email: "unsub@example.com" },
  });

  // Then unsubscribe
  const res = await injectNewsletter(app, {
    method: "POST",
    url: "/api/v1/public/default/newsletter/unsubscribe",
    payload: { email: "unsub@example.com" },
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.email, "unsub@example.com");
  await app.close();
});

test("POST /api/v1/public/default/newsletter/unsubscribe returns 200 even if email not subscribed (idempotent)", async () => {
  const app = buildTestApp();
  await app.ready();

  const res = await injectNewsletter(app, {
    method: "POST",
    url: "/api/v1/public/default/newsletter/unsubscribe",
    payload: { email: "never-subscribed@example.com" },
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.email, "never-subscribed@example.com");
  await app.close();
});

test("POST /api/v1/public/default/newsletter/unsubscribe returns 400 with invalid email", async () => {
  const app = buildTestApp();
  await app.ready();

  const res = await injectNewsletter(app, {
    method: "POST",
    url: "/api/v1/public/default/newsletter/unsubscribe",
    payload: { email: "not-an-email" },
  });

  assert.equal(res.statusCode, 400);
  await app.close();
});

test("POST /api/v1/public/default/newsletter/unsubscribe returns 400 when email is missing", async () => {
  const app = buildTestApp();
  await app.ready();

  const res = await injectNewsletter(app, {
    method: "POST",
    url: "/api/v1/public/default/newsletter/unsubscribe",
    payload: {},
  });

  assert.equal(res.statusCode, 400);
  await app.close();
});

test("POST /api/v1/public/default/newsletter/unsubscribe uses the configured default organization", async () => {
  const app = buildTestApp();
  await app.ready();

  const res = await injectNewsletter(app, {
    method: "POST",
    url: "/api/v1/public/default/newsletter/unsubscribe",
    payload: { email: "org-test@example.com" },
  });

  assert.equal(res.statusCode, 200);
  await app.close();
});

test("newsletter rate limit is per-IP-per-org", async () => {
  const app = buildTestApp();
  await app.ready();

  // A single client IP gets its own 5-request/hour bucket; the sixth request
  // from that IP is rejected regardless of the other tests in this file.
  const headers = { "x-forwarded-for": clientIp() };
  const statuses: number[] = [];

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/public/default/newsletter/subscribe",
      headers,
      payload: { email: `ratelimit-${attempt}-${Date.now()}@example.com` },
    });
    statuses.push(res.statusCode);
  }

  assert.deepEqual(statuses.slice(0, 5), [201, 201, 201, 201, 201]);
  assert.equal(statuses[5], 429);
  await app.close();
});
