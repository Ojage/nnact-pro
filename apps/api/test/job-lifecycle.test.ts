import assert from "node:assert/strict";
import test from "node:test";
import { jobNumber, jobStatusLabel, nextJobStatus } from "../src/job-lifecycle.js";

test("jobNumber formats the configured prefix and zero-padded sequence", () => {
  assert.equal(jobNumber(0, "JOB", 1000), "JOB-1000");
  assert.equal(jobNumber(1, "JOB", 1000), "JOB-1001");
  assert.equal(jobNumber(26, "JOB", 1000), "JOB-1026");
  assert.equal(jobNumber(0, "WO", 2000), "WO-2000");
});

test("office roles may transition forward and reopen or reschedule", () => {
  const office = "dispatcher";
  assert.equal(nextJobStatus("lead", "scheduled", office), true);
  assert.equal(nextJobStatus("lead", "in_progress", office), true);
  assert.equal(nextJobStatus("lead", "canceled", office), true);
  assert.equal(nextJobStatus("scheduled", "in_progress", office), true);
  assert.equal(nextJobStatus("scheduled", "canceled", office), true);
  assert.equal(nextJobStatus("scheduled", "lead", office), true);
  assert.equal(nextJobStatus("in_progress", "completed", office), true);
  assert.equal(nextJobStatus("in_progress", "canceled", office), true);
  assert.equal(nextJobStatus("completed", "lead", office), true);
  assert.equal(nextJobStatus("canceled", "lead", office), true);
});

test("office roles cannot skip straight to completed or regress beyond reopen paths", () => {
  const office = "owner";
  assert.equal(nextJobStatus("lead", "completed", office), false);
  assert.equal(nextJobStatus("completed", "in_progress", office), false);
  assert.equal(nextJobStatus("completed", "scheduled", office), false);
  assert.equal(nextJobStatus("completed", "canceled", office), false);
  assert.equal(nextJobStatus("canceled", "scheduled", office), false);
  assert.equal(nextJobStatus("canceled", "in_progress", office), false);
  assert.equal(nextJobStatus("canceled", "completed", office), false);
});

test("technicians may only start or complete jobs assigned to them", () => {
  assert.equal(nextJobStatus("scheduled", "in_progress", "technician"), true);
  assert.equal(nextJobStatus("in_progress", "completed", "technician"), true);
  assert.equal(nextJobStatus("scheduled", "completed", "technician"), false);
  assert.equal(nextJobStatus("lead", "in_progress", "technician"), false);
  assert.equal(nextJobStatus("in_progress", "canceled", "technician"), false);
  assert.equal(nextJobStatus("completed", "lead", "technician"), false);
  assert.equal(nextJobStatus("canceled", "lead", "technician"), false);
});

test("same-status patches are a no-op for every role", () => {
  for (const role of ["owner", "dispatcher", "technician"] as const) {
    for (const status of ["lead", "scheduled", "in_progress", "completed", "canceled"]) {
      assert.equal(nextJobStatus(status, status, role), true, `${role} ${status} -> ${status}`);
    }
  }
});

test("jobStatusLabel turns enum keys into display text", () => {
  assert.equal(jobStatusLabel("in_progress"), "in progress");
  assert.equal(jobStatusLabel("canceled"), "canceled");
});