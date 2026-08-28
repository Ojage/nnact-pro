import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, notifications } from "@nnact/db";
import type { JwtClaims } from "../auth.js";
import { verifiedClaims } from "../operational-authorization.js";
import { subscribeUserLiveEvents } from "../realtime-hub.js";
import { removePushToken, upsertPushToken } from "../push.js";

const registerBody = z.object({
  token: z.string().min(1),
  platform: z.enum(["web", "ios", "android"]),
  provider: z.enum(["fcm"]).optional().default("fcm"),
});

const removeBody = z.object({
  token: z.string().min(1),
});

async function resolveUserId(req: FastifyRequest, reply: FastifyReplyLike): Promise<string | null> {
  const claims = await verifiedClaims(req, reply as never);
  return claims?.userId ?? null;
}

type FastifyReplyLike = { sent: boolean; code: (n: number) => { send: (b: unknown) => unknown } };

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const uid = await resolveUserId(req, reply);
    if (!uid || reply.sent) return [];
    return db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, uid), eq(notifications.read, false)))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  });

  app.get("/unread-count", async (req, reply) => {
    const uid = await resolveUserId(req, reply);
    if (!uid || reply.sent) return { count: 0 };
    const rows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, uid), eq(notifications.read, false)));
    return { count: rows.length };
  });

  app.get("/all", async (req, reply) => {
    const uid = await resolveUserId(req, reply);
    if (!uid || reply.sent) return [];
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, uid))
      .orderBy(desc(notifications.createdAt))
      .limit(100);
  });

  app.patch("/:id/read", async (req, reply) => {
    const uid = await resolveUserId(req, reply);
    if (!uid || reply.sent) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const [row] = await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, uid)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/read-all", async (req, reply) => {
    const uid = await resolveUserId(req, reply);
    if (!uid || reply.sent) return reply.code(401).send({ error: "unauthorized" });
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, uid), eq(notifications.read, false)));
    return { ok: true };
  });

  /** Live SSE stream — EventSource-friendly via ?access_token= */
  app.get("/stream", async (req, reply) => {
    const query = req.query as { access_token?: string };
    const header = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const token = query.access_token ?? header;

    if (!token) return reply.code(401).send({ error: "unauthorized" });

    let claims: JwtClaims | null = null;
    try {
      claims = (await app.jwt.verify(token)) as JwtClaims;
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const userId = (claims as { userId?: string }).userId;
    if (!userId) return reply.code(401).send({ error: "unauthorized" });

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    raw.write(": connected\n\n");

    const unsubscribe = subscribeUserLiveEvents(userId, (event) => {
      raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      raw.write(": ping\n\n");
    }, 15000);

    req.raw.on("close", () => {
      unsubscribe();
      clearInterval(heartbeat);
    });
  });
}

export async function pushTokenRoutes(app: FastifyInstance) {
  app.post("/register", async (req, reply) => {
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;

    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    await upsertPushToken({
      orgId: claims.orgId,
      userId: claims.userId,
      platform: parsed.data.platform,
      token: parsed.data.token,
      provider: parsed.data.provider,
    });

    return { ok: true };
  });

  app.post("/remove", async (req, reply) => {
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;

    const parsed = removeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    await removePushToken(claims.userId, parsed.data.token);
    return { ok: true };
  });
}
