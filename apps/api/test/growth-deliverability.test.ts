import test from "node:test";
import assert from "node:assert/strict";
import { isPermanentBounce } from "../src/growth/deliverability.js";

test("a soft bounce must never suppress", () => {
  // Suppressing on a temporary failure would silently amputate a large part of
  // a healthy list: 4xx/mailbox-full/greylist are all retried by the ESP and
  // the next send usually succeeds.
  for (const reason of [
    "421 4.7.0 try again later",
    "450 mailbox full",
    "421 greylisted, try again",
    "temporary failure",
    "452 quota exceeded",
    "554 deferred until later",
    "451 4.3.0 rate limit",
  ]) {
    assert.equal(isPermanentBounce(reason), false, `expected "${reason}" to be treated as soft`);
  }
});

test("a hard bounce suppresses", () => {
  for (const reason of [
    "550 5.1.1 user unknown",
    "553 5.1.8 sender address rejected",
    "551 user not found",
    "does not exist",
  ]) {
    assert.equal(isPermanentBounce(reason), true, `expected "${reason}" to be treated as hard`);
  }
});

test("an unclassifiable reason suppresses, because under-sending is the safer error", () => {
  // A missing reason is more likely an unparsed hard bounce than a soft one,
  // and the cost of wrongly suppressing one address is far lower than the cost
  // of continuing to mail a dead address and damaging the sending domain.
  assert.equal(isPermanentBounce(undefined), true);
  assert.equal(isPermanentBounce(""), true);
});

test("soft-bounce markers win over hard-sounding SMTP verbs", () => {
  // "5.x.x" codes carry a permanent signal, but a message that also says
  // "try again" is retryable and must not suppress.
  assert.equal(isPermanentBounce("550 5.1.1 please try again later"), false);
});
