import type { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { db, notifications } from "@nnact/db";

// ponytail: no JWT fallback returns empty. Ceiling: unauthenticated users see nothing.
function userId(req: any): string | null {
  try {
    return (req.user as any)?.sub ?? null;
  } catch {
    return null;
  }
}

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const uid = userId(req);
    if (!uid) return [];
    // Notifications are org-scoped via the JWT org context; we filter by userId
    return db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, uid), eq(notifications.read, false)))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  });

  app.get("/unread-count", async (req) => {
    const uid = userId(req);
    if (!uid) return { count: 0 };
    const rows = await db
      .select({ count: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, uid), eq(notifications.read, false)));
    return { count: rows.length };
  });

  app.get("/all", async (req) => {
    const uid = userId(req);
    if (!uid) return [];
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, uid))
      .orderBy(desc(notifications.createdAt))
      .limit(100);
  });

  app.patch("/:id/read", async (req, reply) => {
    const uid = userId(req);
    if (!uid) return reply.code(401).send({ error: "unauthorized" });
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
    const uid = userId(req);
    if (!uid) return reply.code(401).send({ error: "unauthorized" });
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, uid), eq(notifications.read, false)));
    return { ok: true };
  });
}
