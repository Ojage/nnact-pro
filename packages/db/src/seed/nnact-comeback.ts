// NNACT Pro — comeback / "Retour" demo scenarios for the NNACT development org.
//
// Deterministic and idempotent like the finance seed: the whole comeback domain
// for the demo org is reset, then re-inserted with realistic cases that the
// quality UI and mobile boards can exercise:
//   A) Washer misdiagnosis   → resolved, monitored, closed + Repair Brain proposal
//   B) AC capacitor (supplier) → resolved, in monitoring, supplier-recoverable costs
//   C) Fridge unrelated fault → NOT_A_COMEBACK (new unrelated fault, no charge)
//   D0+D) Repeat sealed-system → open REPORTED case (repeat #2) + scheduled visit
//
// Contextual, non-toxic numbers throughout. Nothing here blocks the API from
// creating real cases afterwards (count-based case numbering continues at
// NNACT/RET/<year>/001005).

import { sql, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  comebackCases,
  comebackStatusHistory,
  comebackCorrectiveActions,
  comebackCosts,
  comebackEvidence,
  comebackCommunications,
  comebackFollowUps,
  jobs,
  jobStatusHistory,
  jobEquipmentLinks,
  knowledgeProposals,
  db,
} from "../index.js";
import {
  NNACT_ORG_ID,
  NNACT_USER_IDS,
  nnactCustomerId,
  nnactPropertyId,
  nnactEquipmentId,
  nnactEquipmentModelId,
  nnactJobId,
} from "./ids.js";

const CASE_ID =
  (index: number) =>
  `b0000001-0011-4000-8000-${String(index).padStart(12, "0")}`;
const PROPOSAL_ID = "b0000001-0012-4000-8000-000000000001";

function daysAgo(days: number, hour = 9): Date {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

function daysAhead(days: number, hour = 10): Date {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

function caseNumber(seq: number): string {
  const year = new Date().getUTCFullYear();
  return `NNACT/RET/${year}/${String(1000 + seq).padStart(6, "0")}`;
}

function jobNumber(seq: number): string {
  return `RB-${String(1000 + seq).padStart(4, "0")}`;
}

export async function seedNnactComeback(): Promise<void> {
  const owner = NNACT_USER_IDS.owner;
  const dispatchGrace = NNACT_USER_IDS.dispatchGrace;
  const emmanuel = NNACT_USER_IDS.seniorEmmanuel;
  const frankline = NNACT_USER_IDS.techFrankline;
  const delphine = NNACT_USER_IDS.techDelphine;
  const pascal = NNACT_USER_IDS.techPascal;

  await db.transaction(async (tx) => {
    // Reset the comeback domain for the demo org (deterministic + idempotent).
    for (const table of [
      comebackFollowUps,
      comebackCosts,
      comebackEvidence,
      comebackCommunications,
      comebackCorrectiveActions,
      comebackStatusHistory,
    ]) {
      await tx.delete(table).where(sql`${table.orgId} = ${NNACT_ORG_ID}`);
    }
    await tx.delete(comebackCases).where(sql`${comebackCases.orgId} = ${NNACT_ORG_ID}`);
    await tx.delete(knowledgeProposals).where(eq(knowledgeProposals.id, PROPOSAL_ID));
    // Comeback visit jobs (cascade removes their status history + equipment links).
    await tx
      .delete(jobs)
      .where(sql`${jobs.orgId} = ${NNACT_ORG_ID} and ${jobs.jobType} = 'comeback'`);

    // XAF currency helper
    const x = (xaf: number) => xaf;

    const history = async (
      caseId: string,
      entries: Array<[from: string | null, to: string, reason: string, at: Date, by: string]>,
    ) => {
      for (const [from, to, reason, at, by] of entries) {
        await tx.insert(comebackStatusHistory).values({
          orgId: NNACT_ORG_ID,
          caseId,
          fromStatus: from as never,
          toStatus: to as never,
          changedBy: by,
          reason,
          createdAt: at,
        });
      }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Scenario A — Samsung washer: drain "pump failure" was a clog (misdiagnosis).
    // Closed after no-relapse monitoring; procedure captured as a knowledge proposal.
    // ─────────────────────────────────────────────────────────────────────────
    const caseA = CASE_ID(1);
    await tx.insert(comebackCases).values({
      id: caseA,
      orgId: NNACT_ORG_ID,
      caseNumber: caseNumber(0),
      originalJobId: nnactJobId(1),
      customerId: nnactCustomerId(3),
      propertyId: nnactPropertyId(3),
      equipmentId: nnactEquipmentId(3),
      reportedBy: delphine,
      reportedAt: daysAgo(44, 8),
      intakeReason: "CUSTOMER_CALLED",
      complaintSummary: "Samsung washer not draining again — pump stopped working",
      complaintDetails: "Same drum-full-of-water complaint 2 days after the first repair; customer is frustrated.",
      originalComplaint: "Samsung washer not draining",
      originalDiagnosis: "Drain pump failure",
      originalRepairSummary: "Replaced drain pump",
      severity: "HIGH",
      status: "CLOSED",
      faultRelationship: "SAME_FAULT",
      rootCause: "MISDIAGNOSIS",
      rootCauseNotes: "Pump was fine; the debris trap and hose were clogged. First technician replaced the pump instead of cleaning the trap.",
      responsibility: "NNACT_RESPONSIBLE",
      preventability: "PREVENTABLE",
      preventabilityNote: "A 90-second trap check would have caught the clog.",
      warrantyStatus: "FULL",
      workmanshipWarrantyEndsAt: addDays(daysAgo(45), 90),
      partsWarrantyEndsAt: addDays(daysAgo(45), 90),
      billingDecision: "NO_CHARGE",
      chargeAmountCents: 0,
      customerConfirmation: "CONFIRMED_RESOLVED",
      monitoringOutcome: "NO_RELAPSE",
      assignedReviewerId: emmanuel,
      assignedTechnicianId: delphine,
      repeatNumber: 1,
      escalationLevel: 0,
      escalated: false,
      resolutionSummary: "Cleaned debris trap and drain hose, verified strong drain, ran three full cycles on site.",
      considerationNotes: "Full rework covered under workmanship warranty; customer not invoiced.",
      version: 1,
    });
    await history(caseA, [
      [null, "REPORTED", "comeback reported", daysAgo(44, 8), delphine],
      ["REPORTED", "TRIAGED", "triaged by dispatcher", daysAgo(44, 9), dispatchGrace],
      ["TRIAGED", "SCHEDULED", "comeback visit scheduled", daysAgo(43, 10), dispatchGrace],
      ["SCHEDULED", "UNDER_INVESTIGATION", "visit started", daysAgo(42, 9), delphine],
      ["UNDER_INVESTIGATION", "RESOLVED", "cleaned trap + verified drain", daysAgo(42, 11), delphine],
      ["RESOLVED", "MONITORING", "monitoring for 7 days", daysAgo(42, 11), emmanuel],
      ["MONITORING", "CLOSED", "monitoring passed (no relapse)", daysAgo(35, 9), emmanuel],
    ]);
    await tx.insert(comebackCosts).values([
      { orgId: NNACT_ORG_ID, caseId: caseA, kind: "LABOUR", costClass: "QUALITY_COST", description: "Rework labour — trap cleaning + verification", amountCents: x(8000), recordedBy: delphine, createdAt: daysAgo(42, 11) },
      { orgId: NNACT_ORG_ID, caseId: caseA, kind: "MISCELLANEOUS", costClass: "QUALITY_COST", description: "Replacement seal kit + drain hose clamp", amountCents: x(4500), recordedBy: delphine, createdAt: daysAgo(42, 11) },
    ]);
    await tx.insert(comebackCorrectiveActions).values({
      id: randomUUID(),
      orgId: NNACT_ORG_ID,
      caseId: caseA,
      kind: "UPDATE_DIAGNOSTIC_PROCEDURE",
      description: "Washer drain diagnosis: always inspect + clean debris trap before replacing the pump.",
      ownerId: emmanuel,
      status: "DONE",
      affectsProcedure: true,
      completedAt: daysAgo(30, 10),
      createdBy: delphine,
      createdAt: daysAgo(42, 11),
    });
    await tx.insert(comebackEvidence).values([
      { orgId: NNACT_ORG_ID, caseId: caseA, kind: "FAILED_PART", note: "Removed pump healthy; trap was packed with lint and a coin. Recovered the old pump for the customer.", createdBy: delphine, createdAt: daysAgo(42, 10) },
      { orgId: NNACT_ORG_ID, caseId: caseA, kind: "FINAL_TEST", note: "Three drain cycles passed on site.", createdBy: delphine, createdAt: daysAgo(42, 11) },
    ]);
    await tx.insert(comebackCommunications).values([
      { orgId: NNACT_ORG_ID, caseId: caseA, kind: "COMPLAINT_RECEIVED", summary: "Customer called: washer still not draining after replacement.", happenedAt: daysAgo(44, 8), createdBy: delphine },
      { orgId: NNACT_ORG_ID, caseId: caseA, kind: "VISIT_SCHEDULED", summary: "Rework visit scheduled within 48h.", happenedAt: daysAgo(43, 10), createdBy: dispatchGrace },
      { orgId: NNACT_ORG_ID, caseId: caseA, kind: "RESOLVED_ANNOUNCED", summary: "Machine verified draining; customer informed.", happenedAt: daysAgo(42, 11), createdBy: delphine },
      { orgId: NNACT_ORG_ID, caseId: caseA, kind: "CUSTOMER_CONFIRMATION", summary: "Customer confirmed resolution after a week of use.", happenedAt: daysAgo(35, 16), createdBy: delphine },
    ]);
    await tx.insert(comebackFollowUps).values({
      orgId: NNACT_ORG_ID,
      caseId: caseA,
      scheduledAt: daysAgo(35, 9),
      outcome: "NO_RELAPSE",
      note: "Customer confirmed no further issues.",
      checkedBy: delphine,
      checkedAt: daysAgo(35, 9),
    });
    await tx.insert(knowledgeProposals).values({
      id: PROPOSAL_ID,
      orgId: NNACT_ORG_ID,
      sourceJobId: nnactJobId(1),
      sourceEquipmentId: nnactEquipmentId(3),
      equipmentModelId: nnactEquipmentModelId(1),
      proposalType: "diagnostic_procedure",
      title: "Samsung WW90T: clean debris trap before condemning the drain pump",
      payload: {
        comebackCaseId: caseA,
        caseNumber: caseNumber(0),
        rootCause: "MISDIAGNOSIS",
        responsibility: "NNACT_RESPONSIBLE",
        preventability: "PREVENTABLE",
        correctiveActions: [],
      },
      status: "proposed",
      proposedBy: delphine,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Scenario B — Daikin split AC: capacitor failed early (supplier part).
    // Resolved + monitoring; part supplier-recoverable; scheduled follow-up.
    // ─────────────────────────────────────────────────────────────────────────
    const caseB = CASE_ID(2);
    const visitB = nnactJobId(101);
    await tx.insert(comebackCases).values({
      id: caseB,
      orgId: NNACT_ORG_ID,
      caseNumber: caseNumber(1),
      originalJobId: nnactJobId(2),
      customerId: nnactCustomerId(1),
      propertyId: nnactPropertyId(1),
      equipmentId: nnactEquipmentId(1),
      reportedBy: frankline,
      reportedAt: daysAgo(27, 9),
      intakeReason: "FOLLOW_UP_CALL",
      complaintSummary: "Split AC blowing warm air again — outdoor unit dead",
      complaintDetails: "Customer noticed no cooling 3 days after the first visit.",
      originalComplaint: "Split AC not cooling — Molyko residence",
      originalDiagnosis: "Filters cleaned; topping off refrigerant",
      originalRepairSummary: "Cleaned filters, checked refrigerant",
      severity: "MEDIUM",
      status: "MONITORING",
      faultRelationship: "RELATED_FAULT",
      rootCause: "PART_FAILED_EARLY",
      rootCauseNotes: "Start capacitor failed after ~60 runtime hours; batch from the fitted supplier is suspect.",
      responsibility: "PART_OR_SUPPLIER_FAILURE",
      preventability: "POSSIBLY_PREVENTABLE",
      preventabilityNote: "Same capacitor batch on a recall list from the supplier.",
      warrantyStatus: "FULL",
      workmanshipWarrantyEndsAt: addDays(daysAgo(30), 90),
      partsWarrantyEndsAt: addDays(daysAgo(30), 90),
      billingDecision: "NO_CHARGE",
      chargeAmountCents: 0,
      customerConfirmation: "CONFIRMED_RESOLVED",
      monitoringOutcome: "PENDING",
      assignedReviewerId: emmanuel,
      assignedTechnicianId: frankline,
      repeatNumber: 1,
      escalationLevel: 0,
      escalated: false,
      resolutionSummary: "Replaced start capacitor, verified compressor start and cooling delta > 8°C.",
      considerationNotes: "Parts cost recovered from supplier; labour under warranty.",
      knowledgeProposalId: null,
      version: 1,
    });
    await history(caseB, [
      [null, "REPORTED", "comeback reported", daysAgo(27, 9), frankline],
      ["REPORTED", "TRIAGED", "triaged by dispatcher", daysAgo(27, 10), dispatchGrace],
      ["TRIAGED", "SCHEDULED", "comeback visit scheduled", daysAgo(26, 14), dispatchGrace],
      ["SCHEDULED", "UNDER_INVESTIGATION", "visit started", daysAgo(25, 10), frankline],
      ["UNDER_INVESTIGATION", "RESOLVED", "capacitor replaced + verified", daysAgo(25, 12), frankline],
      ["RESOLVED", "MONITORING", "monitoring for 7 days", daysAgo(25, 12), emmanuel],
    ]);

    await tx.insert(jobs).values({
      id: visitB,
      orgId: NNACT_ORG_ID,
      customerId: nnactCustomerId(1),
      propertyId: nnactPropertyId(1),
      assignedTo: frankline,
      number: jobNumber(1),
      title: "Comeback — outdoor unit start capacitor",
      description: "Rework visit for the Molyko split AC comeback; replace start capacitor under part warranty.",
      status: "completed",
      jobType: "comeback",
      comebackCaseId: caseB,
      originalJobId: nnactJobId(2),
      serviceCategory: "repair",
      scheduledAt: daysAgo(25, 10),
      total: 0,
      version: 1,
    });
    await tx.insert(jobEquipmentLinks).values({
      orgId: NNACT_ORG_ID,
      jobId: visitB,
      equipmentId: nnactEquipmentId(1),
      linkedBy: frankline,
    });
    await tx.insert(jobStatusHistory).values([
      { orgId: NNACT_ORG_ID, jobId: visitB, fromStatus: null, toStatus: "scheduled", changedBy: dispatchGrace, reason: "comeback visit scheduled" },
      { orgId: NNACT_ORG_ID, jobId: visitB, fromStatus: "scheduled", toStatus: "in_progress", changedBy: frankline, reason: "visit started" },
      { orgId: NNACT_ORG_ID, jobId: visitB, fromStatus: "in_progress", toStatus: "completed", changedBy: frankline, reason: "capacitor replaced" },
    ]);

    await tx.insert(comebackCosts).values([
      { orgId: NNACT_ORG_ID, caseId: caseB, jobId: visitB, kind: "PARTS", costClass: "SUPPLIER_RECOVERABLE", description: "Start capacitor (supplier batch, recalled)", amountCents: x(12000), supplierName: "AC Supplies Buea", recordedBy: frankline, createdAt: daysAgo(25, 12) },
      { orgId: NNACT_ORG_ID, caseId: caseB, jobId: visitB, kind: "LABOUR", costClass: "WARRANTY_COST", description: "Rework labour + start diagnostics", amountCents: x(10000), recordedBy: frankline, createdAt: daysAgo(25, 12) },
    ]);
    await tx.insert(comebackCorrectiveActions).values([
      { orgId: NNACT_ORG_ID, caseId: caseB, kind: "SUPPLIER_CHANGE", description: "Switch start-capacitor supplier to the tested local distributor batch.", ownerId: owner, status: "IN_PROGRESS", affectsProcedure: true, dueAt: daysAhead(10, 12), createdBy: frankline, createdAt: daysAgo(25, 12) },
      { orgId: NNACT_ORG_ID, caseId: caseB, kind: "ADD_FINAL_CHECK", description: "Always record run hours + start current on AC completion before sign-off.", ownerId: emmanuel, status: "DONE", affectsProcedure: true, completedAt: daysAgo(20, 10), createdBy: frankline, createdAt: daysAgo(25, 12) },
    ]);
    await tx.insert(comebackEvidence).values([
      { orgId: NNACT_ORG_ID, caseId: caseB, jobId: visitB, kind: "FAILED_PART", note: "Failed start capacitor retained and photographed for supplier claim.", createdBy: frankline, createdAt: daysAgo(25, 11) },
      { orgId: NNACT_ORG_ID, caseId: caseB, jobId: visitB, kind: "FINAL_TEST", note: "Cooling delta verified > 8°C across 20 min runtime.", createdBy: frankline, createdAt: daysAgo(25, 12) },
    ]);
    await tx.insert(comebackCommunications).values([
      { orgId: NNACT_ORG_ID, caseId: caseB, kind: "COMPLAINT_RECEIVED", summary: "Follow-up call captured the reappearing warm-air issue.", happenedAt: daysAgo(27, 9), createdBy: frankline },
      { orgId: NNACT_ORG_ID, caseId: caseB, kind: "RESOLVED_ANNOUNCED", summary: "Capacitor replaced; cooling verified. Supplier claim filed.", happenedAt: daysAgo(25, 12), createdBy: frankline },
      { orgId: NNACT_ORG_ID, caseId: caseB, kind: "CUSTOMER_CONFIRMATION", summary: "Customer confirmed cool air restored.", happenedAt: daysAgo(24, 18), createdBy: frankline },
    ]);
    await tx.insert(comebackFollowUps).values({
      orgId: NNACT_ORG_ID,
      caseId: caseB,
      scheduledAt: daysAhead(2, 9),
      outcome: "PENDING",
      note: "Final no-relapse check after a week of use.",
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Scenario C — LG refrigerator: customer's new appliance overloaded the
    // wiring; NOT_A_COMEBACK (new unrelated fault), regional guidance given.
    // ─────────────────────────────────────────────────────────────────────────
    const caseC = CASE_ID(3);
    await tx.insert(comebackCases).values({
      id: caseC,
      orgId: NNACT_ORG_ID,
      caseNumber: caseNumber(2),
      originalJobId: nnactJobId(3),
      customerId: nnactCustomerId(2),
      propertyId: nnactPropertyId(2),
      equipmentId: nnactEquipmentId(2),
      reportedBy: pascal,
      reportedAt: daysAgo(20, 9),
      intakeReason: "CUSTOMER_CALLED",
      complaintSummary: "Fresh-food section still not cold enough after repair",
      complaintDetails: "Customer installed a second freezer on the same outlet since the first visit.",
      originalComplaint: "Refrigerator warm in fresh-food section",
      originalDiagnosis: "Airflow / control board re-seated",
      originalRepairSummary: "Re-seated control harness, verified 4°C",
      severity: "MEDIUM",
      status: "NOT_A_COMEBACK",
      faultRelationship: "NEW_UNRELATED_FAULT",
      rootCause: "CUSTOMER_MISUSE",
      rootCauseNotes: "Second freezer added on the same line causes brownout at start-up; refrigerator never recovered setpoint.",
      responsibility: "NEW_UNRELATED_FAULT",
      preventability: "NOT_PREVENTABLE",
      preventabilityNote: "No defect on our original repair; freshly detected line overload.",
      warrantyStatus: "FULL",
      workmanshipWarrantyEndsAt: addDays(daysAgo(28), 90),
      partsWarrantyEndsAt: addDays(daysAgo(28), 90),
      billingDecision: "NO_CHARGE",
      chargeAmountCents: 0,
      customerConfirmation: "DISPUTED_RESOLUTION",
      monitoringOutcome: "PENDING",
      assignedReviewerId: emmanuel,
      assignedTechnicianId: pascal,
      repeatNumber: 1,
      escalationLevel: 0,
      escalated: false,
      denyReason: "No comeback: new unrelated fault caused by customer-side wiring overload.",
      considerationNotes: "Offered a dedicated-line recommendation; normal-service quote via a new work order.",
      version: 1,
    });
    await history(caseC, [
      [null, "REPORTED", "comeback reported", daysAgo(20, 9), pascal],
      ["REPORTED", "TRIAGED", "triaged by dispatcher", daysAgo(20, 10), dispatchGrace],
      ["TRIAGED", "UNDER_INVESTIGATION", "on-site inspection", daysAgo(18, 9), pascal],
      ["UNDER_INVESTIGATION", "NOT_A_COMEBACK", "new unrelated fault — not a comeback", daysAgo(18, 12), emmanuel],
    ]);
    await tx.insert(comebackEvidence).values([
      { orgId: NNACT_ORG_ID, caseId: caseC, kind: "COMPLAINT", note: "Second freezer purchased a week ago; same outlet.", createdBy: pascal, createdAt: daysAgo(20, 9) },
      { orgId: NNACT_ORG_ID, caseId: caseC, kind: "COMEBACK_INSPECTION", note: "Voltage sag measured at start-up; original control board harness intact.", createdBy: pascal, createdAt: daysAgo(18, 10) },
    ]);
    await tx.insert(comebackCommunications).values([
      { orgId: NNACT_ORG_ID, caseId: caseC, kind: "COMPLAINT_RECEIVED", summary: "Customer reports warm fresh-food section again.", happenedAt: daysAgo(20, 9), createdBy: pascal },
      { orgId: NNACT_ORG_ID, caseId: caseC, kind: "CUSTOMER_FOLLOW_UP", summary: "Explained wiring overload; recommended dedicated circuit and offered a normal-service quote.", happenedAt: daysAgo(18, 12), createdBy: pascal },
    ]);

    // ─────────────────────────────────────────────────────────────────────────
    // Scenario D — LG sealed system: first comeback closed, the repeat is open.
    // Shows repeat detection + a scheduled comeback visit job on the board.
    // ─────────────────────────────────────────────────────────────────────────
    const caseD0 = CASE_ID(4);
    await tx.insert(comebackCases).values({
      id: caseD0,
      orgId: NNACT_ORG_ID,
      caseNumber: caseNumber(3),
      originalJobId: nnactJobId(8),
      customerId: nnactCustomerId(8),
      propertyId: nnactPropertyId(8),
      equipmentId: nnactEquipmentId(8),
      reportedBy: pascal,
      reportedAt: daysAgo(8, 9),
      intakeReason: "CUSTOMER_CALLED",
      complaintSummary: "LG fridge intermittent cooling — first follow-up",
      complaintDetails: "Cooling loss returned a day after the sealed-system check.",
      originalComplaint: "Domestic refrigerator sealed system check",
      originalDiagnosis: "Airflow and control issue",
      originalRepairSummary: "Cleared airflow path, re-seated control board",
      severity: "MEDIUM",
      status: "CLOSED",
      faultRelationship: "SAME_FAULT",
      rootCause: "SECONDARY_FAULT_MISSED",
      rootCauseNotes: "Faulty door gasket seal was missed; resealed on the rework visit.",
      responsibility: "PARTIAL_NNACT_RESPONSIBLE",
      preventability: "POSSIBLY_PREVENTABLE",
      warrantyStatus: "FULL",
      workmanshipWarrantyEndsAt: addDays(daysAgo(10), 90),
      partsWarrantyEndsAt: addDays(daysAgo(10), 90),
      billingDecision: "PARTIAL_CHARGE",
      chargeAmountCents: 20000,
      customerConfirmation: "CONFIRMED_RESOLVED",
      monitoringOutcome: "NO_RELAPSE",
      assignedReviewerId: emmanuel,
      assignedTechnicianId: pascal,
      repeatNumber: 1,
      escalationLevel: 0,
      escalated: false,
      resolutionSummary: "Replaced door gasket; internal temperature holds.", 
      considerationNotes: "Partial charge for the gasket; labour waived.",
      version: 1,
    });
    await history(caseD0, [
      [null, "REPORTED", "comeback reported", daysAgo(8, 9), pascal],
      ["REPORTED", "TRIAGED", "triaged by dispatcher", daysAgo(8, 10), dispatchGrace],
      ["TRIAGED", "UNDER_INVESTIGATION", "visit started", daysAgo(7, 9), pascal],
      ["UNDER_INVESTIGATION", "RESOLVED", "gasket replaced", daysAgo(7, 11), pascal],
      ["RESOLVED", "MONITORING", "short monitoring", daysAgo(7, 11), emmanuel],
      ["MONITORING", "CLOSED", "no relapse after 5 days", daysAgo(2, 9), pascal],
    ]);
    await tx.insert(comebackCosts).values({
      orgId: NNACT_ORG_ID,
      caseId: caseD0,
      kind: "PARTS",
      costClass: "BILLABLE_COMEBACK",
      description: "Door gasket (partial charge to customer)",
      amountCents: 20000,
      recordedBy: pascal,
      createdAt: daysAgo(7, 11),
    });

    const caseD = CASE_ID(5);
    const visitD = nnactJobId(102);
    await tx.insert(comebackCases).values({
      id: caseD,
      orgId: NNACT_ORG_ID,
      caseNumber: caseNumber(4),
      originalJobId: nnactJobId(8),
      customerId: nnactCustomerId(8),
      propertyId: nnactPropertyId(8),
      equipmentId: nnactEquipmentId(8),
      reportedBy: pascal,
      reportedAt: daysAgo(1, 9),
      intakeReason: "CUSTOMER_CALLED",
      complaintSummary: "LG fridge still losing cooling at night — third report",
      complaintDetails: "Night-time temp swings despite the gasket replacement.",
      originalComplaint: "Domestic refrigerator sealed system check",
      originalDiagnosis: "Airflow and control issue",
      originalRepairSummary: "Cleared airflow path, re-seated control board",
      severity: "HIGH",
      status: "REPORTED",
      faultRelationship: "UNKNOWN",
      rootCause: "NOT_DETERMINED_YET",
      responsibility: "UNDETERMINED",
      preventability: "UNKNOWN",
      warrantyStatus: "FULL",
      workmanshipWarrantyEndsAt: addDays(daysAgo(10), 90),
      partsWarrantyEndsAt: addDays(daysAgo(10), 90),
      billingDecision: "PENDING_REVIEW",
      chargeAmountCents: 0,
      customerConfirmation: "CONTACTED_PENDING",
      monitoringOutcome: "PENDING",
      assignedReviewerId: emmanuel,
      assignedTechnicianId: pascal,
      repeatNumber: 2,
      escalationLevel: 0,
      escalated: false,
      considerationNotes: "Repeat #2 — escalated automatically if it returns again.",
      version: 1,
    });
    await history(caseD, [
      [null, "REPORTED", "comeback reported (repeat #2)", daysAgo(1, 9), pascal],
    ]);
    await tx.insert(jobs).values({
      id: visitD,
      orgId: NNACT_ORG_ID,
      customerId: nnactCustomerId(8),
      propertyId: nnactPropertyId(8),
      assignedTo: pascal,
      number: jobNumber(2),
      title: "Comeback — fridge cooling repeat inspection",
      description: "Second revisit: inspect sealed system with manometer and log overnight temps.",
      status: "scheduled",
      jobType: "comeback",
      comebackCaseId: caseD,
      originalJobId: nnactJobId(8),
      serviceCategory: "repair",
      scheduledAt: daysAhead(1, 9),
      total: 0,
      version: 1,
    });
    await tx.insert(jobEquipmentLinks).values({
      orgId: NNACT_ORG_ID,
      jobId: visitD,
      equipmentId: nnactEquipmentId(8),
      linkedBy: dispatchGrace,
    });
    await tx.insert(jobStatusHistory).values({
      orgId: NNACT_ORG_ID,
      jobId: visitD,
      fromStatus: null,
      toStatus: "scheduled",
      changedBy: dispatchGrace,
      reason: "comeback visit scheduled",
    });

    console.log(
      `seed:nnact comeback cases seeded: ${caseNumber(0)}, ${caseNumber(1)}, ${caseNumber(2)}, ${caseNumber(3)}, ${caseNumber(4)}`,
    );
  });
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export async function verifyNnactComebackSeed(): Promise<Record<string, number>> {
  const cases = await db.select({ id: comebackCases.id }).from(comebackCases).where(sql`${comebackCases.orgId} = ${NNACT_ORG_ID}`);
  const followUps = await db.select({ id: comebackFollowUps.id }).from(comebackFollowUps).where(sql`${comebackFollowUps.orgId} = ${NNACT_ORG_ID}`);
  const costs = await db.select({ id: comebackCosts.id }).from(comebackCosts).where(sql`${comebackCosts.orgId} = ${NNACT_ORG_ID}`);
  const visitJobs = await db.select({ id: jobs.id }).from(jobs).where(sql`${jobs.orgId} = ${NNACT_ORG_ID} and ${jobs.jobType} = 'comeback'`);
  const proposals = await db.select({ id: knowledgeProposals.id }).from(knowledgeProposals).where(sql`${knowledgeProposals.id} = ${PROPOSAL_ID}`);
  return {
    comeBackCases: cases.length,
    comebackFollowUps: followUps.length,
    comebackCosts: costs.length,
    comebackVisitJobs: visitJobs.length,
    comebackKnowledgeProposals: proposals.length,
  };
}