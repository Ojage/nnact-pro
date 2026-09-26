import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProspectSelectionRules } from "../src/growth/campaign-enrollment.js";

test("parseProspectSelectionRules normalizes JSON rules", () => {
  const rules = parseProspectSelectionRules({
    sectorSlug: "hotels",
    cities: ["Douala", "Yaoundé"],
    minFitScore: 60,
    equipmentKeywords: ["refrigeration"],
    limit: 50,
  });
  assert.equal(rules.sectorSlug, "hotels");
  assert.deepEqual(rules.cities, ["Douala", "Yaoundé"]);
  assert.equal(rules.minFitScore, 60);
  assert.equal(rules.limit, 50);
  assert.equal(rules.excludeRejected, true);
});

test("parseProspectSelectionRules tolerates empty input", () => {
  assert.deepEqual(parseProspectSelectionRules(null), { excludeRejected: true, limit: 200 });
});
