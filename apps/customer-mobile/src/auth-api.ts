import type { CustomerAuthResponseDTO, PortalSessionDTO } from "@nnact/shared";
import type { StoredCustomerSession } from "./auth-storage";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";
const DEFAULT_ORG_ID = process.env.EXPO_PUBLIC_DEFAULT_ORG_ID ?? "";

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

function authHeaders(accessToken: string) {
  return { authorization: `Bearer ${accessToken}` };
}

export function toStoredSession(payload: CustomerAuthResponseDTO): StoredCustomerSession {
  const activeOrgId = payload.orgs[0]?.orgId ?? (DEFAULT_ORG_ID || null);
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
      body: JSON.stringify({ ...body, orgId: body.orgId || DEFAULT_ORG_ID || undefined }),
    }),
  );
}

export async function customerLogin(email: string, password: string): Promise<StoredCustomerSession> {
  return toStoredSession(await request<CustomerAuthResponseDTO>("/api/customer-auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }));
}

export async function customerRefresh(refreshToken: string): Promise<StoredCustomerSession> {
  return toStoredSession(await request<CustomerAuthResponseDTO>("/api/customer-auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  }));
}

export async function customerLogout(refreshToken: string) {
  await request("/api/customer-auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  }).catch(() => undefined);
}

export async function customerAuthedRequest<T>(
  session: StoredCustomerSession,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
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
    throw new Error(`${response.status}: ${body}`);
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
