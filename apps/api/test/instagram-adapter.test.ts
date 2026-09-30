// Instagram Professional publishing adapter.
//
// Mirrors the Facebook contract: publishing runs on the Facebook Page access
// token, never the user token, and a real media id is never invented.
import assert from "node:assert/strict";
import test from "node:test";
import type { PublishRequest } from "@nnact/shared";
import { InstagramPublishingAdapter } from "../src/publishing/adapters/instagram.js";
import type { CredentialStorePort } from "../src/publishing/ports/index.js";

const PAGE_TOKEN = "PAGE_TOKEN_LONG_LIVED";
const USER_TOKEN = "USER_TOKEN_SHORTLIVED";
const IG_ID = "17841400000000001";

function harness(script: Array<{ status: number; body: unknown }>, creds?: Record<string, unknown>) {
  const calls: Array<{ url: string; method: string; body: string | null }> = [];
  const store: CredentialStorePort = {
    get: async () =>
      (creds === undefined
        ? { accessToken: USER_TOKEN, accountId: IG_ID, meta: { pageAccessToken: PAGE_TOKEN, igProfileId: IG_ID } }
        : creds) as Awaited<ReturnType<CredentialStorePort["get"]>>,
    setLastError: async () => {},
    markExpired: async () => {},
    markValidated: async () => {},
  };
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET", body: (init?.body as string) ?? null });
    const next = script.shift() ?? { status: 200, body: { id: "fallback" } };
    return { status: next.status, text: async () => JSON.stringify(next.body) } as unknown as Response;
  }) as typeof fetch;
  const adapter = new InstagramPublishingAdapter({ credentialStore: store, baseUrl: "https://graph.test", graphVersion: "v25.0" });
  return { adapter, calls, restore: () => { globalThis.fetch = original; } };
}

async function withGraph<T>(script: Array<{ status: number; body: unknown }>, creds: Record<string, unknown> | undefined, run: (h: ReturnType<typeof harness>) => Promise<T>): Promise<T> {
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
    channel: "INSTAGRAM",
    title: "Generator care",
    body: "Keep it running well.",
    caption: "Keep it running well.",
    hashtags: ["#HVAC"],
    media: [{ id: "m1", url: "https://cdn.test/a.jpg", contentType: "image/jpeg" }],
    idempotencyKey: "content-1:INSTAGRAM:1",
    ...over,
  } as PublishRequest;
}

test("image posts use the Page access token for container and publish", async () => {
  const script = [{ status: 200, body: { id: "container_1" } }, { status: 200, body: { id: "media_1" } }];
  await withGraph(script, undefined, async ({ adapter, calls }) => {
    const result = await adapter.publish(request());
    assert.equal(calls.length, 2);
    assert.match(calls[0]!.url, new RegExp(`^https://graph\\.test/v25\\.0/${IG_ID}/media$`));
    assert.match(calls[1]!.url, new RegExp(`^https://graph\\.test/v25\\.0/${IG_ID}/media_publish$`));
    for (const c of calls) {
      const params = new URLSearchParams(c.body!);
      assert.equal(params.get("access_token"), PAGE_TOKEN, "must send the Page token");
      assert.notEqual(params.get("access_token"), USER_TOKEN, "user token must never reach Instagram");
    }
    assert.equal(result.providerPublicationId, "media_1");
  });
});

test("image permalinks use /p/, not /reel/", async () => {
  const script = [{ status: 200, body: { id: "container_1" } }, { status: 200, body: { id: "media_1" } }];
  await withGraph(script, undefined, async ({ adapter }) => {
    const result = await adapter.publish(request());
    assert.equal(result.externalUrl, `https://www.instagram.com/p/media_1/`);
  });
});

test("video posts use REELS and a reel permalink", async () => {
  const script = [{ status: 200, body: { id: "container_1" } }, { status: 200, body: { id: "media_1" } }];
  const video = [{ id: "v1", url: "https://cdn.test/a.mp4", contentType: "video/mp4" }];
  await withGraph(script, undefined, async ({ adapter, calls }) => {
    const result = await adapter.publish(request({ media: video }));
    const params = new URLSearchParams(calls[0]!.body!);
    assert.equal(params.get("media_type"), "REELS");
    assert.equal(params.get("video_url"), "https://cdn.test/a.mp4");
    assert.equal(params.get("image_url"), null, "must not send an empty image_url alongside video");
    assert.equal(result.externalUrl, `https://www.instagram.com/reel/media_1/`);
  });
});

test("an image post must not send an empty video_url", async () => {
  const script = [{ status: 200, body: { id: "container_1" } }, { status: 200, body: { id: "media_1" } }];
  await withGraph(script, undefined, async ({ adapter, calls }) => {
    await adapter.publish(request());
    const params = new URLSearchParams(calls[0]!.body!);
    assert.equal(params.get("image_url"), "https://cdn.test/a.jpg");
    assert.equal(params.get("video_url"), null);
    assert.equal(params.get("caption"), "Keep it running well. #HVAC");
  });
});

test("a missing Page token fails closed instead of using the user token", async () => {
  await withGraph([], { accessToken: USER_TOKEN, accountId: IG_ID, meta: {} }, async ({ adapter, calls }) => {
    await assert.rejects(() => adapter.publish(request()), /no Page access token/);
    assert.equal(calls.length, 0);
  });
});

test("a Page with no linked Instagram account fails closed", async () => {
  await withGraph([], { accessToken: USER_TOKEN, meta: { pageAccessToken: PAGE_TOKEN } }, async ({ adapter }) => {
    await assert.rejects(() => adapter.publish(request()), /no Instagram professional account/i);
  });
});

test("a publish with no returned id fails rather than storing the idempotency key", async () => {
  const script = [{ status: 200, body: { id: "container_1" } }, { status: 200, body: {} }];
  await withGraph(script, undefined, async ({ adapter }) => {
    await assert.rejects(
      () => adapter.publish(request()),
      (err: Error & { normalized?: { code?: string } }) => {
        assert.notEqual(err.normalized?.code, undefined);
        assert.doesNotMatch(err.message, /content-1:INSTAGRAM/);
        return true;
      },
    );
  });
});

test("a failed publish deletes the orphaned container", async () => {
  const script = [
    { status: 200, body: { id: "container_1" } },
    { status: 400, body: { error: { code: 360, message: "Invalid media" } } },
    { status: 200, body: { success: true } },
  ];
  await withGraph(script, undefined, async ({ adapter, calls }) => {
    await assert.rejects(() => adapter.publish(request()));
    const del = calls.find((c) => c.method === "DELETE");
    assert.ok(del, "container must be cleaned up");
    assert.ok(del!.url.includes("ids=container_1"));
  });
});

test("update deletes then republishes, since IG media is not editable", async () => {
  const script = [
    { status: 200, body: { success: true } },
    { status: 200, body: { id: "container_2" } },
    { status: 200, body: { id: "media_2" } },
  ];
  await withGraph(script, undefined, async ({ adapter, calls }) => {
    const result = await adapter.update({ ...request(), providerPublicationId: "media_1" });
    assert.equal(calls[0]!.method, "DELETE");
    assert.ok(calls[0]!.url.includes("ids=media_1"));
    assert.equal(calls[1]!.method, "POST");
    assert.equal(result.providerPublicationId, "media_2");
    assert.equal(result.rawMetadata?.replacedMediaId, "media_1");
  });
});

test("text-only content is rejected before any Graph call", async () => {
  await withGraph([], undefined, async ({ adapter, calls }) => {
    const issues = adapter.validateContent(request({ media: [] }));
    assert.equal(issues[0]!.code, "INVALID_MEDIA");
    assert.equal(adapter.validateContent(request({ caption: "x".repeat(2201) }))[0]!.code, "INVALID_CONTENT");
    assert.equal(calls.length, 0);
  });
});

test("an expired Page token maps to a reconnectable AUTH_EXPIRED", async () => {
  const script = [{ status: 400, body: { error: { code: 463, message: "token expired" } } }];
  await withGraph(script, undefined, async ({ adapter }) => {
    await assert.rejects(() => adapter.publish(request()), (err: Error & { normalized?: { code?: string } }) => {
      assert.equal(err.normalized?.code, "AUTH_EXPIRED");
      assert.match(err.message, /Reconnect Instagram/);
      return true;
    });
  });
});
