// Retry publication use case — re-queue a previously failed publication (or
// publish a READY one) by journaling a fresh outbox event.
import { and, eq } from "drizzle-orm";
import { db, publicationOutbox } from "@nnact/db";
import type { ChannelPublicationDTO } from "@nnact/shared";
import { getPublication, mapPublication, transitionPublication } from "../infra/publication-repo.js";
import { contentAudit } from "../infra/audit.js";

export class RetryPublicationUseCase {
  async retry(orgId: string, publicationId: string, actorId: string): Promise<ChannelPublicationDTO> {
    const pub = await getPublication(orgId, publicationId);
    if (!pub) throw Object.assign(new Error("publication not found"), { statusCode: 404 });

    if (pub.status === "PUBLISHED") {
      throw Object.assign(new Error("publication is already published"), { statusCode: 400 });
    }

    // Move to READY (allowed from FAILED/SCHEDULED/QUEUED). If it was already
    // QUEUED/PUBLISHING it will be deduplicated by the worker's outbox idempotency.
    const ok = await transitionPublication(orgId, publicationId, "READY");
    if (!ok) throw Object.assign(new Error("publication is not retryable in its current state"), { statusCode: 400 });

    await db.insert(publicationOutbox).values({
      orgId,
      publicationId,
      eventType: "publish",
      payload: { contentId: pub.contentId, channel: pub.channel },
      status: "pending",
      nextAttemptAt: new Date(),
    });

    await contentAudit(orgId, {
      contentId: pub.contentId, publicationId, actorId, action: "publication.retry_requested", details: { channel: pub.channel },
    });

    const updated = await getPublication(orgId, publicationId);
    return mapPublication(updated!);
  }
}
