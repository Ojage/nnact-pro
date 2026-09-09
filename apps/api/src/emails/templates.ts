// NNACT outbound email builders. Every customer-facing email is a small
// purpose-built template (transactional or marketing) rendered through the
// shared brand shell. Builders that wrap operator-authored message bodies
// (invoice, estimate, portal) keep the writeup untouched and just present it
// in the branded frame; purpose-built emails generate their own copy.

import { emailShell, escapeHtml, textToHtml, EMAIL_HERO_URL, emailAssetUrl, type EmailCta } from "./layout.js";

export interface EmailRender {
  html: string;
  text: string;
}

interface EnvDate {
  env?: NodeJS.ProcessEnv;
}

const BRAND_MUTED = "#64748b";

/** Wraps a rendered plain-text message body (org-customized) in the brand frame. */
export function renderDocumentMessageHtml(
  input: { companyName: string; subject: string; body: string } & EnvDate,
): string {
  return emailShell({
    subject: input.subject,
    preheader: input.body.replace(/\s+/g, " ").slice(0, 140),
    kicker: "NNACT Pro Tech",
    headline: input.subject,
    bodyHtml: textToHtml(input.body),
    companyName: input.companyName,
    env: input.env,
  });
}

export function renderInvoiceEmailHtml(
  input: { companyName: string; customerName: string; subject: string; body: string; portalLink?: string } & EnvDate,
): EmailRender {
  const cta = input.portalLink ? { label: "View your invoice", href: input.portalLink } : undefined;
  const html = emailShell({
    subject: input.subject,
    preheader: `Hi ${input.customerName}, your invoice is ready.`,
    kicker: "Invoice",
    headline: input.subject,
    bodyHtml: textToHtml(input.body),
    cta,
    ctaCaption: input.portalLink ? "Logs in to your secure portal with the SMS code you already use." : undefined,
    companyName: input.companyName,
    env: input.env,
  });
  const text = `${input.body}\n\n${input.portalLink ? `View your invoice here: ${input.portalLink}\n` : ""}${input.companyName}\n${input.env?.PUBLIC_WEB_URL ?? "https://pro.nnact.com"}`;
  return { html, text };
}

export function renderEstimateEmailHtml(
  input: { companyName: string; customerName: string; subject: string; body: string; portalLink?: string } & EnvDate,
): EmailRender {
  const cta = input.portalLink ? { label: "Review your estimate", href: input.portalLink } : undefined;
  const html = emailShell({
    subject: input.subject,
    preheader: `Hi ${input.customerName}, an estimate is ready for your review.`,
    kicker: "Estimate",
    headline: input.subject,
    bodyHtml: textToHtml(input.body),
    cta,
    companyName: input.companyName,
    env: input.env,
  });
  const text = `${input.body}\n\n${input.portalLink ? `Review your estimate here: ${input.portalLink}\n` : ""}${input.companyName}\n${input.env?.PUBLIC_WEB_URL ?? "https://pro.nnact.com"}`;
  return { html, text };
}

export function renderPortalLinkEmailHtml(
  input: { companyName: string; customerName: string; body: string; portalLink: string } & EnvDate,
): EmailRender {
  const html = emailShell({
    subject: `Your ${input.companyName} customer portal`,
    preheader: `Open your secure customer portal for ${input.companyName}.`,
    kicker: "Customer portal",
    headline: "Here is your secure customer portal",
    bodyHtml: textToHtml(input.body),
    cta: { label: "Open your portal", href: input.portalLink },
    companyName: input.companyName,
    env: input.env,
  });
  const text = `${input.body}\n\nOpen your portal: ${input.portalLink}\n\n${input.companyName}\n${input.env?.PUBLIC_WEB_URL ?? "https://pro.nnact.com"}`;
  return { html, text };
}

export function renderBookingConfirmationEmailHtml(
  input: { companyName: string; customerName: string; service: string; requestId: string; trackingUrl: string } & EnvDate,
): EmailRender {
  const bodyHtml =
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">We've received your request for <strong>${escapeHtml(input.service)}</strong>.</p>` +
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">Request reference: ${escapeHtml(input.requestId)}</p>` +
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">Our dispatch team will reach out to confirm a time — usually within 24 hours.</p>`;
  const html = emailShell({
    subject: `We received your ${input.companyName} service request`,
    preheader: `We're on it. Your ${input.service} request is being scheduled.`,
    kicker: "Service request",
    headline: `Thanks, ${input.customerName} — we received your request`,
    bodyHtml,
    cta: { label: "Track your request", href: input.trackingUrl },
    companyName: input.companyName,
    env: input.env,
  });
  const text = [
    `Hi ${input.customerName},`,
    "",
    `We've received your request for: ${input.service}`,
    `Request reference: ${input.requestId}`,
    "",
    "You can check the status of your request anytime here:",
    input.trackingUrl,
    "",
    "Our dispatch team will reach out to confirm a time — usually within 24 hours.",
    "",
    `Thanks,`,
    input.companyName,
  ].join("\n");
  return { html, text };
}

export function renderNewsletterWelcomeEmailHtml(
  input: { companyName: string; name?: string | null } & EnvDate,
): EmailRender {
  const headline = input.name ? `Welcome, ${input.name}` : "You're on the list";
  const html = emailShell({
    subject: `Thanks for subscribing to ${input.companyName} updates`,
    preheader: "Service tips, seasonal offers, and company news — straight to your inbox.",
    kicker: "Newsletter",
    headline,
    bodyHtml: textToHtml(
      `Thanks for subscribing to ${input.companyName} news and updates! We'll keep you posted on service tips, seasonal offers, and company news.`,
    ),
    hero: true,
    variant: "marketing",
    companyName: input.companyName,
    env: input.env,
  });
  const text = [
    `Hi ${input.name ?? "there"},`,
    "",
    `Thanks for subscribing to ${input.companyName} news and updates!`,
    "We'll keep you posted on service tips, seasonal offers, and company news.",
    "",
    "If you didn't request this, you can unsubscribe anytime by replying to this email.",
    "",
    `Thanks,`,
    input.companyName,
  ].join("\n");
  return { html, text };
}

export function renderSecurityOtpEmailHtml(
  input: { companyName: string; code: string; ttlMinutes: number } & EnvDate,
): EmailRender {
  const html = emailShell({
    subject: `Your ${input.companyName} verification code`,
    preheader: `Use code ${input.code} to verify. It expires in ${input.ttlMinutes} minutes.`,
    kicker: "Security",
    headline: "Verify it's you",
    bodyHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
      <tr><td align="center" style="padding:14px 0;"><span style="font-family:monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:#0b1118;">${escapeHtml(input.code)}</span></td></tr>
    </table>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">Enter this code to finish signing in. It expires in ${escapeHtml(input.ttlMinutes)} minutes. Never share it with anyone.</p>`,
    companyName: input.companyName,
    env: input.env,
  });
  const text = `Your ${input.companyName} verification code is ${input.code}.\nIt expires in ${input.ttlMinutes} minutes. Never share it with anyone.`;
  return { html, text };
}

export function renderReviewRequestEmailHtml(
  input: { companyName: string; customerName: string; body: string; reviewHref: string } & EnvDate,
): EmailRender {
  const html = emailShell({
    subject: `How did we do, ${input.customerName}?`,
    preheader: `Tell us about your experience with ${input.companyName}.`,
    kicker: "Your feedback",
    headline: `We'd love your review`,
    bodyHtml: textToHtml(input.body),
    cta: { label: "Leave a review", href: input.reviewHref },
    companyName: input.companyName,
    env: input.env,
  });
  const text = `${input.body}\n\nLeave a review here: ${input.reviewHref}\n\n${input.companyName}`;
  return { html, text };
}

// ── Marketing campaign templates ──────────────────────────────────────────

export interface MarketingCampaignInput extends EnvDate {
  companyName: string;
  headline: string;
  body: string;
  cta: EmailCta;
  ctaCaption?: string;
  kicker?: string;
}

/** Hero-led promotional campaign email. */
export function renderPromoEmailHtml(input: MarketingCampaignInput): EmailRender {
  const html = emailShell({
    subject: `Special offer from ${input.companyName}`,
    preheader: `${input.headline} — offer for a limited time.`,
    kicker: input.kicker ?? "Special offer",
    headline: input.headline,
    bodyHtml: textToHtml(input.body),
    cta: input.cta,
    ctaCaption: input.ctaCaption,
    hero: true,
    variant: "marketing",
    companyName: input.companyName,
    env: input.env,
  });
  const text = `${input.headline}\n\n${input.body}\n\n${input.cta.label}: ${input.cta.href}\n\n${input.companyName}`;
  return { html, text };
}

/** Re-engagement / seasonal campaign email. */
export function renderReopenEmailHtml(
  input: { companyName: string; customerName: string; body?: string; cta?: EmailCta } & EnvDate,
): EmailRender {
  const bodyText = input.body ?? `It's been a while since your last visit to ${input.companyName}. The team is ready when you are — seasonal maintenance, repairs, or a straight-up checkup.`;
  const cta = input.cta ?? { label: "Book now", href: `https://pro.nnact.com/welcome` };
  const html = emailShell({
    subject: `We miss you, ${input.customerName}`,
    preheader: `Life gets busy — ${input.companyName} is here when you need us.`,
    kicker: "We're here",
    headline: `Ready when you are, ${input.customerName}`,
    bodyHtml: textToHtml(bodyText),
    cta,
    hero: true,
    variant: "marketing",
    companyName: input.companyName,
    env: input.env,
  });
  const text = `${bodyText}\n\n${cta.label}: ${cta.href}\n\nThe ${input.companyName} team`;
  return { html, text };
}

/** Exposes the newsletter hero image URL for preview tooling. */
export function newsletterHeroUrl(env?: NodeJS.ProcessEnv): string {
  return emailAssetUrl(EMAIL_HERO_URL, env);
}

/** Muted color shared by marketing builders. */
export const emailMuted = BRAND_MUTED;