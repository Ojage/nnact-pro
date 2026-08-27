import type { PortalSessionDTO, PublicBookingConfigDTO } from "@nnact/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export type { PortalSessionDTO, PublicBookingConfigDTO };

export const api = {
  bookingConfig: (orgId?: string) =>
    request<PublicBookingConfigDTO>(orgId ? `/api/public/${orgId}/booking` : "/api/public/default"),

  bookService: (
    orgId: string,
    body: {
      name: string;
      email?: string;
      phone?: string;
      title: string;
      description?: string;
      serviceCategory?: string;
      address?: string;
      preferredDate?: string;
      preferredTime?: string;
    },
  ) => request<{ ok: boolean; requestId: string }>(`/api/public/${orgId}/book`, { method: "POST", body: JSON.stringify(body) }),

  portalSession: (token: string) => request<PortalSessionDTO>(`/api/portal/${token}`),

  portalCheckout: (token: string, invoiceId: string) =>
    request<{ url: string }>(`/api/portal/${token}/checkout`, { method: "POST", body: JSON.stringify({ invoiceId }) }),

  portalApproveEstimate: (token: string, estimateId: string, body: { optionId: string; signatureName?: string }) =>
    request(`/api/portal/${token}/estimates/${estimateId}/approve`, { method: "POST", body: JSON.stringify(body) }),

  portalDeclineEstimate: (token: string, estimateId: string) =>
    request(`/api/portal/${token}/estimates/${estimateId}/decline`, { method: "POST", body: JSON.stringify({}) }),

  orgLogoUrl: (orgId: string) => `${API_BASE}/api/public/${orgId}/logo`,
};

export function customerAppUrl(path = ""): string {
  const base = process.env.NEXT_PUBLIC_CUSTOMER_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3002";
  return path ? `${base}${path.startsWith("/") ? path : `/${path}`}` : base;
}
