// Pure rendering checks for the NNACT branded email templates: the shell emits
// a complete HTML document with the brand assets, operators' message bodies are
// preserved inside the branded frame, dynamic values are HTML-escaped, and the
// marketing builders carry the small watermarked NNACT hero image.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emailShell,
  escapeHtml,
  textToHtml,
  emailAssetUrl,
  EMAIL_LOGO_URL,
  EMAIL_HERO_URL,
} from "../src/emails/layout.js";
import {
  renderDocumentMessageHtml,
  renderInvoiceEmailHtml,
  renderEstimateEmailHtml,
  renderPortalLinkEmailHtml,
  renderBookingConfirmationEmailHtml,
  renderNewsletterWelcomeEmailHtml,
  renderSecurityOtpEmailHtml,
  renderReviewRequestEmailHtml,
  renderPromoEmailHtml,
  renderReopenEmailHtml,
} from "../src/emails/templates.js";

const TEST_ENV = { PUBLIC_WEB_URL: "https://pro.nnact.com" } as NodeJS.ProcessEnv;

test("emailAssetUrl resolves against PUBLIC_WEB_URL and the landing mount", () => {
  assert.equal(emailAssetUrl(EMAIL_LOGO_URL, TEST_ENV), "https://pro.nnact.com/welcome/nnact-email-logo.png");
  assert.equal(emailAssetUrl(EMAIL_LOGO_URL, {} as NodeJS.ProcessEnv), "https://pro.nnact.com/welcome/nnact-email-logo.png");
  assert.equal(emailAssetUrl(EMAIL_HERO_URL, TEST_ENV), "https://pro.nnact.com/welcome/nnact-email-hero.jpg");
});

test("escapeHtml neutralizes markup and entities", () => {
  assert.equal(escapeHtml("<script>alert('x')</script> & \"quoted\""), "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;quoted&quot;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(0), "0");
});

test("textToHtml converts non-empty lines to escaped paragraphs", () => {
  const html = textToHtml("Hi Aisha\n\nBalance due: $120.50 < 0?").replace(/\s+/g, " ");
  assert.match(html, /Hi Aisha/);
  assert.match(html, /Balance due: \$120\.50 &lt; 0\?/);
  assert.ok(!html.includes("<p></p>"), "blank lines must not produce empty paragraphs");
});

test("emailShell emits a full document with brand assets and only requested hero", () => {
  const withHero = emailShell({
    subject: "Test",
    preheader: "Preview",
    headline: "Hello",
    bodyHtml: "<p>Body</p>",
    hero: true,
    companyName: "NNACT",
    env: TEST_ENV,
  });
  assert.match(withHero, /<!DOCTYPE html>/);
  assert.match(withHero, /welcome\/nnact-email-logo\.png/);
  assert.match(withHero, /welcome\/nnact-email-hero\.jpg/);
  assert.match(withHero, /NNACT&nbsp;&#183;&nbsp;PRO&nbsp;TECH/);
  assert.match(withHero, /&copy; \d{4} NNACT\. All rights reserved\./);

  const noHero = emailShell({ subject: "Test", preheader: "Preview", headline: "Hello", bodyHtml: "<p>Body</p>", env: TEST_ENV });
  assert.ok(!noHero.includes(EMAIL_HERO_URL), "hero image must only render when requested");
});

test("document message emails wrap operator body inside the brand frame and escape it", () => {
  const { html, text } = renderInvoiceEmailHtml({
    companyName: "NNACT",
    customerName: "Aisha <Team>",
    subject: "Invoice INV-1009 from NNACT",
    body: "Hi Aisha, your invoice is ready. Balance due: $100.",
    portalLink: "https://portal/p/abc",
    env: TEST_ENV,
  });
  assert.match(html, /Invoice/);
  assert.match(html, /INV-1009/);
  assert.match(html, /Balance due: \$100\./);
  assert.match(html, /href="https:\/\/portal\/p\/abc"/);
  assert.ok(!html.includes("Aisha <Team>"), "customer name must be escaped");
  assert.equal(text.includes("portal/p/abc"), true);
});

test("estimate email carries the estimate kicker", () => {
  const { html } = renderEstimateEmailHtml({
    companyName: "NNACT",
    customerName: "Aisha Etonde",
    subject: "Estimate EST-1010 from NNACT",
    body: "Please review your estimate.",
    env: TEST_ENV,
  });
  assert.match(html, /Estimate/);
  assert.match(html, /EST-1010/);
});

test("portal link email includes a CTA pointed at the portal", () => {
  const { html } = renderPortalLinkEmailHtml({
    companyName: "NNACT",
    customerName: "Aisha Etonde",
    body: "Here is your secure portal link.",
    portalLink: "https://portal.example/p/tok",
    env: TEST_ENV,
  });
  assert.match(html, /href="https:\/\/portal\.example\/p\/tok"/);
  assert.match(html, /Open your portal/);
});

test("booking confirmation email shows service, reference, and track CTA", () => {
  const { html } = renderBookingConfirmationEmailHtml({
    companyName: "NNACT",
    customerName: "Aisha Etonde",
    service: "AC Repair",
    requestId: "REQ-2026-001",
    trackingUrl: "https://pro.nnact.com/welcome/track?r=1",
    env: TEST_ENV,
  });
  assert.match(html, /AC Repair/);
  assert.match(html, /REQ-2026-001/);
  assert.match(html, /href="https:\/\/pro\.nnact\.com\/welcome\/track\?r=1"/);
});

test("newsletter welcome renders a marketing layout with the watermarked hero", () => {
  const { html, text } = renderNewsletterWelcomeEmailHtml({ companyName: "NNACT", name: "Aisha", env: TEST_ENV });
  assert.match(html, /welcome\/nnact-email-hero\.jpg/);
  assert.match(html, /Welcome, Aisha/);
  assert.match(html, /NNACT news and updates/);
  assert.match(text, /Thanks for subscribing/);
});

test("security OTP email renders the code without leaking it to text preview only", () => {
  const { html, text } = renderSecurityOtpEmailHtml({ companyName: "NNACT", code: "482913", ttlMinutes: 10, env: TEST_ENV });
  assert.match(html, /482913/);
  assert.match(text, /482913/);
  assert.match(text, /10 minutes/);
});

test("review request email renders CTA and body", () => {
  const { html } = renderReviewRequestEmailHtml({
    companyName: "NNACT",
    customerName: "Aisha Etonde",
    body: "If we earned it, please leave us a review.",
    reviewHref: "https://reviews.example/r/nnact",
    env: TEST_ENV,
  });
  assert.match(html, /href="https:\/\/reviews\.example\/r\/nnact"/);
  assert.match(html, /If we earned it/);
});

test("marketing promo and reopen emails render hero, headline, and CTA", () => {
  const promo = renderPromoEmailHtml({
    companyName: "NNACT",
    headline: "Winter tune-up special",
    body: "Save 15% on seasonal maintenance booked this month.",
    cta: { label: "Book now", href: "https://pro.nnact.com/welcome" },
    env: TEST_ENV,
  });
  assert.match(promo.html, /Winter tune-up special/);
  assert.match(promo.html, /welcome\/nnact-email-hero\.jpg/);
  assert.match(promo.html, /Book now/);

  const reopen = renderReopenEmailHtml({
    companyName: "NNACT",
    customerName: "Aisha Etonde",
    env: TEST_ENV,
  });
  assert.match(reopen.html, /Ready when you are, Aisha Etonde/);
  assert.match(reopen.text, /The NNACT team/);
});

test("operator-authored body inside the generic frame is preserved verbatim", () => {
  const html = renderDocumentMessageHtml({
    companyName: "NNACT",
    subject: "Invoice from NNACT",
    body: "Hi there,\n\nYour balance is $43.00.\nThanks!",
    env: TEST_ENV,
  });
  assert.match(html, /Your balance is \$43\.00\./);
  assert.match(html, /Thanks!/);
  assert.match(html, /&copy;/);
});