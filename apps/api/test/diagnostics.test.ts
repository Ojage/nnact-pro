import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveInitialDiagnosticStatus,
  deriveStatusAfterMeasurement,
  shouldSuspendWorkflow,
  validatePublishableStep,
} from "../src/diagnostics.js";

test("diagnostic session requires equipment and a workflow", () => {
  assert.equal(
    deriveInitialDiagnosticStatus({ equipmentResolved: false, workflowId: null }),
    "identification_required",
  );
  assert.equal(
    deriveInitialDiagnosticStatus({ equipmentResolved: true, workflowId: null }),
    "identification_required",
  );
  assert.equal(
    deriveInitialDiagnosticStatus({ equipmentResolved: true, workflowId: "wf-1" }),
    "workflow_ready",
  );
});

test("measurements move an active session into testing or blocked", () => {
  assert.equal(
    deriveStatusAfterMeasurement({ currentStatus: "workflow_ready", result: "pass" }),
    "testing",
  );
  assert.equal(
    deriveStatusAfterMeasurement({ currentStatus: "testing", result: "unable" }),
    "blocked",
  );
  assert.equal(
    deriveStatusAfterMeasurement({ currentStatus: "completed", result: "fail" }),
    "completed",
  );
});

test("technician-facing electrical checks cannot publish without exact field details", () => {
  const errors = validatePublishableStep({
    publicLabel: "Verify bake relay output",
    stepType: "check",
    meterMode: "VAC",
    point1Label: "Control P4-3",
    point2Label: "Neutral",
    operatingCondition: "Bake commanded on",
    expectedText: "120 VAC",
    validationStatus: "validated",
  });
  assert.deepEqual(errors, []);

  const invalid = validatePublishableStep({
    publicLabel: "Check voltage",
    stepType: "check",
    validationStatus: "unreviewed",
  });
  assert.ok(invalid.length >= 5);
});

test("safety-critical field corrections suspend affected workflows", () => {
  assert.equal(shouldSuspendWorkflow("safety_critical"), true);
  assert.equal(shouldSuspendWorkflow("high"), false);
});
