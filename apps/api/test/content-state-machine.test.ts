import assert from "node:assert/strict";
import test from "node:test";

import { assertTransition, canTransition } from "../src/publishing/domain/state-machine.js";
import { assertContentTransition, canTransitionContent } from "../src/publishing/application/content-status.js";

test("publication state machine allows the happy-path publishing flow", () => {
  assert.equal(canTransition("DRAFT", "READY"), true);
  assert.equal(canTransition("READY", "QUEUED"), true);
  assert.equal(canTransition("QUEUED", "PUBLISHING"), true);
  assert.equal(canTransition("PUBLISHING", "PUBLISHED"), true);
});

test("publication state machine allows scheduling and failure for retry", () => {
  assert.equal(canTransition("FAILED", "QUEUED"), true);
  assert.equal(canTransition("SCHEDULED", "QUEUED"), true);
  assert.equal(canTransition("READY", "CANCELLED"), true);
});

test("publication state machine rejects invalid jumps", () => {
  assert.equal(canTransition("DRAFT", "PUBLISHED"), false);
  // Republishing an already-published item is allowed (edit → republish).
  assert.equal(canTransition("PUBLISHED", "PUBLISHING"), true);
  assert.equal(canTransition("CANCELLED", "PUBLISHING"), false);
  assert.throws(() => assertTransition("DRAFT", "PUBLISHED"), /Invalid publication state transition/);
});

test("publication state machine treats staying in the same state as valid", () => {
  assert.equal(canTransition("PUBLISHED", "PUBLISHED"), true);
});

test("content state machine models the review -> approve -> publish lifecycle", () => {
  assert.equal(canTransitionContent("DRAFT", "IN_REVIEW"), true);
  assert.equal(canTransitionContent("IN_REVIEW", "APPROVED"), true);
  assert.equal(canTransitionContent("APPROVED", "PUBLISHED"), true);
  assert.equal(canTransitionContent("PUBLISHED", "ARCHIVED"), true);
  assert.equal(canTransitionContent("ARCHIVED", "DRAFT"), true);
});

test("content state machine rejects publishing an unreviewed draft", () => {
  assert.equal(canTransitionContent("DRAFT", "PUBLISHED"), false);
  assert.throws(() => assertContentTransition("DRAFT", "PUBLISHED"), /Cannot transition content/);
});

test("content state machine allows reject -> revise -> resubmit", () => {
  assert.equal(canTransitionContent("IN_REVIEW", "REJECTED"), true);
  assert.equal(canTransitionContent("REJECTED", "DRAFT"), true);
  assert.equal(canTransitionContent("REJECTED", "IN_REVIEW"), true);
});

test("FAILED_PUBLISH is only reachable from PUBLISHING", () => {
  assert.equal(canTransitionContent("PUBLISHING", "FAILED_PUBLISH"), true);
  assert.equal(canTransitionContent("SCHEDULED", "FAILED_PUBLISH"), false);
});
