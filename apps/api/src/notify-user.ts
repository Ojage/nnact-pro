import { db, notifications } from "@nnact/db";
import type { NotificationDTO } from "@nnact/shared";
import { publishUserLiveEvent } from "./realtime-hub.js";
import { sendPushToUser } from "./push.js";

/** In-app notification + live SSE + optional Firebase push — never throws. */
export async function safeNotifyUser(
  orgId: string,
  userId: string,
  input: { type: string; title: string; body?: string; link?: string; jobId?: string },
): Promise<NotificationDTO | null> {
  try {
    const [row] = await db
      .insert(notifications)
      .values({
        orgId,
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        read: false,
      })
      .returning();

    if (!row) return null;

    const notification: NotificationDTO = {
      id: row.id,
      orgId: row.orgId,
      userId: row.userId,
      type: row.type,
      title: row.title,
      body: row.body,
      link: row.link,
      read: row.read,
      createdAt: row.createdAt.toISOString(),
    };

    publishUserLiveEvent(userId, { kind: "notification", notification });
    publishUserLiveEvent(userId, {
      kind: "field_refresh",
      reason: input.type,
      jobId: input.jobId,
    });

    void sendPushToUser(userId, {
      title: input.title,
      body: input.body,
      link: input.link,
      data: {
        kind: "notification",
        type: input.type,
        notificationId: row.id,
        jobId: input.jobId ?? "",
        link: input.link ?? "",
      },
    });

    return notification;
  } catch {
    return null;
  }
}
