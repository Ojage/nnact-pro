// Unpublish use case — takes content off the website and, where the provider
// supports deletion, removes external social posts. Only supported actions are
// exposed based on provider capabilities.
import { and, eq } from "drizzle-orm";
import { db, channelPublications, contentItems } from "@nnact/db";
import { PublishingProviderRegistry } from "../registry.js";
import { transitionPublication } from "../infra/publication-repo.js";
import { contentAudit } from "../infra/audit.js";

export interface UnpublishResult {
  contentId: string;
  removedExternal: number;
  archived: boolean;
}

export class UnpublishContentUseCase {
  constructor(private readonly registry: PublishingProviderRegistry) {}

  async unpublish(orgId: string, contentId: string, actorId: string, opts: { deleteExternal?: boolean } = {}): Promise<UnpublishResult> {
    const pubs = await db
      .select()
      .from(channelPublications)
      .where(and(eq(channelPublications.orgId, orgId), eq(channelPublications.contentId, contentId)));

    let removedExternal = 0;
    for (const pub of pubs) {
      if (pub.status !== "PUBLISHED") {
        // Cancel pending/unpublished publications outright.
        await transitionPublication(orgId, pub.id, "CANCELLED");
        continue;
      }
      if (opts.deleteExternal && pub.providerPublicationId && pub.channel !== "WEBSITE") {
        const provider = this.registry.get(pub.channel);
        if (provider.capabilities.supportsDelete && provider.deleteOrUnpublish) {
          try {
            await provider.deleteOrUnpublish(orgId, pub.providerPublicationId);
            removedExternal++;
            await contentAudit(orgId, { contentId, publicationId: pub.id, actorId, action: "publication.deleted_external", details: { channel: pub.channel } });
          } catch {
            // External delete failed — leave the row so an operator can retry.
            await contentAudit(orgId, { contentId, publicationId: pub.id, actorId, action: "publication.delete_external_failed", details: { channel: pub.channel } });
            continue;
          }
        }
      }
      await transitionPublication(orgId, pub.id, "CANCELLED");
    }

    // Website publication is revoked by removing it from the public content set
    // (status → ARCHIVED). External posts may remain live unless deleted above.
    const [content] = await db.select().from(contentItems).where(and(eq(contentItems.orgId, orgId), eq(contentItems.id, contentId))).limit(1);
    const canArchive = content && (content.status === "PUBLISHED" || content.status === "PUBLISHING" || content.status === "SCHEDULED");
    if (canArchive) {
      await db.update(contentItems).set({ status: "ARCHIVED", updatedAt: new Date() }).where(eq(contentItems.id, contentId));
    }
    await contentAudit(orgId, { contentId, actorId, action: "content.unpublished", details: { deleteExternal: opts.deleteExternal, removedExternal } });

    return { contentId, removedExternal, archived: Boolean(canArchive) };
  }
}
