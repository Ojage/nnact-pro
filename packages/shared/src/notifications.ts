/** In-app notification row returned by GET /api/notifications. */
export interface NotificationDTO {
  id: string;
  orgId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  read: boolean;
  createdAt: string;
}

/** Server → client live events on GET /api/notifications/stream (SSE). */
export type LiveUserEvent =
  | { kind: "notification"; notification: NotificationDTO }
  | { kind: "field_refresh"; reason: string; jobId?: string }
  | { kind: "voice_note"; voiceNote: JobVoiceNoteDTO };

/** Technician field voice note on a job. */
export interface JobVoiceNoteDTO {
  id: string;
  orgId: string;
  jobId: string;
  authorUserId: string;
  authorName: string;
  durationMs: number;
  contentType: string;
  fileSize?: number | null;
  fileName?: string | null;
  createdAt: string;
}
