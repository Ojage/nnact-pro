import type {
  CustomerAppointmentDTO,
  CustomerAppointmentRequestDTO,
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
  CustomerServicePlanDetailDTO,
  CustomerSupportRequestDTO,
  CustomerAuthResponseDTO,
} from "@nnact/shared";
import { loadCustomerSession, saveCustomerSession, sessionOrgId, type CustomerSession } from "./customer-session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003";

export class CustomerApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseError(res: Response): Promise<CustomerApiError> {
  const text = await res.text().catch(() => "");
  try {
    const body = JSON.parse(text) as { error?: unknown };
    if (typeof body.error === "string") return new CustomerApiError(res.status, body.error);
  } catch {
    void text;
  }
  return new CustomerApiError(res.status, `Request failed (${res.status})`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<T>;
}

async function refreshSession(session: CustomerSession): Promise<CustomerSession | null> {
  try {
    const data = await request<CustomerAuthResponseDTO>("/api/customer-auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    const next: CustomerSession = {
      ...data,
      activeOrgId: session.activeOrgId ?? data.orgs[0]?.orgId ?? null,
    };
    saveCustomerSession(next);
    return next;
  } catch {
    return null;
  }
}

async function authed<T>(path: string, init?: RequestInit): Promise<T> {
  let session = loadCustomerSession();
  if (!session) throw new CustomerApiError(401, "Please sign in.");
  let res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (res.status === 401) {
    const refreshed = await refreshSession(session);
    if (!refreshed) throw new CustomerApiError(401, "Your session expired. Please sign in again.");
    session = refreshed;
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  }
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<T>;
}

function orgPath(orgId: string, suffix: string) {
  return `/api/customer-auth/orgs/${orgId}${suffix}`;
}

function json(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

export function customerFileUrl(path: string): string {
  const session = loadCustomerSession();
  const token = session?.accessToken ?? "";
  const separator = path.includes("?") ? "&" : "?";
  return `${API_BASE}/api${path}${separator}access_token=${encodeURIComponent(token)}`;
}

export const customerApi = {
  async login(email: string, password: string) {
    const data = await request<CustomerAuthResponseDTO>("/api/customer-auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const session: CustomerSession = { ...data, activeOrgId: data.orgs[0]?.orgId ?? null };
    saveCustomerSession(session);
    return session;
  },

  async signup(input: { name: string; email: string; password: string; phone?: string }) {
    const data = await request<CustomerAuthResponseDTO>("/api/customer-auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
    const session: CustomerSession = { ...data, activeOrgId: data.orgs[0]?.orgId ?? null };
    saveCustomerSession(session);
    return session;
  },

  dashboard: (orgId: string) => authed<CustomerDashboardDTO>(orgPath(orgId, "/dashboard")),
  profile: (orgId: string) => authed<CustomerPortalProfileDTO>(orgPath(orgId, "/profile")),
  updateProfile: (orgId: string, body: { name?: string; email?: string; phone?: string | null; company?: string | null; address?: string | null }) =>
    authed<CustomerPortalProfileDTO>(orgPath(orgId, "/profile"), { method: "PATCH", body: JSON.stringify(body) }),
  changePassword: (orgId: string, body: { currentPassword: string; newPassword: string }) =>
    authed<{ ok: boolean }>(orgPath(orgId, "/profile/password"), json(body)),

  appointments: (orgId: string) => authed<CustomerAppointmentDTO[]>(orgPath(orgId, "/appointments")),
  requestAppointment: (
    orgId: string,
    appointmentId: string,
    body: { type: "reschedule" | "cancel"; requestedStartsAt?: string; reason?: string },
  ) => authed<CustomerAppointmentRequestDTO>(orgPath(orgId, `/appointments/${appointmentId}/request`), json(body)),
  appointmentRequests: (orgId: string) => authed<CustomerAppointmentRequestDTO[]>(orgPath(orgId, "/appointment-requests")),

  estimates: (orgId: string) => authed<CustomerEstimateSummaryDTO[]>(orgPath(orgId, "/estimates")),
  estimate: (orgId: string, estimateId: string) =>
    authed<CustomerEstimateDetailDTO>(orgPath(orgId, `/estimates/${estimateId}`)),

  invoices: (orgId: string) => authed<CustomerInvoiceSummaryDTO[]>(orgPath(orgId, "/invoices")),
  invoice: (orgId: string, invoiceId: string) =>
    authed<CustomerInvoiceDetailDTO>(orgPath(orgId, `/invoices/${invoiceId}`)),

  jobs: (orgId: string) => authed<CustomerJobSummaryDTO[]>(orgPath(orgId, "/jobs")),
  job: (orgId: string, jobId: string) => authed<CustomerJobDetailDTO>(orgPath(orgId, `/jobs/${jobId}`)),

  equipment: (orgId: string) => authed<CustomerEquipmentDTO[]>(orgPath(orgId, "/equipment")),
  properties: (orgId: string) => authed<CustomerPropertyDTO[]>(orgPath(orgId, "/properties")),
  addProperty: (orgId: string, body: { address: string; lat?: string; lng?: string }) =>
    authed<CustomerPropertyDTO>(orgPath(orgId, "/properties"), json(body)),
  deleteProperty: (orgId: string, propertyId: string) =>
    authed<{ ok: boolean }>(orgPath(orgId, `/properties/${propertyId}`), { method: "DELETE" }),

  notifications: (orgId: string) => authed<CustomerNotificationDTO[]>(orgPath(orgId, "/notifications")),
  markNotificationsRead: (orgId: string, keys?: string[]) =>
    authed<{ ok: boolean; read: number }>(orgPath(orgId, "/notifications/read"), json(keys ? { keys } : {})),

  reviews: (orgId: string) => authed<CustomerReviewDTO[]>(orgPath(orgId, "/reviews")),
  createReview: (orgId: string, body: { jobId: string; rating: number; comment?: string }) =>
    authed<CustomerReviewDTO>(orgPath(orgId, "/reviews"), json(body)),

  support: (orgId: string) => authed<CustomerSupportRequestDTO[]>(orgPath(orgId, "/support")),
  createSupport: (orgId: string, body: { kind?: string; subject: string; message: string; jobId?: string }) =>
    authed<CustomerSupportRequestDTO>(orgPath(orgId, "/support"), json(body)),

  documents: (orgId: string) => authed<CustomerDocumentDTO[]>(orgPath(orgId, "/documents")),
  plans: (orgId: string) => authed<CustomerServicePlanDetailDTO[]>(orgPath(orgId, "/service-plans")),
  plan: (orgId: string, agreementId: string) =>
    authed<CustomerServicePlanDetailDTO>(orgPath(orgId, `/service-plans/${agreementId}`)),
  requestRenewal: (orgId: string, agreementId: string) =>
    authed<CustomerSupportRequestDTO>(orgPath(orgId, `/service-plans/${agreementId}/renewal`), json({})),

  preferences: (orgId: string) => authed<CustomerPreferencesDTO>(orgPath(orgId, "/preferences")),
  updatePreferences: (orgId: string, body: Partial<CustomerPreferencesDTO>) =>
    authed<CustomerPreferencesDTO>(orgPath(orgId, "/preferences"), { method: "PATCH", body: JSON.stringify(body) }),
  communications: (orgId: string) => authed<CustomerCommunicationDTO[]>(orgPath(orgId, "/communications")),

  currentOrgId: () => sessionOrgId(loadCustomerSession()),
};
