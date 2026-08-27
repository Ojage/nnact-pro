// Per-user guided-walkthrough progress.
//
// Server-authoritative JSONB on users.walkthrough_progress, keyed by
// walkthrough id. The web app caches a copy in localStorage and merges on
// boot, so a temporary auth hiccup never loses progress.
//
// Auth note: the unified session-cookie hook + jwtVerify() carry the staff
// identity. Two "authenticated but foreign" cases degrade gracefully:
//   - development (non-production, no verified claims) → in-process ephemeral
//     store keyed by (orgId, userId), mirroring operational-authorization's
//     dev fallback. Progress still round-trips within the process.
//   - claims that resolve to no users row → update is skipped rather than
//     erroring; the client's localStorage copy remains the source of truth.
// Walkthroughs are UX concerns: they never carry authorization. Mutating this
// store can only (re)mark a tour's progress, never grant a capability.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, users } from "@nnact/db";
import {
  WALKTHROUGH_PROGRESS_STATES,
  type WalkthroughProgressMap,
  type WalkthroughProgressRecord,
} from "@nnact/shared";
import type { StaffJwtClaims } from "../auth.js";

const progressRecordSchema = z.object({
  state: z.enum(WALKTHROUGH_PROGRESS_STATES),
  step: z.number().int().min(0),
  version: z.number().int().min(1),
  starts: z.number().int().min(0).default(0),
  completions: z.number().int().min(0).default(0),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  updatedAt: z.string(),
});

const tourIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

const patchBodySchema = z.object({
  progress: z.record(tourIdSchema, progressRecordSchema),
});

function empty(): WalkthroughProgressMap {
  return {};
}

// Dev/anonymous fallback store (never used in production).
const ephemeral = new Map<string, WalkthroughProgressMap>();

function ephemeralKey(userId: string, orgId: string): string {
  return `${orgId}::${userId}`;
}

export async function walkthroughRoutes(app: FastifyInstance) {
  app.get("/walkthrough-progress", async (req, reply) => {
    const identity = await resolveStaffIdentity(req, reply);
    if (!identity) return;

    const progress = await readProgress(identity.userId, identity.orgId);
    return { progress };
  });

  app.patch("/walkthrough-progress", async (req, reply) => {
    const identity = await resolveStaffIdentity(req, reply);
    if (!identity) return;

    const parsed = patchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten(), hint: "progress must be a map of walkthroughId → progressRecord" });
    }

    const existing = await readProgress(identity.userId, identity.orgId);
    const merged: WalkthroughProgressMap = Object.assign({}, existing, parsed.data.progress);
    await writeProgress(identity.userId, identity.orgId, merged);
    return { progress: merged };
  });
}

async function readProgress(userId: string, orgId: string): Promise<WalkthroughProgressMap> {
  if (userId === "development-owner" || userId === "development-dispatcher") {
    return ephemeral.get(ephemeralKey(userId, orgId)) ?? empty();
  }
  const [row] = await db
    .select({ walkthroughProgress: users.walkthroughProgress })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, orgId)));
  return row?.walkthroughProgress ?? empty();
}

async function writeProgress(userId: string, orgId: string, progress: WalkthroughProgressMap): Promise<void> {
  const progressRecord = progress as Record<string, WalkthroughProgressRecord>;
  if (userId === "development-owner" || userId === "development-dispatcher") {
    ephemeral.set(ephemeralKey(userId, orgId), progressRecord);
    return;
  }
  const [row] = await db
    .update(users)
    .set({ walkthroughProgress: progressRecord })
    .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
    .returning({ id: users.id });
  // Foreign identity (no users row) — leave DB untouched rather than error;
  // the client keeps its localStorage copy as the source of truth.
  if (!row) ephemeral.set(ephemeralKey(userId, orgId), progressRecord);
}

async function resolveStaffIdentity(
  req: { jwtVerify(): Promise<void>; user?: unknown },
  reply: { code(code: number): { send(body: unknown): unknown } },
): Promise<{ userId: string; orgId: string } | null> {
  try {
    await req.jwtVerify();
    const identifier = req.user as StaffJwtClaims | undefined;
    if (
      identifier?.userId &&
      identifier?.orgId &&
      ["owner", "dispatcher", "technician"].includes(identifier.role)
    ) {
      return { userId: identifier.userId, orgId: identifier.orgId };
    }
  } catch {
    // fall through to dev fallback / 401
  }
  if (process.env.NODE_ENV !== "production") {
    return { userId: "development-owner", orgId: "development" };
  }
  reply.code(401).send({ error: "authentication required" });
  return null;
}