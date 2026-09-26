import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterQuotableFacts,
  isQuotableFact,
  knowledgeFactKey,
  shouldSkipRefresh,
} from "../src/growth/knowledge.js";
import { suggestCompetitorsFromWebsite } from "../src/growth/competitors-intel.js";

test("only approved sourced facts are quotable in campaigns", () => {
  assert.equal(
    isQuotableFact({ category: "SERVICES", subject: "PM plans", status: "APPROVED", provenance: "SOURCED" }),
    true,
  );
  assert.equal(
    isQuotableFact({ category: "SERVICES", subject: "PM plans", status: "PENDING", provenance: "SOURCED" }),
    false,
  );
  assert.equal(
    isQuotableFact({ category: "SERVICES", subject: "PM plans", status: "APPROVED", provenance: "INFERRED" }),
    false,
  );
  assert.equal(
    isQuotableFact({
      category: "SERVICES",
      subject: "PM plans",
      status: "APPROVED",
      provenance: "INFERRED",
      manuallyCorrected: true,
    }),
    true,
  );
});

test("manual corrections survive refresh skip logic", () => {
  assert.equal(shouldSkipRefresh({ manuallyCorrected: true, status: "PENDING" }), true);
  assert.equal(shouldSkipRefresh({ manuallyCorrected: false, status: "APPROVED" }), true);
  assert.equal(shouldSkipRefresh({ manuallyCorrected: false, status: "PENDING" }), false);
});

test("fact keys normalize subject wording", () => {
  const a = knowledgeFactKey("SERVICES", " 24/7   Call-out ");
  const b = knowledgeFactKey("SERVICES", "24/7 call-out");
  assert.equal(a, b);
});

test("filterQuotableFacts removes pending and inferred claims", () => {
  const out = filterQuotableFacts([
    { category: "PRICING", subject: "Hidden", status: "APPROVED", provenance: "SOURCED" },
    { category: "SERVICES", subject: "Visible", status: "APPROVED", provenance: "SOURCED" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.subject, "Visible");
});

test("foreign HVAC domains are suggested as international references, not local competitors", () => {
  const suggestions = suggestCompetitorsFromWebsite("nnact.com", ["Buea", "Douala"], ["Hotels"]);
  const ace = suggestions.find((s) => s.websiteDomain === "acehvacrepair.com");
  assert.ok(ace);
  assert.equal(ace.classification, "INTERNATIONAL_REFERENCE");
  assert.equal(ace.reviewStatus, "SUGGESTED");
  assert.match(ace.evidenceSummary, /not a direct competitor|reference/i);
});
