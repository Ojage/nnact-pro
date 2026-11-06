import type {
  CustomerAppointmentDTO,
  CustomerAppointmentRequestDTO,
  CustomerAuthResponseDTO,
  CustomerCommunicationDTO,
  CustomerDashboardDTO,
  CustomerDocumentDTO,
  CustomerEquipmentDTO,
  CustomerEstimateDetailDTO,
  CustomerEstimateSummaryDTO,
  CustomerInvoiceDetailDTO,
  CustomerInvoiceSummaryDTO,
  CustomerJobDetailDTO,
  CustomerJobSummaryDTO,
  CustomerNotificationDTO,
  CustomerPortalProfileDTO,
  CustomerPreferencesDTO,
  CustomerPropertyDTO,
  CustomerReviewDTO,
  CustomerSearchResponseDTO,
  CustomerServicePlanDetailDTO,
  CustomerSupportRequestDTO,
  PortalSessionDTO,
} from "@nnact/shared";
import { apiErrorMessage } from "@nnact/shared";
import type { StoredCustomerSession } from "./auth-storage";
import { getApiUrl, getDefaultOrgId } from "./env";

function apiBase() {
  return getApiUrl();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(apiErrorMessage(response.status, body));
  }
  return response.json() as Promise<T>;
}

function authHeaders(accessToken: string) {
  return { authorization: `Bearer ${accessToken}` };
}

export function toStoredSession(payload: CustomerAuthResponseDTO): StoredCustomerSession {
  const activeOrgId = payload.orgs[0]?.orgId ?? (getDefaultOrgId() || null);
  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: payload.user,
    orgs: payload.orgs,
    activeOrgId: activeOrgId || null,
  };
}

export async function customerRegister(body: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  orgId?: string;
}): Promise<StoredCustomerSession> {
  return toStoredSession(
    await request<CustomerAuthResponseDTO>("/api/customer-auth/register", {
      method: "POST",
      body: JSON.stringify({ ...body, orgId: body.orgId || getDefaultOrgId() || undefined }),
    }),
  );
}

export async function customerLogin(email: string, password: string): Promise<StoredCustomerSession> {
  return toStoredSession(await request<CustomerAuthResponseDTO>("/api/customer-auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }));
}

export async function customerLoginWithPhone(phone: string, password: string): Promise<StoredCustomerSession> {
  return toStoredSession(await request<CustomerAuthResponseDTO>("/api/customer-auth/login", {
    method: "POST",
    body: JSON.stringify({ phone, password }),
  }));
}

export interface OtpRequestResult {
  sent: boolean;
  devCode?: string;
  message?: string;
}

export async function customerRequestOtp(phone: string): Promise<OtpRequestResult> {
  return request<OtpRequestResult>("/api/customer-auth/otp/request", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export async function customerVerifyOtp(phone: string, code: string): Promise<StoredCustomerSession> {
  return toStoredSession(await request<CustomerAuthResponseDTO>("/api/customer-auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  }));
}

export async function customerRequestPasswordReset(payload: { email?: string; phone?: string }): Promise<OtpRequestResult> {
  return request<OtpRequestResult>("/api/customer-auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function customerResetPassword(payload: {
  email?: string;
  phone?: string;
  code: string;
  newPassword: string;
}): Promise<StoredCustomerSession> {
  return toStoredSession(await request<CustomerAuthResponseDTO>("/api/customer-auth/password-reset/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  }));
}

export async function customerRefresh(refreshToken: string): Promise<StoredCustomerSession> {
  return toStoredSession(await request<CustomerAuthResponseDTO>("/api/customer-auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  }));
}

export async function customerLogout(refreshToken: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    await request("/api/customer-auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal,
    });
  } catch {
    // Best-effort revoke — local session is already cleared.
  } finally {
    clearTimeout(timeout);
  }
}

export async function customerAuthedRequest<T>(
  session: StoredCustomerSession,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(session.accessToken),
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 401) throw new Error("session_expired");
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(apiErrorMessage(response.status, body));
  }
  return response.json() as Promise<T>;
}

export async function customerWorkspace(session: StoredCustomerSession, orgId: string) {
  return customerAuthedRequest<PortalSessionDTO>(session, `/api/customer-auth/orgs/${orgId}/workspace`);
}

export async function customerCheckout(session: StoredCustomerSession, orgId: string, invoiceId: string) {
  return customerAuthedRequest<{ url: string }>(session, `/api/customer-auth/orgs/${orgId}/checkout`, {
    method: "POST",
    body: JSON.stringify({ invoiceId }),
  });
}

export async function customerApproveEstimate(
  session: StoredCustomerSession,
  orgId: string,
  estimateId: string,
  body: { optionId: string; signatureName?: string },
) {
  return customerAuthedRequest(session, `/api/customer-auth/orgs/${orgId}/estimates/${estimateId}/approve`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function customerDeclineEstimate(session: StoredCustomerSession, orgId: string, estimateId: string) {
  return customerAuthedRequest(session, `/api/customer-auth/orgs/${orgId}/estimates/${estimateId}/decline`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function customerSearch(session: StoredCustomerSession, orgId: string, query: string) {
  const params = new URLSearchParams({ q: query });
  return customerAuthedRequest<CustomerSearchResponseDTO>(
    session,
    `/api/customer-auth/orgs/${orgId}/search?${params}`,
  );
}


function orgPath(orgId: string, suffix: string) {
  return `/api/customer-auth/orgs/${orgId}${suffix}`;
}

export function customerFileUrl(session: StoredCustomerSession, path: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${apiBase()}/api${path}${separator}access_token=${encodeURIComponent(session.accessToken)}`;
}

export const customerPortalApi = {
  dashboard: (session: StoredCustomerSession, orgId: string) =>
    customerAuthedRequest<CustomerDashboardDTO>(session, orgPath(orgId, "/dashboard")),
  profile: (session: StoredCustomerSession, orgId: string) =>
    customerAuthedRequest<CustomerPortalProfileDTO>(session, orgPath(orgId, "/profile")),
  updateProfile: (
    session: StoredCustomerSession,
    orgId: string,
    body: { name?: string; email?: string; phone?: string | null; company?: string | null; address?: string | null },
  ) =>
    customerAuthedRequest<CustomerPortalProfileDTO>(session, orgPath(orgId, "/profile"), {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  changePassword: (session: StoredCustomerSession, orgId: string, body: { currentPassword: string; newPassword: string }) =>
    customerAuthedRequest<{ ok: boolean }>(session, orgPath(orgId, "/profile/password"), {
      method: "POST",
      body: JSON.stringify(body),
    }),
  appointments: (session: StoredCustomerSession, orgId: string) =>
    customerAuthedRequest<CustomerAppointmentDTO[]>(session, orgPath(orgId, "/appointments")),
  requestAppointment: (
    session: StoredCustomerSession,
    orgId: string,
    appointmentId: string,
    body: { type: "reschedule" | "cancel"; requestedStartsAt?: string; reason?: string },
  ) =>
    customerAuthedRequest<CustomerAppointmentRequestDTO>(session, orgPath(orgId, `/appointments/${appointmentId}/request`), {
      method: "POST",
      body: JSON.stringify(body),
    }),
  appointmentRequests: (session: StoredCustomerSession, orgId: string) =>
    customerAuthedRequest<CustomerAppointmentRequestDTO[]>(session, orgPath(orgId, "/appointment-requests")),
  estimates: (session: StoredCustomerSession, orgId: string) =>
    customerAuthedRequest<CustomerEstimateSummaryDTO[]>(session, orgPath(orgId, "/estimates")),
  estimate: (session: StoredCustomerSession, orgId: string, estimateId: string) =>
    customerAuthedRequest<CustomerEstimateDetailDTO>(session, orgPath(orgId, `/estimates/${estimateId}`)),
  invoices: (session: StoredCustomerSession, orgId: string) =>
    customerAuthedRequest<CustomerInvoiceSummaryDTO[]>(session, orgPath(orgId, "/invoices")),
  invoice: (session: StoredCustomerSession, orgId: string, invoiceId: string) =>
    customerAuthedRequest<CustomerInvoiceDetailDTO>(session, orgPath(orgId, `/invoices/${invoiceId}`)),
  documents: (session: StoredCustomerSession, orgId: string) =>
    customerAuthedRequest<CustomerDocumentDTO[]>(session, orgPath(orgId, "/documents")),
  jobs: (session: StoredCustomerSession, orgId: string) =>
    customerAuthedRequest<CustomerJobSummaryDTO[]>(session, orgPath(orgId, "/jobs")),
  job: (session: StoredCustomerSession, orgId: string, jobId: string) =>
    customerAuthedRequest<CustomerJobDetailDTO>(session, orgPath(orgId, `/jobs/${jobId}`)),
  equipment: (session: StoredCustomerSession, orgId: string) =>
    customerAuthedRequest<CustomerEquipmentDTO[]>(session, orgPath(orgId, "/equipment")),
  properties: (session: StoredCustomerSession, orgId: string) =>
    customerAuthedRequest<CustomerPropertyDTO[]>(session, orgPath(orgId, "/properties")),
  addProperty: (session: StoredCustomerSession, orgId: string, body: { address: string; lat?: string; lng?: string }) =>
    customerAuthedRequest<CustomerPropertyDTO>(session, orgPath(orgId, "/properties"), {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteProperty: (session: StoredCustomerSession, orgId: string, propertyId: string) =>
    customerAuthedRequest<{ ok: boolean }>(session, orgPath(orgId, `/properties/${propertyId}`), { method: "DELETE" }),
  notifications: (session: StoredCustomerSession, orgId: string) =>
    customerAuthedRequest<CustomerNotificationDTO[]>(session, orgPath(orgId, "/notifications")),
  markNotificationsRead: (session: StoredCustomerSession, orgId: string, keys?: string[]) =>
    customerAuthedRequest<{ ok: boolean; read: number }>(session, orgPath(orgId, "/notifications/read"), {
      method: "POST",
      body: JSON.stringify(keys ? { keys } : {}),
    }),
  reviews: (session: StoredCustomerSession, orgId: string) =>
    customerAuthedRequest<CustomerReviewDTO[]>(session, orgPath(orgId, "/reviews")),
  createReview: (session: StoredCustomerSession, orgId: string, body: { jobId: string; rating: number; comment?: string }) =>
    customerAuthedRequest<CustomerReviewDTO>(session, orgPath(orgId, "/reviews"), {
      method: "POST",
      body: JSON.stringify(body),
    }),
  support: (session: StoredCustomerSession, orgId: string) =>
    customerAuthedRequest<CustomerSupportRequestDTO[]>(session, orgPath(orgId, "/support")),
  createSupport: (
    session: StoredCustomerSession,
    orgId: string,
    body: { kind?: string; subject: string; message: string; jobId?: string },
  ) =>
    customerAuthedRequest<CustomerSupportRequestDTO>(session, orgPath(orgId, "/support"), {
      method: "POST",
      body: JSON.stringify(body),
    }),
  servicePlans: (session: StoredCustomerSession, orgId: string) =>
    customerAuthedRequest<CustomerServicePlanDetailDTO[]>(session, orgPath(orgId, "/service-plans")),
  servicePlan: (session: StoredCustomerSession, orgId: string, agreementId: string) =>
    customerAuthedRequest<CustomerServicePlanDetailDTO>(session, orgPath(orgId, `/service-plans/${agreementId}`)),
  requestRenewal: (session: StoredCustomerSession, orgId: string, agreementId: string) =>
    customerAuthedRequest<CustomerSupportRequestDTO>(session, orgPath(orgId, `/service-plans/${agreementId}/renewal`), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  preferences: (session: StoredCustomerSession, orgId: string) =>
    customerAuthedRequest<CustomerPreferencesDTO>(session, orgPath(orgId, "/preferences")),
  updatePreferences: (session: StoredCustomerSession, orgId: string, body: Partial<CustomerPreferencesDTO>) =>
    customerAuthedRequest<CustomerPreferencesDTO>(session, orgPath(orgId, "/preferences"), {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  communications: (session: StoredCustomerSession, orgId: string) =>
    customerAuthedRequest<CustomerCommunicationDTO[]>(session, orgPath(orgId, "/communications")),
};
