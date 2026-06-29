// Runnable check (no DB/server needed):  node --import tsx --test test/webhook.test.ts
// Pins the webhook wire format and exercises the framework-agnostic handler.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  generateWebhookSecret,
  signWebhook,
  verifyWebhook,
  createWebhookHandler,
} from "../src/index.ts";

test("wire format is exactly t=<ms>,v1=HMAC_SHA256(secret, `${ts}.${body}`)", () => {
  // Golden assertion: if either OFP server or SDK ever changes the format, this
  // fails. The server's signWebhook must produce byte-identical output.
  const secret = "whsec_fixed";
  const body = '{"kind":"job.created","orgId":"o1","data":{},"ts":1700000000000}';
  const ts = 1700000000000;
  const expected = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  assert.equal(signWebhook(secret, body, ts), `t=${ts},v1=${expected}`);
});

test("sign + verify round-trips", () => {
  const secret = generateWebhookSecret();
  const body = JSON.stringify({ kind: "invoice.paid", data: { total: 18900 } });
  assert.equal(verifyWebhook(secret, body, signWebhook(secret, body)), true);
});

test("verify rejects tampered body, wrong secret, replay, and garbage", () => {
  const secret = generateWebhookSecret();
  const sig = signWebhook(secret, "original");
  assert.equal(verifyWebhook(secret, "tampered", sig), false);
  assert.equal(verifyWebhook(generateWebhookSecret(), "original", sig), false);

  const stale = signWebhook(secret, "x", Date.now() - 10 * 60_000);
  assert.equal(verifyWebhook(secret, "x", stale), false); // default 5-min tolerance
  assert.equal(verifyWebhook(secret, "x", stale, 0), true); // tolerance off -> valid sig
  assert.equal(verifyWebhook(secret, "x", "not-a-sig"), false);
});

test("createWebhookHandler verifies, parses, and dispatches", async () => {
  const secret = generateWebhookSecret();
  const seen: string[] = [];
  const handle = createWebhookHandler({ secret, onEvent: (e) => { seen.push(e.kind); } });

  const body = JSON.stringify({ kind: "job.created", orgId: "o1", data: { id: "j1" }, ts: Date.now() });
  const ok = await handle(body, signWebhook(secret, body));
  assert.deepEqual(ok, { ok: true, status: 200 });
  assert.deepEqual(seen, ["job.created"]);

  assert.equal((await handle(body, undefined)).status, 401); // missing signature
  assert.equal((await handle(body, "t=1,v1=bad")).status, 401); // bad signature
  assert.equal((await handle("not json", signWebhook(secret, "not json"))).status, 400);
});

test("handler returns 500 when onEvent throws (so OFP records a failed delivery)", async () => {
  const secret = generateWebhookSecret();
  const handle = createWebhookHandler({ secret, onEvent: () => { throw new Error("boom"); } });
  const body = JSON.stringify({ kind: "job.created", orgId: "o", data: {}, ts: Date.now() });
  const r = await handle(body, signWebhook(secret, body));
  assert.equal(r.status, 500);
  assert.equal(r.ok, false);
});
