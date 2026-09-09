import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import type { StoredStaffSession } from "./auth-storage";
import { staffFetch } from "./auth-api";

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch {
  // Expo Go (SDK 53+) does not support Android remote push; the app
  // continues without a notification handler there.
}

export async function registerFieldPush(session: StoredStaffSession): Promise<string | null> {
  if (!Device.isDevice) return null;

  try {
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
  } catch {
    return null;
  }
}

export async function unregisterFieldPush(session: StoredStaffSession, token: string) {
  await staffFetch(session, "/api/push-tokens/remove", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function addPushRefreshListener(onRefresh: () => void) {
  try {
    const received = Notifications.addNotificationReceivedListener(() => onRefresh());
    const response = Notifications.addNotificationResponseReceivedListener(() => onRefresh());
    return () => {
      received.remove();
      response.remove();
    };
  } catch {
    return () => {};
  }
}
