import assert from "node:assert/strict";
import test from "node:test";
import { readSponsorConfig } from "../lib/sponsor-config.js";

test("sponsor slot is absent unless explicitly enabled and complete", () => {
  assert.equal(readSponsorConfig({}), null);
  assert.equal(readSponsorConfig({ NNPSPONSOR_ENABLED: "true" }), null);
  assert.equal(
    readSponsorConfig({
      NNPSPONSOR_ENABLED: "false",
      NNPSPONSOR_NAME: "Example",
      NNPSPONSOR_MESSAGE: "Message",
      NNPSPONSOR_URL: "https://example.com",
    }),
    null,
  );
});

test("sponsor URL must be a clean HTTPS origin without credentials or tracking parameters", () => {
  const base = {
    NNPSPONSOR_ENABLED: "true",
    NNPSPONSOR_NAME: "Example Sponsor",
    NNPSPONSOR_MESSAGE: "Supports open field-service software.",
  };
  assert.equal(readSponsorConfig({ ...base, NNPSPONSOR_URL: "http://example.com" }), null);
  assert.equal(readSponsorConfig({ ...base, NNPSPONSOR_URL: "https://user:pass@example.com" }), null);
  assert.equal(readSponsorConfig({ ...base, NNPSPONSOR_URL: "https://example.com/path" }), null);
  assert.equal(readSponsorConfig({ ...base, NNPSPONSOR_URL: "https://example.com?utm_source=ofp" }), null);
  assert.deepEqual(readSponsorConfig({ ...base, NNPSPONSOR_URL: "https://example.com/" }), {
    name: "Example Sponsor",
    message: "Supports open field-service software.",
    url: "https://example.com",
  });
});
