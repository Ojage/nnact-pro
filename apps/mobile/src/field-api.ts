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
