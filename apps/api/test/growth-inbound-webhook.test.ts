import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeInboundPayload,
  signInboundPayload,
  verifyGrowthInboundSignature,
  InboundWebhookError,
} from "../src/growth/inbound-webhook.js";

test("signature verification rejects tampered bodies", () => {
  const secret = "test-secret";
  const body = Buffer.from(JSON.stringify({ id: "evt_1", data: { from: "a@b.com", to: "c@d.com", text: "hi" } }));
  const sig = `sha256=${signInboundPayload(body, secret)}`;
  verifyGrowthInboundSignature(body, sig, secret);
  assert.throws(
    () => verifyGrowthInboundSignature(Buffer.from("{}"), sig, secret),
    (err: unknown) => err instanceof InboundWebhookError,
  );
});

test("normalizeInboundPayload extracts addresses and event id", () => {
  const email = normalizeInboundPayload({
    type: "email.received",
    data: {
      email_id: "em_123",
      from: "Prospect <prospect@hotel.com>",
      to: ["sales@nnact.com"],
      subject: "Re: Maintenance",
      text: "Can we schedule a visit?",
    },
  });
  assert.equal(email.externalId, "em_123");
  assert.equal(email.fromEmail, "prospect@hotel.com");
  assert.equal(email.toEmail, "sales@nnact.com");
  assert.match(email.bodyText, /schedule/i);
});

test("a signature of the right length but not hex is refused, not thrown", () => {
  const secret = "test-secret";
  const body = Buffer.from(JSON.stringify({ id: "evt_1" }));
  // 64 valid-looking characters that are not hex. Decoding this to a buffer
  // yields nothing, so a naive length check would let timingSafeEqual throw a
  // RangeError and turn a bad signature into a 500.
  const notHex = `sha256=${"z".repeat(64)}`;
  assert.throws(
    () => verifyGrowthInboundSignature(body, notHex, secret),
    (err: unknown) => err instanceof InboundWebhookError && err.code === "bad_signature" && err.statusCode === 401,
  );

  // Truncated and over-long digests are refused the same way.
  for (const bad of ["sha256=abc", `sha256=${"a".repeat(63)}`, `sha256=${"a".repeat(65)}`]) {
    assert.throws(
      () => verifyGrowthInboundSignature(body, bad, secret),
      (err: unknown) => err instanceof InboundWebhookError && err.statusCode === 401,
    );
  }
});

test("the signature is an HMAC, so appending to a signed body does not verify", () => {
  const secret = "test-secret";
  const body = Buffer.from(JSON.stringify({ id: "evt_1", text: "original" }));
  const sig = `sha256=${signInboundPayload(body, secret)}`;

  // Length extension: a plain sha256(secret ‖ body) construction would let the
  // padding and appended fields verify. HMAC must refuse.
  const tampered = Buffer.from(body.toString("utf8") + '","admin":true');
  assert.throws(() => verifyGrowthInboundSignature(tampered, sig, secret), InboundWebhookError);
});

test("a missing or blank secret fails as unconfigured rather than verifying", () => {
  const body = Buffer.from("{}");
  assert.throws(
    () => verifyGrowthInboundSignature(body, `sha256=${"a".repeat(64)}`, "  "),
    (err: unknown) => err instanceof InboundWebhookError && err.code === "not_configured",
  );
});
