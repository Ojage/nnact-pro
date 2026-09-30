// Stage 3 — searchable inbox + unified timeline (messages + outbound log).

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  db,
  growthInboxMessages,
  growthInboxThreads,
  growthOutboundMessages,
  growthProspects,
  growthSenderIdentities,
} from "@nnact/db";
import { GROWTH_REPLY_INTENTS } from "@nnact/shared";
import { resolveOrgId } from "./org.js";
import { requireGrowthRead, requireGrowthWrite } from "../growth/access.js";
import { sendThreadReply } from "../growth/reply-send.js";

const uuid = z.string().uuid();

const inboxView = z.enum([
  "all",
  "needs_reply",
  "all_replies",
  "sent",
  "interested",
  "meeting",
  "unsubscribe",
  "complaint",
  "failed",
]);

export async function growthConversationsRoutes(app: FastifyInstance) {
  app.get("/conversations/search", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const query = req.query as { q?: string; limit?: string; view?: string };
    const q = String(query.q ?? "").trim();
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50)));
    const viewParsed = inboxView.safeParse(query.view ?? "all");
    const view = viewParsed.success ? viewParsed.data : "all";

    const conditions = [eq(growthInboxThreads.orgId, orgId)];
    if (view === "needs_reply") {
      conditions.push(eq(growthInboxThreads.needsHumanReply, true));
    } else if (view === "all_replies") {
      conditions.push(
        sql`exists (
          select 1 from growth_inbox_messages m
          where m.thread_id = ${growthInboxThreads.id} and m.org_id = ${orgId} and m.direction = 'INBOUND'
        )`,
      );
    } else if (view === "sent") {
      conditions.push(
        sql`exists (
          select 1 from growth_inbox_messages m
          where m.thread_id = ${growthInboxThreads.id} and m.org_id = ${orgId} and m.direction = 'OUTBOUND'
        )`,
      );
    } else if (view === "interested") {
      conditions.push(
        sql`exists (
          select 1 from growth_inbox_messages m
          where m.thread_id = ${growthInboxThreads.id} and m.org_id = ${orgId} and m.direction = 'INBOUND'
            and m.intent in ('INTERESTED', 'SCHEDULING')
        )`,
      );
    } else if (view === "meeting") {
      conditions.push(
        sql`exists (
          select 1 from growth_inbox_messages m
          where m.thread_id = ${growthInboxThreads.id} and m.org_id = ${orgId} and m.direction = 'INBOUND'
            and m.intent = 'SCHEDULING'
        )`,
      );
    } else if (view === "unsubscribe") {
      conditions.push(
        sql`exists (
          select 1 from growth_inbox_messages m
          where m.thread_id = ${growthInboxThreads.id} and m.org_id = ${orgId} and m.direction = 'INBOUND'
            and m.intent = 'UNSUBSCRIBE'
        )`,
      );
    } else if (view === "complaint") {
      conditions.push(
        sql`exists (
          select 1 from growth_inbox_messages m
          where m.thread_id = ${growthInboxThreads.id} and m.org_id = ${orgId} and m.direction = 'INBOUND'
            and m.intent = 'COMPLAINT'
        )`,
      );
    } else if (view === "failed") {
      conditions.push(
        sql`exists (
          select 1 from growth_outbound_messages o
          where o.inbox_thread_id = ${growthInboxThreads.id} and o.org_id = ${orgId}
            and o.status in ('FAILED', 'BLOCKED')
        )`,
      );
    }

    if (q) {
      const needle = `%${q}%`;
      conditions.push(
        or(
          ilike(growthProspects.companyName, needle),
          ilike(growthInboxThreads.subject, needle),
          sql`exists (
            select 1 from growth_inbox_messages m
            where m.thread_id = ${growthInboxThreads.id}
              and m.org_id = ${orgId}
              and m.body_text ilike ${needle}
          )`,
        )!,
      );
    }

    const rows = await db
      .select({
        thread: growthInboxThreads,
        companyName: growthProspects.companyName,
        senderEmail: growthSenderIdentities.email,
        senderDisplayName: growthSenderIdentities.displayName,
      })
      .from(growthInboxThreads)
      .innerJoin(growthProspects, eq(growthInboxThreads.prospectId, growthProspects.id))
      .leftJoin(growthSenderIdentities, eq(growthInboxThreads.senderIdentityId, growthSenderIdentities.id))
      .where(and(...conditions))
      .orderBy(desc(growthInboxThreads.lastMessageAt))
      .limit(limit);

    const threadIds = rows.map((r) => r.thread.id);
    const latestIntents =
      threadIds.length === 0
        ? []
        : await db.execute<{ thread_id: string; intent: string | null }>(sql`
            select distinct on (thread_id) thread_id, intent
            from growth_inbox_messages
            where org_id = ${orgId} and direction = 'INBOUND'
              and thread_id in (${sql.join(
                threadIds.map((id) => sql`${id}`),
                sql`, `,
              )})
            order by thread_id, created_at desc
          `);
    const intentByThread = new Map(
      (latestIntents as unknown as { thread_id: string; intent: string | null }[]).map((r) => [
        r.thread_id,
        r.intent,
      ]),
    );

    return rows.map(({ thread, companyName, senderEmail, senderDisplayName }) => {
      const lastIntent = intentByThread.get(thread.id);
      const intentOk =
        !lastIntent || (GROWTH_REPLY_INTENTS as readonly string[]).includes(lastIntent)
          ? lastIntent
          : "OTHER";
      return {
        id: thread.id,
        prospectId: thread.prospectId,
        companyName,
        subject: thread.subject,
        lastMessageAt: thread.lastMessageAt.toISOString(),
        needsHumanReply: thread.needsHumanReply,
        verificationRequestedAt: thread.verificationRequestedAt?.toISOString() ?? null,
        senderEmail,
        senderDisplayName,
        lastIntent: intentOk,
        campaignId: thread.campaignId,
      };
    });
  });

  app.get("/conversations/:threadId/timeline", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const threadId = uuid.parse((req.params as { threadId: string }).threadId);

    const messages = await db
      .select()
      .from(growthInboxMessages)
      .where(and(eq(growthInboxMessages.orgId, orgId), eq(growthInboxMessages.threadId, threadId)))
      .orderBy(growthInboxMessages.createdAt);

    const outbound = await db
      .select()
      .from(growthOutboundMessages)
      .where(and(eq(growthOutboundMessages.orgId, orgId), eq(growthOutboundMessages.inboxThreadId, threadId)))
      .orderBy(growthOutboundMessages.createdAt);

    return {
      messages: messages.map((m) => ({
        kind: "message" as const,
        id: m.id,
        direction: m.direction,
        bodyText: m.bodyText,
        intent: m.intent,
        createdAt: m.createdAt.toISOString(),
        outboundMessageId: m.outboundMessageId,
      })),
      outboundEvents: outbound.map((o) => ({
        kind: "outbound" as const,
        id: o.id,
        status: o.status,
        subject: o.subject,
        toEmail: o.toEmail,
        blockedReason: o.blockedReason,
        sentAt: o.sentAt?.toISOString() ?? null,
        createdAt: o.createdAt.toISOString(),
      })),
    };
  });

  // Staff reply to a thread. Write-gated (not owner-only): replying to inbound
  // mail is ordinary staff work, unlike changing sender identities or campaign
  // strategy. The suppression re-check and the org pause live in the service.
  app.post("/conversations/:threadId/reply", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const threadId = uuid.parse((req.params as { threadId: string }).threadId);

    const body = z
      .object({
        bodyText: z.string().min(1).max(20_000),
        subject: z.string().min(1).max(300).optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_body", details: body.error.flatten() });
    }

    const result = await sendThreadReply({
      orgId,
      threadId,
      bodyText: body.data.bodyText,
      subject: body.data.subject ?? null,
      sentByUserId: claims.userId,
    });

    if (result.status === "refused") {
      // 409 for a policy refusal (suppressed, paused, thread not sendable) so a
      // client can distinguish "you may not" from "the request was malformed".
      const status = result.code === "not_found" ? 404 : 409;
      return reply.code(status).send({ error: result.code, message: result.message });
    }
    if (result.status === "duplicate") {
      return reply.code(200).send({ sent: false, duplicate: true, outboundMessageId: result.outboundMessageId });
    }
    return reply.code(201).send({ sent: true, outboundMessageId: result.outboundMessageId });
  });
}
