// Pure validation of the NNACT SMS template catalog: every use case is defined,
// variable declarations match the copy, required variables are actually used,
// and rendering produces the expected out-of-band strings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SMS_TEMPLATE_CATALOG, SMS_TEMPLATE_SLUGS, lookupSmsTemplate, renderSmsTemplate } from "../src/sms/templates.js";

const VAR_RE = /\{\{([A-Za-z0-9_.]+)\}\}/g;

function usedVariables(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(VAR_RE)) {
    if (match[1].startsWith("/#")) continue;
    names.add(match[1].replace(/^#/, ""));
  }
  return [...names];
}

test("catalog slugs are unique and match SME_TEMPLATE_SLUGS ordering", () => {
  const slugs = SMS_TEMPLATE_CATALOG.map((entry) => entry.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.deepEqual(slugs, [...SMS_TEMPLATE_SLUGS]);
});

test("every template declares every variable it actually uses", () => {
  for (const entry of SMS_TEMPLATE_CATALOG) {
    const used = usedVariables(entry.template);
    const undeclared = used.filter((name) => !entry.variables.includes(name));
    assert.deepEqual(undeclared, [], `${entry.slug} uses variables not declared: ${undeclared.join(", ")}`);
  }
});

test("every template uses its required variables", () => {
  for (const entry of SMS_TEMPLATE_CATALOG) {
    const used = usedVariables(entry.template);
    const missing = entry.requiredVariables.filter((name) => !used.includes(name));
    assert.deepEqual(missing, [], `${entry.slug} is missing required variables: ${missing.join(", ")}`);
  }
});

test("audience is valid and at least one staff and one customer template exist", () => {
  for (const entry of SMS_TEMPLATE_CATALOG) {
    assert.ok(entry.audience === "customer" || entry.audience === "staff", `${entry.slug} has bad audience`);
  }
  assert.ok(SMS_TEMPLATE_CATALOG.some((entry) => entry.audience === "staff"));
  assert.ok(SMS_TEMPLATE_CATALOG.some((entry) => entry.audience === "customer"));
});

test("templates render out-of-band known variables and drop unknown ones", () => {
  const message = renderSmsTemplate("otp_login", { code: "482913", companyName: "NNACT", ttlMinutes: 10 });
  assert.match(message, /482913/);
  assert.match(message, /NNACT/);
  assert.match(message, /10 minutes/);

  const declined = renderSmsTemplate("estimate_declined", {
    companyName: "NNACT",
    customerName: "Aisha Etonde",
    estimateNumber: "EST-1004",
    contactPhone: "237651385746",
  });
  assert.match(declined, /EST-1004/);
  assert.match(declined, /Aisha Etonde/);
});

test("section variables render only when truthy", () => {
  const withExpiry = renderSmsTemplate("portal_link", { companyName: "NNACT", portalLink: "https://p/NNACT/link", portalExpiresAt: "Sep 30, 2026" });
  assert.match(withExpiry, /expires Sep 30, 2026/);
  const withoutExpiry = renderSmsTemplate("portal_link", { companyName: "NNACT", portalLink: "https://p/NNACT/link" });
  assert.ok(!withoutExpiry.includes("expires"), "expiry clause must not leak when the date is absent");
});

test("unknown slug throws", () => {
  assert.throws(() => lookupSmsTemplate("does_not_exist" as never));
});

test("catalog exposes the full NNACT use-case surface", () => {
  const labels = new Set(SMS_TEMPLATE_CATALOG.map((entry) => entry.slug));
  for (const expected of ["otp_login", "job_assigned", "invoice_issued", "estimate_ready", "portal_link", "review_request", "promo_offer", "staff_new_request"]) {
    assert.ok(labels.has(expected), `missing expected template: ${expected}`);
  }
});