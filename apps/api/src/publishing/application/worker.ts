// Publication worker — drains the outbox and executes provider adapters.
// Runs inside the existing polling worker loop (apps/worker). It owns the
// attempt lifecycle, retry policy, and per-channel status persistence. It never
// blocks an HTTP request and never touches provider SDKs directly (uses the
// registry + ports).
import { and, eq, lte } from "drizzle-orm";
import { db } from "@nnact/db";
import { channelPublications, contentItems, channelVariants, publicationOutbox } from "@nnact/db";
import type { PublishingChannel, PublishingProviderPort, PublishRequest } from "@nnact/shared";
import { bodyDocumentToChannelPayload } from "@nnact/shared";
import type { PublishingProviderRegistry } from "../registry.js";
import type { MediaProviderPort } from "../ports/index.js";
import { DbPublicationRepository, claimDueOutbox, markOutboxProcessed, markOutboxFailed, transitionPublication } from "../infra/publication-repo.js";
import { getContentItem } from "../infra/content-repo.js";
import { backoffMs, MAX_ATTEMPTS, isRetryableCode } from "../domain/errors.js";
import { contentAudit } from "../infra/audit.js";

export interface WorkerDeps {
  registry: PublishingProviderRegistry;
  media: MediaProviderPort;
  publicationRepo?: DbPublicationRepository;
}

export interface WorkerSummary {
  processed: number;
  succeeded: number;
  failed: number;
  promoted: number;
}

export class PublicationWorker {
  private readonly repo: DbPublicationRepository;

  constructor(private readonly deps: WorkerDeps) {
    this.repo = deps.publicationRepo ?? new DbPublicationRepository();
  }

  /**
   * One sweep: promote due scheduled publications, then process pending outbox
   * rows. Idempotent and never throws (errors are captured per-publication).
   */
  async sweep(now: Date = new Date()): Promise<WorkerSummary> {
    const promoted = await this.promoteDue(now);
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    const rows = await claimDueOutbox();
    for (const row of rows) {
      processed++;
      const pub = await this.loadPublication(row.orgId, row.publicationId);
      if (!pub) {
        await markOutboxProcessed(row.orgId, row.id);
        continue;
      }
      try {
        const ok = await this.executePublication(row.orgId, row.publicationId, pub.channel, now);
        if (ok) succeeded++;
        else failed++;
        await markOutboxProcessed(row.orgId, row.id);
      } catch (err) {
        failed++;
        const message = (err as Error)?.message ?? "unknown error";
        await markOutboxFailed(row.orgId, row.id, message.slice(0, 500));
      }
    }

    return { processed, succeeded, failed, promoted };
  }

  /** Move SCHEDULED publications whose time has come to READY + enqueue them. */
  private async promoteDue(now: Date): Promise<number> {
    const due = await db
      .select()
      .from(channelPublications)
      .where(and(eq(channelPublications.status, "SCHEDULED"), lte(channelPublications.scheduledAt, now)))
      .limit(100);
    let promoted = 0;
    for (const pub of due) {
      const ok = await transitionPublication(pub.orgId, pub.id, "READY");
      if (!ok) continue;
      await db.insert(publicationOutbox).values({
        orgId: pub.orgId,
        publicationId: pub.id,
        eventType: "publish",
        payload: { contentId: pub.contentId, channel: pub.channel },
        status: "pending",
        nextAttemptAt: new Date(),
      });
      promoted++;
    }
    return promoted;
  }

  private async loadPublication(orgId: string, publicationId: string): Promise<typeof channelPublications.$inferSelect | null> {
    const [row] = await db
      .select()
      .from(channelPublications)
      .where(and(eq(channelPublications.orgId, orgId), eq(channelPublications.id, publicationId)))
      .limit(1);
    return row ?? null;
  }

  private async executePublication(orgId: string, publicationId: string, channel: PublishingChannel, now: Date): Promise<boolean> {
    const provider = this.deps.registry.get(channel);
    const [pubRow] = await db
      .select()
      .from(channelPublications)
      .where(and(eq(channelPublications.orgId, orgId), eq(channelPublications.id, publicationId)))
      .limit(1);
    if (!pubRow) return false;

    const content = await getContentItem(orgId, pubRow.contentId);
    if (!content) return false;

    await transitionPublication(orgId, publicationId, "PUBLISHING");
    const attemptNumber = (await this.repo.incrementAttemptCount(orgId, publicationId)) + 1;

    const request = await this.buildRequest(orgId, pubRow, content, provider);
    const validationIssues = provider.validateContent(request);
    if (validationIssues.length > 0) {
      await this.repo.recordAttempt({
        orgId, publicationId, attemptNumber, startedAt: now, completedAt: new Date(),
        errorCode: validationIssues[0].code, errorMessage: validationIssues[0].message, retryable: false,
      });
      const issue = validationIssues[0];
      await this.repo.markFailed({ orgId, publicationId, error: { code: issue.code, message: issue.message, retryable: false }, attemptNumber });
      await contentAudit(orgId, { contentId: pubRow.contentId, publicationId, action: "publication.failed", details: { channel, reason: issue.message } });
      return false;
    }

    // Attempt loop with exponential backoff + jitter.
    let attempt = 0;
    while (true) {
      const started = new Date();
      try {
        const result = await provider.publish(request);
        await this.repo.recordAttempt({
          orgId, publicationId, attemptNumber: attempt + 1, startedAt: started, completedAt: new Date(),
          providerStatus: result.providerStatus, retryable: false, providerRequestId: result.providerPublicationId,
        });
        await this.repo.markSucceeded({
          orgId, publicationId,
          providerPublicationId: result.providerPublicationId,
          externalUrl: result.externalUrl ?? null,
          publishedAt: result.publishedAt,
          providerStatus: result.providerStatus,
        });
        await contentAudit(orgId, {
          contentId: pubRow.contentId, publicationId, action: "publication.succeeded",
          details: { channel, providerPublicationId: result.providerPublicationId, externalUrl: result.externalUrl },
        });
        await this.maybeFinalizeContent(orgId, pubRow.contentId);
        return true;
      } catch (err) {
        const normalized = (err as { normalized?: { code: string; message: string; retryable: boolean } })?.normalized
          ?? { code: "UNKNOWN_PROVIDER_ERROR", message: (err as Error)?.message ?? "error", retryable: true };
        const code = normalized.code as never;
        const retryable = normalized.retryable && isRetryableCode(code);
        await this.repo.recordAttempt({
          orgId, publicationId, attemptNumber: attempt + 1, startedAt: started, completedAt: new Date(),
          errorCode: code, errorMessage: normalized.message, retryable,
        });
        if (!retryable || attempt + 1 >= MAX_ATTEMPTS) {
          await this.repo.markFailed({ orgId, publicationId, error: { code, message: normalized.message, retryable }, attemptNumber: attempt + 1 });
          await contentAudit(orgId, {
            contentId: pubRow.contentId, publicationId, action: "publication.failed",
            details: { channel, code, message: normalized.message, attempt: attempt + 1 },
          });
          await this.notifyFailure(orgId, pubRow.contentId, channel, normalized.message);
          return false;
        }
        attempt++;
        await new Promise((r) => setTimeout(r, backoffMs(attempt)));
      }
    }
  }

  private async buildRequest(
    orgId: string,
    pubRow: typeof channelPublications.$inferSelect,
    content: Awaited<ReturnType<typeof getContentItem>>,
    provider: PublishingProviderPort,
  ): Promise<PublishRequest> {
    const nonNullContent = content!;
    const [variantRow] = await db
      .select()
      .from(channelVariants)
      .where(and(eq(channelVariants.orgId, orgId), eq(channelVariants.contentId, pubRow.contentId), eq(channelVariants.channel, pubRow.channel as never)))
      .limit(1);

    // Resolve media for the channel variant (respecting approved-for-marketing).
    let mediaIds: string[] = [];
    if (variantRow?.mediaOverrideId) mediaIds = [variantRow.mediaOverrideId];
    else if (nonNullContent.seo?.openGraphMediaId) mediaIds = [nonNullContent.seo.openGraphMediaId];
    else if (nonNullContent.featuredMediaId) mediaIds = [nonNullContent.featuredMediaId];
    const media = await this.deps.media.resolveForPublication(orgId, mediaIds);

    // Body text for the channel. Explicit variants win; otherwise derive from the
    // canonical document with provider-aware truncation (social character limits,
    // custom-block degradation). Falls back to the legacy plain-text body.
    let body = variantRow?.bodyOverride || variantRow?.caption || "";
    if (!body) {
      if (nonNullContent.bodyDocument && Array.isArray(nonNullContent.bodyDocument)) {
        body = bodyDocumentToChannelPayload(nonNullContent.bodyDocument as Parameters<typeof bodyDocumentToChannelPayload>[0], provider.capabilities).text;
      } else {
        body = nonNullContent.body;
      }
    }

    return {
      publicationId: pubRow.id,
      organizationId: orgId,
      contentId: pubRow.contentId,
      channel: pubRow.channel,
      title: variantRow?.titleOverride || nonNullContent.title,
      body,
      excerpt: nonNullContent.summary,
      caption: variantRow?.caption ?? nonNullContent.summary ?? undefined,
      canonicalUrl: (nonNullContent.seo?.canonicalUrl as string | undefined) ?? this.canonical(orgId, pubRow.channel, nonNullContent.slug),
      hashtags: (variantRow?.hashtags as string[] | undefined) ?? [],
      media,
      scheduledAt: pubRow.scheduledAt,
      idempotencyKey: pubRow.idempotencyKey,
      metadata: { slug: nonNullContent.slug, pageId: undefined },
    };
  }

  private canonical(_orgId: string, _channel: PublishingChannel, slug: string): string {
    const base = process.env.PUBLIC_WEB_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
    // Website is the canonical destination for public articles.
    return `${base}/blog/${slug}`;
  }

  private async maybeFinalizeContent(orgId: string, contentId: string): Promise<void> {
    // If every enabled publication is PUBLISHED, mark content PUBLISHED.
    const pubs = await db
      .select()
      .from(channelPublications)
      .where(and(eq(channelPublications.orgId, orgId), eq(channelPublications.contentId, contentId)));
    const nonDraft = pubs.filter((p) => p.status !== "CANCELLED" && p.status !== "DRAFT");
    if (nonDraft.length > 0 && nonDraft.every((p) => p.status === "PUBLISHED")) {
      await db.update(contentItems).set({ status: "PUBLISHED", publishedAt: new Date(), updatedAt: new Date() }).where(eq(contentItems.id, contentId));
    }
  }

  private async notifyFailure(orgId: string, contentId: string, channel: PublishingChannel, message: string): Promise<void> {
    // Best-effort in-app notification to office staff.
    try {
      const { safeNotifyUser } = await import("../../notify-user.js");
      const { listOfficeStaffUserIds } = await import("../../notify-office.js");
      const members = await listOfficeStaffUserIds(orgId);
      await Promise.all(
        members.map((id) =>
          safeNotifyUser(orgId, id, {
            type: "publication.failed",
            title: `Publication failed on ${channel}`,
            body: message,
            link: `/content/${contentId}`,
          }),
        ),
      );
    } catch {
      // notifications are best-effort
    }
  }
}
