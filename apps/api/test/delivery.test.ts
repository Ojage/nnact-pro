// Runnable check (no DB needed):  node --import tsx --test test/delivery.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { backoffMs, buildDeliveryRequest, MAX_ATTEMPTS } from "../src/plugins/delivery.ts";

test("backoffMs grows exponentially then caps at 1h", () => {
  assert.equal(backoffMs(1), 30_000); // base
  assert.equal(backoffMs(2), 60_000);
  assert.equal(backoffMs(3), 120_000);
  assert.ok(backoffMs(2) > backoffMs(1) && backoffMs(3) > backoffMs(2));
  assert.equal(backoffMs(50), 3_600_000); // capped, never unbounded
});

test("MAX_ATTEMPTS is a sane positive integer", () => {
  assert.ok(Number.isInteger(MAX_ATTEMPTS) && MAX_ATTEMPTS >= 1);
});

test("generic delivery is the signed OFP envelope", () => {
  const { headers, body } = buildDeliveryRequest({
    transform: "generic",
    kind: "invoice.paid",
    orgId: "org-1",
    payload: { invoiceId: "i1", total: 18900 },
    secret: "whsec_x",
  });
  assert.equal(headers["x-ofp-event"], "invoice.paid");
  assert.match(headers["x-ofp-signature"], /^t=\d+,v1=[0-9a-f]+$/);
  const env = JSON.parse(body);
  assert.equal(env.kind, "invoice.paid");
  assert.equal(env.orgId, "org-1");
  assert.deepEqual(env.data, { invoiceId: "i1", total: 18900 });
});

test("notifier delivery is the target shape, unsigned", () => {
  const { headers, body } = buildDeliveryRequest({
    transform: "slack",
    kind: "job.created",
    orgId: "org-1",
    payload: { title: "AC tune-up" },
    secret: "whsec_x",
  });
  assert.equal(headers["x-ofp-signature"], undefined); // no signature for notifiers
  assert.deepEqual(JSON.parse(body), { text: "🆕 New job: AC tune-up" });
});
