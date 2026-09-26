import { resolveSmtpConfig } from "../mailer.js";
import { isColdSendingEnabled, resolveColdTransportConfig } from "./transport-policy.js";

export type ReadinessLevel = "ok" | "warn" | "blocked";

export interface EnvReadinessItem {
  id: string;
  level: ReadinessLevel;
  label: string;
  detail: string;
}

/** Non-secret deployment checklist for Growth & core mail (owner ops view). */
export function getGrowthDeploymentReadiness(env: NodeJS.ProcessEnv = process.env): EnvReadinessItem[] {
  const items: EnvReadinessItem[] = [];

  const smtp = resolveSmtpConfig(env);
  if (smtp) {
    const host = env.SMTP_HOST?.trim() ?? "";
    const isResend = /resend\.com/i.test(host);
    items.push({
      id: "smtp_transactional",
      level: "ok",
      label: "Transactional / permission SMTP",
      detail: isResend
        ? `Configured (${host}). Use only for transactional and opted-in mail — not cold outreach.`
        : `Configured (${host}).`,
    });
  } else {
    items.push({
      id: "smtp_transactional",
      level: "blocked",
      label: "Transactional / permission SMTP",
      detail: "Set SMTP_HOST, SMTP_USER, and SMTP_PASS (e.g. Resend smtp.resend.com:587) for portal mail and Growth permission campaigns.",
    });
  }

  const cold = resolveColdTransportConfig(env);
  if (cold) {
    items.push({
      id: "cold_transport",
      level: "ok",
      label: "Cold outreach transport",
      detail: `Dedicated SMTP at ${cold.host}:${cold.port}. Cold campaigns may send when approved.`,
    });
  } else {
    items.push({
      id: "cold_transport",
      level: "warn",
      label: "Cold outreach transport",
      detail: "Not configured (COLD_SMTP_HOST, COLD_SMTP_USER, COLD_SMTP_PASS). Cold outreach stays blocked — expected until a compliant provider is approved.",
    });
  }

  const scheduler = env.GROWTH_SCHEDULER_ENABLED === "true";
  items.push({
    id: "growth_scheduler",
    level: scheduler ? (cold ? "ok" : "warn") : "ok",
    label: "Growth send scheduler",
    detail: scheduler
      ? cold
        ? "Enabled — worker tick will attempt scheduled campaign sends."
        : "Enabled but cold transport is missing; cold campaigns will refuse at send time."
      : "Disabled (GROWTH_SCHEDULER_ENABLED≠true). Manual run still available to dispatchers.",
  });

  const inboundSecret = env.GROWTH_INBOUND_WEBHOOK_SECRET?.trim();
  if (inboundSecret && inboundSecret.length >= 16) {
    items.push({
      id: "inbound_webhook",
      level: "ok",
      label: "Inbound reply webhook",
      detail: "GROWTH_INBOUND_WEBHOOK_SECRET is set. Configure provider to POST /api/v1/growth/webhooks/inbound/:orgId with HMAC signature.",
    });
  } else {
    items.push({
      id: "inbound_webhook",
      level: "warn",
      label: "Inbound reply webhook",
      detail: "Set GROWTH_INBOUND_WEBHOOK_SECRET (≥16 chars) and route inbound mail to the growth inbound webhook for unified inbox.",
    });
  }

  const expleeUrl = env.EXPLEE_READ_API_URL?.trim();
  const expleeToken = env.EXPLEE_READ_API_TOKEN?.trim();
  if (expleeUrl && expleeToken) {
    items.push({
      id: "explee_import",
      level: "ok",
      label: "Explee read import",
      detail: "Read-only Explee API credentials present.",
    });
  } else {
    items.push({
      id: "explee_import",
      level: "warn",
      label: "Explee read import",
      detail: "Optional: EXPLEE_READ_API_URL and EXPLEE_READ_API_TOKEN for legacy prospect import.",
    });
  }

  if (env.SMTP_HOST && /resend\.com/i.test(env.SMTP_HOST) && cold && /resend\.com/i.test(cold.host)) {
    items.push({
      id: "resend_cold_separation",
      level: "blocked",
      label: "Provider separation",
      detail: "Cold SMTP must not use smtp.resend.com. Resend prohibits unsolicited outreach.",
    });
  }

  return items;
}

export function growthDeploymentReady(items: EnvReadinessItem[]): boolean {
  return !items.some((i) => i.level === "blocked");
}
