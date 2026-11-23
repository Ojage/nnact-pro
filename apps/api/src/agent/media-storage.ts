import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const MAX_BYTES = 25 * 1024 * 1024;

function uploadDir(): string {
  return process.env.NNPUPLOAD_DIR ?? "./.ofp-uploads";
}

function safeSegment(value: string): string {
  if (!value || basename(value) !== value || value.includes("..")) throw new Error("invalid storage id");
  return value;
}

/** Keys are relative to NNPUPLOAD_DIR so the same helper works in dev and prod. */
export function agentMediaPath(objectKey: string): string {
  const parts = objectKey.split("/");
  if (parts.length !== 4 || parts[0] !== "agent") throw new Error("invalid media key");
  return join(uploadDir(), safeSegment(parts[0]), safeSegment(parts[1]), safeSegment(parts[2]), safeSegment(parts[3]));
}

function extensionFor(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/webm": "webm",
  };
  return map[contentType.split(";")[0]?.trim().toLowerCase() ?? ""] ?? "bin";
}

export interface StoredAgentMedia {
  objectKey: string;
  byteSize: number;
  sha256: string;
}

export async function storeAgentMedia(input: {
  orgId: string;
  messageId: string;
  kind: "image" | "audio";
  buffer: Buffer;
  contentType: string;
  fileName?: string | null;
}): Promise<StoredAgentMedia> {
  if (input.buffer.byteLength === 0) throw new Error("empty media");
  if (input.buffer.byteLength > MAX_BYTES) throw new Error("media exceeds 25 MB limit");
  const directory = join(uploadDir(), "agent", safeSegment(input.orgId), safeSegment(input.messageId));
  await mkdir(directory, { recursive: true, mode: 0o750 });
  const name = `${input.kind}-${randomUUID()}.${extensionFor(input.contentType)}`;
  const destination = join(directory, name);
  await writeFile(destination, input.buffer, { mode: 0o640, flag: "wx" });
  return {
    objectKey: `agent/${safeSegment(input.orgId)}/${safeSegment(input.messageId)}/${name}`,
    byteSize: input.buffer.byteLength,
    sha256: createHash("sha256").update(input.buffer).digest("hex"),
  };
}

export async function readAgentMedia(objectKey: string): Promise<Buffer> {
  return readFile(agentMediaPath(objectKey));
}

export async function deleteAgentMedia(objectKey: string): Promise<void> {
  await rm(agentMediaPath(objectKey), { force: true });
}
