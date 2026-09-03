// AES-256-GCM field encryption for OAuth credentials at rest.
// Never log ciphertext or plaintext. The key comes from the environment; if
// unset in non-production we derive a dev-only key (clearly not for prod use).
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function keyFrom(env: NodeJS.ProcessEnv = process.env): Buffer {
  const secret = (env.CONTENT_PUBLISHING_KEY ?? "").trim();
  if (secret) {
    if (secret.length < 32) throw new Error("CONTENT_PUBLISHING_KEY must be at least 32 characters");
    return createHash("sha256").update(secret).digest();
  }
  if (env.NODE_ENV === "production") {
    throw new Error("CONTENT_PUBLISHING_KEY is required in production to encrypt provider credentials");
  }
  // Dev convenience key — never used in production.
  return createHash("sha256").update("nnact-pro-dev-publishing-key").digest();
}

export function encryptSecret(plaintext: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = keyFrom(env);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${Buffer.concat([iv, tag, enc]).toString("base64")}`;
}

export function decryptSecret(ciphertext: string, env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    if (!ciphertext.startsWith("v1:")) return null;
    const raw = Buffer.from(ciphertext.slice(3), "base64");
    const iv = raw.subarray(0, IV_LEN);
    const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data = raw.subarray(IV_LEN + TAG_LEN);
    const key = keyFrom(env);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
