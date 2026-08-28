import { and, eq, inArray } from "drizzle-orm";
import { db, users } from "@nnact/db";
import type { JobVoiceNoteDTO } from "@nnact/shared";
import { safeNotifyUser } from "./notify-user.js";
import { publishUserLiveEvent } from "./realtime-hub.js";
import { sendPushToUser } from "./push.js";

export async function listOfficeStaffUserIds(orgId: string, excludeUserId?: string): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.orgId, orgId),
        eq(users.active, true),
        inArray(users.role, ["owner", "dispatcher"]),
      ),
    );
  return rows.map((row) => row.id).filter((id) => id !== excludeUserId);
}

/** Notify dispatchers/owners instantly when a technician uploads a voice note. */
export async function notifyVoiceNoteReceived(
  orgId: string,
  authorUserId: string,
  authorName: string,
  jobId: string,
  jobTitle: string,
  voiceNote: JobVoiceNoteDTO,
): Promise<void> {
  const recipients = await listOfficeStaffUserIds(orgId, authorUserId);
  const title = `Voice note · ${jobTitle}`;
  const body = `${authorName} sent a field voice update (${formatDuration(voiceNote.durationMs)})`;

  for (const userId of recipients) {
    void safeNotifyUser(orgId, userId, {
      type: "voice_note",
      title,
      body,
      link: `/jobs/${jobId}`,
      jobId,
    });
    publishUserLiveEvent(userId, { kind: "voice_note", voiceNote });
    void sendPushToUser(userId, {
      title,
      body,
      link: `/jobs/${jobId}`,
      data: {
        kind: "voice_note",
        voiceNoteId: voiceNote.id,
        jobId,
        link: `/jobs/${jobId}`,
      },
    });
  }
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}:${String(sec).padStart(2, "0")}` : `${sec}s`;
}
