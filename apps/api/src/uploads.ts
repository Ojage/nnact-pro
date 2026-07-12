import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { eq, and } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { db, jobs, photos } from "@ofp/db";

export interface PhotoRecord {
  id: string;
  orgId: string;
  jobId: string;
  objectKey: string;
  contentType: string;
  fileName: string | null;
  fileSize: number | null;
  uploadedAt: Date;
  createdAt: Date;
}

export interface SavePhotoInput {
  stream: Readable;
  filenameHint?: string | null;
}

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);
const MAX_BYTES_DEFAULT = 25 * 1024 * 1024;
const MAX_BYTES_CEIL = 100 * 1024 * 1024;
const SNIFF_HEAD_BYTES = 4096;

function maxBytes() {
  const configured = Number(process.env.OFP_UPLOAD_MAX_BYTES);
  if (!Number.isFinite(configured) || configured <= 0) return MAX_BYTES_DEFAULT;
  return Math.min(configured, MAX_BYTES_CEIL);
}

function uploadDir() {
  return process.env.OFP_UPLOAD_DIR ?? "./.ofp-uploads";
}

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function safeOriginalName(value?: string | null) {
  if (!value) return null;
  return basename(value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200) || null;
}

export async function savePhoto(
  orgId: string,
  jobId: string,
  input: SavePhotoInput,
): Promise<PhotoRecord> {
  const [job] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId)));
  if (!job) throw httpError(404, "job not found");

  const photoId = randomUUID();
  const objectKey = `ofp/${orgId}/${photoId}`;
  const destination = join(uploadDir(), objectKey);
  const destinationDir = join(uploadDir(), "ofp", orgId);
  try {
    await mkdir(destinationDir, { recursive: true, mode: 0o750 });
  } catch {
    throw httpError(500, "internal storage error");
  }

  let total = 0;
  let head = Buffer.alloc(0);
  const limit = maxBytes();
  const inspector = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > limit) {
        callback(httpError(413, `photo exceeds maximum size of ${limit} bytes`));
        return;
      }
      if (head.length < SNIFF_HEAD_BYTES) {
        const needed = SNIFF_HEAD_BYTES - head.length;
        head = Buffer.concat([head, chunk.subarray(0, needed)]);
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
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    await rm(destination, { force: true }).catch(() => {});
    throw httpError(415, `unsupported content-type: ${detected?.mime ?? "unknown"}`);
  }

  try {
    const [record] = await db
      .insert(photos)
      .values({
        id: photoId,
        orgId,
        jobId,
        objectKey,
        contentType: detected.mime,
        fileName: safeOriginalName(input.filenameHint),
        fileSize: total,
      })
      .returning();
    return record as PhotoRecord;
  } catch {
    await rm(destination, { force: true }).catch(() => {});
    throw httpError(500, "internal storage error");
  }
}

export async function getPhotoFile(
  photoId: string,
  orgId: string,
): Promise<{ record: PhotoRecord; buffer: Buffer } | null> {
  const [record] = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, photoId), eq(photos.orgId, orgId)))
    .limit(1);
  if (!record) return null;

  try {
    const buffer = await readFile(join(uploadDir(), record.objectKey));
    return { record: record as PhotoRecord, buffer };
  } catch {
    throw httpError(500, "internal storage error");
  }
}

export async function listJobPhotos(jobId: string, orgId: string): Promise<PhotoRecord[]> {
  const rows = await db
    .select()
    .from(photos)
    .where(and(eq(photos.jobId, jobId), eq(photos.orgId, orgId)))
    .orderBy(photos.uploadedAt);
  return rows as PhotoRecord[];
}
