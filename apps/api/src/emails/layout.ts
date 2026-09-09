// NNACT brand email shell. Renders a light, responsive, email-client-safe HTML
// frame (table layout, inline styles) around any free-form body HTML. The
// header carries the NNACT logo on the brand navy; a small watermarked
// NNACT Pro Tech hero image is available for marketing layouts; the footer
// repeats the wordmark and a muted legal line. Images are hosted on the served
// landing page (pro.nnact.com/welcome) and resolved to absolute URLs so they
// render in every mailbox.
//
// All dynamic text must be escaped before being placed in layout fields; see
// escapeHtml below. Never trust customer/operator strings into HTML.

export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Absolute URL of a branded asset served from the landing page. */
export function emailAssetUrl(file: string, env: NodeJS.ProcessEnv = process.env): string {
  const base = (env.PUBLIC_WEB_URL?.trim() || "https://pro.nnact.com").replace(/\/$/, "");
  return `${base}/welcome/${file}`;
}

export const EMAIL_LOGO_URL = "nnact-email-logo.png";
export const EMAIL_HERO_URL = "nnact-email-hero.jpg";

const BRAND_NAVY = "#0b1118";
const BRAND_BLUE = "#0d419d";
const BRAND_BLUE_END = "#00255d";
const BRAND_GREEN = "#16a34a";
const BODY_BG = "#f3f5f9";
const CARD_BG = "#ffffff";
const HEADING = "#0b1118";
const TEXT = "#334155";
const MUTED = "#64748b";
const RULE = "#e6e9ef";

export interface EmailCta {
  label: string;
  href: string;
}

export interface EmailShellOptions {
  /** Document <title> / preheader seed. Not the sent subject line. */
  subject: string;
  /** Hidden preview text shown after the subject in the inbox list. */
  preheader: string;
  /** Small kicker above the headline, e.g. "INVOICE" or "SPECIAL OFFER". */
  kicker?: string;
  /** Big heading shown at the top of the body card. */
  headline: string;
  /** Escaped body HTML (paragraphs, buttons). */
  bodyHtml: string;
  /** Primary call-to-action button. */
  cta?: EmailCta;
  /** Optional smaller text line under the CTA. */
  ctaCaption?: string;
  /** Renders the watermarked NNACT Pro Tech hero image under the header. */
  hero?: boolean;
  /** Alternate body background tint for marketing layouts. */
  variant?: "standard" | "marketing";
  /** Organization display name shown in the footer. */
  companyName?: string;
  /** Extra footer line, e.g. a street address or phone. */
  footerLine?: string;
  env?: NodeJS.ProcessEnv;
}

function heroHtml(env?: NodeJS.ProcessEnv): string {
  const src = emailAssetUrl(EMAIL_HERO_URL, env);
  return `<a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="NNACT Pro Tech" width="600" style="display:block;width:100%;height:auto;border:0;outline:none;text-decoration:none;" /></a>`;
}

function logoHtml(width: number, env?: NodeJS.ProcessEnv): string {
  const src = emailAssetUrl(EMAIL_LOGO_URL, env);
  return `<img src="${src}" alt="NNACT" width="${width}" style="display:block;width:${width}px;height:auto;border:0;outline:none;text-decoration:none;" />`;
}

/** Formats plain text as safe HTML paragraphs. */
export function textToHtml(text: string): string {
  return text
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${TEXT};">${escapeHtml(line)}</p>`)
    .join("\n");
}

export function emailShell(options: EmailShellOptions): string {
  const env = options.env;
  const hero = options.hero ?? false;
  const marketingTint = options.variant === "marketing" ? `style="background:linear-gradient(160deg,#0b1118 0%,#0d419d 100%);"` : `style="background:${BRAND_BLUE};"`;
  const ctaBlock = options.cta
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr><td align="center" style="padding:0 32px;">
         <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
           <td align="center" bgcolor="${BRAND_GREEN}" style="border-radius:10px;">
             <a href="${escapeHtml(options.cta.href)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:.2px;">${escapeHtml(options.cta.label)}</a>
           </td>
         </tr></table>
         ${options.ctaCaption ? `<p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:${MUTED};">${escapeHtml(options.ctaCaption)}</p>` : ""}
       </td></tr></table>`
    : "";
  const kickerBlock = options.kicker
    ? `<p style="margin:0 0 8px;font-size:11px;letter-spacing:2.4px;text-transform:uppercase;color:${escapeHtml(BRAND_GREEN)};font-weight:700;">${escapeHtml(options.kicker)}</p>`
    : "";
  const companyName = escapeHtml(options.companyName || "NNACT Pro Tech");
  const footerLine = options.footerLine ? `<p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:${MUTED};">${escapeHtml(options.footerLine)}</p>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(options.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BODY_BG};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <span style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;color:#f3f5f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(options.preheader)}&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BODY_BG}" style="background:${BODY_BG};">
    <tr>
      <td align="center" style="padding:24px 16px 40px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${CARD_BG};border-radius:18px;overflow:hidden;border:1px solid ${RULE};">
          <!-- Header band -->
          <tr><td align="center" ${marketingTint} style="padding:26px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background:${CARD_BG};border-radius:14px;padding:8px;">${logoHtml(92, env)}</td></tr></table>
          </td></tr>
          <!-- Watermarked NNACT hero (marketing layouts) -->
          ${hero ? `<tr><td style="padding:0;border-bottom:1px solid ${RULE};">${heroHtml(env)}</td></tr>` : ""}
          <!-- Body card -->
          <tr><td style="padding:30px 32px 8px;">
            ${kickerBlock}
            <h1 style="margin:0 0 16px;font-size:23px;line-height:1.25;font-weight:700;color:${HEADING};">${escapeHtml(options.headline)}</h1>
          </td></tr>
          <tr><td style="padding:0 32px 26px;">${options.bodyHtml}</td></tr>
          ${ctaBlock}
          <!-- Footer band -->
          <tr><td style="background:${BRAND_NAVY};padding:26px 32px 28px;text-align:center;">
            <p style="margin:0;font-family:Inter,Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:2px;color:#22c55e;">NNACT&nbsp;&#183;&nbsp;PRO&nbsp;TECH</p>
            <p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#8fa3b8;">&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
            ${footerLine}
          </td></tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;line-height:1.5;color:${MUTED};text-align:center;">You received this message because it relates to your service with ${companyName}. If this was unexpected, reply to this email and we'll fix it.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}