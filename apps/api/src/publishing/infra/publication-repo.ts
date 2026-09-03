// Publication repository — persists channel publications, attempts, and the
// outbox. Enforces the state machine transition on status changes so two
// workers cannot double-publish. All org-scoped.
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@nnact/db";
import {
  channelPublications,
  publicationAttempts,
  publicationOutbox,
} from "@nnact/db";
import type { ChannelPublicationDTO, NormalizedProviderError, PublishingErrorCode } from "@nnact/shared";
import { assertTransition } from "../domain/state-machine.js";
import type { PublicationOutboxPort, PublicationRepositoryPort } from "../ports/index.js";

function iso(v: Date | null | undefined): string | undefined {
  return v ? v.toISOString() : undefined;
}

export function mapPublication(row: typeof channelPublications.$inferSelect): ChannelPublicationDTO {
  return {
    id: row.id,
    contentId: row.contentId,
    channel: row.channel,
    status: row.status,
    providerPublicationId: row.providerPublicationId,
    externalUrl: row.externalUrl,
    scheduledAt: iso(row.scheduledAt),
    publishedAt: iso(row.publishedAt),
    lastErrorCode: row.lastErrorCode as PublishingErrorCode | null,
    lastErrorMessage: row.lastErrorMessage,
    attemptCount: row.attemptCount,
    createdAt: iso(row.createdAt) ?? "",
    updatedAt: iso(row.updatedAt) ?? "",
  };
}

export async function getPublication(orgId: string, publicationId: string): Promise<typeof channelPublications.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(channelPublications)
    .where(and(eq(channelPublications.orgId, orgId), eq(channelPublications.id, publicationId)))
    .limit(1);
  return row ?? null;
}

export async function listPublications(orgId: string, opts: { channel?: string; status?: string; limit: number; offset: number }): Promise<{ items: ChannelPublicationDTO[]; total: number }> {
  const conditions = [eq(channelPublications.orgId, orgId)];
  if (opts.channel) conditions.push(eq(channelPublications.channel, opts.channel as never));
  if (opts.status) conditions.push(eq(channelPublications.status, opts.status as never));
  const where = and(...conditions);
  const rows = await db
    .select()
    .from(channelPublications)
    .where(where)
    .orderBy(descCreated())
    .limit(opts.limit)
    .offset(opts.offset);
  const [totalRow] = await db.select({ value: sql<number>`count(*)::int` }).from(channelPublications).where(where);
  return { items: rows.map(mapPublication), total: totalRow?.value ?? 0 };
}

function descCreated() {
  return sql`${channelPublications.createdAt} DESC`;
}

async function transition(orgId: string, publicationId: string, to: (typeof channelPublications.$inferSelect)["status"]): Promise<boolean> {
  const [row] = await db
    .select({ id: channelPublications.id, status: channelPublications.status })
    .from(channelPublications)
    .where(and(eq(channelPublications.orgId, orgId), eq(channelPublications.id, publicationId)))
    .limit(1)
    .for("update");
  if (!row) return false;
  try {
    assertTransition(row.status, to);
  } catch {
    return false;
  }
  await db.update(channelPublications).set({ status: to, updatedAt: new Date() }).where(eq(channelPublications.id, publicationId));
  return true;
}

export class DbPublicationRepository implements PublicationRepositoryPort {
  async recordAttempt(input: {
    orgId: string;
    publicationId: string;
    attemptNumber: number;
    startedAt: Date;
    completedAt?: Date | null;
    providerStatus?: string | null;
    errorCode?: PublishingErrorCode | null;
    errorMessage?: string | null;
    retryable: boolean;
    providerRequestId?: string | null;
  }): Promise<void> {
    await db.insert(publicationAttempts).values({
      orgId: input.orgId,
      publicationId: input.publicationId,
      attemptNumber: input.attemptNumber,
      startedAt: input.startedAt,
      completedAt: input.completedAt ?? null,
      providerStatus: input.providerStatus ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      retryable: input.retryable,
      providerRequestId: input.providerRequestId ?? null,
    });
  }

  async markSucceeded(input: {
    orgId: string;
    publicationId: string;
    providerPublicationId: string;
    externalUrl?: string | null;
    publishedAt: Date;
    providerStatus: string;
  }): Promise<void> {
    await transition(input.orgId, input.publicationId, "PUBLISHED");
    await db
      .update(channelPublications)
      .set({
        providerPublicationId: input.providerPublicationId,
        externalUrl: input.externalUrl ?? null,
        publishedAt: input.publishedAt,
        lastErrorCode: null,
        lastErrorMessage: null,
        scheduledAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(channelPublications.orgId, input.orgId), eq(channelPublications.id, input.publicationId)));
  }

  async markFailed(input: {
    orgId: string;
    publicationId: string;
    error: NormalizedProviderError;
    attemptNumber: number;
  }): Promise<void> {
    const to = input.error.retryable ? "FAILED" : "FAILED";
    await transition(input.orgId, input.publicationId, to);
    await db
      .update(channelPublications)
      .set({
        lastErrorCode: input.error.code,
        lastErrorMessage: input.error.message,
        attemptCount: input.attemptNumber,
        updatedAt: new Date(),
      })
      .where(and(eq(channelPublications.orgId, input.orgId), eq(channelPublications.id, input.publicationId)));
  }

  async incrementAttemptCount(orgId: string, publicationId: string): Promise<number> {
    const [row] = await db
      .update(channelPublications)
      .set({ attemptCount: sql`${channelPublications.attemptCount} + 1`, updatedAt: new Date() })
      .where(and(eq(channelPublications.orgId, orgId), eq(channelPublications.id, publicationId)))
      .returning({ attemptCount: channelPublications.attemptCount });
    return row?.attemptCount ?? 0;
  }
}

export class DbPublicationOutbox implements PublicationOutboxPort {
  async enqueue(input: { orgId: string; publicationId: string; eventType: "publish" | "update" | "delete"; payload: Record<string, unknown> }): Promise<void> {
    await db.insert(publicationOutbox).values({
      orgId: input.orgId,
      publicationId: input.publicationId,
      eventType: input.eventType,
      payload: input.payload,
      status: "pending",
      nextAttemptAt: new Date(),
    });
  }
}

export async function listAttempts(orgId: string, publicationId: string) {
  const rows = await db
    .select()
    .from(publicationAttempts)
    .where(and(eq(publicationAttempts.orgId, orgId), eq(publicationAttempts.publicationId, publicationId)))
    .orderBy(asc(publicationAttempts.attemptNumber));
  return rows;
}

// ── Outbox reader for the worker ──
export interface OutboxRow {
  id: string;
  orgId: string;
  publicationId: string;
  eventType: string;
  status: string;
}

export async function claimDueOutbox(batch = 50): Promise<OutboxRow[]> {
  const rows = await db
    .select({
      id: publicationOutbox.id,
      orgId: publicationOutbox.orgId,
      publicationId: publicationOutbox.publicationId,
      eventType: publicationOutbox.eventType,
      status: publicationOutbox.status,
    })
    .from(publicationOutbox)
    .where(sql`${publicationOutbox.status} = 'pending' AND (${publicationOutbox.nextAttemptAt} IS NULL OR ${publicationOutbox.nextAttemptAt} <= now())`)
    .limit(batch);
  return rows;
}

export async function markOutboxProcessed(orgId: string, outboxId: string): Promise<void> {
  await db.update(publicationOutbox).set({ status: "processed", processedAt: new Date() }).where(and(eq(publicationOutbox.orgId, orgId), eq(publicationOutbox.id, outboxId)));
}

export async function markOutboxFailed(orgId: string, outboxId: string, error: string): Promise<void> {
  await db.update(publicationOutbox).set({ status: "failed", error }).where(and(eq(publicationOutbox.orgId, orgId), eq(publicationOutbox.id, outboxId)));
}

export { transition as transitionPublication };
