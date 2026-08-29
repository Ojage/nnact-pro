import type { FastifyInstance, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import { resolveOrgId } from "./org.js";
import { verifiedClaims } from "../operational-authorization.js";
import { canAccessJob } from "../job-access.js";
import {
  getVoiceNoteFile,
  listJobVoiceNotes,
  saveVoiceNote,
  getVoiceNoteDto,
  markJobVoiceNotesDelivered,
  markVoiceNoteRead,
} from "../voice-note-storage.js";
import { notifyVoiceNoteReceived } from "../notify-office.js";
import { resolveOrgIdWithQueryToken, verifiedClaimsForQueryToken } from "../query-token.js";
import { safeEmitActivity } from "../activities.js";
import { db, jobs, users, jobVoiceNotes } from "@nnact/db";
import { eq, and } from "drizzle-orm";
import { createFixedWindowRateLimit, requestIpKey } from "../rate-limit.js";

const uploadRateLimit = createFixedWindowRateLimit({
  max: 120,
  windowMs: 60 * 60 * 1000,
  key: (request: FastifyRequest) => {
    const jobId = (request.params as { jobId?: string } | undefined)?.jobId ?? "unknown";
    return `${requestIpKey(request)}:voice:${jobId}`;
  },
});

export async function voiceNoteRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: 8 * 1024 * 1024,
      fields: 4,
    },
  });

  app.get("/jobs/:jobId/voice-notes", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;

    const { jobId } = req.params as { jobId: string };
    if (!(await canAccessJob(orgId, jobId, claims.role, claims.userId))) {
      return reply.code(404).send({ error: "job not found" });
    }
    return listJobVoiceNotes(jobId, orgId);
  });

  app.post<{ Params: { jobId: string } }>(
    "/jobs/:jobId/voice-notes",
    { preHandler: uploadRateLimit },
    async (req, reply) => {
      const orgId = await resolveOrgId(req);
      const claims = await verifiedClaims(req, reply);
      if (!claims || reply.sent) return;

      const { jobId } = req.params;
      if (!(await canAccessJob(orgId, jobId, claims.role, claims.userId))) {
        return reply.code(404).send({ error: "job not found" });
      }

      let fileStream: { file: import("node:stream").Readable; filename?: string } | null = null;
      let durationMs = 0;

      for await (const part of req.parts()) {
        if (part.type === "file") {
          fileStream = { file: part.file, filename: part.filename };
        } else if (part.fieldname === "durationMs") {
          const raw = await part.value;
          durationMs = Number.parseInt(String(raw), 10);
        }
      }

      if (!fileStream) return reply.code(400).send({ error: "no audio uploaded" });

      const record = await saveVoiceNote(orgId, jobId, claims.userId, {
        stream: fileStream.file,
        filenameHint: fileStream.filename,
        durationMs: Number.isFinite(durationMs) ? durationMs : 0,
      });

      const dto = await getVoiceNoteDto(record.id, orgId);
      if (!dto) return reply.code(500).send({ error: "voice note persistence failed" });

      const [jobRow] = await db
        .select({ title: jobs.title, customerId: jobs.customerId })
        .from(jobs)
        .where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId)))
        .limit(1);

      const [author] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, claims.userId))
        .limit(1);

      safeEmitActivity(orgId, "voice_note.added", `Voice note on ${jobRow?.title ?? "job"}`, {
        jobId,
        customerId: jobRow?.customerId,
      });

      void notifyVoiceNoteReceived(
        orgId,
        claims.userId,
        author?.name ?? claims.name ?? "Technician",
        jobId,
        jobRow?.title ?? "Service job",
        dto,
      );

      return reply.code(201).send(dto);
    },
  );

  app.post<{ Params: { jobId: string } }>(
    "/jobs/:jobId/voice-notes/mark-delivered",
    async (req, reply) => {
      const orgId = await resolveOrgId(req);
      const claims = await verifiedClaims(req, reply);
      if (!claims || reply.sent) return;

      const { jobId } = req.params;
      if (!(await canAccessJob(orgId, jobId, claims.role, claims.userId))) {
        return reply.code(404).send({ error: "job not found" });
      }
      if (claims.role !== "owner" && claims.role !== "dispatcher") {
        return reply.code(403).send({ error: "only office users can confirm delivery" });
      }

      await markJobVoiceNotesDelivered(jobId, orgId, claims.userId);
      return { ok: true };
    },
  );

  app.post<{ Params: { noteId: string } }>(
    "/voice-notes/:noteId/read",
    async (req, reply) => {
      const orgId = await resolveOrgId(req);
      const claims = await verifiedClaims(req, reply);
      if (!claims || reply.sent) return;

      const { noteId } = req.params;
      const [note] = await db
        .select({ jobId: jobVoiceNotes.jobId, authorUserId: jobVoiceNotes.authorUserId })
        .from(jobVoiceNotes)
        .where(and(eq(jobVoiceNotes.id, noteId), eq(jobVoiceNotes.orgId, orgId)))
        .limit(1);
      if (!note) return reply.code(404).send({ error: "voice note not found" });
      if (!(await canAccessJob(orgId, note.jobId, claims.role, claims.userId))) {
        return reply.code(404).send({ error: "job not found" });
      }

      await markVoiceNoteRead(noteId, orgId, claims.userId);
      return { ok: true };
    },
  );

  app.get<{ Params: { noteId: string } }>("/voice-notes/:noteId/file", async (req, reply) => {
    const orgId = await resolveOrgIdWithQueryToken(app, req);
    const claims = await verifiedClaimsForQueryToken(app, req, reply);
    if (!claims || reply.sent) return;

    const { noteId } = req.params;
    const [note] = await db
      .select({ jobId: jobVoiceNotes.jobId })
      .from(jobVoiceNotes)
      .where(and(eq(jobVoiceNotes.id, noteId), eq(jobVoiceNotes.orgId, orgId)))
      .limit(1);
    if (!note) return reply.code(404).send({ error: "voice note not found" });
    if (!(await canAccessJob(orgId, note.jobId, claims.role, claims.userId))) {
      return reply.code(404).send({ error: "job not found" });
    }

    const result = await getVoiceNoteFile(noteId, orgId);
    if (!result) return reply.code(404).send({ error: "voice note not found" });

    reply.header("Cache-Control", "private, max-age=3600");
    return reply.type(result.record.contentType).send(result.buffer);
  });
}
