import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { eq, and, desc } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { db, jobs, jobVoiceNotes, users } from "@nnact/db";
import type { JobVoiceNoteDTO } from "@nnact/shared";

export interface VoiceNoteRecord {
  id: string;
  orgId: string;
  jobId: string;
  authorUserId: string;
  objectKey: string;
  contentType: string;
  fileName: string | null;
  fileSize: number | null;
  durationMs: number;
  createdAt: Date;
}

const ALLOWED_MIME = new Set([
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/webm",
  "audio/x-m4a",
  "video/mp4",
  "application/octet-stream",
]);
const MAX_BYTES = 8 * 1024 * 1024;
const SNIFF_HEAD_BYTES = 4096;

function uploadDir() {
  return process.env.NNPUPLOAD_DIR ?? "./.ofp-uploads";
}

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function safeOriginalName(value?: string | null) {
  if (!value) return null;
  return basename(value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200) || null;
}

function safePathSegment(value: string) {
  if (!value || basename(value) !== value) throw httpError(400, "invalid organization id");
  return value;
}

export async function saveVoiceNote(
  orgId: string,
  jobId: string,
  authorUserId: string,
  input: { stream: Readable; filenameHint?: string | null; durationMs?: number },
): Promise<VoiceNoteRecord> {
  const [job] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId)));
  if (!job) throw httpError(404, "job not found");

  const noteId = randomUUID();
  const objectKey = `voice/${orgId}/${noteId}`;
  const destination = join(uploadDir(), objectKey);
  const destinationDir = join(uploadDir(), "voice", safePathSegment(orgId));
  await mkdir(destinationDir, { recursive: true, mode: 0o750 }).catch(() => {
    throw httpError(500, "internal storage error");
  });

  let total = 0;
  let head = Buffer.alloc(0);
  const inspector = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > MAX_BYTES) {
        callback(httpError(413, "voice note exceeds maximum size"));
        return;
      }
      if (head.length < SNIFF_HEAD_BYTES) {
        head = Buffer.concat([head, chunk.subarray(0, SNIFF_HEAD_BYTES - head.length)]);
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(input.stream, inspector, createWriteStream(destination, { flags: "wx", mode: 0o640 }));
  } catch (error) {
    await rm(destination, { force: true }).catch(() => {});
    if (error && typeof error === "object" && "statusCode" in error) throw error;
    throw httpError(500, "internal storage error");
  }

  if (total === 0) {
    await rm(destination, { force: true }).catch(() => {});
    throw httpError(400, "empty file");
  }

  const detected = await fileTypeFromBuffer(head);
  const mime = detected?.mime ?? "audio/m4a";
  if (!ALLOWED_MIME.has(mime) && mime !== "application/octet-stream") {
    await rm(destination, { force: true }).catch(() => {});
    throw httpError(415, `unsupported audio type: ${mime}`);
  }

  const durationMs = Math.max(0, Math.min(input.durationMs ?? 0, 600_000));

  try {
    const [record] = await db
      .insert(jobVoiceNotes)
      .values({
        id: noteId,
        orgId,
        jobId,
        authorUserId,
        objectKey,
        contentType: mime === "application/octet-stream" ? "audio/m4a" : mime,
        fileName: safeOriginalName(input.filenameHint),
        fileSize: total,
        durationMs,
      })
      .returning();
    return record as VoiceNoteRecord;
  } catch (error) {
    await rm(destination, { force: true }).catch(() => {});
    const detail = error instanceof Error ? error.message : String(error);
    if (/job_voice_notes/i.test(detail) && /does not exist|relation/i.test(detail)) {
      throw httpError(
        503,
        "voice notes storage is not ready — run database migration 0024_job_voice_notes",
      );
    }
    console.error("saveVoiceNote: database insert failed", error);
    throw httpError(500, "internal storage error");
  }
}

export async function getVoiceNoteFile(
  noteId: string,
  orgId: string,
): Promise<{ record: VoiceNoteRecord; buffer: Buffer } | null> {
  const [record] = await db
    .select()
    .from(jobVoiceNotes)
    .where(and(eq(jobVoiceNotes.id, noteId), eq(jobVoiceNotes.orgId, orgId)))
    .limit(1);
  if (!record) return null;

  try {
    const buffer = await readFile(join(uploadDir(), record.objectKey));
    return { record: record as VoiceNoteRecord, buffer };
  } catch {
    throw httpError(500, "internal storage error");
  }
}

export async function listJobVoiceNotes(jobId: string, orgId: string): Promise<JobVoiceNoteDTO[]> {
  const rows = await db
    .select({
      note: jobVoiceNotes,
      authorName: users.name,
    })
    .from(jobVoiceNotes)
    .innerJoin(users, eq(jobVoiceNotes.authorUserId, users.id))
    .where(and(eq(jobVoiceNotes.jobId, jobId), eq(jobVoiceNotes.orgId, orgId)))
    .orderBy(desc(jobVoiceNotes.createdAt));

  return rows.map((row) => ({
    id: row.note.id,
    orgId: row.note.orgId,
    jobId: row.note.jobId,
    authorUserId: row.note.authorUserId,
    authorName: row.authorName,
    durationMs: row.note.durationMs,
    contentType: row.note.contentType,
    fileSize: row.note.fileSize,
    fileName: row.note.fileName,
    createdAt: row.note.createdAt.toISOString(),
  }));
}

export async function getVoiceNoteDto(noteId: string, orgId: string): Promise<JobVoiceNoteDTO | null> {
  const [row] = await db
    .select({
      note: jobVoiceNotes,
      authorName: users.name,
    })
    .from(jobVoiceNotes)
    .innerJoin(users, eq(jobVoiceNotes.authorUserId, users.id))
    .where(and(eq(jobVoiceNotes.id, noteId), eq(jobVoiceNotes.orgId, orgId)))
    .limit(1);

  if (!row) return null;
  return {
    id: row.note.id,
    orgId: row.note.orgId,
    jobId: row.note.jobId,
    authorUserId: row.note.authorUserId,
    authorName: row.authorName,
    durationMs: row.note.durationMs,
    contentType: row.note.contentType,
    fileSize: row.note.fileSize,
    fileName: row.note.fileName,
    createdAt: row.note.createdAt.toISOString(),
  };
}
