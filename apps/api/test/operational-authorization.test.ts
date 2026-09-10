import assert from "node:assert/strict";
import test from "node:test";
import {
  requiredRolesForRequest,
  roleCanSyncOperation,
  technicianJobPatchAllowed,
} from "../src/operational-authorization.js";

test("owner-only and office write routes are classified explicitly", () => {
  assert.deepEqual(requiredRolesForRequest("PATCH", "/api/users/user-1"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("PATCH", "/api/org/me"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("GET", "/api/operations/status"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/operations/backups"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/invoices"), ["owner", "dispatcher"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/appointments"), ["owner", "dispatcher"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/jobs"), ["owner", "dispatcher"]);
  assert.equal(requiredRolesForRequest("GET", "/api/invoices"), null);
  assert.equal(requiredRolesForRequest("PATCH", "/api/jobs/job-1"), null);
});

test("versioned /api/v1 paths get the same role guards as the legacy /api base", () => {
  assert.deepEqual(requiredRolesForRequest("PATCH", "/api/v1/users/user-1"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("PATCH", "/api/v1/org/me"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/v1/operations/backups"), ["owner"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/v1/jobs"), ["owner", "dispatcher"]);
  assert.deepEqual(requiredRolesForRequest("PATCH", "/api/v1/equipment/equip-1"), ["owner", "dispatcher"]);
  assert.deepEqual(requiredRolesForRequest("POST", "/api/v1/customers"), ["owner", "dispatcher"]);
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
  for (const role of ["owner", "dispatcher", "technician"] as const) {
    for (const table of ["invoices", "payments", "estimates"]) {
      assert.equal(
        roleCanSyncOperation(role, { table, type: "create", payload: {} }),
        false,
      );
    }
  }
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
