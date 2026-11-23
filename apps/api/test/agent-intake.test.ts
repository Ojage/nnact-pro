import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { FOLLOW_UP_QUESTIONS, JOB_DRAFT_KEY_FIELDS, SAFETY_ACKNOWLEDGEMENTS, jobDraftSchema } from "@nnact/shared";
import { detectLanguage, detectSafetyFlags } from "../src/agent/intake.js";
import { verifyWhatsappSignature } from "../src/agent/whatsapp.js";
import { costCentsForAudio } from "../src/ai/usage.js";
import { agentIntakeFixtures } from "./fixtures/agent-intake.js";

test("anonymized intake fixtures cover ten conversations and three languages", () => {
  assert.equal(agentIntakeFixtures.length, 10);
  assert.deepEqual([...new Set(agentIntakeFixtures.map((fixture) => fixture.language))].sort(), ["en", "fr", "pidgin"]);
  for (const fixture of agentIntakeFixtures) {
    assert.equal(fixture.messages.length, 3, fixture.id);
    assert.ok(fixture.messages.every((message) => message.body.trim().length > 0), fixture.id);
    assert.match(fixture.participantPhone, /^\+100000000\d\d$/, fixture.id);
    assert.doesNotThrow(() => jobDraftSchema.parse(fixture.expected), fixture.id);
  }
});

test("fixture drafts always expose the fields a dispatcher needs", () => {
  for (const fixture of agentIntakeFixtures) {
    for (const field of JOB_DRAFT_KEY_FIELDS) {
      assert.ok(Object.hasOwn(fixture.expected, field), `${fixture.id} ${field}`);
    }
  }
});

test("language detection handles French, Pidgin and English", () => {
  assert.equal(detectLanguage("Bonjour, mon réfrigérateur ne marche plus"), "fr");
  assert.equal(detectLanguage("Wetin e dey do, abeg help"), "pidgin");
  assert.equal(detectLanguage("My washing machine will not start"), "en");
});

test("safety detection is case insensitive and covers local-language terms", () => {
  assert.deepEqual(detectSafetyFlags("There are sparks and a burning smell"), ["sparks", "burning smell"]);
  assert.deepEqual(detectSafetyFlags("Il y a des étincelles et une odeur de gaz"), ["étincelles", "gaz"]);
  assert.deepEqual(detectSafetyFlags("The fan is making a noise"), []);
});

test("safety and follow-up messages are fixed human-written text", () => {
  for (const [language, acknowledgement] of Object.entries(SAFETY_ACKNOWLEDGEMENTS)) {
    assert.ok(acknowledgement.length > 40, language);
    assert.doesNotMatch(acknowledgement, /price|arrive|diagnos/i, language);
  }
  for (const language of Object.keys(FOLLOW_UP_QUESTIONS)) {
    const questions = Object.values(FOLLOW_UP_QUESTIONS[language as keyof typeof FOLLOW_UP_QUESTIONS]);
    assert.ok(questions.length >= JOB_DRAFT_KEY_FIELDS.length, language);
    assert.ok(questions.every((question) => question.length > 5), language);
  }
});

test("WhatsApp signature verification accepts genuine Meta payloads only", () => {
  const rawBody = Buffer.from('{"entry":[]}', "utf8");
  const secret = "test-app-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  assert.doesNotThrow(() => verifyWhatsappSignature(rawBody, signature, secret));
  assert.throws(() => verifyWhatsappSignature(rawBody, "sha256=deadbeef", secret));
  assert.throws(() => verifyWhatsappSignature(rawBody, undefined, secret));
});

test("audio cost follows the existing incremental-cent convention", () => {
  assert.equal(costCentsForAudio(1), 1);
  assert.equal(costCentsForAudio(1_000_000), 1);
  assert.equal(costCentsForAudio(1_000_001), 2);
});
