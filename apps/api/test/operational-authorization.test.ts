import assert from "node:assert/strict";
import test from "node:test";
import {
  requiredRolesForRequest,
  roleCanSyncOperation,
  technicianJobPatchAllowed,
} from "../src/operational-authorization.js";

test("owner-only and office write routes are classified explicitly", () => {
  assert.equal(requiredRolesForRequest("PATCH", "/api/users/user-1"), null);
  assert.deepEqual(requiredRolesForRequest("PATCH", "/api/org/me"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("GET", "/api/operations/status"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/operations/backups"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/invoices"), ["owner", "dispatcher", "secretary"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/appointments"), ["owner", "dispatcher", "secretary"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/customers"), ["owner", "dispatcher", "secretary"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/estimates"), ["owner", "dispatcher", "secretary"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/service-agreements"), ["owner", "dispatcher", "secretary"]);
  assert.deepEqual(requiredRolesForRequest("PATCH", "/api/service-visits/visit-1"), ["owner", "dispatcher"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/reviews"), ["owner", "dispatcher"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/jobs"), ["owner", "dispatcher"]);
  assert.equal(requiredRolesForRequest("GET", "/api/invoices"), null);
  assert.equal(requiredRolesForRequest("PATCH", "/api/jobs/job-1"), null);
});

test("non-owner team-member management stays owner-only while self-service profile routes are exempt", () => {
  assert.deepEqual(requiredRolesForRequest("POST", "/api/users"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("DELETE", "/api/users/user-1"), ["owner"]);
  assert.equal(requiredRolesForRequest("POST", "/api/users/user-1/avatar"), null);
  assert.equal(requiredRolesForRequest("DELETE", "/api/users/user-1/avatar"), null);
  assert.deepEqual(requiredRolesForRequest("PUT", "/api/users/user-1/avatar"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/users/user-1/photo"), ["owner"]);
});

test("versioned /api/v1 paths get the same role guards as the legacy /api base", () => {
  assert.equal(requiredRolesForRequest("PATCH", "/api/v1/users/user-1"), null);
  assert.equal(requiredRolesForRequest("POST", "/api/v1/users/user-1/avatar"), null);
  assert.deepEqual(requiredRolesForRequest("DELETE", "/api/v1/users/user-1"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("PATCH", "/api/v1/org/me"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/v1/operations/backups"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/v1/jobs"), ["owner", "dispatcher"]);
  assert.deepEqual(requiredRolesForRequest("PATCH", "/api/v1/equipment/equip-1"), ["owner", "dispatcher", "secretary"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/v1/customers"), ["owner", "dispatcher", "secretary"]);
  assert.equal(requiredRolesForRequest("GET", "/api/v1/jobs"), null);
  assert.equal(
    requiredRolesForRequest("PATCH", "/api/v1/jobs/job-1?foo=bar"),
    null,
  );
});

test("technician job patches are status-only and limited to field transitions", () => {
  assert.equal(technicianJobPatchAllowed({ status: "in_progress" }), true);
  assert.equal(technicianJobPatchAllowed({ status: "completed" }), true);
  assert.equal(technicianJobPatchAllowed({ status: "canceled" }), false);
  assert.equal(technicianJobPatchAllowed({ status: "completed", total: 5000 }), false);
  assert.equal(technicianJobPatchAllowed({ assignedTo: "other" }), false);
});

test("offline financial writes cannot bypass canonical invoice and payment APIs", () => {
  for (const role of ["owner", "dispatcher", "secretary", "technician"] as const) {
    for (const table of ["invoices", "payments", "estimates"]) {
      assert.equal(
        roleCanSyncOperation(role, { table, type: "create", payload: {} }),
        false,
      );
    }
  }
});

test("secretaries cannot sync any offline operations", () => {
  assert.equal(
    roleCanSyncOperation("secretary", { table: "jobs", type: "update", payload: { status: "completed", total: 10000 } }),
    false,
  );
  assert.equal(
    roleCanSyncOperation("secretary", { table: "customers", type: "create", payload: {} }),
    false,
  );
});

test("technicians can only sync assigned field-shaped operations", () => {
  assert.equal(
    roleCanSyncOperation("technician", {
      table: "jobs",
      type: "update",
      payload: { status: "in_progress" },
    }),
    true,
  );
  assert.equal(
    roleCanSyncOperation("technician", {
      table: "jobs",
      type: "update",
      payload: { status: "completed", total: 10000 },
    }),
    false,
  );
  assert.equal(
    roleCanSyncOperation("technician", {
      table: "line_items",
      type: "create",
      payload: { jobId: "job" },
    }),
    true,
  );
  assert.equal(
    roleCanSyncOperation("technician", {
      table: "customers",
      type: "create",
      payload: {},
    }),
    false,
  );
});

test("growth and outreach writes are restricted to owner and dispatcher", () => {
  assert.deepEqual(requiredRolesForRequest("POST", "/api/growth/prospects"), ["owner", "dispatcher"]);
  assert.deepEqual(requiredRolesForRequest("PATCH", "/api/growth/prospects/prospect-1"), ["owner", "dispatcher"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/growth/senders"), ["owner", "dispatcher"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/growth/suppressions"), ["owner", "dispatcher"]);
  // Same guards on the versioned prefix.
  assert.deepEqual(requiredRolesForRequest("POST", "/api/v1/growth/prospects"), ["owner", "dispatcher"]);
  // Query strings must not bypass the prefix match.
  assert.deepEqual(requiredRolesForRequest("POST", "/api/growth/prospects?force=true"), ["owner", "dispatcher"]);
  // Reads are gated in the route handlers (growth/access.ts), not here.
  assert.equal(requiredRolesForRequest("GET", "/api/growth/prospects"), null);
});

test("content automation config and subscriber writes are owner-only", () => {
  // AI provider credentials, automation mode, and manual triggers.
  assert.deepEqual(requiredRolesForRequest("PUT", "/api/ai/settings"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("PUT", "/api/ai/providers/openai"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/ai/providers/openai/probe"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/ai/trigger"), ["owner"]);
  // Subscriber list and per-subscriber status changes.
  assert.deepEqual(requiredRolesForRequest("PATCH", "/api/newsletter/sub-1"), ["owner"]);
  // Same guards on the versioned prefix.
  assert.deepEqual(requiredRolesForRequest("PUT", "/api/v1/ai/settings"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/v1/ai/trigger"), ["owner"]);
  // Query strings must not bypass the prefix match.
  assert.deepEqual(requiredRolesForRequest("PUT", "/api/ai/settings?force=true"), ["owner"]);
});

test("content pipeline writes keep their narrower owner/dispatcher role set", () => {
  assert.deepEqual(requiredRolesForRequest("POST", "/api/content"), ["owner", "dispatcher"]);
  assert.deepEqual(requiredRolesForRequest("PATCH", "/api/content/content-1"), ["owner", "dispatcher"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/content/publications/pub-1/retry"), ["owner", "dispatcher"]);
});

test("read-only automation inspection is not blocked by the write guard", () => {
  // Reads are authorized in the handlers / blanket guard, which skips GET, so a
  // non-owner dispatcher may still see run history. Only mutation is restricted.
  assert.equal(requiredRolesForRequest("GET", "/api/ai/runs"), null);
  assert.equal(requiredRolesForRequest("GET", "/api/ai/settings"), null);
  // The public newsletter subscribe endpoint is a different prefix and must
  // stay open so site visitors are not required to be staff.
  assert.equal(requiredRolesForRequest("POST", "/api/public/newsletter/subscribe"), null);
});
