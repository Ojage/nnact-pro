import { and, eq } from "drizzle-orm";
import { db, devicePushTokens } from "@nnact/db";
import { firebaseMessaging } from "./firebase.js";

export async function sendPushToUser(
  userId: string,
  input: {
    title: string;
    body?: string;
    data?: Record<string, string>;
    link?: string;
  },
): Promise<void> {
  const messaging = firebaseMessaging();
  if (!messaging) return;

  const tokens = await db
    .select({ token: devicePushTokens.token })
    .from(devicePushTokens)
    .where(eq(devicePushTokens.userId, userId));

  if (tokens.length === 0) return;

  const data = { ...(input.data ?? {}) };
  if (input.link) data.link = input.link;

  try {
    await messaging.sendEachForMulticast({
      tokens: tokens.map((row) => row.token),
      notification: {
        title: input.title,
        body: input.body ?? "",
      },
      data,
      webpush: input.link
        ? {
            fcmOptions: { link: input.link },
          }
        : undefined,
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default" } } },
    });
  } catch {
    // Push must never break domain actions.
  }
}

export async function upsertPushToken(input: {
  orgId: string;
  userId: string;
  platform: string;
  token: string;
  provider?: string;
}): Promise<void> {
  await db
    .insert(devicePushTokens)
    .values({
      orgId: input.orgId,
      userId: input.userId,
      platform: input.platform,
      provider: input.provider ?? "fcm",
      token: input.token,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: devicePushTokens.token,
      set: {
        orgId: input.orgId,
        userId: input.userId,
        platform: input.platform,
        provider: input.provider ?? "fcm",
        updatedAt: new Date(),
      },
    });
}

export async function removePushToken(userId: string, token: string): Promise<void> {
  await db
    .delete(devicePushTokens)
    .where(and(eq(devicePushTokens.userId, userId), eq(devicePushTokens.token, token)));
}
