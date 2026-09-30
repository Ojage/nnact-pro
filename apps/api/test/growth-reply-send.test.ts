import test from "node:test";
import assert from "node:assert/strict";
import { replyIdempotencyKey } from "../src/growth/reply-send.js";
import { TRANSPORT_PERMITTED_PURPOSES, transportForPurpose, transportPermitsPurpose } from "../src/growth/transport-policy.js";
import { purposeToMessagePurpose } from "../src/growth/campaign-policy.js";

test("the same body on the same thread is the same idempotency key", () => {
  const a = replyIdempotencyKey("thread-1", "Thanks, that works for us.");
  const b = replyIdempotencyKey("thread-1", "  Thanks, that works for us.  ");
  assert.equal(a, b, "leading/trailing whitespace must not create a second send");
});

test("a different body on the same thread is a different key", () => {
  const a = replyIdempotencyKey("thread-1", "First reply");
  const b = replyIdempotencyKey("thread-1", "Second reply");
  assert.notEqual(a, b);
});

test("the same body on different threads is a different key", () => {
  const a = replyIdempotencyKey("thread-1", "Same words");
  const b = replyIdempotencyKey("thread-2", "Same words");
  assert.notEqual(a, b, "replies to different threads must never collide");
});

test("different bodies of identical length do not collide", () => {
  // Length is part of the key, so a hash collision between two same-length
  // bodies is the only risk; these differ well beyond that.
  const a = replyIdempotencyKey("thread-1", "aaaa");
  const b = replyIdempotencyKey("thread-1", "bbbb");
  assert.notEqual(a, b);
});

test("a reply resolves to the shared transport and never to the cold transport", () => {
  // The cold transport exists so unsolicited mail cannot damage the
  // transactional/marketing reputation. A reply is a response to inbound mail
  // and must not ride the cold reputation.
  assert.equal(transportForPurpose("reply"), "resend");
  assert.equal(transportPermitsPurpose("cold_transport", "reply"), false);
  assert.equal(transportPermitsPurpose("resend", "reply"), true);
});

test("the reply purpose is permitted only where it should be", () => {
  assert.ok(TRANSPORT_PERMITTED_PURPOSES.resend.includes("reply"));
  assert.ok(!TRANSPORT_PERMITTED_PURPOSES.cold_transport.includes("reply"));
});

test("REPLY maps to the reply message purpose, not cold outreach", () => {
  assert.equal(purposeToMessagePurpose("REPLY"), "reply");
});
