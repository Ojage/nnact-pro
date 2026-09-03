// Content audit log — records who did what (create/edit/approve/schedule/
// publish/reconnect/retry) against content and publications. Best-effort; never
// throws so the user-visible action is never blocked by logging.
import { db, contentAuditLog } from "@nnact/db";

export async function contentAudit(
  orgId: string,
  input: {
    contentId?: string | null;
    publicationId?: string | null;
    actorId?: string | null;
    action: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db.insert(contentAuditLog).values({
      orgId,
      contentId: input.contentId ?? null,
      publicationId: input.publicationId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      details: input.details ?? {},
    });
  } catch (err) {
    console.error(`[content-audit] emit failed (action=${input.action}):`, err);
  }
}
