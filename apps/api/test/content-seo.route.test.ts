/**
 * SEO metadata passthrough on POST /content and PATCH /content/:id.
 *
 * The `contentItems` table has carried `seoTitle`, `seoDescription`,
 * `canonicalUrl`, `openGraphTitle`, `openGraphDescription` and
 * `openGraphMediaId` for a while, and both `updateContent` and the AI
 * automation layer write them. No route ever forwarded the values, so the
 * Zod body schema silently dropped them and every client — web or mobile —
 * could read SEO back but never set it. Search engines silently fell back to
 * the title and summary.
 *
 * This pins the request-body contract so the fields cannot be dropped again.
 *
 * Run with: node --import tsx --experimental-test-module-mocks --test test/content-seo.route.test.ts
 */
import assert from "node:assert/strict";
import { test, mock } from "node:test";
import Fastify from "fastify";
import fjwt from "@fastify/jwt";
import { AUTH_AUDIENCES } from "@nnact/shared";

const ORG = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const CONTENT = "33333333-3333-3333-3333-333333333333";

const SEO = {
  seoTitle: "AC servicing in Nairobi",
  seoDescription: "Book same-day AC servicing across Nairobi.",
  canonicalUrl: "https://nnact.example/blog/ac-servicing-nairobi",
  openGraphTitle: "Same-day AC servicing",
  openGraphDescription: "Nairobi's fastest AC repair response.",
};

/** Captures the payload each repo function was called with. */
const calls: { create?: unknown; update?: unknown } = {};

const ITEM = {
  id: CONTENT,
  orgId: ORG,
  type: "ARTICLE",
  title: "AC servicing in Nairobi",
  slug: "ac-servicing-nairobi",
  status: "DRAFT",
  visibility: "PUBLIC",
  language: "en",
  revision: 1,
  tagIds: [],
  seo: SEO,
  createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
};

mock.module("../src/routes/org.js", {
  namedExports: { resolveOrgId: async () => ORG },
});

mock.module("../src/publishing/infra/content-repo.js", {
  namedExports: {
    listContent: async () => ({ items: [], total: 0 }),
    getContentItem: async () => ITEM,
    createContent: async (input: unknown) => {
      calls.create = input;
      return ITEM;
    },
    updateContent: async (input: unknown) => {
      calls.update = input;
      return ITEM;
    },
    getContentVersions: async () => [],
    listCategories: async () => [],
    upsertCategory: async () => ({ id: "cat-1" }),
    ensureTags: async () => [],
    listTags: async () => [],
    listMedia: async () => ({ items: [], total: 0 }),
    countMedia: async () => 0,
    mediaFacets: async () => ({}),
    bulkLabelMedia: async () => ({}),
    patchMediaMeta: async () => ({}),
    getVariants: async () => [],
    upsertVariant: async () => ({}),
    slugify: (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  },
});

mock.module("../src/publishing/infra/publication-repo.js", {
  namedExports: {
    ...(await import("../src/publishing/infra/publication-repo.js")),
    listPublications: async () => ({ items: [], total: 0 }),
    getPublication: async () => null,
    listAttempts: async () => [],
  },
});

mock.module("../src/publishing/infra/audit.js", {
  namedExports: { contentAudit: async () => undefined },
});

const { contentRoutes } = await import("../src/routes/content.js");

async function buildApp() {
  const app = Fastify();
  await app.register(fjwt, { secret: "content-seo-test-secret" });
  await app.register(contentRoutes, { prefix: "/api/content" });
  await app.ready();
  return app;
}

function auth(app: ReturnType<typeof Fastify>) {
  return app.jwt.sign({ aud: AUTH_AUDIENCES.staff, userId: USER, orgId: ORG, role: "owner" });
}

test("POST /api/content forwards the seo block to createContent", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/content",
    headers: { authorization: `Bearer ${auth(app)}` },
    payload: { type: "ARTICLE", title: "AC servicing in Nairobi", seo: SEO },
  });

  assert.equal(res.statusCode, 201);
  assert.deepEqual((calls.create as { seo?: unknown }).seo, SEO);
});

test("PATCH /api/content/:id forwards a partial seo update", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "PATCH",
    url: `/api/content/${CONTENT}`,
    headers: { authorization: `Bearer ${auth(app)}` },
    payload: { seo: { seoTitle: "Updated SEO title" } },
  });

  assert.equal(res.statusCode, 200);
  // Only the supplied key is sent, so a partial edit does not blank the rest.
  assert.deepEqual((calls.update as { seo?: unknown }).seo, { seoTitle: "Updated SEO title" });
});

test("content without seo still creates, and no seo key is invented", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/api/content",
    headers: { authorization: `Bearer ${auth(app)}` },
    payload: { type: "MAINTENANCE_TIP", title: "Change your filters monthly" },
  });

  assert.equal(res.statusCode, 201);
  assert.equal((calls.create as { seo?: unknown }).seo, undefined);
});

test("a malformed canonical url never reaches the repo layer", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  delete calls.create;
  const res = await app.inject({
    method: "POST",
    url: "/api/content",
    headers: { authorization: `Bearer ${auth(app)}` },
    payload: { type: "ARTICLE", title: "Bad canonical", seo: { canonicalUrl: "not-a-url" } },
  });

  // The API registers no global error handler, so a ZodError surfaces as 500
  // rather than 400. That is a pre-existing gap across every route and out of
  // scope here; what matters for SEO is that the value is refused outright
  // instead of being persisted.
  assert.notEqual(res.statusCode, 201);
  assert.equal(calls.create, undefined);
});

test("seo field lengths are bounded so a client cannot overflow the column", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  delete calls.create;
  const res = await app.inject({
    method: "POST",
    url: "/api/content",
    headers: { authorization: `Bearer ${auth(app)}` },
    payload: { type: "ARTICLE", title: "Long seo", seo: { seoTitle: "x".repeat(256) } },
  });

  assert.notEqual(res.statusCode, 201);
  assert.equal(calls.create, undefined);
});
