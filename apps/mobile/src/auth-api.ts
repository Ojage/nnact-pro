import type { StaffAuthResponseDTO } from "@nnact/shared";
import type { StoredStaffSession } from "./auth-storage";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${response.status}: ${body}`);
  }
  return response.json() as Promise<T>;
}

export async function staffLogin(email: string, password: string): Promise<StoredStaffSession> {
  const payload = await request<StaffAuthResponseDTO & { orgId: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: { ...payload.user, orgId: payload.orgId },
    orgId: payload.orgId,
  };
}

export async function staffRefresh(refreshToken: string): Promise<StoredStaffSession> {
  const payload = await request<StaffAuthResponseDTO & { orgId: string }>("/api/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: { ...payload.user, orgId: payload.orgId },
    orgId: payload.orgId,
  };
}

export async function staffLogout(refreshToken: string) {
  await request("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  }).catch(() => undefined);
}

export async function staffFetch<T>(session: StoredStaffSession, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${session.accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 401) throw new Error("session_expired");
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${response.status}: ${body}`);
  }
  return response.json() as Promise<T>;
}
