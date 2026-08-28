import admin from "firebase-admin";

let initialized = false;

function parseServiceAccount(): admin.ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as admin.ServiceAccount;
  } catch {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(decoded) as admin.ServiceAccount;
  }
}

export function firebaseMessaging(): admin.messaging.Messaging | null {
  if (!initialized) {
    const account = parseServiceAccount();
    if (!account) return null;
    admin.initializeApp({
      credential: admin.credential.cert(account),
    });
    initialized = true;
  }
  return admin.messaging();
}

export function firebaseEnabled(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim());
}
