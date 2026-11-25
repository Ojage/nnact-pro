import assert from "node:assert/strict";
import test from "node:test";
import { canAccessRoute } from "./nav";
import { quickAccessFor, quickActionsFor } from "./home-actions";

test("each role gets its own quick actions", () => {
  const owner = quickActionsFor("owner").map((action) => action.label);
  const technician = quickActionsFor("technician").map((action) => action.label);
  const secretary = quickActionsFor("secretary").map((action) => action.label);
  assert.ok(owner.includes("Open dispatch") && owner.includes("Agent Office"));
  assert.deepEqual(technician, ["My jobs", "Start diagnostics", "Repair Brain"]);
  assert.ok(secretary.includes("Find a customer"));
  assert.ok(!secretary.includes("Open dispatch"), "secretaries cannot open dispatch");
  assert.ok(!technician.includes("New job"));
});

test("no role is offered a page it cannot open", () => {
  for (const role of ["owner", "dispatcher", "secretary", "technician"] as const) {
    for (const item of [...quickActionsFor(role), ...quickAccessFor(role, 99)]) {
      assert.ok(canAccessRoute(role, item.href), `${role} -> ${item.href}`);
    }
  }
});

test("quick access shows at most eight tiles and never Agent Office to a technician", () => {
  assert.equal(quickAccessFor("owner").length, 8);
  assert.ok(!quickAccessFor("technician", 99).some((tile) => tile.href === "/agents"));
  assert.deepEqual(quickActionsFor(undefined), quickActionsFor("technician"), "unknown roles get the narrowest set");
});
