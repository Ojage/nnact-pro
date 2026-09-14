import type { StoredStaffSession } from "./auth-storage";
import { staffFetch } from "./auth-api";
import type {
  ComebackAnalyticsDTO,
  ComebackCaseDetailDTO,
  ComebackCaseListItemDTO,
  ComebackTechnicianMetricDTO,
} from "@nnact/shared";

export function listComebacks(
  session: StoredStaffSession,
  params?: { status?: string; severity?: string; q?: string },
): Promise<ComebackCaseListItemDTO[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.severity) query.set("severity", params.severity);
  if (params?.q) query.set("q", params.q);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return staffFetch<ComebackCaseListItemDTO[]>(session, `/api/comebacks${suffix}`);
}

export function getComeback(session: StoredStaffSession, id: string): Promise<ComebackCaseDetailDTO> {
  return staffFetch<ComebackCaseDetailDTO>(session, `/api/comebacks/${id}`);
}

export function listJobComebacks(
  session: StoredStaffSession,
  jobId: string,
): Promise<ComebackCaseListItemDTO[]> {
  return staffFetch<ComebackCaseListItemDTO[]>(session, `/api/jobs/${jobId}/comebacks`);
}

export function createComebackFromJob(
  session: StoredStaffSession,
  body: {
    jobId: string;
    complaintSummary?: string;
    complaintDetails?: string;
    intakeReason?: string;
    severity?: string;
  },
): Promise<ComebackCaseListItemDTO> {
  const { jobId, ...rest } = body;
  return staffFetch<ComebackCaseListItemDTO>(session, `/api/jobs/${jobId}/comeback`, {
    method: "POST",
    body: JSON.stringify(rest),
  });
}

export function transitionComeback(
  session: StoredStaffSession,
  id: string,
  action: string,
  body?: Record<string, unknown>,
): Promise<ComebackCaseDetailDTO> {
  return staffFetch<ComebackCaseDetailDTO>(session, `/api/comebacks/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export function comebackAnalytics(session: StoredStaffSession): Promise<ComebackAnalyticsDTO> {
  return staffFetch<ComebackAnalyticsDTO>(session, "/api/comebacks/analytics");
}

export function comebackTechnicianMetrics(session: StoredStaffSession): Promise<ComebackTechnicianMetricDTO[]> {
  return staffFetch<ComebackTechnicianMetricDTO[]>(session, "/api/comebacks/technician-metrics");
}