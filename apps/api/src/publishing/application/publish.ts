// Application publishing use cases — orchestrate the domain through ports and
// providers. No provider SDK and no HTTP to social platforms appears here; the
// registry + adapters own that. This is where the atomic outbox + publication
// records are created so the worker can publish reliably and idempotently.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@nnact/db";
import { channelPublications, contentItems, publicationOutbox } from "@nnact/db";
import type { ChannelPublicationDTO, PublishingChannel } from "@nnact/shared";
import type { PublishingProviderRegistry } from "../registry.js";
import type { MediaProviderPort } from "../ports/index.js";
import { getContentItem, getVariants } from "../infra/content-repo.js";
import { mapPublication } from "../infra/publication-repo.js";
import { assertContentTransition, type ContentTransitionTarget } from "./content-status.js";
import { contentAudit } from "../infra/audit.js";

export interface PublishUseCaseDeps {
  registry: PublishingProviderRegistry;
  media: MediaProviderPort;
}

export interface PublishNowInput {
  orgId: string;
  contentId: string;
  actorId: string;
  channels: PublishingChannel[];
  scheduledAt?: Date | null;
}

export interface PublishOutcome {
  contentId: string;
  status: ContentTransitionTarget;
  publications: ChannelPublicationDTO[];
}

export class PublishContentUseCase {
  constructor(private readonly deps: PublishUseCaseDeps) {}

  /** Publish now (or schedule). Atomically creates publications + journals outbox. */
  async publish(input: PublishNowInput): Promise<PublishOutcome> {
    const content = await getContentItem(input.orgId, input.contentId);
    if (!content) throw Object.assign(new Error("content not found"), { statusCode: 404 });

    const isScheduled = Boolean(input.scheduledAt);
    const target: ContentTransitionTarget = isScheduled ? "SCHEDULED" : "PUBLISHING";
    assertContentTransition(content.status, target);

    const variants = await getVariants(input.orgId, input.contentId);
    const variantByChannel = new Map(variants.map((v) => [v.channel, v]));
    const targetChannels = input.channels.filter((c) => {
      const variant = variantByChannel.get(c);
      return !variant || variant.enabled !== false;
    });

    if (targetChannels.length === 0) {
      throw Object.assign(new Error("no enabled channels to publish to"), { statusCode: 400 });
    }

    const publications: ChannelPublicationDTO[] = await db.transaction(async (tx) => {
      const created: ChannelPublicationDTO[] = [];
      for (const channel of targetChannels) {
        const idempotencyKey = `${input.contentId}:${channel}:${content.revision}`;
        const [existing] = await tx
          .select()
          .from(channelPublications)
          .where(and(eq(channelPublications.contentId, input.contentId), eq(channelPublications.channel, channel as never)))
          .limit(1);
        if (existing) {
          created.push(mapPublication(existing));
          continue;
        }
        const [pub] = await tx
          .insert(channelPublications)
          .values({
            orgId: input.orgId,
            contentId: input.contentId,
            channel: channel as never,
            status: isScheduled ? "SCHEDULED" : "READY",
            scheduledAt: input.scheduledAt ?? null,
            idempotencyKey,
          })
          .returning();
        created.push(mapPublication(pub));
      }

      for (const pub of created) {
        if (pub.status === "DRAFT" || pub.status === "SCHEDULED") continue;

        // Re-publishing an already-published piece is an "update": keep the same
        // external post and push new content to it. Skip anything queued,
        // in flight, or already delivered for this exact revision so repeated
        // clicks can't fan out duplicate events. Retry re-queues its own events
        // (no revision in payload) and is unaffected by this guard.
        const [alreadyHandled] = await tx
          .select({ id: publicationOutbox.id })
          .from(publicationOutbox)
          .where(
            and(
              eq(publicationOutbox.publicationId, pub.id),
              sql`${publicationOutbox.status} <> 'failed'`,
              sql`${publicationOutbox.payload}->>'revision' = ${String(content.revision)}`,
            ),
          )
          .limit(1);
        if (alreadyHandled) continue;

        const isUpdate = pub.status === "PUBLISHED" && content.status === "PUBLISHED";
        await tx.insert(publicationOutbox).values({
          orgId: input.orgId,
          publicationId: pub.id,
          eventType: isUpdate ? "update" : "publish",
          payload: {
            contentId: input.contentId,
            channel: pub.channel,
            revision: content.revision,
            ...(isUpdate && pub.providerPublicationId ? { providerPublicationId: pub.providerPublicationId } : {}),
          },
          status: "pending",
          nextAttemptAt: new Date(),
        });
      }
      return created;
    });

    await db
      .update(contentItems)
      // Publishing an extra channel must not regress an item that is already
      // live on the canonical website; otherwise a failing side channel (e.g.
      // LinkedIn) leaves the article stuck in PUBLISHING and invisible publicly.
      .set({
        status: content.status === "PUBLISHED" ? "PUBLISHED" : target,
        scheduledAt: input.scheduledAt ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(contentItems.orgId, input.orgId), eq(contentItems.id, input.contentId)));

    await contentAudit(input.orgId, {
      contentId: input.contentId,
      actorId: input.actorId,
      action: isScheduled ? "content.scheduled" : "content.publish_requested",
      details: { channels: targetChannels },
    });

    return { contentId: input.contentId, status: target, publications };
  }

  /** Convenience alias so callers always go through the same path. */
  async schedule(input: PublishNowInput & { scheduledAt: Date }): Promise<PublishOutcome> {
    return this.publish({ ...input, scheduledAt: input.scheduledAt });
  }
}
