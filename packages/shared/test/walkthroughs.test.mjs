import assert from "node:assert/strict";
import test from "node:test";
import {
  getWalkthrough,
  newWalkthroughProgress,
  roleOf,
  walkthroughAccessibleTo,
  walkthroughsForRole,
  walkthroughsForRoute,
  WALKTHROUGH_ROLES,
} from "../src/walkthroughs.ts";

test("walkthrough definition surface is internally consistent", () => {
  const tour = getWalkthrough("create-customer");
  assert.ok(tour, "create-customer tour exists");
  assert.equal(tour.version, 1);
  assert.ok(tour.steps.length >= 3, "tour has an action/navigation sequence");
  for (const step of tour.steps) {
    assert.ok(step.title, "step has a title");
    assert.ok(step.body, "step has a body");
    assert.ok(["info", "spotlight", "action", "navigation", "tip", "success"].includes(step.kind));
  }
});

test("roleOf tolerates legacy and unknown role strings", () => {
  assert.equal(roleOf({ role: "owner" }), "owner");
  assert.equal(roleOf({ role: "technician" }), "technician");
  assert.equal(roleOf({ role: "senior" }), "technician");
  assert.equal(roleOf({ role: "nobody" }), "technician");
});

test("every tour is only targetable by a non-empty role set", () => {
  const tours = walkthroughsForRole("owner");
  assert.ok(tours.length > 0, "owners can run tours");
  for (const role of WALKTHROUGH_ROLES) {
    const scoped = walkthroughsForRole(role);
    for (const tour of scoped) {
      assert.ok(tour.roles.includes(role), `${tour.id} grants ${role}`);
      assert.ok(walkthroughAccessibleTo(tour, role), `${tour.id} is accessible to ${role}`);
    }
  }
});

test("contribute tour is open to technicians; review stays senior-gated", () => {
  const canContribute = walkthroughAccessibleTo(getWalkthrough("contribute-repair-knowledge"), "technician");
  assert.ok(canContribute, "technicians can contribute knowledge");
  const canReview = walkthroughAccessibleTo(getWalkthrough("review-verify-knowledge"), "technician");
  assert.equal(canReview, false, "review is gated to owner/dispatcher");
});

test("walkthroughsForRoute narrows by pathname prefix", () => {
  const createCustomer = getWalkthrough("create-customer");
  const customerTours = walkthroughsForRoute("/customers/abc", "dispatcher");
  assert.ok(customerTours.some((t) => t.id === createCustomer.id));
  const all = walkthroughsForRoute("/dispatch", "dispatcher");
  assert.ok(all.some((t) => t.id === "dispatch-assign-technician"));
});

test("newWalkthroughProgress seeds an in_progress record at the right version", () => {
  const record = newWalkthroughProgress({ id: "x", version: 3 }, 2);
  assert.equal(record.state, "in_progress");
  assert.equal(record.version, 3);
  assert.equal(record.step, 2);
  assert.equal(record.starts, 1);
});