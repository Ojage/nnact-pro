// Run lifecycle: the execution gate, stranded-run recovery, and operator
// Cancel/Retry.
//
// The bug these pin: `markAttempt` used to UPDATE on id alone, with no state
// guard. Because the "Generate now" request path calls it (not `claimRun`), a
// finished run was flipped back to PLANNING on every click and re-executed —
// one production run reached 90 attempts and never reached a state an operator
// could clear, because PLANNING/GENERATING_TEXT are absent from CLAIMABLE_RUN_STATES
// and there was no cancel/retry route to move it out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAIMABLE_RUN_STATES, TERMINAL_RUN_STATES, WIP_RUN_STATES } from "../src/ai/ports.js";
import { AI_RUN_STATES } from "@nnact/shared";

test("WIP states are derived from AI_RUN_STATES, not hand-listed", () => {
  // A newly added pipeline stage must be swept as stranded by default rather
  // than silently excluded because someone forgot to update a list.
  const derived = new Set(WIP_RUN_STATES);
  for (const state of AI_RUN_STATES) {
    const expected = !TERMINAL_RUN_STATES.includes(state as never) && !CLAIMABLE_RUN_STATES.includes(state as never);
    assert.equal(derived.has(state), expected, `${state} classification is wrong`);
  }
  assert.ok(WIP_RUN_STATES.includes("PLANNING"), "the state the operator saw stranded must be swept");
  assert.ok(WIP_RUN_STATES.includes("GENERATING_TEXT"), "the other stranded state must be swept");
});

test("FAILED is the only state that is both terminal and claimable", () => {
  // Overlap is deliberate and load-bearing: FAILED means "stopped, operator
  // action required" yet is still pickable up, which is exactly what lets Retry
  // re-run a run the sweep or a failure wrote. Any second overlap would mean a
  // state that can be picked up while also being considered finished.
  const overlap = CLAIMABLE_RUN_STATES.filter((s) => TERMINAL_RUN_STATES.includes(s as never));
  assert.deepEqual([...overlap], ["FAILED"]);
});

test("FAILED is both terminal and claimable, which is what makes Retry work", () => {
  // The stale sweep writes FAILED. If FAILED were not claimable the run would
  // just move from permanently-stranded to permanently-failed.
  assert.ok(TERMINAL_RUN_STATES.includes("FAILED" as never));
  assert.ok(CLAIMABLE_RUN_STATES.includes("FAILED" as never));
});

test("CANCELLED is terminal and not claimable, so cancel cannot be re-run", () => {
  assert.ok(TERMINAL_RUN_STATES.includes("CANCELLED" as never));
  assert.ok(!CLAIMABLE_RUN_STATES.includes("CANCELLED" as never));
});

test("no WIP state is claimable, so a stranded run needs a reset to recover", () => {
  // This is the invariant that made the production rows unrecoverable: a run in
  // a WIP state can never be claimed, so only the sweep or an operator action
  // can move it.
  for (const state of WIP_RUN_STATES) {
    assert.ok(!CLAIMABLE_RUN_STATES.includes(state as never), `${state} must not be claimable`);
  }
});
