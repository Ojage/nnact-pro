// Finance receipt file storage. Mirrors the job-photo pipeline but stores into
// a dedicated `receipts` namespace (the jobs-scoped `photos` table requires a
// non-null jobId, so receipts can't reuse it). Served org-scoped only.

import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileTypeFromBuffer } from "file-type";
import { resolveOrgId } from "./routes/org.js";
import { verifiedClaims } from "./operational-authorization.js";

export interface SaveFinanceReceiptInput {
  stream: Readable;
  filenameHint?: string | null;
}

interface FinanceReceiptRecord {
  fileId: string;
  orgId: string;
  objectKey: string;
  contentType: string;
  fileName: string | null;
  fileSize: number;
  uploadedAt: string;
}

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "application/pdf",
]);
const MAX_BYTES_DEFAULT = 25 * 1024 * 1024;
const MAX_BYTES_CEIL = 100 * 1024 * 1024;
const SNIFF_HEAD_BYTES = 4096;

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

function safeOriginalName(value?: string | null) {
  if (!value) return null;
  return basename(value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200) || null;
}

/** Persist a receipt under `ofp/{orgId}/receipts/{fileId}` — never overwrites. */
export async function saveFinanceReceipt(
  orgId: string,
  input: SaveFinanceReceiptInput,
): Promise<FinanceReceiptRecord> {
  const fileId = randomUUID();
  const objectKey = `ofp/${orgId}/receipts/${fileId}`;
  const destination = join(uploadDir(), objectKey);
  const destinationDir = join(uploadDir(), "ofp", orgId, "receipts");
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
        callback(httpError(413, `receipt exceeds maximum size of ${limit} bytes`));
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
    await pipeline(
      input.stream,
      inspector,
      createWriteStream(destination, { flags: "wx", mode: 0o640 }),
    );
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

  return {
    fileId,
    orgId,
    objectKey,
    contentType: detected.mime,
    fileName: safeOriginalName(input.filenameHint),
    fileSize: total,
    uploadedAt: new Date().toISOString(),
  };
}

/** Read a receipt file back; org-scoped (returns null when not found). */
export async function getFinanceReceipt(
  orgId: string,
  fileId: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return null;
  const objectKey = `ofp/${orgId}/receipts/${fileId}`;
  try {
    const buffer = await readFile(join(uploadDir(), objectKey));
    const detected = await fileTypeFromBuffer(buffer);
    return { buffer, contentType: detected?.mime ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

/** URL prefix used by the API layer when hydrating receiptUrls. */
export function receiptPublicUrl(orgId: string, fileId: string): string {
  return `/api/finance/receipts/${fileId}`;
}

export function receiptFileIdFromUrl(url: string): string | null {
  const match = /^\/api\/finance\/receipts\/([0-9a-f-]{36})$/i.exec(url);
  return match?.[1] ?? null;
}

/** Org-scoped receipt serving. Feed URLs come from `receiptPublicUrl`. */
export async function financeReceiptRoutes(app: FastifyInstance) {
  app.get("/finance/receipts/:fileId", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { fileId } = req.params as { fileId: string };
    const file = await getFinanceReceipt(orgId, fileId);
    if (!file) return reply.code(404).send({ error: "not found" });
    return reply.type(file.contentType).send(file.buffer);
  });
}