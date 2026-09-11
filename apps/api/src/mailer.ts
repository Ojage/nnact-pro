// Outbound SMTP mailer. Configured entirely through environment variables so
// no credentials ever live in the repository. When SMTP is not configured the
// mailer fails closed: sendEmail resolves null instead of attempting a send.
import nodemailer, { type Transporter } from "nodemailer";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Optional branded HTML body; when absent clients fall back to `text`. */
  html?: string;
  attachments?: EmailAttachment[];
  /** Optional per-message "from". Defaults to the resolved SMTP_FROM sender. */
  from?: string;
}

export interface SendResult {
  messageId: string;
  accepted: string[];
}

/**
 * Email categories and their dedicated "from" senders. Each category falls
 * back to the category-specific SMTP_FROM_<CATEGORY> env var, then the
 * generic SMTP_FROM, then the SMTP user.
 */
export type EmailCategory = "security" | "billing" | "service" | "newsletter";

const CATEGORY_ENV_KEYS: Record<EmailCategory, string> = {
  security: "SMTP_FROM_SECURITY",
  billing: "SMTP_FROM_BILLING",
  service: "SMTP_FROM_SERVICE",
  newsletter: "SMTP_FROM_NEWSLETTER",
};

const CATEGORY_DEFAULTS: Record<EmailCategory, string> = {
  security: "NNACT Security <security@nnact.com>",
  billing: "NNACT Billing <billing@nnact.com>",
  service: "NNACT Service <service@nnact.com>",
  newsletter: "NNACT News <newsletter@nnact.com>",
};

/** Resolves the display sender for a given email category. */
export function resolveCategorySender(category: EmailCategory, env: NodeJS.ProcessEnv = process.env): string {
  const envKey = CATEGORY_ENV_KEYS[category];
  const fromCategory = env[envKey]?.trim();
  if (fromCategory) return fromCategory;
  const fromGeneric = env.SMTP_FROM?.trim();
  if (fromGeneric) return fromGeneric;
  return CATEGORY_DEFAULTS[category];
}

export function resolveSmtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  if (!host || !user || pass === undefined || pass === "") return null;
  return {
    host,
    port: Number(env.SMTP_PORT ?? 587),
    secure: env.SMTP_SECURE === "true",
    user,
    pass,
    from: env.SMTP_FROM?.trim() || `${user}`,
  };
}

export function createSmtpTransport(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
}

/**
 * Sends an email. Returns null when SMTP is not configured (fail closed) or
 * throws when the transport rejects the message. The transport is created from
 * the resolved config unless one is injected (tests inject a fake).
 */
export async function sendEmail(
  message: EmailMessage,
  injected?: { transport?: Transporter; config?: SmtpConfig | null },
): Promise<SendResult | null> {
  const config = injected?.config === undefined ? resolveSmtpConfig() : injected.config;
  if (!config) return null;
  const transport = injected?.transport ?? createSmtpTransport(config);
  const info = await transport.sendMail({
    from: message.from ?? config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
    attachments: message.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType,
    })),
  });
  return { messageId: info.messageId ?? "", accepted: info.accepted ?? [] };
}
