import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bigramSimilarity,
  contactNormalizedValue,
  detectDuplicates,
  duplicateLookupKeys,
  hasHardDuplicate,
  isSimilarCompany,
  scoreDuplicate,
  type DuplicateCandidate,
} from "../src/growth/duplicates.js";

const acme: DuplicateCandidate = {
  id: "a1111111-1111-1111-1111-111111111111",
  companyName: "Acme Air Conditioning",
  websiteDomain: "acmeair.co.za",
  contacts: [
    { kind: "EMAIL", value: "Facilities@AcmeAir.co.za" },
    { kind: "PHONE", value: "+27 11 555 0100" },
  ],
};

test("a matching contact email is the strongest duplicate signal", () => {
  const match = scoreDuplicate(
    { company: "Totally Different Name", email: "facilities@acmeair.co.za" },
    acme,
  );
  assert.ok(match);
  assert.equal(match.matchedOn, "EMAIL");
  assert.equal(match.score, 100);
  assert.equal(match.id, acme.id);
});

test("a matching website domain flags a duplicate", () => {
  const match = scoreDuplicate({ domain: "www.acmeair.co.za" }, acme);
  assert.ok(match);
  assert.equal(match.matchedOn, "DOMAIN");
  assert.ok(match.score >= 90);
});

test("a subdomain of the recorded domain still matches", () => {
  const match = scoreDuplicate({ domain: "mail.acmeair.co.za" }, acme);
  assert.ok(match);
  assert.equal(match.matchedOn, "DOMAIN");
});

test("a phone number stored in different formats still matches", () => {
  // The stored contact is "+27 11 555 0100"; the incoming prospect supplies the
  // national form, which only resolves with the organization's country code.
  const match = scoreDuplicate({ phone: "011 555 0100", countryCallingCode: "27" }, acme);
  assert.ok(match);
  assert.equal(match.matchedOn, "PHONE");
  assert.ok(match.score >= 80);
});

test("a national phone number is not guessed at without a country code", () => {
  // Without country context "011 555 0100" and "+27 11 555 0100" are not
  // provably the same number, so they must not be merged.
  assert.equal(scoreDuplicate({ phone: "011 555 0100" }, acme), null);
});

test("similar company names are treated as the same company", () => {
  assert.equal(isSimilarCompany("Acme Air Conditioning", "Acme Air Conditioning"), true);
  assert.equal(isSimilarCompany("Acme Air Conditioning", "ACME Air Conditioning Ltd"), true);
  assert.equal(isSimilarCompany("Acme Air Conditioning", "Acme Airconditioning"), true);
  assert.equal(isSimilarCompany("Acme Air Conditioning", "Boltworks Engineering"), false);
});

test("company-only similarity scores below an identifier match", () => {
  const companyOnly = scoreDuplicate({ company: "Acme Air Conditioning" }, acme);
  const emailMatch = scoreDuplicate({ company: "Acme Air Conditioning", email: "facilities@acmeair.co.za" }, acme);
  assert.ok(companyOnly);
  assert.ok(emailMatch);
  assert.equal(companyOnly.matchedOn, "COMPANY");
  assert.equal(emailMatch.matchedOn, "EMAIL");
  assert.ok(companyOnly.score < emailMatch.score);
});

test("an unrelated record is not a duplicate", () => {
  assert.equal(
    scoreDuplicate(
      { company: "Boltworks Engineering", domain: "boltworks.co.za", email: "info@boltworks.co.za" },
      acme,
    ),
    null,
  );
});

test("matches are ranked strongest first", () => {
  const weak: DuplicateCandidate = {
    id: "b2222222-2222-2222-2222-222222222222",
    companyName: "Acme Airconditioning",
    websiteDomain: null,
  };
  const matches = detectDuplicates(
    { company: "Acme Air Conditioning", email: "facilities@acmeair.co.za" },
    [weak, acme],
  );
  assert.equal(matches.length, 2);
  assert.equal(matches[0].id, acme.id);
  assert.equal(matches[0].matchedOn, "EMAIL");
  assert.ok(matches[0].score >= matches[1].score);
});

test("a similar name alone is a suggestion, not an automatic merge", () => {
  const similarNameOnly: DuplicateCandidate = {
    id: "c3333333-3333-3333-3333-333333333333",
    companyName: "Acme Airconditioning",
    websiteDomain: null,
  };
  const suggestions = detectDuplicates({ company: "Acme Air Conditioning" }, [similarNameOnly]);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].matchedOn, "COMPANY");
  assert.equal(hasHardDuplicate(suggestions), false);

  // A shared email is strong enough to act on automatically.
  assert.equal(hasHardDuplicate(detectDuplicates({ email: "facilities@acmeair.co.za" }, [acme])), true);
});

test("weak matches below the threshold are dropped", () => {
  const matches = detectDuplicates({ company: "Acme Air Conditioning" }, [acme], { minimumScore: 95 });
  assert.equal(matches.length, 0);
});

test("lookup keys normalize their inputs", () => {
  const keys = duplicateLookupKeys({
    email: "  Person@Example.COM ",
    phone: "+27 (11) 555-0100",
    company: "Acme, Inc.",
  });
  assert.equal(keys.email, "person@example.com");
  assert.equal(keys.domain, "example.com");
  assert.equal(keys.phone, "27115550100");
  assert.equal(keys.company, "acme");

  const national = duplicateLookupKeys({ phone: "011 555 0100", countryCallingCode: "27" });
  assert.equal(national.phone, "27115550100");
});

test("contact values normalize per kind", () => {
  assert.equal(contactNormalizedValue("EMAIL", " A@B.com "), "a@b.com");
  assert.equal(contactNormalizedValue("PHONE", "+27 11 555 0100"), "27115550100");
  assert.equal(contactNormalizedValue("PHONE", "011 555 0100", { countryCallingCode: "27" }), "27115550100");
  assert.equal(contactNormalizedValue("WHATSAPP", "0027 11 555 0100"), "27115550100");
  assert.equal(contactNormalizedValue("DOMAIN", "https://Www.Acme.co.za/x"), "www.acme.co.za");
  assert.equal(contactNormalizedValue("EMAIL", "  "), "");
});

test("bigram similarity is bounded and order tolerant", () => {
  assert.equal(bigramSimilarity("acme air", "acme air"), 1);
  assert.equal(bigramSimilarity("", "acme"), 0);
  assert.ok(bigramSimilarity("acme air conditioning", "air conditioning acme") > 0.5);
  assert.equal(bigramSimilarity("acme", "zzzz"), 0);
});
