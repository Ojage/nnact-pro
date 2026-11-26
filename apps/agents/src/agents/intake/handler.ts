import { and, eq } from "drizzle-orm";
import { db, agentMedia, conversations, customers, messages, whatsappConfigs } from "@nnact/db";
import {
  FOLLOW_UP_QUESTIONS,
  JOB_DRAFT_KEY_FIELDS,
  SAFETY_ACKNOWLEDGEMENTS,
  jobDraftSchema,
  normalizePhone,
  type AgentLanguage,
  type JobDraft,
} from "@nnact/shared";
import { detectSafety } from "../../lib/helpers.js";
import { registry, textProviderOrder } from "../../lib/ai.js";
import { readAgentMedia } from "../../../../api/src/agent/media-storage.js";
import { getWhatsappConfig, sendWhatsappText } from "../../../../api/src/agent/whatsapp.js";
import type { AgentPlatformApi } from "../../platform/api.js";
import type { AgentOffice } from "../../platform/office.js";
import { EXTRACTION_SYSTEM, PROMPT_VERSION, extractionPrompt } from "./prompt.js";

const TWENTY_FOUR_HOURS = 86_400_000;

async function matchCustomerIds(orgId: string, phone: string): Promise<string[]> {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];
  const indexed = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.phoneE164, normalized)))
    .limit(10);
  if (indexed.length) return indexed.map((row) => row.id);
  const all = await db.select({ id: customers.id, phone: customers.phone }).from(customers).where(eq(customers.orgId, orgId));
  return all.filter((row) => row.phone && normalizePhone(row.phone) === normalized).map((row) => row.id).slice(0, 10);
}

async function transcribeVoice(api: AgentPlatformApi, orgId: string, messageId: string, runId: string): Promise<string | null> {
  const [audio] = await db
    .select()
    .from(agentMedia)
    .where(and(eq(agentMedia.messageId, messageId), eq(agentMedia.kind, "audio")))
    .limit(1);
  if (!audio) return null;
  const buffer = await readAgentMedia(audio.objectKey);
  const result = await registry.transcribeAudio(orgId, {
    audio: buffer,
    fileName: audio.fileName ?? `voice.${audio.contentType.split("/")[1] ?? "ogg"}`,
    contentType: audio.contentType,
    runId,
    task: "agent.stt",
  });
  if (!result) return null;
  await api.setMessageTranscript(messageId, orgId, result.text);
  return result.text;
}

async function sendFixedText(input: {
  api: AgentPlatformApi;
  orgId: string;
  conversationId: string;
  to: string;
  body: string;
  followUpIndex: number | null;
}): Promise<void> {
  const config = await getWhatsappConfig(input.orgId);
  if (!config) return;
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .limit(1);
  const lastCustomer = conversation?.lastCustomerMessageAt?.getTime() ?? 0;
  if (!lastCustomer || Date.now() - lastCustomer > TWENTY_FOUR_HOURS) {
    await input.api.updateConversation(input.conversationId, {
      orgId: input.orgId,
      needsTemplate: true,
    });
    return;
  }
  const run = await input.api.startRun({
    orgId: input.orgId,
    conversationId: input.conversationId,
    task: "agent.followup",
    input: { body: input.body, followUpIndex: input.followUpIndex },
    promptVersion: PROMPT_VERSION,
  });
  try {
    const sent = await sendWhatsappText(input.to, input.body, config);
    await input.api.createMessage({
      orgId: input.orgId,
      conversationId: input.conversationId,
      externalId: sent?.messageId ?? null,
      direction: "outbound",
      fromAddress: config.phoneNumberId,
      toAddress: input.to,
      text: input.body,
      followUpIndex: input.followUpIndex,
      sentAt: new Date().toISOString(),
    });
    await input.api.finishRun(run.id, {
      orgId: input.orgId,
      state: "completed",
      output: { messageId: sent?.messageId ?? null },
      promptVersion: PROMPT_VERSION,
      outcome: "success",
    });
  } catch (error) {
    await input.api.finishRun(run.id, {
      orgId: input.orgId,
      state: "failed",
      error: (error as Error).message,
      promptVersion: PROMPT_VERSION,
      outcome: "failure",
    });
    throw error;
  }
}

/**
 * Turn one inbound WhatsApp message into a draft job for dispatcher review.
 * The agent never creates a real job: the API's draft endpoint does, and a
 * person approves it. Follow-up questions and safety acknowledgements are
 * fixed, translated templates, never free-form model text.
 */
export async function processIntakeMessage(api: AgentPlatformApi, office: AgentOffice, messageId: string, leaseId?: string): Promise<void> {
  const [message] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!message) return;
  const config = await getWhatsappConfig(message.orgId);
  if (!config) return;
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, message.conversationId)).limit(1);
  if (!conversation || conversation.state === "closed") return;

  const run = await office.beginRun(
    {
      orgId: message.orgId,
      conversationId: message.conversationId,
      messageId: message.id,
      task: "agent.extract",
      input: { text: message.text, media: message.media },
      promptVersion: PROMPT_VERSION,
    },
    { label: "Drafting job from WhatsApp", steps: 5, leaseId },
  );
  const finish = (input: Parameters<AgentPlatformApi["finishRun"]>[1]) => api.finishRun(run.id, input);

  try {
    let transcript = message.transcript;
    if (!transcript && message.media.some((item) => item.kind === "audio")) {
      transcript = await run.step("transcribe", "Transcribe the voice note", () => transcribeVoice(api, message.orgId, message.id, run.id), {
        summarize: (text) => ({ fields: { transcribed: Boolean(text), chars: text?.length ?? 0 } }),
      });
    } else {
      await run.skip("transcribe", "Transcribe the voice note", transcript ? "already transcribed" : "no voice note");
    }
    const language = (conversation.language === "fr" || conversation.language === "pidgin" ? conversation.language : "en") as AgentLanguage;
    const text = [message.text, transcript].filter(Boolean).join("\n").trim();
    if (!text && !message.media.some((item) => item.kind === "image")) {
      await finish({ orgId: message.orgId, state: "skipped", error: "no text or media to extract", promptVersion: PROMPT_VERSION, outcome: "skipped" });
      await run.end();
      return;
    }
    const photoReferences = message.media.filter((item) => item.kind === "image").map((item) => item.id);
    const safetyFlags = [...new Set([...message.safetyFlags, ...detectSafety(text)])];
    if (safetyFlags.length) await run.log("warn", "safety words in the message", { flags: safetyFlags.join(",") });

    const generated = await run.step(
      "extract",
      "Extract job fields",
      async () =>
        registry.generateTextWithFallback(
          message.orgId,
          {
            system: EXTRACTION_SYSTEM,
            prompt: extractionPrompt({ text, transcript, language, photoReferences, safetyFlags }),
            structured: true,
            temperature: 0,
            maxTokens: 1400,
            task: "agent.extract",
            runId: run.id,
          },
          await textProviderOrder(message.orgId),
        ),
      { summarize: (result) => ({ fields: { provider: result.result.provider, language } }) },
    );
    const draft = await run.step(
      "validate",
      "Validate the draft",
      async (): Promise<JobDraft> => {
        const parsed = jobDraftSchema.safeParse(generated.result.structuredData);
        if (!parsed.success) throw new Error(`invalid structured extraction: ${parsed.error.message.slice(0, 300)}`);
        return {
          ...parsed.data,
          language,
          photoReferences,
          safetyFlags,
          missingFields: parsed.data.missingFields.filter((field) => JOB_DRAFT_KEY_FIELDS.includes(field as never)),
        };
      },
      { summarize: (result) => ({ fields: { missing: result.missingFields.length, safety: safetyFlags.length } }) },
    );

    const posted = await run.step(
      "draft",
      "Save draft for dispatcher review",
      async () => {
        const candidates = await matchCustomerIds(message.orgId, draft.phone ?? conversation.participantPhone);
        return api.postIntakeDraft(message.orgId, {
          orgId: message.orgId,
          conversationId: conversation.id,
          messageId: message.id,
          runId: run.id,
          customerId: candidates.length === 1 ? candidates[0] : null,
          customerCandidateIds: candidates,
          draft,
          needsTemplate: conversation.needsTemplate,
          mediaObjectKeys: photoReferences,
        });
      },
      { summarize: (result) => ({ fields: { status: result.status ?? "created" } }) },
    );

    // The draft is saved; a failed reply must not fail the extraction.
    await run
      .step(
        "reply",
        safetyFlags.length ? "Send safety acknowledgement" : "Ask follow-up questions",
        () => replyToCustomer(api, message.orgId, conversation, draft, safetyFlags, language),
        { waiting: true, summarize: (sent) => ({ fields: { sent } }) },
      )
      .catch(() => undefined);

    await finish({
      orgId: message.orgId,
      state: "completed",
      output: { draft, status: posted.status ?? "created" },
      jobId: posted.job?.id ?? null,
      provider: generated.result.provider,
      model: generated.result.model,
      inputTokens: generated.result.inputTokens,
      outputTokens: generated.result.outputTokens,
      promptVersion: PROMPT_VERSION,
      outcome: "success",
    });
    await run.end();
  } catch (error) {
    await finish({ orgId: message.orgId, state: "failed", error: (error as Error).message.slice(0, 1000), promptVersion: PROMPT_VERSION, outcome: "failure" }).catch(
      () => undefined,
    );
    await run.log("error", "intake run failed", { kind: (error as Error).name });
    await run.end(true);
    throw error;
  }
}

/** Fixed, translated text only: a safety acknowledgement or up to three follow-up questions. */
async function replyToCustomer(
  api: AgentPlatformApi,
  orgId: string,
  conversation: typeof conversations.$inferSelect,
  draft: JobDraft,
  safetyFlags: string[],
  language: AgentLanguage,
): Promise<string> {
  if (safetyFlags.length) {
    await sendFixedText({ api, orgId, conversationId: conversation.id, to: conversation.participantPhone, body: SAFETY_ACKNOWLEDGEMENTS[language], followUpIndex: null });
    return "safety";
  }
  if (!draft.missingFields.length || conversation.followUpCount >= 3) return "none";
  const questions = draft.missingFields
    .map((field) => FOLLOW_UP_QUESTIONS[language][field])
    .filter(Boolean)
    .slice(0, 3);
  if (!questions.length) return "none";
  await sendFixedText({
    api,
    orgId,
    conversationId: conversation.id,
    to: conversation.participantPhone,
    body: questions.join("\n"),
    followUpIndex: conversation.followUpCount + 1,
  });
  await api.updateConversation(conversation.id, { orgId, followUpCount: conversation.followUpCount + 1, state: "awaiting_customer" });
  return "follow-up";
}
