// Publishing registry composition root.
//
// The public marketing/blog origin is optional for merely booting the API, so
// it is resolved lazily by the Website adapter. These tests pin both halves of
// that contract: the origin is still required, but only when it is used.
import assert from "node:assert/strict";
import test from "node:test";
import type { PublishRequest } from "@nnact/shared";
import { defaultRegistry, publicSiteUrl } from "../src/publishing/registry.js";

function request(): PublishRequest {
  return {
    publicationId: "publication-1",
    contentId: "content-1",
    title: "How to maintain a generator",
    body: "A short article body.",
  } as unknown as PublishRequest;
}

test("publicSiteUrl prefers PUBLIC_BLOG_URL and strips a trailing slash", () => {
  const env = { PUBLIC_BLOG_URL: "https://blog.example.com/" } as NodeJS.ProcessEnv;
  assert.equal(publicSiteUrl(env), "https://blog.example.com");
});

test("publicSiteUrl falls back to PUBLIC_WEB_URL outside production", () => {
  const env = { PUBLIC_WEB_URL: "https://app.example.com" } as NodeJS.ProcessEnv;
  assert.equal(publicSiteUrl(env), "https://app.example.com");
});

test("publicSiteUrl builds the marketing apex in production", () => {
  const env = {
    NODE_ENV: "production",
    NNPMARKETING_ADDRESS: "https://marketing.example.com/",
  } as NodeJS.ProcessEnv;
  assert.equal(publicSiteUrl(env), "https://marketing.example.com");
});

test("publicSiteUrl still fails closed when no origin is configured", () => {
  assert.throws(
    () => publicSiteUrl({} as NodeJS.ProcessEnv),
    /public web\/blog origin not configured/,
  );
});

test("the default registry boots without a blog origin and defers the failure", async () => {
  const saved = {
    PUBLIC_BLOG_URL: process.env.PUBLIC_BLOG_URL,
    PUBLIC_WEB_URL: process.env.PUBLIC_WEB_URL,
    NNPMARKETING_ADDRESS: process.env.NNPMARKETING_ADDRESS,
  };
  delete process.env.PUBLIC_BLOG_URL;
  delete process.env.PUBLIC_WEB_URL;
  delete process.env.NNPMARKETING_ADDRESS;

  try {
    // Registering the providers must not throw: this runs on every server boot.
    const registry = defaultRegistry();
    const website = registry.get("WEBSITE");
    assert.ok(website, "website provider is registered");

    // Using the channel is what surfaces the missing configuration.
    await assert.rejects(
      () => website.validateConnection("org-1"),
      /public web\/blog origin not configured/,
    );
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("the default registry publishes a blog URL once an origin is configured", async () => {
  const saved = process.env.PUBLIC_BLOG_URL;
  process.env.PUBLIC_BLOG_URL = "https://blog.example.com";
  try {
    const registry = defaultRegistry();
    const result = await registry.get("WEBSITE").publish(request());
    assert.equal(
      result.externalUrl,
      "https://blog.example.com/en/blog/content-1",
    );
  } finally {
    if (saved === undefined) delete process.env.PUBLIC_BLOG_URL;
    else process.env.PUBLIC_BLOG_URL = saved;
  }
});
