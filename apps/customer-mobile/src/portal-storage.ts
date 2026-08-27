import AsyncStorage from "@react-native-async-storage/async-storage";

const PORTAL_TOKEN_KEY = "nnact.customer.portalToken";

export async function loadPortalToken(): Promise<string | null> {
  return AsyncStorage.getItem(PORTAL_TOKEN_KEY);
}

export async function savePortalToken(token: string): Promise<void> {
  await AsyncStorage.setItem(PORTAL_TOKEN_KEY, token);
}

export async function clearPortalToken(): Promise<void> {
  await AsyncStorage.removeItem(PORTAL_TOKEN_KEY);
}
