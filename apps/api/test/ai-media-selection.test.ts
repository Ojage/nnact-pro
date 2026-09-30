// Label-aware featured-image selection.
//
// Why this exists: the automation used to pick `pickLeastUsedCandidate`, which
// ignored every label and returned the least-used approved photo. An operator
// labelling "this is a maintenance tip image" in the gallery got no effect at
// all — the next post picked whatever had the lowest counter. The gallery is
// only worth building if these labels actually steer the pipeline, so the
// ranking is pinned here.
//
// `image.ts` imports the db and touches disk, so these exercise the pure
// ranking functions directly rather than resolveFeaturedImage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { briefKeywords, pickCandidateFor, scoreCandidate, tagOverlap } from "../src/ai/image.js";
import type { MediaContext, AiCandidateMedia } from "../src/ai/context.js";
import type { ContentBriefDTO } from "@nnact/shared";

function candidate(over: Partial<AiCandidateMedia> & { id: string }): AiCandidateMedia {
  return {
    url: `https://api.test/api/v1/public/media/${over.id}`,
    kind: "photo",
    contentType: "image/jpeg",
    altText: null,
    usageCount: 0,
    lastUsed: null,
    useFor: null,
    tags: [],
    ...over,
  };
}

function context(...items: AiCandidateMedia[]): MediaContext {
  return { approved: items, logoUrl: null, canGenerateImages: false };
}

const brief = (over: Partial<ContentBriefDTO> = {}): ContentBriefDTO => ({
  topic: "Why fridge breakdowns spike after power cuts",
  angle: "How appliance repair and maintenance prevents the pattern",
  audience: "homeowners",
  serviceCategory: "Refrigeration",
  contentType: "ARTICLE",
  primaryMessage: "maintenance prevents failures",
  cta: "book a service",
  desiredLength: 420,
  imageDirection: "Technician servicing a refrigerator",
  ...over,
});

test("an asset labelled for this post kind outranks a heavily used one", () => {
  const media = context(
    candidate({ id: "a-popular", usageCount: 40 }),
    candidate({ id: "b-exact", usageCount: 3, useFor: "ARTICLE" }),
  );
  assert.equal(pickCandidateFor(brief(), media)?.id, "b-exact");
});

test("a subject-tag match outranks an unlabelled asset", () => {
  const media = context(
    candidate({ id: "a-generic", usageCount: 0 }),
    candidate({ id: "b-refrigeration", usageCount: 99, tags: ["refrigeration"] }),
  );
  assert.equal(pickCandidateFor(brief(), media)?.id, "b-refrigeration");
});

test("an exact post-kind label still beats a subject tag on a different post kind", () => {
  // The whole reason the tiers are coarse rather than a single score: an
  // operator who labelled an image for maintenance tips means it.
  const media = context(
    candidate({ id: "a-wrong-kind", usageCount: 0, tags: ["refrigeration"] }),
    candidate({ id: "b-right-kind", usageCount: 50, useFor: "MAINTENANCE_TIP" }),
  );
  const chosen = pickCandidateFor(brief({ contentType: "MAINTENANCE_TIP" }), media);
  assert.equal(chosen?.id, "b-right-kind");
});

test("within a tier the least-used asset wins, so rotation spreads out", () => {
  const media = context(
    candidate({ id: "a-used-5", usageCount: 5, useFor: "ARTICLE" }),
    candidate({ id: "b-used-0", usageCount: 0, useFor: "ARTICLE" }),
    candidate({ id: "c-used-2", usageCount: 2, useFor: "ARTICLE" }),
  );
  assert.equal(pickCandidateFor(brief(), media)?.id, "b-used-0");
});

test("equal usage tie-breaks on id so a retry picks the same asset", () => {
  // Non-determinism here means a retried run can publish a different image than
  // the attempt before it, which looks like a bug to the operator.
  const media = context(
    candidate({ id: "b-second", usageCount: 3, useFor: "ARTICLE" }),
    candidate({ id: "a-first", usageCount: 3, useFor: "ARTICLE" }),
  );
  assert.equal(pickCandidateFor(brief(), media)?.id, "a-first");
  assert.equal(pickCandidateFor(brief(), media)?.id, "a-first");
});

test("non-photo assets (video, logo) are never chosen", () => {
  const media = context(
    candidate({ id: "a-video", kind: "gallery", useFor: "ARTICLE" }),
    candidate({ id: "b-logo", kind: "logo", useFor: "ARTICLE" }),
  );
  assert.equal(pickCandidateFor(brief(), media), null);
});

test("an empty library yields null rather than throwing", () => {
  assert.equal(pickCandidateFor(brief(), context()), null);
});

test("tag matching ignores case and surrounding whitespace", () => {
  // Tags are operator-typed free text; " Fridge " and "fridge" must be one tag
  // or the filter chip and the selection disagree.
  const media = context(
    candidate({ id: "a-generic" }),
    candidate({ id: "b-tagged", tags: ["  Fridge  "] }),
  );
  assert.equal(pickCandidateFor(brief({ topic: "Fridge care" }), media)?.id, "b-tagged");
});

test("stopwords alone cannot produce a tag match", () => {
  // Without a stopword list a tag called "the" or "how" would match almost any
  // brief and the tag tier would be noise.
  assert.equal(tagOverlap(["the", "and", "for"], briefKeywords(brief())), 0);
});

test("brief keywords drop filler but keep the subject", () => {
  const keywords = briefKeywords(brief());
  assert.ok(keywords.has("refrigeration"));
  assert.ok(keywords.has("fridge"));
  assert.ok(keywords.has("maintenance"));
  assert.ok(!keywords.has("the"));
  assert.ok(!keywords.has("how"));
});

test("score tiers are 3 = exact label, 2 = tag overlap, 1 = general", () => {
  const b = brief();
  assert.equal(scoreCandidate(candidate({ id: "x", useFor: "ARTICLE" }), b), 3);
  assert.equal(scoreCandidate(candidate({ id: "x", tags: ["fridge"] }), b), 2);
  assert.equal(scoreCandidate(candidate({ id: "x" }), b), 1);
  // A label for a different post kind is not an exact match, but it is still a
  // deliberate label, so it must not be scored as though it were tagged.
  assert.equal(scoreCandidate(candidate({ id: "x", useFor: "FIELD_STORY" }), b), 1);
});
