import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BUSINESS_SETTINGS,
  buildEstimateTerms,
  estimateDeposit,
  estimateDocumentData,
  renderFieldDocumentHtml,
  splitDocumentBullets,
  type DocumentEstimateLike,
  type DocumentOrgLike,
} from "@nnact/shared";
import type { OrgSettingsDTO } from "./api";

function orgWith(settings: Partial<BusinessSettingsLike> = {}): OrgSettingsDTO {
  return {
    id: "org-1",
    name: "Test HVAC Co",
    timezone: "Africa/Douala",
    brandColor: "#2563EB",
    removeOpenFieldProAttribution: false,
    businessSettings: {
      ...DEFAULT_BUSINESS_SETTINGS,
      ...settings,
      invoice: {
        ...DEFAULT_BUSINESS_SETTINGS.invoice,
        ...(settings.invoice ?? {}),
        visibility: {
          ...DEFAULT_BUSINESS_SETTINGS.invoice.visibility,
          ...(settings.invoice?.visibility ?? {}),
        },
      },
    },
  };
}

// Structural subset of BusinessSettings used by the org fixture.
type BusinessSettingsLike = typeof DEFAULT_BUSINESS_SETTINGS;

function estimateLike(overrides: Partial<DocumentEstimateLike> = {}): DocumentEstimateLike & { total: number } {
  return {
    id: "est-1",
    number: "EST-2000",
    accepted: false,
    createdAt: "2026-09-13T10:00:00Z",
    status: "sent",
    total: 20_000,
    ...overrides,
  };
}

function orgLike(): DocumentOrgLike {
  return { name: "Test HVAC Co", brandColor: "#2563EB", businessSettings: DEFAULT_BUSINESS_SETTINGS };
}

function customerLike(overrides: Partial<{ name: string; email?: string | null; phone?: string | null; company?: string; address?: string }> = {}): {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string;
  address?: string;
} {
  return { name: "Jane Doe", ...overrides };
}

function jobLike(overrides: Partial<{ title: string; description?: string | null; number?: string | null; serviceAddress?: string | null }> = {}): {
  title: string;
  description?: string | null;
  number?: string | null;
  serviceAddress?: string | null;
} {
  return { title: "AC repair", ...overrides };
}

function renderEstimate({
  estimate = estimateLike(),
  customer,
  job,
  lineItems = [],
  org = orgLike(),
}: {
  estimate?: DocumentEstimateLike & { total: number };
  customer?: { name?: string; email?: string | null; phone?: string | null; company?: string; address?: string };
  job?: { title?: string; description?: string | null; number?: string | null; serviceAddress?: string | null } | undefined;
  lineItems?: Array<{ description: string; quantity: number; unitPrice: number; unit?: string | null }>;
  org?: DocumentOrgLike | null;
} = {}) {
  return renderFieldDocumentHtml(
    estimateDocumentData({ estimate, customer: customerLike(customer), job: jobLike(job), lineItems, org: org ?? null }),
  );
}

test("scope bullets render in their own section", () => {
  const html = renderEstimate({
    estimate: estimateLike({ scope: "Replace evaporator\n- Recharge R-410A gas\nInstall a new filter drier" }),
    job: { title: "AC repair" },
  });
  assert.match(html, /Scope of work/);
  assert.match(html, /Replace evaporator/);
  assert.match(html, /Recharge R-410A gas/);
  assert.match(html, /Install a new filter drier/);
});

test("splitDocumentBullets strips list markers and numbering", () => {
  assert.deepEqual(splitDocumentBullets("- First\n• Second\n3. Third\n\nFourth"), ["First", "Second", "Third", "Fourth"]);
  assert.deepEqual(splitDocumentBullets(""), []);
});

test("technical job shorthand is never printed as customer-facing notes", () => {
  const html = renderEstimate({
    job: { title: "AC repair", description: "check low side psi, compressor draws low amps, order cap" },
  });
  assert.doesNotMatch(html, /low side psi/);
  assert.doesNotMatch(html, /order cap/);
  assert.doesNotMatch(html, /low amps/);
});

test("terms carry only policy-derived facts, with no blanket price-inclusion claim", () => {
  const settings = {
    ...DEFAULT_BUSINESS_SETTINGS,
    estimate: {
      ...DEFAULT_BUSINESS_SETTINGS.estimate,
      expirationDays: 21,
      depositMode: "percent" as const,
      depositValue: 50,
      signatureRequired: true,
      paymentTerms: "Balance due on completion.",
      warrantyTerms: "90-day parts warranty.",
      defaultExclusions: "Consumables are excluded.",
    },
  };
  const terms = buildEstimateTerms({
    estimate: estimateLike(),
    settings: settings.estimate,
    orgTerms: [],
    currency: "XAF",
  });
  const joined = terms.join("\n");
  assert.match(joined, /valid for 21 days/);
  assert.match(joined, /Balance due on completion/);
  assert.match(joined, /90-day parts warranty/);
  assert.match(joined, /initial deposit of 50%/, "deposit percent must be priced");
  assert.match(joined, /Consumables are excluded/);
  assert.doesNotMatch(joined, /prices include/i, "never assert blanket inclusions");
});

test("explicit estimate terms override any computed policy terms", () => {
  const terms = buildEstimateTerms({
    estimate: estimateLike(),
    settings: DEFAULT_BUSINESS_SETTINGS.estimate,
    orgTerms: ["Org term one."],
    explicit: ["Custom explicit term."],
    currency: "XAF",
  });
  assert.deepEqual(terms, ["Custom explicit term."]);
});

test("estimateDeposit computes fixed and percent deposits", () => {
  const percent = estimateDeposit({
    settings: { ...DEFAULT_BUSINESS_SETTINGS.estimate, depositMode: "percent" as const, depositValue: 25 },
    totalCents: 80_000,
    currency: "XAF",
  });
  assert.ok(percent);
  assert.equal(percent.requiredCents, 20_000);
  assert.equal(percent.balanceCents, 60_000);
  const fixed = estimateDeposit({
    settings: { ...DEFAULT_BUSINESS_SETTINGS.estimate, depositMode: "fixed" as const, depositValue: 15_000 },
    totalCents: 80_000,
    currency: "XAF",
  });
  assert.ok(fixed);
  assert.equal(fixed.requiredCents, 15_000);
  assert.equal(fixed.balanceCents, 65_000);
});

test("unit column appears when a line carries a unit and is hidden otherwise", () => {
  const withUnits = renderEstimate({
    lineItems: [{ description: "R-410A", quantity: 2, unitPrice: 5_000, unit: "kg" }],
    job: { title: "AC repair" },
  });
  assert.match(withUnits, /<th class="center">Unit<\/th>/);
  assert.match(withUnits, />kg</);

  const noUnits = renderEstimate({
    lineItems: [{ description: "Labor", quantity: 1, unitPrice: 20_000 }],
    job: { title: "AC repair" },
  });
  assert.doesNotMatch(noUnits, /<th class="center">Unit<\/th>/);
});

test("approved option carries the acceptance block and selected badge", () => {
  const html = renderEstimate({
    estimate: estimateLike({
      status: "approved",
      accepted: true,
      acceptedAt: "2026-09-15T14:00:00Z",
      acceptedByName: "Jane Doe",
      acceptedMethod: "signature",
      selectedOptionId: "o2",
      options: [
        { id: "o1", label: "Basic", lineItems: [{ description: "Repair", quantity: 1, unitPrice: 10_000 }] },
        { id: "o2", label: "Full", lineItems: [{ description: "Full service", quantity: 1, unitPrice: 20_000 }] },
      ],
    }),
    job: { title: "AC repair" },
  });
  assert.match(html, /<h3>Full<\/h3><span class="badge approve">Approved<\/span>/);
  assert.match(html, /Accepted by signature/);
  assert.match(html, /Jane Doe/);
});

test("customer address and service address print in the parties block", () => {
  const html = renderEstimate({
    customer: { name: "Jane Doe", company: "Doe Properties", address: "12 Mango St, Douala" },
    job: { title: "AC repair", number: "JOB-42", serviceAddress: "Unit 4, 12 Mango St, Douala" },
  });
  assert.match(html, /12 Mango St, Douala/);
  assert.match(html, /Doe Properties/);
  assert.match(html, /JOB-42/);
  assert.match(html, /Unit 4, 12 Mango St, Douala/);
});

test("print CSS keeps the brand rail clear of content and pages flow naturally", () => {
  const html = renderEstimate({
    lineItems: [{ description: "Evaporator", quantity: 1, unitPrice: 20_000 }],
    job: { title: "AC repair" },
  });
  assert.match(html, /@media print/);
  assert.match(html, /padding:36px 44px 36px 64px/, "left padding must clear the 14px brand rail");
  assert.match(html, /min-height:0/, "no forced screen height in print");
  assert.match(html, /height:auto/);
  assert.match(html, /thead\{display:table-header-group\}/, "repeat table headers across pages");
});

test("currency headers use the org currency symbol, not the ISO code", () => {
  const html = renderEstimate({
    lineItems: [{ description: "Evaporator", quantity: 1, unitPrice: 20_000 }],
    job: { title: "AC repair" },
  });
  assert.match(html, /Unit Price \(FCFA\)/);
  assert.doesNotMatch(html, /Unit Price \(XAF\)/);
});

test("amount in words uses the formatted total", () => {
  const html = renderEstimate({
    lineItems: [{ description: "Evaporator", quantity: 1, unitPrice: 20_000 }],
    job: { title: "AC repair" },
  });
  assert.match(html, /TOTAL FCFA 200/);
  assert.match(html, /Twenty Thousand Francs CFA Only/);
});