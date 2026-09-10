// Quality-rules (deterministic, no provider) + fake-adapter contract tests.
// No database or HTTP involved — the fake adapters are the dev/test harness.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HybridQualityAssessor } from "../src/ai/quality.js";
import { AiProviderRegistry } from "../src/ai/registry.js";
import { fakeAiFactory } from "../src/ai/adapters.js";
import type { DecryptedProviderConfig } from "../src/ai/domain.js";
import type { BusinessContext } from "../src/ai/context.js";

// Registry is never reached when reviewOrder is empty (rules-only mode).
const registry = new AiProviderRegistry({ configStore: undefined as never });
const assessor = new HybridQualityAssessor({ registry, reviewOrder: [], threshold: 80 });

const ctx = { companyName: "NNACT", fieldStorySummaries: [] } as BusinessContext;

test("rule gate BLOCKs unsafe content before any provider is consulted", async () => {
  const block = await assessor.assess("org-1", {
    brief: { topic: "refrigerant maintenance" },
    title: "DIY refrigerant recharge at home",
    body: "Here is how to recharge the refrigerant in your residential condenser yourself with a kit from amazon.",
    hashtags: [],
  });
  assert.equal(block.publishDecision, "BLOCK");
  assert.ok(block.blockingIssues.some((i) => /DIY/i.test(i)));
});

test("rule gate REGENERATEs thin/promotional content", async () => {
  const regenerate = await assessor.assess("org-1", {
    brief: { topic: "hydraulics" },
    title: "Oil leaks",
    body: "Call NNACT today.",
    hashtags: [],
  });
  assert.ok(["REGENERATE", "BLOCK"].includes(regenerate.publishDecision));
});

test("rule gate PUBLISHes clean field content", async () => {
  const keep = await assessor.assess("org-1", {
    brief: { topic: "vibration analysis" },
    title: "Why vibration analysis predicts bearing failure before costs spike",
    body: "NNACT field teams use vibration analysis to catch bearing faults early. A routine inspection collects displacement and velocity readings, then maps trends. Acting on the trend avoids an unplanned shutdown and protects plant uptime. Contact NNACT to schedule a thermographic survey and vibration assessment.",
    hashtags: ["#maintenance"],
  });
  assert.equal(keep.publishDecision, "PUBLISH");
  assert.ok(keep.overall >= 60);
});

test("rule gate blocks leaked contact identifiers", async () => {
  const leak = await assessor.assess("org-1", {
    brief: { topic: "lubrication" },
    title: "Lubrication basics for plant teams",
    body: "Reach jane.doe@example.com for details and call 09123456789 today. Grease gearboxes monthly.",
    hashtags: [],
  });
  assert.equal(leak.publishDecision, "BLOCK");
});

test("fake adapter contract: text structured output", async () => {
  const factory = fakeAiFactory();
  const cfg: DecryptedProviderConfig = { provider: "OPENAI", apiKey: "k", baseUrl: null, timeoutMs: 1000, defaultTextModel: null, defaultImageModel: null, options: {} };
  const result = await factory.text().generateText({ prompt: "write a maintenance article", structured: true, task: "article" }, cfg);
  assert.equal(result.provider, "OPENAI");
  assert.equal(typeof result.content, "string");
  assert.ok(result.structuredData);
  assert.ok(typeof result.structuredData?.title === "string");
  assert.ok(result.inputTokens >= 0 && result.outputTokens >= 0 && result.latencyMs >= 0);
});

test("fake adapter contract: image + vision", async () => {
  const factory = fakeAiFactory();
  const cfg: DecryptedProviderConfig = { provider: "OPENAI", apiKey: "k", baseUrl: null, timeoutMs: 1000, defaultTextModel: null, defaultImageModel: null, options: {} };
  const imageFactory = factory.image();
  assert.ok(imageFactory, "fake factory must expose an image adapter");
  const image = await imageFactory!.generateImage({ prompt: "hvac technician", size: "1024x1024" }, cfg);
  assert.ok(image && image.bytes > 0, "fake image should produce a 1x1 PNG");
  assert.match(image!.contentType, /^image\/png$/);
  const vision = await factory.vision().analyzeImage({ prompt: "any", images: [{ mediaType: "image/png", dataBase64: "aGVsbG8=" }] }, cfg);
  assert.equal(vision.verdict, "PASS");
});