import assert from "node:assert/strict";
import { test } from "node:test";
import {
  diagnosticOfflineBatchSchema,
  diagnosticOfflineSessionCreateOp,
} from "../src/routes/diagnostic-offline.js";

const validCreate = {
  opId: "op-create-1",
  kind: "session.create",
  payload: {
    id: "c6f7e084-4a3d-4f1b-9c2e-7b5d8a1e3f90",
    jobId: "1f6d5c6e-2a4b-4d0f-9e3a-4b8c7d6e5f40",
    equipmentId: "6e2a4b8c-1d0f-4a3b-9c7e-2f5d8a1b4c60",
    workflowId: "8a7b6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c20",
  },
};

test("accepts a valid session.create op with optional fields", () => {
    const op = {
      ...validCreate,
      payload: {
        ...validCreate.payload,
        customerComplaint: "No cooling",
        technicianObservation: "Compressor cycling",
      },
    };
    const parsed = diagnosticOfflineSessionCreateOp.parse(op);
    assert.equal(parsed.kind, "session.create");
    assert.equal(parsed.payload.customerComplaint, "No cooling");
  });

  test("rejects a non-uuid session id", () => {
    const op = { ...validCreate, payload: { ...validCreate.payload, id: "not-a-uuid" } };
    assert.throws(() => diagnosticOfflineSessionCreateOp.parse(op));
  });

  test("rejects a payload missing equipmentId", () => {
    const op = { ...validCreate, payload: { ...validCreate.payload, equipmentId: undefined } };
    assert.throws(() => diagnosticOfflineSessionCreateOp.parse(op));
  });

  test("batch schema accepts a mixed batch including session.create", () => {
    const batch = {
      ops: [
        validCreate,
        {
          opId: "op-patch-1",
          kind: "session.patch",
          payload: {
            sessionId: validCreate.payload.id,
            baseVersion: 1,
            status: "completed" as const,
            disposition: "done",
          },
        },
        {
          opId: "op-measure-1",
          kind: "measurement.create",
          payload: {
            id: "ca3d5f1e-2b4c-4e6f-8a9b-0c1d2e3f4a5b",
            sessionId: validCreate.payload.id,
            stepId: "7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e",
            result: "pass" as const,
            recordedAt: "2026-09-15T10:00:00.000Z",
          },
        },
        {
          opId: "op-corr-1",
          kind: "correction.create",
          payload: {
            id: "da3d5f1e-2b4c-4e6f-8a9b-0c1d2e3f4a5c",
            workflowId: "8a7b6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c20",
            workflowVersion: 1,
            stepId: "7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e",
            category: "step.correction",
            severity: "low",
            description: "wrong unit",
          },
        },
      ],
    };
    const parsed = diagnosticOfflineBatchSchema.parse(batch);
    assert.equal(parsed.ops.length, 4);
    assert.equal(parsed.ops[0].kind, "session.create");
    assert.equal(parsed.ops[1].kind, "session.patch");
  });