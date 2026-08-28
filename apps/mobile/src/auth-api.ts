import type { StaffAuthResponseDTO, StaffSearchResponseDTO } from "@nnact/shared";
import type { StoredStaffSession } from "./auth-storage";
import { getApiUrl } from "./env";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiUrl()}${path}`, {
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
  return toStoredSession(payload);
}

export async function staffMe(accessToken: string): Promise<StaffAuthResponseDTO["user"]> {
  return request<StaffAuthResponseDTO["user"]>("/api/auth/me", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

export async function staffChangePassword(
  session: StoredStaffSession,
  currentPassword: string,
  newPassword: string,
): Promise<StoredStaffSession> {
  const payload = await request<StaffAuthResponseDTO & { orgId: string }>("/api/auth/change-password", {
    method: "POST",
    headers: { authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return toStoredSession(payload);
}

function toStoredSession(payload: StaffAuthResponseDTO & { orgId: string }): StoredStaffSession {
  const mustChangePassword = Boolean(payload.mustChangePassword ?? payload.user.mustChangePassword);
  return {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: { ...payload.user, mustChangePassword },
    orgId: payload.orgId,
  };
}

export async function staffRefresh(refreshToken: string): Promise<StoredStaffSession> {
  const payload = await request<StaffAuthResponseDTO & { orgId: string }>("/api/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
  return toStoredSession(payload);
}

export async function staffLogout(refreshToken: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    await request("/api/auth/logout", {
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

export async function staffFetch<T>(session: StoredStaffSession, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiUrl()}${path}`, {
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

export async function staffSearch(session: StoredStaffSession, query: string) {
  const params = new URLSearchParams({ q: query });
  return staffFetch<StaffSearchResponseDTO>(session, `/api/search?${params}`);
}

export { getApiUrl };
