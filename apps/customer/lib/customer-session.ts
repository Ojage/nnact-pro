import type { CustomerAuthResponseDTO } from "@nnact/shared";

const STORAGE_KEY = "nnact.customer.session";

export interface CustomerSession extends CustomerAuthResponseDTO {
  activeOrgId: string | null;
}

export function loadCustomerSession(): CustomerSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CustomerSession;
    if (!parsed.accessToken || !parsed.refreshToken || !Array.isArray(parsed.orgs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCustomerSession(session: CustomerSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearCustomerSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function sessionOrgId(session: CustomerSession | null): string | null {
  return session?.activeOrgId ?? session?.orgs[0]?.orgId ?? null;
}
