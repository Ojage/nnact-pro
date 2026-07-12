export type DiagnosticSessionStatus =
  | "not_started"
  | "identification_required"
  | "workflow_ready"
  | "testing"
  | "blocked"
  | "inconclusive"
  | "diagnosed"
  | "escalated"
  | "under_review"
  | "completed";

export interface PublishableStepInput {
  publicLabel?: string | null;
  stepType: "check" | "decision" | "reference" | "stop";
  meterMode?: string | null;
  point1Label?: string | null;
  point2Label?: string | null;
  operatingCondition?: string | null;
  expectedText?: string | null;
  validationStatus?: string | null;
}

export function deriveInitialDiagnosticStatus(input: {
  equipmentResolved: boolean;
  workflowId?: string | null;
}): DiagnosticSessionStatus {
  if (!input.equipmentResolved) return "identification_required";
  if (!input.workflowId) return "identification_required";
  return "workflow_ready";
}

export function deriveStatusAfterMeasurement(input: {
  currentStatus: DiagnosticSessionStatus;
  result: string;
}): DiagnosticSessionStatus {
  if (["completed", "escalated", "under_review"].includes(input.currentStatus)) {
    return input.currentStatus;
  }
  if (input.result === "unable" || input.result === "not_reproduced") return "blocked";
  return "testing";
}

/**
 * Publication guard for technician-facing workflow steps. Decision/reference
 * steps can omit meter points; executable checks cannot.
 */
export function validatePublishableStep(step: PublishableStepInput): string[] {
  const errors: string[] = [];
  if (!step.publicLabel?.trim()) errors.push("public technician-facing label is required");

  if (step.stepType === "check") {
    if (!step.meterMode?.trim()) errors.push("meter/tool mode is required for a check");
    if (!step.point1Label?.trim()) errors.push("point 1 is required for a check");
    if (!step.point2Label?.trim()) errors.push("point 2 is required for a check");
    if (!step.operatingCondition?.trim()) errors.push("operating condition is required for a check");
    if (!step.expectedText?.trim()) errors.push("expected result is required for a check");
  }

  if (step.validationStatus !== "validated") {
    errors.push("step must pass validation before publication");
  }

  return errors;
}

export function shouldSuspendWorkflow(severity: string): boolean {
  return severity === "safety_critical";
}
