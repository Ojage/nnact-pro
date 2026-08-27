/** Stable UUIDs for idempotent NNACT demo seeding. Namespace: b0000001-0000-4000-8000-* */

export const NNACT_ORG_ID = "b0000001-0001-4000-8000-000000000001";

export const NNACT_USER_IDS = {
  owner: "b0000001-0002-4000-8000-000000000001",
  dispatchGrace: "b0000001-0002-4000-8000-000000000002",
  dispatchBertrand: "b0000001-0002-4000-8000-000000000003",
  financeClaudia: "b0000001-0002-4000-8000-000000000004",
  seniorEmmanuel: "b0000001-0002-4000-8000-000000000005",
  techFrankline: "b0000001-0002-4000-8000-000000000006",
  techDelphine: "b0000001-0002-4000-8000-000000000007",
  techJunior: "b0000001-0002-4000-8000-000000000008",
  techRita: "b0000001-0002-4000-8000-000000000009",
  techPascal: "b0000001-0002-4000-8000-000000000010",
} as const;

export function nnactCustomerId(index: number): string {
  return `b0000001-0003-4000-8000-${String(index).padStart(12, "0")}`;
}

export function nnactPropertyId(index: number): string {
  return `b0000001-0004-4000-8000-${String(index).padStart(12, "0")}`;
}

export function nnactEquipmentModelId(index: number): string {
  return `b0000001-0005-4000-8000-${String(index).padStart(12, "0")}`;
}

export function nnactEquipmentId(index: number): string {
  return `b0000001-0006-4000-8000-${String(index).padStart(12, "0")}`;
}

export function nnactJobId(index: number): string {
  return `b0000001-0007-4000-8000-${String(index).padStart(12, "0")}`;
}

export function nnactAppointmentId(index: number): string {
  return `b0000001-0008-4000-8000-${String(index).padStart(12, "0")}`;
}

export function nnactInvoiceId(index: number): string {
  return `b0000001-0009-4000-8000-${String(index).padStart(12, "0")}`;
}

export function nnactEstimateId(index: number): string {
  return `b0000001-000a-4000-8000-${String(index).padStart(12, "0")}`;
}

export function nnactPaymentId(index: number): string {
  return `b0000001-000b-4000-8000-${String(index).padStart(12, "0")}`;
}

export function nnactSymptomId(index: number): string {
  return `b0000001-000c-4000-8000-${String(index).padStart(12, "0")}`;
}

export function nnactFaultId(index: number): string {
  return `b0000001-000d-4000-8000-${String(index).padStart(12, "0")}`;
}

export function nnactRepairOutcomeId(index: number): string {
  return `b0000001-000f-4000-8000-${String(index).padStart(12, "0")}`;
}
