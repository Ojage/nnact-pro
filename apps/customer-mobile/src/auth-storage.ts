import * as SecureStore from "expo-secure-store";
import type { CustomerAuthResponseDTO, CustomerOrgLinkDTO } from "@nnact/shared";

const ACCESS_KEY = "nnact.customer.access";
const REFRESH_KEY = "nnact.customer.refresh";
const USER_KEY = "nnact.customer.user";
const ORGS_KEY = "nnact.customer.orgs";
const ACTIVE_ORG_KEY = "nnact.customer.activeOrgId";

export interface StoredCustomerSession {
  accessToken: string;
  refreshToken: string;
  user: CustomerAuthResponseDTO["user"];
  orgs: CustomerOrgLinkDTO[];
  activeOrgId: string | null;
}

export async function loadCustomerSession(): Promise<StoredCustomerSession | null> {
  const [accessToken, refreshToken, userJson, orgsJson, activeOrgId] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
    SecureStore.getItemAsync(USER_KEY),
    SecureStore.getItemAsync(ORGS_KEY),
    SecureStore.getItemAsync(ACTIVE_ORG_KEY),
  ]);
  if (!accessToken || !refreshToken || !userJson || !orgsJson) return null;
  try {
    return {
      accessToken,
      refreshToken,
      user: JSON.parse(userJson),
      orgs: JSON.parse(orgsJson),
      activeOrgId: activeOrgId ?? null,
    };
  } catch {
    return null;
  }
}

export async function saveCustomerSession(session: StoredCustomerSession) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, session.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user)),
    SecureStore.setItemAsync(ORGS_KEY, JSON.stringify(session.orgs)),
    SecureStore.setItemAsync(ACTIVE_ORG_KEY, session.activeOrgId ?? ""),
  ]);
}

export async function clearCustomerSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
    SecureStore.deleteItemAsync(ORGS_KEY),
    SecureStore.deleteItemAsync(ACTIVE_ORG_KEY),
  ]);
}
