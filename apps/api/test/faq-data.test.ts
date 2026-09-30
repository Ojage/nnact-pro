import test from "node:test";
import assert from "node:assert/strict";
import { FAQ_ENTRIES, FAQ_CATEGORIES, faqCategorySummaries, searchFaq } from "../../web/lib/faq-data.js";

test("every entry has a unique id, used as the React key", () => {
  const ids = FAQ_ENTRIES.map((e) => e.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, [], `duplicate FAQ ids: ${dupes.join(", ")}`);
});

test("every entry is in a declared category, and every category has entries", () => {
  const declared = new Set<string>(FAQ_CATEGORIES);
  for (const entry of FAQ_ENTRIES) {
    assert.ok(declared.has(entry.category), `entry ${entry.id} has undeclared category "${entry.category}"`);
  }
  for (const category of FAQ_CATEGORIES) {
    const count = FAQ_ENTRIES.filter((e) => e.category === category).length;
    assert.ok(count > 0, `category "${category}" has no answers, so its jump link would be dead`);
  }
});

test("category anchors are unique, so jump links cannot collide", () => {
  const anchors = faqCategorySummaries().map((c) => c.anchor);
  assert.equal(new Set(anchors).size, anchors.length);
});

test("the counts shown on the jump links match the data", () => {
  for (const summary of faqCategorySummaries()) {
    const actual = FAQ_ENTRIES.filter((e) => e.category === summary.category).length;
    assert.equal(summary.count, actual, `count for "${summary.category}" is wrong`);
  }
});

test("no answer is empty or trivially short", () => {
  for (const entry of FAQ_ENTRIES) {
    assert.ok(entry.question.trim().length > 8, `question too short: ${entry.id}`);
    // A staff FAQ answer that says nothing actionable is worse than no answer,
    // because it looks authoritative while being empty.
    assert.ok(
      entry.answer.trim().length > 60,
      `answer for ${entry.id} is ${entry.answer.trim().length} chars, too short to be useful`,
    );
  }
});

test("every answer ends as a sentence", () => {
  for (const entry of FAQ_ENTRIES) {
    assert.match(entry.answer.trim(), /[.!?]$/, `answer for ${entry.id} does not read as a complete answer`);
  }
});

test("an empty query returns everything, so the page is browsable by default", () => {
  assert.equal(searchFaq("").length, FAQ_ENTRIES.length);
  assert.equal(searchFaq("   ").length, FAQ_ENTRIES.length);
});

test("search matches on answer text, not just the question", () => {
  // Staff will search for the mechanism, not the phrasing of the question.
  assert.ok(searchFaq("bounce").length > 0);
  assert.ok(searchFaq("quiet hours").length > 0);
  assert.ok(searchFaq("suppression").length > 0);
});

test("search is case-insensitive", () => {
  const lower = searchFaq("autopilot").map((e) => e.id);
  const upper = searchFaq("AUTOPILOT").map((e) => e.id);
  assert.deepEqual(upper, lower);
  assert.ok(lower.length > 0);
});

test("multiple words narrow the results rather than widening them", () => {
  const one = searchFaq("campaign").length;
  const two = searchFaq("campaign autopilot").length;
  assert.ok(two <= one, `expected "campaign autopilot" (${two}) to be no broader than "campaign" (${one})`);
});

test("a nonsense query returns nothing rather than everything", () => {
  assert.equal(searchFaq("zzzzqqqxyzzy").length, 0);
});

test("search never returns an entry from outside the searched set", () => {
  const subset = FAQ_ENTRIES.slice(0, 5);
  const out = searchFaq("the", subset);
  assert.ok(out.every((e) => subset.includes(e)));
});
