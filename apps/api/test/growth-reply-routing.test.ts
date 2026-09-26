import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyInboundReply } from "../src/growth/reply-assist.js";

test("identity verification questions route to a human immediately", () => {
  const result = classifyInboundReply("Do you actually work at NNACT? Who are you?");
  assert.equal(result.intent, "VERIFICATION");
  assert.equal(result.requiresHuman, true);
  assert.equal(result.verificationRequested, true);
});

test("pricing questions require human approval", () => {
  const result = classifyInboundReply("What is your price for a maintenance plan?");
  assert.equal(result.intent, "PRICING");
  assert.equal(result.requiresHuman, true);
});

test("unsubscribe is routed to human handling", () => {
  const result = classifyInboundReply("Please unsubscribe me from this list.");
  assert.equal(result.intent, "UNSUBSCRIBE");
  assert.equal(result.requiresHuman, true);
});
