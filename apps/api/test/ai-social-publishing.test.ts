// AI automation cross-publishing to social channels.
//
// Two behaviours are pinned here because both were previously wrong in ways
// that reported success for work that never happened:
//  1. `socialPublishSucceeded` must read the worker's counts, not assume a
//     completed sweep means the post went out.
//  2. Facebook copy is self-contained; LinkedIn copy carries the canonical link.
import { test } from "node:test";
import assert from "node:assert/strict";
import { socialCopyFor, socialPublishSucceeded } from "../src/ai/automation.js";
import { AI_RUN_STATES } from "@nnact/shared";
import { ARTICLE_JSON_SCHEMA_DOC } from "../src/ai/prompts.js";

const URL = "https://nnact.com/en/blog/generator-care-1a2b";

const ARTICLE = {
  title: "Keeping a cold room cold",
  summary: "A two sentence summary.",
  linkedinCaption: "Short LinkedIn copy.",
  facebookPost: "A conversational Facebook post that stands alone.",
};

test("a sweep that processed nothing is not a success", () => {
  // The old code set `linkedinPublished = true` unconditionally after sweep().
  assert.equal(socialPublishSucceeded({ succeeded: 0, failed: 0 }), false);
});

test("a sweep with a failed publication is not a success", () => {
  // sweep() swallows provider errors and counts them; the post never shipped.
  assert.equal(socialPublishSucceeded({ succeeded: 1, failed: 1 }), false);
  assert.equal(socialPublishSucceeded({ succeeded: 0, failed: 1 }), false);
});

test("a clean sweep with at least one success is a success", () => {
  assert.equal(socialPublishSucceeded({ succeeded: 1, failed: 0 }), true);
  assert.equal(socialPublishSucceeded({ succeeded: 3, failed: 0 }), true);
});

test("LinkedIn copy uses the caption and appends the canonical link", () => {
  assert.equal(socialCopyFor("LINKEDIN", ARTICLE, URL), `Short LinkedIn copy.\n\n${URL}`);
});

test("Facebook copy is self-contained and omits the link", () => {
  const copy = socialCopyFor("FACEBOOK", ARTICLE, URL);
  assert.equal(copy, "A conversational Facebook post that stands alone.");
  assert.ok(!copy.includes(URL), "a Facebook reader will not follow a link out of the post");
});

test("both channels degrade to the summary, then the headline", () => {
  const noCaptions = { title: "Headline only", summary: "Summary text." };
  assert.equal(socialCopyFor("FACEBOOK", noCaptions, URL), "Summary text.");
  assert.equal(socialCopyFor("LINKEDIN", noCaptions, URL), `Summary text.\n\n${URL}`);

  const titleOnly = { title: "Headline only" };
  assert.equal(socialCopyFor("FACEBOOK", titleOnly, URL), "Headline only");
  assert.equal(socialCopyFor("LINKEDIN", titleOnly, URL), `Headline only\n\n${URL}`);
});

test("blank captions fall through instead of producing an empty post", () => {
  const blank = { title: "Headline", summary: "   ", linkedinCaption: "", facebookPost: "\n\t " };
  assert.equal(socialCopyFor("FACEBOOK", blank, URL), "Headline");
  assert.equal(socialCopyFor("LINKEDIN", blank, URL), `Headline\n\n${URL}`);
});

test("PUBLISHING_FACEBOOK is a real run state", () => {
  assert.ok(AI_RUN_STATES.includes("PUBLISHING_FACEBOOK"));
});

test("the writer is asked for a Facebook post", () => {
  assert.match(ARTICLE_JSON_SCHEMA_DOC, /"facebookPost"/);
});
