import type { CustomerDTO, JobDTO } from "@ofp/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface AppointmentDTO {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

export interface InvoiceDTO {
  id: string;
  number: string;
  status: "draft" | "sent" | "paid" | "void";
  total: number;
  jobId: string;
  dueAt: string | null;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  customers: () => get<CustomerDTO[]>("/api/customers"),
  jobs: () => get<JobDTO[]>("/api/jobs"),
  appointments: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const qs = q.toString();
    return get<AppointmentDTO[]>(`/api/appointments${qs ? `?${qs}` : ""}`);
  },
  invoices: () => get<InvoiceDTO[]>("/api/invoices"),
  health: () => get<{ ok: boolean }>("/api/health"),
};

// Client-side login helper (used by the login form).
export async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `login failed (${res.status})`);
  return res.json() as Promise<{ token: string; orgId: string; user: { name: string; role: string } }>;
}
