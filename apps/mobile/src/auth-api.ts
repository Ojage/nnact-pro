import type { StaffAuthResponseDTO, StaffSearchResponseDTO } from "@nnact/shared";
import { apiErrorMessage } from "@nnact/shared";
import type { StoredStaffSession } from "./auth-storage";
import { getApiUrl } from "./env";

const FETCH_TIMEOUT_MS = 12_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${getApiUrl()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(apiErrorMessage(response.status, body));
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("network request failed");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function staffLogin(email: string, password: string): Promise<StoredStaffSession> {
  const payload = await request<StaffAuthResponseDTO & { orgId: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return toStoredSession(payload);
}

export async function staffLoginWithPhone(phone: string, password: string): Promise<StoredStaffSession> {
  const payload = await request<StaffAuthResponseDTO & { orgId: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone, password }),
  });
  return toStoredSession(payload);
}

export interface OtpRequestResult {
  sent: boolean;
  devCode?: string;
  message?: string;
}

export async function staffRequestOtp(phone: string): Promise<OtpRequestResult> {
  return request<OtpRequestResult>("/api/auth/otp/request", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export async function staffVerifyOtp(phone: string, code: string): Promise<StoredStaffSession> {
  const payload = await request<StaffAuthResponseDTO & { orgId: string }>("/api/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
  return toStoredSession(payload);
}

export async function staffRequestPasswordReset(payload: { email?: string; phone?: string }): Promise<OtpRequestResult> {
  return request<OtpRequestResult>("/api/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function staffResetPassword(payload: {
  email?: string;
  phone?: string;
  code: string;
  newPassword: string;
}): Promise<StoredStaffSession> {
  const result = await request<StaffAuthResponseDTO & { orgId: string }>("/api/auth/password-reset/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return toStoredSession(result);
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${getApiUrl()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${session.accessToken}`,
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (response.status === 401) throw new Error("session_expired");
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(apiErrorMessage(response.status, body));
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("network request failed");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function staffSearch(session: StoredStaffSession, query: string) {
  const params = new URLSearchParams({ q: query });
  return staffFetch<StaffSearchResponseDTO>(session, `/api/search?${params}`);
}

export { getApiUrl };
