import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import type { StoredStaffSession } from "./auth-storage";
import { staffFetch } from "./auth-api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerFieldPush(session: StoredStaffSession): Promise<string | null> {
  if (!Device.isDevice) return null;

  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("field-assignments", {
      name: "Field assignments",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const push = await Notifications.getDevicePushTokenAsync();
  const token = push.data;
  if (!token) return null;

  await staffFetch(session, "/api/push-tokens/register", {
    method: "POST",
    body: JSON.stringify({
      token,
      platform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web",
      provider: "fcm",
    }),
  });

  return token;
}

export async function unregisterFieldPush(session: StoredStaffSession, token: string) {
  await staffFetch(session, "/api/push-tokens/remove", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function addPushRefreshListener(onRefresh: () => void) {
  const received = Notifications.addNotificationReceivedListener(() => onRefresh());
  const response = Notifications.addNotificationResponseReceivedListener(() => onRefresh());
  return () => {
    received.remove();
    response.remove();
  };
}
