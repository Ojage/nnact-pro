import type { JobDTO, UserDTO } from "@ofp/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface DispatchAppointment {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (typeof window !== "undefined") {
    const token = localStorage.getItem("ofp_token");
    if (token) headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${response.status}: ${body || response.statusText}`);
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const dispatchApi = {
  appointments: () => request<DispatchAppointment[]>("/api/appointments"),
  jobs: () => request<JobDTO[]>("/api/jobs"),
  users: () => request<UserDTO[]>("/api/users"),
  assignAppointment: (id: string, technicianId: string | null) =>
    request<DispatchAppointment>(`/api/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ technicianId }),
    }),
};
