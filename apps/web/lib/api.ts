const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

class ApiError extends Error {
  constructor(
    public status: number,
    body: string,
  ) {
    super(`${status}: ${body}`);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  // ponytail: reads token from localStorage on the client; RSCs don't have
  // access to it, so they run unauthenticated against the demo seed.
  // Ceiling: multi-org with real auth per user. Upgrade: switch to
  // httpOnly cookie set by the login endpoint, or pass the token via a
  // server-side session cookie.
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("ofp_token");
    if (token) headers["authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body);
  }
  // Some endpoints return 204 or empty body
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

// ── Public helpers ──

export interface LoginResult {
  token: string;
  user: { id: string; name: string; email: string; role: string };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

// ── Resource wrappers ──

type JobDTO = import("@ofp/shared").JobDTO;
type CustomerDTO = import("@ofp/shared").CustomerDTO;
type ActivityDTO = import("@ofp/shared").ActivityDTO;
type ReportSummaryDTO = import("@ofp/shared").ReportSummaryDTO;
type UserDTO = import("@ofp/shared").UserDTO;
type RecurringJobDTO = import("@ofp/shared").RecurringJobDTO;

interface Appointment {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

interface Invoice {
  id: string;
  jobId: string;
  number: string;
  status: import("@ofp/shared").InvoiceStatus;
  total: number;
  dueAt?: string | null;
  createdAt?: string;
}

interface Estimate {
  id: string;
  orgId: string;
  jobId: string;
  total: number;
  accepted: boolean;
  createdAt: string;
}

interface LineItem {
  id: string;
  jobId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  createdAt: string;
}

interface Review {
  id: string;
  orgId: string;
  jobId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
}

interface ReviewList {
  reviews: Review[];
  average: number;
  count: number;
}

interface Payment {
  id: string;
  orgId: string;
  invoiceId: string;
  amount: number;
  method: string;
  reference?: string | null;
  paidAt: string;
}

interface InvoiceDetail extends Invoice {
  lineItems: LineItem[];
  payments: Payment[];
}

export const api = {
  health: () => request<{ ok: boolean }>("/api/health"),

  jobs: () => request<JobDTO[]>("/api/jobs"),
  job: (id: string) => request<JobDTO>(`/api/jobs/${id}`),
  patchJob: (id: string, data: Record<string, unknown>) =>
    request<JobDTO>(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  customers: () => request<CustomerDTO[]>("/api/customers"),
  customer: (id: string) => request<CustomerDTO>(`/api/customers/${id}`),

  activities: (q?: { customerId?: string; jobId?: string }) => {
    const params = new URLSearchParams();
    if (q?.customerId) params.set("customerId", q.customerId);
    if (q?.jobId) params.set("jobId", q.jobId);
    const qs = params.toString();
    return request<ActivityDTO[]>(`/api/activities${qs ? `?${qs}` : ""}`);
  },

  appointments: () => request<Appointment[]>("/api/appointments"),
  invoices: () => request<Invoice[]>("/api/invoices"),
  invoice: (id: string) => request<InvoiceDetail>(`/api/invoices/${id}`),
  createInvoice: (body: { jobId: string; dueAt?: string }) =>
    request<Invoice>("/api/invoices", { method: "POST", body: JSON.stringify(body) }),
  updateInvoiceStatus: (id: string, status: "sent" | "void") =>
    request<{ ok: boolean; status: string }>(`/api/invoices/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  recordPayment: (id: string, body: { amount: number; method?: string }) =>
    request<{ status: string; remaining: number; overpaid: number }>(`/api/invoices/${id}/pay`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reports: () => request<ReportSummaryDTO>("/api/reports/summary"),

  estimates: () => request<Estimate[]>("/api/estimates"),
  createEstimate: (body: { jobId: string }) =>
    request<Estimate>("/api/estimates", { method: "POST", body: JSON.stringify(body) }),

  reviews: () => request<ReviewList>("/api/reviews"),

  lineItems: (jobId: string) => request<LineItem[]>(`/api/jobs/${jobId}/line-items`),

  users: () => request<UserDTO[]>("/api/users"),
  recurring: () => request<RecurringJobDTO[]>("/api/recurring"),
};
