import type { JobDTO, UserDTO } from "@nnact/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface DispatchAppointment {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

interface ApiErrorBody {
  error?: string;
  message?: string;
  conflict?: {
    appointmentId?: string;
    jobId?: string;
    startsAt?: string;
    endsAt?: string;
  };
}

export function formatDispatchApiError(status: number, statusText: string, body: string) {
  if (!body) return `${status}: ${statusText}`;

  try {
    const parsed = JSON.parse(body) as ApiErrorBody;
    const message = parsed.error || parsed.message;
    if (!message) return `${status}: ${body}`;

    if (status === 409 && parsed.conflict?.startsAt && parsed.conflict?.endsAt) {
      const start = new Date(parsed.conflict.startsAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      const end = new Date(parsed.conflict.endsAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      return `${message} (${start}–${end})`;
    }

    return message;
  } catch {
    return `${status}: ${body}`;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (typeof window !== "undefined") {
    const token = localStorage.getItem("NNPtoken");
    if (token) headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(formatDispatchApiError(response.status, response.statusText, body));
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
