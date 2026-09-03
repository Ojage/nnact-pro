// Content media storage — saves uploaded files for Content Studio and serves
// them via the public API. Mirrors the photos upload pipeline (multipart stream,
// MIME sniffing, size caps) but stores under NNPUPLOAD_DIR/content/{orgId}.
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileTypeFromBuffer } from "file-type";
import { and, eq } from "drizzle-orm";
import { db, contentMedia, orgs } from "@nnact/db";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
]);
const SNIFF_HEAD_BYTES = 4096;

const MAX_BYTES_DEFAULT = 50 * 1024 * 1024;
const MAX_BYTES_CEIL = 200 * 1024 * 1024;

function maxBytes() {
  const configured = Number(process.env.NNPUPLOAD_MAX_BYTES);
  if (!Number.isFinite(configured) || configured <= 0) return MAX_BYTES_DEFAULT;
  return Math.min(configured, MAX_BYTES_CEIL);
}

function uploadDir() {
  return process.env.NNPUPLOAD_DIR ?? "./.ofp-uploads";
}

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

export interface SaveContentMediaInput {
  orgId: string;
  stream: Readable;
  filenameHint?: string | null;
  source?: string | null;
  approvedForMarketing?: boolean;
  uploadedBy?: string | null;
}

export async function saveContentMedia(
  input: SaveContentMediaInput,
): Promise<typeof contentMedia.$inferSelect> {
  const [org] = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.id, input.orgId));
  if (!org) throw httpError(404, "organization not found");

  const mediaId = randomUUID();
  const directory = join(uploadDir(), "content", input.orgId);
  const destination = join(directory, mediaId);
  await mkdir(directory, { recursive: true, mode: 0o750 }).catch(() => {
    throw httpError(500, "internal storage error");
  });

  let total = 0;
  let head = Buffer.alloc(0);
  const limit = maxBytes();
  const inspector = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > limit) return callback(httpError(413, `file exceeds maximum size of ${limit} bytes`));
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

  const storageKey = `content/${input.orgId}/${mediaId}`;
  try {
    const [record] = await db
      .insert(contentMedia)
      .values({
        orgId: input.orgId,
        storageKey,
        contentType: detected.mime,
        fileName: safeOriginalName(input.filenameHint),
        source: input.source ?? null,
        approvedForMarketing: input.approvedForMarketing ?? false,
        uploadedBy: input.uploadedBy ?? null,
      })
      .returning();
    return record;
  } catch {
    await rm(destination, { force: true }).catch(() => {});
    throw httpError(500, "internal storage error");
  }
}

export async function getContentMediaFile(mediaId: string, orgId: string): Promise<{ record: typeof contentMedia.$inferSelect; buffer: Buffer } | null> {
  const [record] = await db
    .select()
    .from(contentMedia)
    .where(and(eq(contentMedia.id, mediaId), eq(contentMedia.orgId, orgId)))
    .limit(1);
  if (!record) return null;
  try {
    const buffer = await readFile(join(uploadDir(), "content", orgId, mediaId));
    return { record, buffer };
  } catch {
    throw httpError(500, "internal storage error");
  }
}

/** Public media resolution — no org scoping (used by the public content API / site). */
export async function getPublicMediaFile(mediaId: string): Promise<{ record: typeof contentMedia.$inferSelect; buffer: Buffer } | null> {
  const [record] = await db.select().from(contentMedia).where(eq(contentMedia.id, mediaId)).limit(1);
  if (!record) return null;
  try {
    const buffer = await readFile(join(uploadDir(), "content", record.orgId, mediaId));
    return { record, buffer };
  } catch {
    throw httpError(500, "internal storage error");
  }
}

function safeOriginalName(value?: string | null) {
  if (!value) return null;
  return basename(value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200) || null;
}
