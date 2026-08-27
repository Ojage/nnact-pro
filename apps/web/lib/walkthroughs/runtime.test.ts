import assert from "node:assert/strict";
import test from "node:test";
import type {
  Walkthrough,
  WalkthroughProgressRecord,
  WalkthroughStep,
} from "@nnact/shared";
import {
  conditionMatches,
  isTourCompleted,
  isTourDismissed,
  isTourInProgress,
  pathMatches,
  recordMatchesVersion,
  resolveStatus,
  routeLabel,
  stepBlocksNext,
  stepCountLabel,
  stepFulfilled,
  stepIsAutoAdvancing,
  stepNeedsNavigation,
  targetSelector,
  toursForPathname,
} from "./runtime";

function step(overrides: Partial<WalkthroughStep> & { kind: WalkthroughStep["kind"] }): WalkthroughStep {
  return {
    title: "Step",
    body: "Body",
    ...overrides,
  } as WalkthroughStep;
}

function tour(version: number, overrides: Partial<Walkthrough> = {}): Walkthrough {
  return {
    id: "t",
    version,
    title: "Tour",
    summary: "Summary",
    duration: "1 min",
    roles: ["owner", "dispatcher", "technician"],
    relatesTo: ["/jobs"],
    steps: [step({ kind: "info" })],
    ...overrides,
  } as Walkthrough;
}

function record(state: WalkthroughProgressRecord["state"], version: number): WalkthroughProgressRecord {
  return { state, step: 0, version, starts: 1, completions: 0, updatedAt: "2026-01-01T00:00:00.000Z" };
}

test("targetSelector builds a data-tour attribute selector", () => {
  assert.equal(targetSelector("jobs-add"), '[data-tour="jobs-add"]');
});

test("pathMatches handles root and prefix routes", () => {
  assert.equal(pathMatches("/", "/"), true);
  assert.equal(pathMatches("/?x=1", "/"), true);
  assert.equal(pathMatches("/jobs", "/jobs"), true);
  assert.equal(pathMatches("/jobs/abc", "/jobs"), true);
  assert.equal(pathMatches("/customers", "/jobs"), false);
});

test("stepNeedsNavigation", () => {
  const nav = step({ kind: "navigation", route: "/dispatch" });
  const plain = step({ kind: "info" });
  assert.equal(stepNeedsNavigation(nav, "/jobs"), true);
  assert.equal(stepNeedsNavigation(nav, "/dispatch"), false);
  assert.equal(stepNeedsNavigation(plain, "/anything"), false);
});

test("conditionMatches honors tag, selector, and target", () => {
  assert.equal(conditionMatches({ tag: "job.created" }, { tag: "job.created" }), true);
  assert.equal(conditionMatches({ tag: "job.created" }, { tag: "visit.started" }), false);

  const el = { matches: (sel: string) => sel === "[data-tour='x']" || sel === '[data-tour="x"]' };
  assert.equal(conditionMatches({ selector: "[data-tour='x']" }, { target: el }), true);
  assert.equal(conditionMatches({ target: "x" }, { target: el }), true);
  assert.equal(conditionMatches({ target: "y" }, { target: el }), false);
  assert.equal(conditionMatches({ selector: "[data-tour='x']" }, {}), false);
});

test("stepFulfilled without advanceOn is always fulfilled", () => {
  assert.equal(stepFulfilled(step({ kind: "action" })), true);
});

test("stepFulfilled requires any condition to match", () => {
  const s = step({ kind: "action", advanceOn: [{ tag: "a" }, { tag: "b" }] });
  assert.equal(stepFulfilled(s, { tag: "b" }), true);
  assert.equal(stepFulfilled(s, { tag: "c" }), false);
});

test("stepBlocksNext only blocks real action steps", () => {
  const action = step({ kind: "action", advanceOn: [{ tag: "job.created" }] });
  assert.equal(stepBlocksNext(action, false), true);
  assert.equal(stepBlocksNext(action, true), false);
  const optional = step({ kind: "action", advanceOn: [{ tag: "job.created" }], required: false });
  assert.equal(stepBlocksNext(optional, false), false);
  const info = step({ kind: "info" });
  assert.equal(stepBlocksNext(info, false), false);
});

test("stepIsAutoAdvancing defaults on for gated actions", () => {
  const gated = step({ kind: "action", advanceOn: [{ tag: "job.created" }] });
  assert.equal(stepIsAutoAdvancing(gated), true);
  const optOut = step({ kind: "action", advanceOn: [{ tag: "job.created" }], autoAdvance: false });
  assert.equal(stepIsAutoAdvancing(optOut), false);
  assert.equal(stepIsAutoAdvancing(step({ kind: "info" })), false);
});

test("recordMatchesVersion and completion helpers are version-aware", () => {
  const v1 = tour(1);
  const stale = record("completed", 1);
  const current = record("in_progress", 1);
  assert.equal(recordMatchesVersion(v1, stale), true);
  assert.equal(recordMatchesVersion(v1, { ...stale, version: 0 }), false);

  assert.equal(isTourCompleted(v1, stale), true);
  assert.equal(isTourCompleted(v1, { ...stale, version: 0 }), false);
  assert.equal(isTourInProgress(v1, current), true);
  assert.equal(isTourInProgress(v1, stale), false);
  assert.equal(isTourDismissed(v1, { ...current, state: "dismissed" }), true);
});

test("routeLabel and stepCountLabel", () => {
  assert.equal(routeLabel("/customers"), "Go to Customers");
  assert.equal(routeLabel("/nope"), null);
  assert.equal(stepCountLabel(0, 5), "1 of 5");
  assert.equal(stepCountLabel(5, 5), "5 of 5");
});

test("resolveStatus cycles idle → navigate → resolving → ready/missing", () => {
  assert.equal(resolveStatus(undefined, "/", false, false), "idle");
  const needsNav = step({ kind: "navigation", route: "/dispatch" });
  assert.equal(resolveStatus(needsNav, "/jobs", false, false), "navigate");
  const onRoute = step({ kind: "spotlight", target: "slot" });
  assert.equal(resolveStatus(onRoute, "/jobs", true, false), "ready");
  assert.equal(resolveStatus(onRoute, "/jobs", false, true), "resolving");
  assert.equal(resolveStatus(onRoute, "/jobs", false, false), "missing");
});

test("toursForPathname returns tours relating to a pathname", () => {
  const related = tour(1, { id: "a", relatesTo: ["/jobs"] });
  const unrelated = tour(1, { id: "b", relatesTo: ["/customers"] });
  const result = toursForPathname([related, unrelated], "/jobs/xyz");
  assert.deepEqual(result.map((t) => t.id), ["a"]);
});