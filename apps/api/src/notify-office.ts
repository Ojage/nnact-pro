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

/** Push any new expense submission every pre-approval state to the office. */
export async function notifyExpenseSubmittedToOffice(
  orgId: string,
  authorUserId: string,
  authorName: string,
  expenseNumber: string,
  expenseTitle: string,
  amountCents: number,
): Promise<void> {
  const recipients = await listOfficeStaffUserIds(orgId, authorUserId);
  const title = `Expense submitted · ${expenseNumber}`;
  const body = `${authorName} submitted "${expenseTitle}" for ${(amountCents / 100).toFixed(2)}`;
  for (const userId of recipients) {
    void safeNotifyUser(orgId, userId, { type: "expense.submitted", title, body, link: "/finance/expenses" });
  }
}

/** Push any new advance request to the office. */
export async function notifyAdvanceRequestedToOffice(
  orgId: string,
  authorUserId: string,
  authorName: string,
  advanceNumber: string,
  amountCents: number,
): Promise<void> {
  const recipients = await listOfficeStaffUserIds(orgId, authorUserId);
  const title = `Advance requested · ${advanceNumber}`;
  const body = `${authorName} requested a cash advance of ${(amountCents / 100).toFixed(2)}`;
  for (const userId of recipients) {
    void safeNotifyUser(orgId, userId, { type: "advance.requested", title, body, link: "/finance/advances" });
  }
}

/** Push any new reimbursement claim to the office. */
export async function notifyReimbursementSubmittedToOffice(
  orgId: string,
  authorUserId: string,
  authorName: string,
  reimbursementNumber: string,
  amountCents: number,
): Promise<void> {
  const recipients = await listOfficeStaffUserIds(orgId, authorUserId);
  const title = `Reimbursement submitted · ${reimbursementNumber}`;
  const body = `${authorName} claimed reimbursement of ${(amountCents / 100).toFixed(2)}`;
  for (const userId of recipients) {
    void safeNotifyUser(orgId, userId, { type: "reimbursement.submitted", title, body, link: "/finance/reimbursements" });
  }
}
