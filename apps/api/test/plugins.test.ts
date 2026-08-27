// Runnable check (no DB needed):  node --import tsx --test test/plugins.test.ts
// Covers the security-critical plugin crypto: token hashing/matching and the
// HMAC webhook signature (authenticity + replay defense).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateToken,
  hashToken,
  tokenMatches,
  generateWebhookSecret,
  signWebhook,
  verifyWebhook,
} from "../src/plugins/crypto.ts";

test("generateToken returns plaintext, its hash, and a display prefix", () => {
  const t = generateToken();
  assert.ok(t.token.startsWith("NNP"));
  assert.equal(t.tokenHash, hashToken(t.token));
  assert.equal(t.prefix, t.token.slice(0, 12));
  assert.notEqual(t.token, t.tokenHash); // never store the plaintext
});

test("tokenMatches accepts the right token and rejects a wrong one", () => {
  const t = generateToken();
  assert.equal(tokenMatches(t.token, t.tokenHash), true);
  assert.equal(tokenMatches("NNPwrong", t.tokenHash), false);
});

test("two tokens are distinct", () => {
  assert.notEqual(generateToken().token, generateToken().token);
});

test("signWebhook + verifyWebhook round-trips", () => {
  const secret = generateWebhookSecret();
  const body = JSON.stringify({ kind: "invoice.paid", data: { total: 18900 } });
  const sig = signWebhook(secret, body);
  assert.equal(verifyWebhook(secret, body, sig), true);
});

test("verifyWebhook rejects a tampered body", () => {
  const secret = generateWebhookSecret();
  const sig = signWebhook(secret, "original");
  assert.equal(verifyWebhook(secret, "tampered", sig), false);
});

test("verifyWebhook rejects the wrong secret", () => {
  const body = "payload";
  const sig = signWebhook(generateWebhookSecret(), body);
  assert.equal(verifyWebhook(generateWebhookSecret(), body, sig), false);
});

test("verifyWebhook rejects a replayed (stale) timestamp", () => {
  const secret = generateWebhookSecret();
  const body = "payload";
  const oldTs = Date.now() - 10 * 60_000; // 10 min old
  const sig = signWebhook(secret, body, oldTs);
  // Default 5-min tolerance -> rejected; tolerance:0 -> accepted (signature is valid).
  assert.equal(verifyWebhook(secret, body, sig), false);
  assert.equal(verifyWebhook(secret, body, sig, 0), true);
});

test("verifyWebhook rejects a malformed header", () => {
  assert.equal(verifyWebhook(generateWebhookSecret(), "x", "not-a-signature"), false);
});
