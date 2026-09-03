import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeModelIdentifier,
  normalizeFaultCode,
  normalizeSymptomLabel,
  nextConfidenceAfterSuccess,
  autoPromoteConfidenceAfterSuccess,
  rankFaultsBySymptoms,
  buildProposalDraft,
} from "../src/repair-brain.js";
import {
  normalizeModelIdentifier as sharedNormalizeModel,
  normalizeFaultCode as sharedNormalizeFault,
  normalizeSymptomLabel as sharedNormalizeSymptom,
  slugifyName,
} from "@nnact/shared";
import {
  toErrorCodeDTO,
  toCategoryDTO,
  toManufacturerDTO,
} from "../src/repair-brain-intelligence.js";

test("normalizeModelIdentifier deduplicates manufacturer + model variants", () => {
  assert.equal(normalizeModelIdentifier("Samsung", "WW90T4040CE"), "samsungww90t4040ce");
  assert.equal(normalizeModelIdentifier("Samsung", "WW-90T4040CE"), "samsungww90t4040ce");
  assert.equal(sharedNormalizeModel("LG", "GC-B247SLUV"), "lggcb247sluv");
});

test("normalizeFaultCode collapses E21 variants", () => {
  assert.equal(normalizeFaultCode("E21"), "e21");
  assert.equal(normalizeFaultCode("E-21"), "e21");
  assert.equal(normalizeFaultCode("5C"), "5c");
  assert.equal(sharedNormalizeFault("Error E21"), "errore21");
});

test("normalizeSymptomLabel produces searchable consistent labels", () => {
  assert.equal(normalizeSymptomLabel("  Machine Does Not Power On  "), "machine does not power on");
  assert.equal(sharedNormalizeSymptom("Water   Leakage"), "water leakage");
});

test("autoPromoteConfidenceAfterSuccess caps at repeated_success without downgrading verified tiers", () => {
  assert.equal(autoPromoteConfidenceAfterSuccess("field_observation"), "repeated_success");
  assert.equal(autoPromoteConfidenceAfterSuccess("repeated_success"), "repeated_success");
  assert.equal(autoPromoteConfidenceAfterSuccess("technician_verified"), "technician_verified");
  assert.equal(autoPromoteConfidenceAfterSuccess("senior_verified"), "senior_verified");
});

test("rankFaultsBySymptoms matches linked symptoms without AI", () => {
  const faults = [
    { id: "f1", title: "Does not drain", faultCode: "5C", description: "Drain pump issue" },
    { id: "f2", title: "No power", description: "Electrical fault" },
  ];
  const faultToSymptomIds = new Map([
    ["f1", ["s1", "s2"]],
    ["f2", ["s3"]],
  ]);
  const symptomIdToLabel = new Map([
    ["s1", "Machine does not drain"],
    ["s2", "Water remains in drum"],
    ["s3", "Machine does not power on"],
  ]);
  const ranked = rankFaultsBySymptoms(
    faults,
    faultToSymptomIds,
    symptomIdToLabel,
    ["machine does not drain", "water remains in drum"],
  );
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]!.faultId, "f1");
  assert.ok(ranked[0]!.score >= 2);
});

test("buildProposalDraft pre-fills from job field data", () => {
  const draft = buildProposalDraft({
    jobId: "job-1",
    equipmentId: "eq-1",
    equipmentModelId: "model-1",
    session: {
      id: "sess-1",
      customerComplaint: "Washer not draining",
      summary: "Drain pump open circuit",
      errorCodes: ["5C"],
    },
    outcomes: [
      {
        outcome: "successful",
        whatWasDone: "Replaced drain pump",
        partsUsed: [{ partName: "Drain pump", oemPartNumber: "DC31-00181A", quantity: 1 }],
        conclusion: "Machine drains normally",
        isFailedAttempt: false,
      },
      {
        outcome: "failed",
        whatWasDone: "Cleaned filter",
        isFailedAttempt: true,
        conclusion: "Filter was not root cause",
      },
    ],
    measurements: [
      { parameter: "Drain pump resistance", observedValue: "open", unit: "Ω", result: "fail", expectedMin: "150", expectedMax: "220" },
    ],
    knownFault: { id: "fault-1", title: "Does not drain", faultCode: "5C" },
  });
  assert.equal(draft.proposalType, "repair_procedure");
  assert.equal(draft.sourceJobId, "job-1");
  assert.equal(draft.title, "Does not drain");
  assert.ok(Array.isArray(draft.payload.failedAttempts));
  assert.equal((draft.payload.failedAttempts as unknown[]).length, 1);
  assert.ok((draft.payload.measurements as unknown[]).length === 1);
});

test("buildProposalDraft never marks knowledge as verified", () => {
  const draft = buildProposalDraft({
    jobId: "job-1",
    outcomes: [{ outcome: "successful", whatWasDone: "Fixed wiring" }],
    measurements: [],
  });
  assert.notEqual(draft.payload.verificationStatus, "verified");
  assert.notEqual(draft.payload.confidenceStatus, "senior_verified");
});

test("complete field workflow confidence ladder respects manual verification tiers", () => {
  assert.equal(nextConfidenceAfterSuccess("repeated_success"), "technician_verified");
  assert.equal(autoPromoteConfidenceAfterSuccess("repeated_success"), "repeated_success");
  assert.equal(autoPromoteConfidenceAfterSuccess("technician_verified"), "technician_verified");
});

test("rankFaultsBySymptoms matches linked symptoms without AI", () => {
  const faults = [
    { id: "f1", title: "Does not drain", faultCode: "5C", description: "Drainage fault" },
    { id: "f2", title: "No heat", faultCode: null, description: "Heating element" },
  ];
  const faultToSymptoms = new Map([
    ["f1", ["s1", "s2"]],
    ["f2", ["s3"]],
  ]);
  const symptomLabels = new Map([
    ["s1", "Water remains in drum"],
    ["s2", "Machine does not drain"],
    ["s3", "Drum does not rotate"],
  ]);

  const ranked = rankFaultsBySymptoms(
    faults,
    faultToSymptoms,
    symptomLabels,
    ["machine does not drain", "water remains in drum"],
  );

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]!.faultId, "f1");
  assert.ok(ranked[0]!.score >= 2);
  assert.ok(ranked[0]!.matchedSymptoms.length >= 2);
});

test("buildProposalDraft pre-fills from diagnosis measurements and repair outcome", () => {
  const draft = buildProposalDraft({
    jobId: "job-1",
    equipmentId: "eq-1",
    equipmentModelId: "model-1",
    session: {
      id: "sess-1",
      customerComplaint: "Washer not draining",
      summary: "Drain pump open circuit",
      errorCodes: ["5C"],
      knownFaultId: "fault-1",
    },
    outcomes: [
      {
        outcome: "successful",
        whatWasDone: "Replaced drain pump DC31-00181A",
        partsUsed: [{ partName: "Drain pump", oemPartNumber: "DC31-00181A", quantity: 1 }],
        conclusion: "Machine drains normally",
        isFailedAttempt: false,
      },
      {
        outcome: "failed",
        whatWasDone: "Replaced capacitor",
        conclusion: "Fault remained",
        isFailedAttempt: true,
      },
    ],
    measurements: [
      {
        parameter: "Drain pump resistance",
        observedValue: "OL",
        unit: "Ω",
        result: "fail",
        expectedMin: "150",
        expectedMax: "220",
      },
    ],
    knownFault: { id: "fault-1", title: "Does not drain", faultCode: "5C" },
  });

  assert.equal(draft.sourceJobId, "job-1");
  assert.equal(draft.equipmentModelId, "model-1");
  assert.equal(draft.title, "Does not drain");
  assert.equal(draft.proposalType, "repair_procedure");
  assert.ok(Array.isArray(draft.payload.failedAttempts));
  assert.equal((draft.payload.failedAttempts as unknown[]).length, 1);
  assert.ok(Array.isArray(draft.payload.measurements));
});

test("buildProposalDraft does not mark knowledge as verified", () => {
  const draft = buildProposalDraft({
    jobId: "job-2",
    outcomes: [{ outcome: "successful", whatWasDone: "Cleaned filter" }],
    measurements: [],
  });
  assert.notEqual(draft.payload.verificationStatus, "verified");
  assert.notEqual(draft.payload.confidenceStatus, "senior_verified");
});

test("repair brain authorization requires owner/dispatcher for verify paths", async () => {
  const { repairBrainAuthorizationGuard } = await import("../src/repair-brain-authorization.js");

  const mockReply = {
    sent: false,
    code(n: number) {
      return {
        send: (body: unknown) => {
          mockReply.sent = true;
          mockReply.lastCode = n;
          mockReply.lastBody = body;
          return mockReply;
        },
      };
    },
    lastCode: 0,
    lastBody: null as unknown,
  };

  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const verifyReq = {
    method: "POST",
    url: "/api/repair-brain/proposals/abc-123/verify",
    jwtVerify: async () => {
      throw new Error("no auth");
    },
    headers: {},
  };

  await repairBrainAuthorizationGuard(verifyReq as never, mockReply as never);
  assert.equal(mockReply.lastCode, 401);

  process.env.NODE_ENV = prevEnv;

  mockReply.sent = false;
  const techReq = {
    method: "POST",
    url: "/api/repair-brain/proposals/abc-123/verify",
    jwtVerify: async () => {},
    user: { role: "technician" },
    headers: { authorization: "Bearer x" },
  };
  await repairBrainAuthorizationGuard(techReq as never, mockReply as never);
  assert.equal(mockReply.lastCode, 403);

  mockReply.sent = false;
  const ownerReq = {
    method: "POST",
    url: "/api/repair-brain/proposals/abc-123/verify",
    jwtVerify: async () => {},
    user: { role: "owner" },
    headers: { authorization: "Bearer x" },
  };
  await repairBrainAuthorizationGuard(ownerReq as never, mockReply as never);
  assert.equal(mockReply.sent, false);
});

test("GET requests bypass repair brain authorization guard", async () => {
  const { repairBrainAuthorizationGuard } = await import("../src/repair-brain-authorization.js");
  const mockReply = { sent: false, code: () => ({ send: () => mockReply }) };
  const getReq = { method: "GET", url: "/api/repair-brain/jobs/abc/context" };
  await repairBrainAuthorizationGuard(getReq as never, mockReply as never);
  assert.equal(mockReply.sent, false);
});

test("field workflow lifecycle: equipment link → diagnosis → outcome → proposal draft shape", () => {
  const steps = ["equipment", "knowledge", "diagnosis", "measurements", "repair", "outcome", "proposal"];
  assert.equal(steps.length, 7);

  const afterOutcome = buildProposalDraft({
    jobId: "wo-221",
    equipmentId: "inst-1",
    equipmentModelId: "mdl-samsung",
    session: { id: "ds-1", customerComplaint: "Not draining", errorCodes: ["5C"] },
    outcomes: [
      { outcome: "successful", whatWasDone: "Pump replaced", isFailedAttempt: false },
    ],
    measurements: [
      { parameter: "Pump Ω", observedValue: "OL", unit: "Ω", result: "fail", expectedMin: "150", expectedMax: "220" },
    ],
    knownFault: null,
  });

  assert.equal(afterOutcome.sourceJobId, "wo-221");
  assert.equal(afterOutcome.proposalType, "repair_procedure");
  assert.ok(afterOutcome.payload.whatWasDone);
  assert.ok(afterOutcome.payload.measurements);
});

// ── Engineering Intelligence (taxonomy / templates / DTO mappers) ────────

test("slugifyName normalizes names into stable slugs", () => {
  assert.equal(slugifyName("Top Load Washer"), "top-load-washer");
  assert.equal(slugifyName("  Refrigerator!  "), "refrigerator");
  assert.equal(slugifyName("AirConditioner"), "airconditioner");
  assert.equal(slugifyName("LG   Dryer"), "lg-dryer");
  assert.equal(slugifyName(""), "");
});

test("toCategoryDTO maps a category row to its DTO", () => {
  const row = {
    id: "cat-1",
    orgId: "org-1",
    name: "Front Load Washer",
    slug: "front-load-washer",
    subcategory: null,
    productFamily: null,
    description: null,
    template: { sections: [{ key: "drainage", label: "Drainage", group: "Machine", kind: "system", ordinal: 1 }] },
    createdById: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-02T00:00:00Z"),
  } as never;
  const dto = toCategoryDTO(row as never);
  assert.equal(dto.name, "Front Load Washer");
  assert.equal(dto.slug, "front-load-washer");
  assert.equal(dto.template.sections[0].key, "drainage");
  assert.equal(dto.createdAt, "2024-01-01T00:00:00.000Z");
});

test("toManufacturerDTO maps a manufacturer row to its DTO", () => {
  const row = {
    id: "mfr-1",
    orgId: "org-1",
    name: "LG",
    slug: "lg",
    country: "South Korea",
    notes: null,
    createdById: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  } as never;
  const dto = toManufacturerDTO(row as never);
  assert.equal(dto.name, "LG");
  assert.equal(dto.country, "South Korea");
});

test("toErrorCodeDTO maps an error code row to its DTO", () => {
  const row = {
    id: "ec-1",
    orgId: "org-1",
    equipmentModelId: "mdl-1",
    systemId: null,
    code: "OE",
    normalizedCode: "oe",
    meaning: "Drain error",
    description: null,
    preconditions: [],
    likelyCauses: ["Clogged pump", "Blocked hose"],
    correctiveActions: ["Clean pump filter"],
    severity: "medium",
    tags: [],
    confidenceStatus: "field_observation",
    verificationStatus: "field_note",
    verifiedBy: null,
    verifiedAt: null,
    revision: 1,
    createdById: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  } as never;
  const dto = toErrorCodeDTO(row as never);
  assert.equal(dto.normalizedCode, "oe");
  assert.deepEqual(dto.likelyCauses, ["Clogged pump", "Blocked hose"]);
  assert.equal(dto.revision, 1);
});

