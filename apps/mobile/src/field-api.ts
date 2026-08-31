import type { StoredStaffSession } from "./auth-storage";
import { staffFetch } from "./auth-api";
import { getApiUrl } from "./env";

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

export type MeasurementResult =
  | "pass"
  | "fail"
  | "within_range"
  | "out_of_range"
  | "unable"
  | "not_reproduced";

export interface DiagnosticWorkflow {
  id: string;
  name: string;
  productType: string;
  make?: string | null;
  modelFamily?: string | null;
  versionNumber: number;
  supportStatus: string;
}

export interface DiagnosticStep {
  id: string;
  workflowId: string;
  publicLabel: string;
  sequence: number;
  mode: "field" | "guided" | "both";
  stepType: string;
  purpose?: string | null;
  safetyState?: string | null;
  expectedText?: string | null;
  unit?: string | null;
  passInterpretation?: string | null;
  failInterpretation?: string | null;
}

export interface DiagnosticSession {
  id: string;
  jobId: string;
  equipmentId: string;
  workflowId?: string | null;
  workflowVersion?: number | null;
  status: DiagnosticSessionStatus;
  customerComplaint?: string | null;
  technicianObservation?: string | null;
  disposition?: string | null;
  summary?: string | null;
  version: number;
  updatedAt: string;
}

export interface DiagnosticMeasurement {
  id: string;
  sessionId: string;
  stepId: string;
  valueText?: string | null;
  unit?: string | null;
  result: string;
  note?: string | null;
  recordedAt: string;
}

export interface EquipmentRow {
  id: string;
  type: string;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  customerId: string;
}

export interface JobPhoto {
  id: string;
  jobId: string;
  filename: string;
  createdAt: string;
}

export interface DiagnosticSessionDetail {
  session: DiagnosticSession;
  equipment: EquipmentRow;
  workflow: DiagnosticWorkflow | null;
  job: { id: string; title: string; status: string; scheduledAt?: string | null };
  measurements: DiagnosticMeasurement[];
  steps: DiagnosticStep[];
}

export async function fetchDiagnosticSession(session: StoredStaffSession, sessionId: string) {
  return staffFetch<DiagnosticSessionDetail>(session, `/api/diagnostics/sessions/${sessionId}`);
}

export async function createDiagnosticSession(
  session: StoredStaffSession,
  body: {
    jobId: string;
    equipmentId: string;
    workflowId?: string;
    customerComplaint?: string;
    technicianObservation?: string;
  },
) {
  return staffFetch<DiagnosticSession>(session, "/api/diagnostics/sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchDiagnosticSession(
  session: StoredStaffSession,
  sessionId: string,
  body: Partial<DiagnosticSession>,
) {
  return staffFetch<DiagnosticSession>(session, `/api/diagnostics/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function recordMeasurement(
  session: StoredStaffSession,
  sessionId: string,
  body: {
    stepId: string;
    valueText?: string;
    unit?: string;
    result: MeasurementResult;
    note?: string;
    unableReason?: string;
    photoId?: string;
  },
) {
  return staffFetch<DiagnosticMeasurement>(session, `/api/diagnostics/sessions/${sessionId}/measurements`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listWorkflows(session: StoredStaffSession) {
  return staffFetch<DiagnosticWorkflow[]>(session, "/api/diagnostics/workflows");
}

export async function fetchJobEquipment(session: StoredStaffSession, jobId: string) {
  try {
    return await staffFetch<{ link: { jobId: string; equipmentId: string }; equipment: EquipmentRow }>(
      session,
      `/api/diagnostics/job-equipment/${jobId}`,
    );
  } catch {
    return null;
  }
}

export async function listCustomerEquipment(session: StoredStaffSession, customerId: string) {
  return staffFetch<EquipmentRow[]>(session, `/api/equipment?customerId=${customerId}`);
}

export async function listJobPhotos(session: StoredStaffSession, jobId: string) {
  return staffFetch<JobPhoto[]>(session, `/api/photos/job/${jobId}`);
}

export async function uploadJobPhoto(session: StoredStaffSession, jobId: string, localUri: string) {
  const formData = new FormData();
  const name = localUri.split("/").pop() ?? "field-photo.jpg";
  formData.append("file", {
    uri: localUri,
    name,
    type: "image/jpeg",
  } as unknown as Blob);

  const response = await fetch(`${getApiUrl()}/api/photos/upload/${jobId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${session.accessToken}` },
    body: formData,
  });
  if (response.status === 401) throw new Error("session_expired");
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${response.status}: ${body}`);
  }
  return response.json() as Promise<JobPhoto>;
}

export async function fetchUnreadNotificationCount(session: StoredStaffSession) {
  return staffFetch<{ count: number }>(session, "/api/notifications/unread-count");
}

export function jobPhotoFileUrl(photoId: string, accessToken?: string | null) {
  const base = `${getApiUrl()}/api/photos/${photoId}/file`;
  return accessToken ? `${base}?token=${encodeURIComponent(accessToken)}` : base;
}

export function voiceNoteFileUrl(noteId: string, accessToken?: string | null) {
  const base = `${getApiUrl()}/api/voice-notes/${noteId}/file`;
  return accessToken ? `${base}?token=${encodeURIComponent(accessToken)}` : base;
}

export async function listJobVoiceNotes(session: StoredStaffSession, jobId: string) {
  return staffFetch<import("@nnact/shared").JobVoiceNoteDTO[]>(
    session,
    `/api/jobs/${jobId}/voice-notes`,
  );
}

// ── Repair Brain ──

export interface RepairBrainModel {
  id: string;
  manufacturer: string;
  brand?: string | null;
  modelNumber: string;
  modelName?: string | null;
  category: string;
  subcategory?: string | null;
  specifications: Record<string, unknown>;
  updatedAt: string;
}

export interface RepairBrainFault {
  id: string;
  equipmentModelId: string;
  faultCode?: string | null;
  title: string;
  description?: string | null;
  severity?: string | null;
  probableCauses: string[];
  confidenceStatus: string;
  verificationStatus: string;
  symptoms?: Array<{ id: string; label: string }>;
}

export interface RepairBrainModelProfile {
  model: RepairBrainModel;
  faults: RepairBrainFault[];
  repairProcedures: Array<{ id: string; title: string; description?: string | null; requiredTools?: string[]; steps?: Array<{ sequence: number; instruction: string; warning?: string }> }>;
  parts: Array<{ id: string; partName: string; oemPartNumber?: string | null; lastKnownPriceCents?: number | null }>;
  testPoints: Array<{ id: string; component?: string | null; description?: string | null; connector?: string | null; pin?: string | null; expectedMin?: string | null; expectedMax?: string | null; unit?: string | null }>;
  documents: Array<{ id: string; title: string; documentType: string }>;
  diagnosticWorkflows: Array<{ id: string; name: string }>;
  repairStats: {
    totalRepairs: number;
    successfulRepairs: number;
    averageLaborMinutes: number;
    byFault: Record<string, { count: number; topSolutions: Array<{ action: string; count: number }> }>;
  };
  instanceCount: number;
}

export interface RepairBrainSearchResults {
  models: Array<{ id: string; manufacturer: string; modelNumber: string; modelName?: string | null; category: string }>;
  faults: Array<{ id: string; equipmentModelId: string; title: string; faultCode?: string | null }>;
  parts: Array<{ id: string; equipmentModelId: string; partName: string; oemPartNumber?: string | null }>;
  procedures: Array<{ id: string; equipmentModelId: string; title: string; type: string }>;
  documents: Array<{ id: string; title: string; documentType: string; equipmentModelId?: string | null }>;
  repairHistory: Array<{ id: string; outcome: string; conclusion?: string | null; equipmentModelId?: string | null }>;
}

export async function searchRepairBrain(session: StoredStaffSession, query: string) {
  return staffFetch<RepairBrainSearchResults>(
    session,
    `/api/repair-brain/search?q=${encodeURIComponent(query)}`,
  );
}

export async function listRepairBrainModels(session: StoredStaffSession) {
  return staffFetch<RepairBrainModel[]>(session, "/api/repair-brain/models");
}

export async function getRepairBrainModelProfile(session: StoredStaffSession, modelId: string) {
  return staffFetch<RepairBrainModelProfile>(session, `/api/repair-brain/models/${modelId}/profile`);
}

export async function submitRepairBrainProposal(
  session: StoredStaffSession,
  body: { proposalType: string; title: string; payload?: Record<string, unknown>; equipmentModelId?: string },
) {
  return staffFetch<Record<string, unknown>>(session, "/api/repair-brain/proposals", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function linkEquipmentToModel(session: StoredStaffSession, equipmentId: string) {
  return staffFetch<{ equipment: Record<string, unknown>; model: RepairBrainModel | null; created: boolean }>(
    session,
    `/api/repair-brain/equipment/${equipmentId}/link-model`,
    { method: "POST" },
  );
}

export async function uploadVoiceNote(
  session: StoredStaffSession,
  jobId: string,
  localUri: string,
  durationMs: number,
) {
  const formData = new FormData();
  const name = localUri.split("/").pop() ?? "voice-note.m4a";
  formData.append("file", {
    uri: localUri,
    name,
    type: "audio/m4a",
  } as unknown as Blob);
  formData.append("durationMs", String(Math.round(durationMs)));

  const response = await fetch(`${getApiUrl()}/api/jobs/${jobId}/voice-notes`, {
    method: "POST",
    headers: { authorization: `Bearer ${session.accessToken}` },
    body: formData,
  });
  if (response.status === 401) throw new Error("session_expired");
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${response.status}: ${body}`);
  }
  return response.json() as Promise<import("@nnact/shared").JobVoiceNoteDTO>;
}
