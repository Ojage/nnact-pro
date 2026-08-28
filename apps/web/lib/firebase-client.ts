import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from "firebase/messaging";

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
}

export function readFirebaseWebConfig(): FirebaseWebConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim();
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim();
  if (!apiKey || !projectId || !messagingSenderId || !appId) return null;

  return {
    apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ?? `${projectId}.firebaseapp.com`,
    projectId,
    messagingSenderId,
    appId,
  };
}

export function initFirebaseApp(): FirebaseApp | null {
  const config = readFirebaseWebConfig();
  if (!config) return null;
  if (getApps().length > 0) return getApps()[0]!;
  return initializeApp(config);
}

export async function initFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  const supported = await isSupported();
  if (!supported) return null;
  const app = initFirebaseApp();
  if (!app) return null;
  return getMessaging(app);
}

export async function registerWebPushToken(apiBase: string, accessToken: string): Promise<string | null> {
  const messaging = await initFirebaseMessaging();
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim();
  if (!messaging || !vapidKey) return null;

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: await navigator.serviceWorker.register("/firebase-messaging-sw.js"),
  });

  if (!token) return null;

  await fetch(`${apiBase}/api/push-tokens/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ token, platform: "web", provider: "fcm" }),
  });

  return token;
}

export function listenForegroundMessages(
  messaging: Messaging,
  onPayload: (payload: { title?: string; body?: string; data?: Record<string, string> }) => void,
) {
  return onMessage(messaging, (payload) => {
    onPayload({
      title: payload.notification?.title,
      body: payload.notification?.body,
      data: (payload.data as Record<string, string> | undefined) ?? undefined,
    });
  });
}
