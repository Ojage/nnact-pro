import type { PortalSessionDTO, PublicBookingConfigDTO, PublicBookingResultDTO } from "@nnact/shared";
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

export const customerApi = {
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
  ) => request<PublicBookingResultDTO>(`/api/public/${orgId}/book`, { method: "POST", body: JSON.stringify(body) }),

  portalSession: (token: string) => request<PortalSessionDTO>(`/api/portal/${token}`),

  portalCheckout: (token: string, invoiceId: string) =>
    request<{ url: string }>(`/api/portal/${token}/checkout`, { method: "POST", body: JSON.stringify({ invoiceId }) }),

  portalApproveEstimate: (token: string, estimateId: string, body: { optionId: string; signatureName?: string }) =>
    request(`/api/portal/${token}/estimates/${estimateId}/approve`, { method: "POST", body: JSON.stringify(body) }),

  portalDeclineEstimate: (token: string, estimateId: string) =>
    request(`/api/portal/${token}/estimates/${estimateId}/decline`, { method: "POST", body: JSON.stringify({}) }),
};

/** Extract a portal bearer token from a pasted link or raw token string. */
export function parsePortalToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("pl_")) return trimmed;
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const token = parts[parts.length - 1];
    return token?.startsWith("pl_") ? token : null;
  } catch {
    return null;
  }
}
