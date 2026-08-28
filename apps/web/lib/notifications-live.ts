import type { LiveUserEvent, NotificationDTO } from "@nnact/shared";
import { api } from "./api";
import {
  initFirebaseMessaging,
  listenForegroundMessages,
  registerWebPushToken,
} from "./firebase-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type LiveNotificationHandlers = {
  onUnreadCount?: (count: number) => void;
  onNotification?: (notification: NotificationDTO) => void;
  onFieldRefresh?: (reason: string, jobId?: string) => void;
};

export function connectNotificationStream(
  accessToken: string,
  handlers: LiveNotificationHandlers,
): () => void {
  const url = `${API_BASE}/api/notifications/stream?access_token=${encodeURIComponent(accessToken)}`;
  const source = new EventSource(url);

  source.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as LiveUserEvent;
      if (payload.kind === "notification") {
        handlers.onNotification?.(payload.notification);
        void api.unreadNotificationCount().then((r) => handlers.onUnreadCount?.(r.count));
      } else if (payload.kind === "field_refresh") {
        handlers.onFieldRefresh?.(payload.reason, payload.jobId);
      } else if (payload.kind === "voice_note") {
        window.dispatchEvent(
          new CustomEvent("nnact:voice-note", {
            detail: { jobId: payload.voiceNote.jobId, voiceNote: payload.voiceNote },
          }),
        );
        void api.unreadNotificationCount().then((r) => handlers.onUnreadCount?.(r.count));
      }
    } catch {
      /* ignore malformed events */
    }
  };

  source.onerror = () => {
    source.close();
  };

  return () => source.close();
}

export async function bootstrapLiveNotifications(
  accessToken: string,
  handlers: LiveNotificationHandlers,
): Promise<() => void> {
  const teardowns: Array<() => void> = [];

  teardowns.push(connectNotificationStream(accessToken, handlers));

  try {
    await registerWebPushToken(API_BASE, accessToken);
    const messaging = await initFirebaseMessaging();
    if (messaging) {
      const unsub = listenForegroundMessages(messaging, (payload) => {
        if (payload.data?.kind === "notification") {
          void api.unreadNotificationCount().then((r) => handlers.onUnreadCount?.(r.count));
        }
        if (payload.data?.kind === "notification" || payload.data?.field_refresh) {
          handlers.onFieldRefresh?.(payload.data.type ?? "push", payload.data.jobId);
        }
        if (payload.data?.kind === "voice_note" && payload.data.jobId) {
          window.dispatchEvent(
            new CustomEvent("nnact:voice-note", {
              detail: { jobId: payload.data.jobId, voiceNote: { id: payload.data.voiceNoteId } },
            }),
          );
          void api.unreadNotificationCount().then((r) => handlers.onUnreadCount?.(r.count));
        }
      });
      teardowns.push(unsub);
    }
  } catch {
    /* push is optional */
  }

  return () => teardowns.forEach((fn) => fn());
}
