import * as SecureStore from "expo-secure-store";
import type { StaffAuthResponseDTO } from "@nnact/shared";

const ACCESS_KEY = "nnact.staff.access";
const REFRESH_KEY = "nnact.staff.refresh";
const USER_KEY = "nnact.staff.user";
const ORG_KEY = "nnact.staff.orgId";

export interface StoredStaffSession {
  accessToken: string;
  refreshToken: string;
  user: StaffAuthResponseDTO["user"];
  orgId: string;
}

export async function loadStaffSession(): Promise<StoredStaffSession | null> {
  const [accessToken, refreshToken, userJson, orgId] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
    SecureStore.getItemAsync(USER_KEY),
    SecureStore.getItemAsync(ORG_KEY),
  ]);
  if (!accessToken || !refreshToken || !userJson || !orgId) return null;
  try {
    return { accessToken, refreshToken, user: JSON.parse(userJson), orgId };
  } catch {
    return null;
  }
}

export async function saveStaffSession(session: StoredStaffSession) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, session.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user)),
    SecureStore.setItemAsync(ORG_KEY, session.orgId),
  ]);
}

export async function clearStaffSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
    SecureStore.deleteItemAsync(ORG_KEY),
  ]);
}
