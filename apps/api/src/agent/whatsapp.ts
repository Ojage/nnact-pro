import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, whatsappConfigs } from "@nnact/db";
import { decryptSecret } from "../publishing/infra/encryption.js";
import { getJson, postJson, TransportError, extractErrorDetail } from "../ai/transport.js";

export interface WhatsAppConfig {
  orgId: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  mediaRetentionDays: number;
  source: "database" | "environment";
}

/** Database config wins; env vars are a safe fallback for single-org deployments. */
export async function getWhatsappConfig(orgId: string): Promise<WhatsAppConfig | null> {
  const [row] = await db.select().from(whatsappConfigs).where(eq(whatsappConfigs.orgId, orgId)).limit(1);
  if (row && row.enabled) {
    const accessToken = decryptSecret(row.accessTokenCipher);
    const appSecret = decryptSecret(row.appSecretCipher);
    const verifyToken = decryptSecret(row.verifyTokenCipher);
    if (!accessToken || !appSecret || !verifyToken) return null;
    return {
      orgId,
      phoneNumberId: row.phoneNumberId,
      businessAccountId: row.businessAccountId,
      accessToken,
      appSecret,
      verifyToken,
      mediaRetentionDays: row.mediaRetentionDays,
      source: "database",
    };
  }
  const phoneNumberId = process.env.AGENT_WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.AGENT_WHATSAPP_ACCESS_TOKEN?.trim();
  const appSecret = process.env.AGENT_WHATSAPP_APP_SECRET?.trim();
  const verifyToken = process.env.AGENT_WHATSAPP_VERIFY_TOKEN?.trim();
  if (!phoneNumberId || !accessToken || !appSecret || !verifyToken) return null;
  return {
    orgId,
    phoneNumberId,
    businessAccountId: process.env.AGENT_WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() ?? null,
    accessToken,
    appSecret,
    verifyToken,
    mediaRetentionDays: Number(process.env.AGENT_MEDIA_RETENTION_DAYS ?? 30) || 30,
    source: "environment",
  };
}

const HEX_64 = /^[0-9a-f]{64}$/i;

/** Meta sends `X-Hub-Signature-256: sha256=<hex>` over the exact raw request body. */
export function verifyWhatsappSignature(rawBody: Buffer, header: string | undefined, appSecret: string): void {
  if (!header?.startsWith("sha256=")) throw Object.assign(new Error("signature mismatch"), { statusCode: 401 });
  const presented = header.slice("sha256=".length).trim();
  if (!HEX_64.test(presented)) throw Object.assign(new Error("signature mismatch"), { statusCode: 401 });
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  if (!timingSafeEqual(Buffer.from(presented.toLowerCase(), "hex"), Buffer.from(expected, "hex"))) {
    throw Object.assign(new Error("signature mismatch"), { statusCode: 401 });
  }
}

const GRAPH_API = (process.env.AGENT_WHATSAPP_GRAPH_VERSION ?? "v21.0").replace(/^\/+|\/+$/g, "");

export interface DownloadedMedia {
  buffer: Buffer;
  contentType: string;
  fileName: string | null;
}

/** Download from Meta into memory. Size is capped before the caller writes to private storage. */
export async function downloadWhatsappMedia(mediaId: string, config: WhatsAppConfig): Promise<DownloadedMedia> {
  const meta = await getJson(`https://graph.facebook.com/${GRAPH_API}/${encodeURIComponent(mediaId)}`, {
    headers: { authorization: `Bearer ${config.accessToken}` },
    timeoutMs: 30_000,
  });
  if (meta.status < 200 || meta.status >= 300) {
    throw new TransportError(extractErrorDetail(meta.json, `media lookup returned ${meta.status}`), "HTTP", meta.status, meta.json, meta.status === 429 || meta.status >= 500);
  }
  const info = meta.json as { url?: string; mime_type?: string; filename?: string };
  if (!info.url) throw new TransportError("media lookup returned no url", "HTTP", meta.status, meta.json);
  const response = await fetch(info.url, { headers: { authorization: `Bearer ${config.accessToken}` }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new TransportError(`media download returned ${response.status}`, "HTTP", response.status, null, response.status === 429 || response.status >= 500);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 25 * 1024 * 1024) throw new TransportError("media exceeds 25 MB limit", "TOO_LARGE", response.status);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > 25 * 1024 * 1024) throw new TransportError("media exceeds 25 MB limit", "TOO_LARGE", response.status);
  return {
    buffer,
    contentType: info.mime_type ?? response.headers.get("content-type") ?? "application/octet-stream",
    fileName: info.filename ?? null,
  };
}

/** Send a fixed, human-written text. Never pass model output to customers from this path. */
export async function sendWhatsappText(
  to: string,
  body: string,
  config: WhatsAppConfig,
): Promise<{ messageId: string } | null> {
  const response = await postJson(`https://graph.facebook.com/${GRAPH_API}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
    headers: { authorization: `Bearer ${config.accessToken}` },
    timeoutMs: 30_000,
    body: {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: body.slice(0, 4096), preview_url: false },
    },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new TransportError(extractErrorDetail(response.json, `send returned ${response.status}`), "HTTP", response.status, response.json, response.status === 429 || response.status >= 500);
  }
  const data = response.json as { messages?: { id?: string }[] };
  const messageId = data.messages?.[0]?.id;
  return messageId ? { messageId } : null;
}
