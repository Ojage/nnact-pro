// Facebook Page publishing adapter.
//
// The load-bearing contract here is the *Page* access token. A user access
// token cannot call /{page-id}/feed — Graph rejects it with error 200 — so the
// adapter must never fall back to the user token it also has on hand. These
// tests pin that, plus the photo/album shapes Graph actually accepts.
import assert from "node:assert/strict";
import test from "node:test";
import type { PublishRequest } from "@nnact/shared";
import { FacebookPublishingAdapter, graphVersionFor } from "../src/publishing/adapters/facebook.js";
import type { CredentialStorePort } from "../src/publishing/ports/index.js";

const PAGE_TOKEN = "PAGE_TOKEN_LONGLIVED";
const USER_TOKEN = "USER_TOKEN_SHORTLIVED";
const PAGE_ID = "1122334455";

interface Call {
  url: string;
  method: string;
  body: string | null;
}

/** Records every outbound Graph call and replays scripted responses in order. */
function harness(script: Array<{ status: number; body: unknown }>, creds?: Record<string, unknown>) {
  const calls: Call[] = [];
  const store: CredentialStorePort = {
    get: async () =>
      (creds === undefined
        ? { accessToken: USER_TOKEN, accountId: PAGE_ID, pageId: PAGE_ID, meta: { pageAccessToken: PAGE_TOKEN } }
        : creds) as Awaited<ReturnType<CredentialStorePort["get"]>>,
    setLastError: async () => {},
    markExpired: async () => {},
    markValidated: async () => {},
  };

  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: (init?.body as string) ?? null });
    const next = script.shift() ?? { status: 200, body: { id: "999" } };
    return { status: next.status, text: async () => JSON.stringify(next.body) } as unknown as Response;
  }) as typeof fetch;

  const adapter = new FacebookPublishingAdapter({ credentialStore: store, baseUrl: "https://graph.test", graphVersion: "v25.0" });
  const restore = () => {
    globalThis.fetch = original;
  };
  return { adapter, calls, restore };
}

async function withGraph<T>(script: Array<{ status: number; body: unknown }>, creds?: Record<string, unknown>, run: (h: ReturnType<typeof harness>) => Promise<T>): Promise<T> {
  const h = harness(script, creds);
  try {
    return await run(h);
  } finally {
    h.restore();
  }
}

function request(over: Partial<PublishRequest> = {}): PublishRequest {
  return {
    publicationId: "pub-1",
    organizationId: "org-1",
    contentId: "content-1",
    channel: "FACEBOOK",
    title: "Generator care",
    body: "Keep it running well.",
    hashtags: ["#HVAC"],
    media: [],
    idempotencyKey: "content-1:FACEBOOK:3",
    ...over,
  } as PublishRequest;
}

function media(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `m${i}`, url: `https://cdn.test/${i}.jpg`, contentType: "image/jpeg" }));
}

test("graphVersionFor defaults, normalises, and honours META_GRAPH_VERSION", () => {
  assert.equal(graphVersionFor({} as NodeJS.ProcessEnv), "v25.0");
  assert.equal(graphVersionFor({ META_GRAPH_VERSION: "v26.0" } as NodeJS.ProcessEnv), "v26.0");
  assert.equal(graphVersionFor({ META_GRAPH_VERSION: "24.0" } as NodeJS.ProcessEnv), "v24.0", "adds the v prefix when missing");
  assert.equal(graphVersionFor({ META_GRAPH_VERSION: "  " } as NodeJS.ProcessEnv), "v25.0", "blank falls back to the default");
});

test("text posts use the Page access token, never the user token", async () => {
  await withGraph([{ status: 200, body: { id: "post_1" } }], undefined, async ({ adapter, calls }) => {
    const result = await adapter.publish(request());
    assert.equal(calls.length, 1);
    const params = new URLSearchParams(calls[0]!.body!);
    assert.equal(params.get("access_token"), PAGE_TOKEN, "must send the Page token");
    assert.notEqual(params.get("access_token"), USER_TOKEN, "user token must never reach /feed");
    assert.match(calls[0]!.url, /\/v25\.0\/1122334455\/feed$/);
    assert.equal(params.get("message"), "Keep it running well. #HVAC");
    assert.equal(result.providerPublicationId, "post_1");
    assert.equal(result.externalUrl, `https://www.facebook.com/${PAGE_ID}/posts/post_1`);
  });
});

test("a connection without a Page token fails closed instead of using the user token", async () => {
  await withGraph([], { accessToken: USER_TOKEN, accountId: PAGE_ID, pageId: PAGE_ID, meta: {} }, async ({ adapter, calls }) => {
    await assert.rejects(() => adapter.publish(request()), /no Page access token/);
    assert.equal(calls.length, 0, "must not call Graph without a Page token");
  });
});

test("a connection without a Page id fails closed", async () => {
  await withGraph([], { accessToken: USER_TOKEN, meta: { pageAccessToken: PAGE_TOKEN } }, async ({ adapter }) => {
    await assert.rejects(() => adapter.publish(request()), /no Page selected/);
  });
});

test("validateConnection reads the Page name with the Page token", async () => {
  await withGraph([{ status: 200, body: { id: PAGE_ID, name: "NNACT Cooling" } }], undefined, async ({ adapter, calls }) => {
    const result = await adapter.validateConnection("org-1");
    assert.equal(result.valid, true);
    assert.equal(result.accountName, "NNACT Cooling");
    assert.match(calls[0]!.url, /fields=id,name,access_token/);
    assert.equal(new URL(calls[0]!.url).searchParams.get("access_token"), PAGE_TOKEN);
  });
});

test("a single photo posts to /photos with caption, not message", async () => {
  await withGraph([{ status: 200, body: { post_id: "photo_1" } }], undefined, async ({ adapter, calls }) => {
    const result = await adapter.publish(request({ media: media(1) }));
    assert.match(calls[0]!.url, /\/photos$/);
    const params = new URLSearchParams(calls[0]!.body!);
    assert.equal(params.get("caption"), "Keep it running well. #HVAC", "/photos ignores `message`; `caption` is required");
    assert.equal(params.get("message"), null);
    assert.equal(params.get("url"), "https://cdn.test/0.jpg");
    assert.equal(result.providerPublicationId, "photo_1");
  });
});

test("an album uploads photos unpublished, then attaches real media_fbids", async () => {
  const script = [
    { status: 200, body: { post_id: "fbid_1" } },
    { status: 200, body: { post_id: "fbid_2" } },
    { status: 200, body: { id: "album_1" } },
  ];
  await withGraph(script, undefined, async ({ adapter, calls }) => {
    const result = await adapter.publish(request({ media: media(2) }));
    assert.equal(calls.length, 3, "two uploads plus one feed post");
    for (const c of calls.slice(0, 2)) {
      assert.match(c.url, /\/photos$/);
      const p = new URLSearchParams(c.body!);
      assert.equal(p.get("published"), "false", "uploads must stay unpublished until the feed post");
    }
    assert.match(calls[2]!.url, /\/feed$/);
    const feed = new URLSearchParams(calls[2]!.body!);
    // The old code sent { media_fbid: undefined, url }, which Graph rejects.
    assert.equal(feed.get("attached_media[0]"), JSON.stringify({ media_fbid: "fbid_1" }));
    assert.equal(feed.get("attached_media[1]"), JSON.stringify({ media_fbid: "fbid_2" }));
    assert.equal(feed.get("message"), "Keep it running well. #HVAC");
    assert.equal(result.providerPublicationId, "album_1");
  });
});

test("a failed album post rolls back the unpublished uploads", async () => {
  const script = [
    { status: 200, body: { post_id: "fbid_1" } },
    { status: 200, body: { post_id: "fbid_2" } },
    { status: 400, body: { error: { code: 200, message: "Page token required" } } },
    { status: 200, body: { success: true } },
    { status: 200, body: { success: true } },
  ];
  await withGraph(script, undefined, async ({ adapter, calls }) => {
    await assert.rejects(() => adapter.publish(request({ media: media(2) })), /denied the request/);
    const deletes = calls.filter((c) => c.method === "DELETE");
    assert.equal(deletes.length, 2, "both orphan uploads must be deleted");
    assert.ok(deletes.every((d) => /fbid_/.test(d.url)));
  });
});

test("update deletes then reposts, because Facebook messages are immutable", async () => {
  const script = [
    { status: 200, body: { success: true } }, // delete old
    { status: 200, body: { id: "new_post" } }, // repost
  ];
  await withGraph(script, undefined, async ({ adapter, calls }) => {
    const result = await adapter.update({ ...request(), providerPublicationId: "old_post" });
    assert.equal(calls[0]!.method, "DELETE");
    assert.match(calls[0]!.url, /\/old_post\?/);
    assert.equal(calls[1]!.method, "POST");
    assert.match(calls[1]!.url, /\/feed$/);
    assert.equal(result.providerPublicationId, "new_post");
    assert.equal(result.rawMetadata?.replacedPostId, "old_post");
  });
});

test("delete tolerates an already-deleted post", async () => {
  await withGraph([{ status: 404, body: { error: { message: "Unsupported get request" } } }], undefined, async ({ adapter }) => {
    await adapter.deleteOrUnpublish("org-1", "gone");
  });
});

test("getPublicationStatus reports DELETED for a 404", async () => {
  await withGraph([{ status: 404, body: {} }], undefined, async ({ adapter }) => {
    const status = await adapter.getPublicationStatus("org-1", "gone");
    assert.equal(status.status, "DELETED");
    assert.equal(status.externalUrl, null);
  });
});

test("an expired Page token maps to a reconnectable AUTH_EXPIRED", async () => {
  // 463 is what Meta returns for an expired Page token; it is not a 401.
  await withGraph([{ status: 400, body: { error: { code: 463, message: "The access token has expired." } } }], undefined, async ({ adapter }) => {
    await assert.rejects(() => adapter.publish(request()), (err: Error & { normalized?: { code?: string } }) => {
      assert.equal(err.normalized?.code, "AUTH_EXPIRED");
      assert.match(err.message, /Reconnect Facebook/);
      return true;
    });
  });
});

test("a scope failure maps to PERMISSION_DENIED, not AUTH_EXPIRED", async () => {
  await withGraph([{ status: 403, body: { error: { code: 200, message: "Requires pages_manage_posts" } } }], undefined, async ({ adapter }) => {
    await assert.rejects(() => adapter.publish(request()), (err: Error & { normalized?: { code?: string } }) => {
      assert.equal(err.normalized?.code, "PERMISSION_DENIED");
      return true;
    });
  });
});

test("over-long text and empty posts are rejected before any Graph call", async () => {
  await withGraph([], undefined, async ({ adapter, calls }) => {
    const long = adapter.validateContent(request({ body: "x".repeat(63_207) }));
    assert.equal(long.length, 1);
    assert.equal(long[0]!.code, "INVALID_CONTENT");
    const empty = adapter.validateContent(request({ body: "  " }));
    assert.equal(empty[0]!.code, "INVALID_CONTENT");
    const tooMany = adapter.validateContent(request({ body: "ok", media: media(11) }));
    assert.equal(tooMany[0]!.code, "INVALID_MEDIA");
    assert.equal(calls.length, 0);
  });
});
