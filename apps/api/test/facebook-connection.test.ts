// Meta / Facebook Page connection establishment.
//
// Two hazards are pinned here:
//  1. `me/accounts` is a relative edge on /me. A missing leading slash turns it
//     into a bogus "v25.0me" path segment and the Page list silently empties.
//  2. Page access tokens are secrets. They must reach the encrypted blob and
//     never the plaintext `metadata` jsonb column that the client can read.
import assert from "node:assert/strict";
import test from "node:test";
import { fetchManagedPages, planMetaConnection, splitChannelMeta } from "../src/routes/connections.js";

const APP_ID = "999888777";
const APP_SECRET = "app-secret";
const VERSION = "v25.0";
const LONG_LIVED = "PAGE_TOKEN_LONG_LIVED_60D";
const SHORT_LIVED = "PAGE_TOKEN_SHORT";

interface Call {
  url: string;
}

function graphHarness(script: Array<{ status: number; body: unknown }>) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    calls.push({ url });
    const next = script.shift() ?? { status: 200, body: {} };
    return { status: next.status, text: async () => JSON.stringify(next.body) } as unknown as Response;
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

async function withGraph<T>(script: Array<{ status: number; body: unknown }>, run: (h: ReturnType<typeof graphHarness>) => Promise<T>): Promise<T> {
  const h = graphHarness(script);
  try {
    return await run(h);
  } finally {
    h.restore();
  }
}

function page(id: string, name: string, tasks: string[], accessToken = LONG_LIVED) {
  return { id, name, picture: { data: { url: `https://cdn.test/${id}.jpg` } }, tasks, access_token: accessToken };
}

test("fetchManagedPages calls /me/accounts with a leading slash and a version", async () => {
  const script = [{ status: 200, body: { data: [page("1", "NNACT", ["CREATE_CONTENT"])] } }, { status: 200, body: { access_token: LONG_LIVED, expires_in: 5_184_000 } }];
  await withGraph(script, async ({ calls }) => {
    await fetchManagedPages("USER", APP_ID, APP_SECRET, VERSION);
    const accountsUrl = new URL(calls[0]!.url);
    assert.equal(accountsUrl.pathname, `/${VERSION}/me/accounts`, "must not collapse into a 'v25.0me' segment");
    assert.ok(accountsUrl.searchParams.get("fields")?.includes("tasks"), "tasks must be requested to know if we can publish");
    assert.ok(accountsUrl.searchParams.get("fields")?.includes("access_token"));
    assert.equal(accountsUrl.searchParams.get("access_token"), "USER");
  });
});

test("short-lived page tokens are exchanged for long-lived ones", async () => {
  const script = [{ status: 200, body: { data: [page("1", "NNACT", ["CREATE_CONTENT"], SHORT_LIVED)] } }, { status: 200, body: { access_token: LONG_LIVED, expires_in: 5_184_000 } }];
  await withGraph(script, async ({ calls, }) => {
    const [p] = await fetchManagedPages("USER", APP_ID, APP_SECRET, VERSION);
    assert.equal(p!.accessToken, LONG_LIVED, "must store the exchanged token, not the short-lived one");
    const exchange = new URL(calls[1]!.url);
    assert.equal(exchange.searchParams.get("grant_type"), "fb_exchange_token");
    assert.equal(exchange.searchParams.get("fb_exchange_token"), SHORT_LIVED);
    assert.equal(exchange.searchParams.get("client_secret"), APP_SECRET);
    // ~60 days out, so the connection does not rot two months from now.
    const expiry = new Date(p!.expiresAt!).getTime() - Date.now();
    const days = expiry / 86_400_000;
    assert.ok(days > 55 && days < 61, `expected ~60 day expiry, got ${days.toFixed(1)}`);
  });
});

test("a failed exchange keeps the short-lived token rather than dropping the Page", async () => {
  const script = [
    { status: 200, body: { data: [page("1", "NNACT", ["CREATE_CONTENT"], SHORT_LIVED)] } },
    { status: 400, body: { error: { message: "bad exchange" } } },
  ];
  await withGraph(script, async () => {
    const [p] = await fetchManagedPages("USER", APP_ID, APP_SECRET, VERSION);
    assert.equal(p!.accessToken, SHORT_LIVED, "degrade to the working token, do not lose the Page");
    assert.equal(p!.expiresAt, null);
  });
});

test("a Page with no access_token is skipped instead of stored half-configured", async () => {
  const script = [{ status: 200, body: { data: [{ id: "1", name: "Broken", tasks: ["CREATE_CONTENT"] }] } }];
  await withGraph(script, async () => {
    assert.deepEqual(await fetchManagedPages("USER", APP_ID, APP_SECRET, VERSION), []);
  });
});

test("a failed /me/accounts returns no pages rather than throwing", async () => {
  await withGraph([{ status: 400, body: { error: { code: 190 } } }], async () => {
    assert.deepEqual(await fetchManagedPages("USER", APP_ID, APP_SECRET, VERSION), []);
  });
});

test("CREATE_CONTENT and MANAGE map to canPublish; read-only tasks do not", async () => {
  const script = [
    {
      status: 200,
      body: {
        data: [
          page("1", "Admin", ["CREATE_CONTENT"]),
          page("2", "Manager", ["MANAGE"]),
          page("3", "Viewer", ["READ_CONTENT", "MODERATE_COMMENTS"]),
        ],
      },
    },
    { status: 200, body: { access_token: LONG_LIVED } },
    { status: 200, body: { access_token: LONG_LIVED } },
    { status: 200, body: { access_token: LONG_LIVED } },
  ];
  await withGraph(script, async () => {
    const pages = await fetchManagedPages("USER", APP_ID, APP_SECRET, VERSION);
    assert.deepEqual(
      pages.map((p) => [p.id, p.canPublish]),
      [
        ["1", true],
        ["2", true],
        ["3", false],
      ],
    );
  });
});

test("exactly one publishable Page is auto-selected", () => {
  const pages = [
    { id: "1", name: "Read only", tasks: ["READ_CONTENT"], canPublish: false, accessToken: LONG_LIVED, expiresAt: null },
    { id: "2", name: "NNACT Cooling", tasks: ["CREATE_CONTENT"], canPublish: true, accessToken: LONG_LIVED, expiresAt: null },
  ];
  const plan = planMetaConnection(pages as never, { appId: APP_ID, userName: "Owner", version: VERSION });
  assert.equal(plan.chosen?.id, "2");
  assert.equal(plan.pageSelectionRequired, false);
  assert.equal(plan.meta.pageAccessToken, LONG_LIVED);
  assert.equal(plan.meta.selectedPageId, "2");
});

test("several publishable Pages require an explicit choice instead of taking the first", () => {
  const pages = [
    { id: "1", name: "NNACT Cooling", tasks: ["CREATE_CONTENT"], canPublish: true, accessToken: "T1", expiresAt: null },
    { id: "2", name: "NNACT Spares", tasks: ["CREATE_CONTENT"], canPublish: true, accessToken: "T2", expiresAt: null },
  ];
  const plan = planMetaConnection(pages as never, { appId: APP_ID, userName: "Owner", version: VERSION });
  assert.equal(plan.chosen, null, "must not guess which Page to post to");
  assert.equal(plan.pageSelectionRequired, true);
  assert.equal(plan.meta.pageAccessToken, null);
  assert.equal(plan.meta.selectedPageId, null);
  assert.equal(plan.meta.availablePages.length, 2);
});

test("zero publishable Pages requires selection and offers nothing publishable", () => {
  const pages = [{ id: "1", name: "Viewer", tasks: ["READ_CONTENT"], canPublish: false, accessToken: "T1", expiresAt: null }];
  const plan = planMetaConnection(pages as never, { appId: APP_ID, userName: "Owner", version: VERSION });
  assert.equal(plan.chosen, null);
  assert.equal(plan.pageSelectionRequired, true);
  assert.equal(plan.meta.availablePages[0]!.canPublish, false);
});

test("page tokens never reach the plaintext metadata column", () => {
  const pages = [{ id: "1", name: "NNACT", tasks: ["CREATE_CONTENT"], canPublish: true, accessToken: "SUPER_SECRET_TOKEN", expiresAt: null }];
  const plan = planMetaConnection(pages as never, { appId: APP_ID, userName: "Owner", version: VERSION });

  // This is the actual persistence boundary: what `splitChannelMeta` hands to
  // the `metadata` jsonb column. The previous version of this test only checked
  // `availablePages`, which is why a top-level pageAccessToken leak passed CI.
  const { __pages, ...rest } = { ...plan.meta, __pages: pages };
  assert.ok(__pages);
  const { publicMeta, secretMeta } = splitChannelMeta(rest);

  // Top level: no token anywhere in the plaintext shape.
  assert.equal(publicMeta.pageAccessToken, undefined, "plaintext metadata must not carry a top-level page token");
  assert.equal(secretMeta.pageAccessToken, "SUPER_SECRET_TOKEN", "the token must still reach the encrypted blob");
  for (const [key, value] of Object.entries(publicMeta)) {
    assert.notEqual(value, "SUPER_SECRET_TOKEN", `plaintext metadata key ${key} leaked the token`);
  }

  // Nested per-page summaries are mirrored into the readable column too.
  const summaries = publicMeta.availablePages as unknown as Record<string, unknown>[];
  for (const summary of summaries) {
    assert.equal(summary.accessToken, undefined, "availablePages must not carry tokens");
    assert.equal(summary.expiresAt, undefined, "availablePages must not carry token metadata");
  }
  assert.deepEqual(Object.keys(summaries[0]!).sort(), ["canPublish", "id", "name", "picture", "tasks"]);
});

test("the Instagram plan's page token is also routed to the encrypted blob only", () => {
  const { publicMeta, secretMeta } = splitChannelMeta({ igProfileId: "1784", pageId: "1", pageAccessToken: "IG_PAGE_TOKEN" });
  assert.deepEqual(publicMeta, { igProfileId: "1784", pageId: "1" });
  assert.deepEqual(secretMeta, { pageAccessToken: "IG_PAGE_TOKEN" });
});
