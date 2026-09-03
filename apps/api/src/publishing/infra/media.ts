// Media provider — resolves content_media ids into publishable items usable by
// provider adapters (absolute URL, mime, alt text). Requires the public API URL
// so external providers can fetch the file. Approved-for-marketing is enforced
// here so operational photos never leak to external channels automatically.
import { and, eq, inArray } from "drizzle-orm";
import { db, contentItems, contentMedia } from "@nnact/db";
import type { PublishMediaItem } from "@nnact/shared";
import type { MediaProviderPort } from "../ports/index.js";

export interface MediaProviderDeps {
  publicApiBaseUrl: string;
}

export class DbMediaProvider implements MediaProviderPort {
  constructor(private readonly deps: MediaProviderDeps) {}

  async resolveForPublication(orgId: string, mediaIds: string[]): Promise<PublishMediaItem[]> {
    if (mediaIds.length === 0) return [];
    const rows = await db
      .select()
      .from(contentMedia)
      .where(and(eq(contentMedia.orgId, orgId), eq(contentMedia.approvedForMarketing, true), inArray(contentMedia.id, mediaIds)));
    const byId = new Map(rows.map((r) => [r.id, r]));
    return mediaIds
      .map((id) => byId.get(id))
      .filter((r): r is typeof contentMedia.$inferSelect => Boolean(r))
      .map((r) => this.toItem(orgId, r));
  }

  async resolveFeatured(orgId: string, contentId: string): Promise<PublishMediaItem[]> {
    const [content] = await db.select().from(contentItems).where(and(eq(contentItems.orgId, orgId), eq(contentItems.id, contentId))).limit(1);
    if (!content?.featuredMediaId) return [];
    const [media] = await db
      .select()
      .from(contentMedia)
      .where(and(eq(contentMedia.orgId, orgId), eq(contentMedia.id, content.featuredMediaId), eq(contentMedia.approvedForMarketing, true)))
      .limit(1);
    return media ? [this.toItem(orgId, media)] : [];
  }

  private toItem(orgId: string, row: typeof contentMedia.$inferSelect): PublishMediaItem {
    const base = this.deps.publicApiBaseUrl.replace(/\/$/, "");
    return {
      id: row.id,
      url: `${base}/api/v1/public/media/${row.id}`,
      contentType: row.contentType,
      altText: row.altText,
      caption: row.caption,
    };
  }
}
