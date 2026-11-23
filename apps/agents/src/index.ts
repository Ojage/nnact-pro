// NNACT Intake Agent: turns inbound WhatsApp messages into draft jobs using
// the same AI provider registry as the rest of the product. It never writes a
// job directly; all job/customer writes go through the API's draft endpoint.
import { createHmac } from "node:crypto";
import { and, asc, eq, gte, inArray, isNull, lt, sum } from "drizzle-orm";
import { db } from "@nnact/db";
import {
  agentMedia,
  agentRuns,
  aiUsageRecords,
  conversations,
  customers,
  jobs,
  messages,
  quoteProposals,
  whatsappConfigs,
} from "@nnact/db";
import {
  AGENT_SCOPES,
  AUTH_AUDIENCES,
  FOLLOW_UP_QUESTIONS,
  INTAKE_RUN_TASKS,
  JOB_DRAFT_KEY_FIELDS,
  QUOTING_RUN_TASKS,
  SAFETY_ACKNOWLEDGEMENTS,
  SAFETY_TERMS,
  jobDraftSchema,
  normalizePhone,
  quoteProposalDraftSchema,
  type AgentLanguage,
  type AgentScope,
  type JobDraft,
  type PricedCandidateDTO,
  type QuoteProposalDraft,
} from "@nnact/shared";
import { DbAutomationSettingsStore, DbProviderConfigStore, DbUsageStore } from "../../api/src/ai/infra.ts";
import { AiProviderRegistry } from "../../api/src/ai/registry.ts";
import { deleteAgentMedia, readAgentMedia } from "../../api/src/agent/media-storage.ts";
import { getWhatsappConfig, sendWhatsappText } from "../../api/src/agent/whatsapp.ts";

const POLL_MS = Number(process.env.AGENT_POLL_MS ?? 15_000);
const DAILY_COST_CAP_CENTS = Number(process.env.AGENT_DAILY_COST_CAP_CENTS ?? 200);
const QUOTE_DAILY_COST_CAP_CENTS = Number(process.env.QUOTE_AGENT_DAILY_COST_CAP_CENTS ?? 200);
const MAX_ATTEMPTS = 3;
const API_URL = (process.env.AGENT_API_URL ?? "http://api:3001").replace(/\/$/, "");
const AGENT_ID = process.env.AGENT_ID?.trim() || "nnact-intake-agent";
const TWENTY_FOUR_HOURS = 86_400_000;

const configStore = new DbProviderConfigStore();
const settingsStore = new DbAutomationSettingsStore();
const usageStore = new DbUsageStore();
const registry = new AiProviderRegistry({ configStore, usage: usageStore });

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

/** HS256 service token. Intake gets one scope; quoting gets three narrow reads/write scopes. */
function agentToken(orgId: string, scopes: AgentScope[] = [AGENT_SCOPES.draftJobsCreate]): string {
  const secret = process.env.JWT_SECRET?.trim() || "nnactpro-development-only-secret";
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      aud: AUTH_AUDIENCES.agent,
      agentId: AGENT_ID,
      orgId,
      scope: scopes[0],
      scopes,
      iat: now,
      exp: now + 300,
    }),
  );
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function detectSafety(text: string | null | undefined): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return [...new Set(SAFETY_TERMS.filter((term) => lower.includes(term)))];
}

function todayStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function dailySpendCents(orgId: string, tasks: readonly string[]): Promise<number> {
  const [{ value }] = await db
    .select({ value: sum(aiUsageRecords.costCents) })
    .from(aiUsageRecords)
    .where(
      and(
        eq(aiUsageRecords.orgId, orgId),
        gte(aiUsageRecords.createdAt, todayStart()),
        inArray(aiUsageRecords.task, [...tasks]),
      ),
    );
  return Number(value ?? 0);
}

async function startRun(input: {
  orgId: string;
  conversationId?: string | null;
  messageId?: string | null;
  jobId?: string | null;
  task: string;
  payload: Record<string, unknown>;
}): Promise<string> {
  const [run] = await db
    .insert(agentRuns)
    .values({
      orgId: input.orgId,
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      jobId: input.jobId ?? null,
      state: "running",
      task: input.task,
      input: input.payload,
      attempts: 1,
    })
    .returning();
  return run.id;
}

async function finishRun(
  runId: string,
  patch: { state?: "completed" | "failed" | "skipped"; output?: Record<string, unknown>; provider?: string; model?: string; costCents?: number; error?: string | null; jobId?: string | null },
): Promise<void> {
  await db
    .update(agentRuns)
    .set({ ...patch, completedAt: new Date(), error: patch.error ?? null })
    .where(eq(agentRuns.id, runId));
}

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

const EXTRACTION_SYSTEM = [
  "You extract repair-intake facts from a WhatsApp message.",
  "Return only JSON matching the requested schema.",
  "Never invent a fact; use null when absent. Set confidence between 0 and 1 for every field.",
  "Never provide prices, arrival times, or a diagnosis. Copy the customer's own wording for symptoms.",
  "Detect language as en, fr, or pidgin. Include safety flags only for sparks, burning smell, gas, or smoke.",
].join(" ");

function extractionPrompt(input: {
  text: string;
  transcript: string | null;
  language: AgentLanguage;
  photoReferences: string[];
  safetyFlags: string[];
}): string {
  return JSON.stringify(
    {
      language: input.language,
      messageText: input.text,
      transcript: input.transcript,
      photoReferences: input.photoReferences,
      detectedSafetyFlags: input.safetyFlags,
      requiredFields: JOB_DRAFT_KEY_FIELDS,
      instruction: "Fill the JobDraft schema. photoReferences must be copied verbatim from the input.",
    },
    null,
    2,
  );
}

async function transcribeVoice(orgId: string, messageId: string, runId: string): Promise<string | null> {
  const [audio] = await db
    .select()
    .from(agentMedia)
    .where(and(eq(agentMedia.messageId, messageId), eq(agentMedia.kind, "audio")))
    .limit(1);
  if (!audio) return null;
  const buffer = await readAgentMedia(audio.objectKey);
  const result = await registry.transcribeAudio(
    orgId,
    {
      audio: buffer,
      fileName: audio.fileName ?? `voice.${audio.contentType.split("/")[1] ?? "ogg"}`,
      contentType: audio.contentType,
      runId,
      task: "agent.stt",
    },
  );
  if (!result) return null;
  await db.update(messages).set({ transcript: result.text }).where(eq(messages.id, messageId));
  await finishRun(runId, {
    state: "completed",
    output: { transcript: result.text },
    provider: result.provider,
    model: result.model,
    costCents: 1,
  });
  return result.text;
}

async function sendFixedText(input: {
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
    await db.update(conversations).set({ needsTemplate: true, updatedAt: new Date() }).where(eq(conversations.id, input.conversationId));
    return;
  }
  const runId = await startRun({
    orgId: input.orgId,
    conversationId: input.conversationId,
    task: "agent.followup",
    payload: { body: input.body, followUpIndex: input.followUpIndex },
  });
  try {
    const sent = await sendWhatsappText(input.to, input.body, config);
    await db.insert(messages).values({
      orgId: input.orgId,
      conversationId: input.conversationId,
      externalId: sent?.messageId ?? null,
      direction: "outbound",
      fromAddress: config.phoneNumberId,
      toAddress: input.to,
      text: input.body,
      followUpIndex: input.followUpIndex,
      sentAt: new Date(),
    });
    await finishRun(runId, { state: "completed", output: { messageId: sent?.messageId ?? null } });
  } catch (error) {
    await finishRun(runId, { state: "failed", error: (error as Error).message });
  }
}

async function postDraft(orgId: string, payload: unknown): Promise<{ status: string; job?: { id: string } }> {
  const response = await fetch(`${API_URL}/api/v1/agent/intake/draft-jobs`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${agentToken(orgId)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await response.json().catch(() => ({}))) as { status?: string; job?: { id: string }; error?: unknown };
  if (!response.ok) throw new Error(`draft API returned ${response.status}: ${JSON.stringify(json.error ?? json)}`);
  return { status: json.status ?? "created", job: json.job };
}

async function processMessage(messageId: string): Promise<void> {
  const [message] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!message) return;
  const config = await getWhatsappConfig(message.orgId);
  if (!config) return;
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, message.conversationId))
    .limit(1);
  if (!conversation || conversation.state === "closed") return;

  const settings = await settingsStore.get(message.orgId);
  const order = settings.textProviderOrder.length ? settings.textProviderOrder : (["OPENAI"] as const);
  const runId = await startRun({
    orgId: message.orgId,
    conversationId: message.conversationId,
    messageId: message.id,
    task: "agent.extract",
    payload: { text: message.text, media: message.media },
  });

  try {
    let transcript = message.transcript;
    if (!transcript && message.media.some((item) => item.kind === "audio")) {
      transcript = await transcribeVoice(message.orgId, message.id, runId);
    }
    const language = (conversation.language === "fr" || conversation.language === "pidgin" ? conversation.language : "en") as AgentLanguage;
    const text = [message.text, transcript].filter(Boolean).join("\n").trim();
    if (!text && !message.media.some((item) => item.kind === "image")) {
      await finishRun(runId, { state: "skipped", error: "no text or media to extract" });
      return;
    }
    const photoReferences = message.media.filter((item) => item.kind === "image").map((item) => item.id);
    const safetyFlags = [
      ...new Set([
        ...message.safetyFlags,
        ...detectSafety(text),
      ]),
    ];
    const generated = await registry.generateTextWithFallback(
      message.orgId,
      {
        system: EXTRACTION_SYSTEM,
        prompt: extractionPrompt({ text, transcript, language, photoReferences, safetyFlags }),
        structured: true,
        temperature: 0,
        maxTokens: 1400,
        task: "agent.extract",
        runId,
      },
      [...order],
    );
    const parsed = jobDraftSchema.safeParse(generated.result.structuredData);
    if (!parsed.success) throw new Error(`invalid structured extraction: ${parsed.error.message.slice(0, 300)}`);
    const draft: JobDraft = {
      ...parsed.data,
      language,
      photoReferences,
      safetyFlags,
      missingFields: parsed.data.missingFields.filter((field) => JOB_DRAFT_KEY_FIELDS.includes(field as never)),
    };

    const candidates = await matchCustomerIds(message.orgId, draft.phone ?? conversation.participantPhone);
    const posted = await postDraft(message.orgId, {
      orgId: message.orgId,
      conversationId: conversation.id,
      messageId: message.id,
      runId,
      customerId: candidates.length === 1 ? candidates[0] : null,
      customerCandidateIds: candidates,
      draft,
      needsTemplate: conversation.needsTemplate,
      mediaObjectKeys: photoReferences,
    });
    await finishRun(runId, {
      state: "completed",
      output: { draft, status: posted.status },
      jobId: posted.job?.id ?? null,
    });

    if (safetyFlags.length) {
      await sendFixedText({
        orgId: message.orgId,
        conversationId: conversation.id,
        to: conversation.participantPhone,
        body: SAFETY_ACKNOWLEDGEMENTS[language],
        followUpIndex: null,
      });
    } else if (draft.missingFields.length && conversation.followUpCount < 3) {
      const questions = draft.missingFields
        .map((field) => FOLLOW_UP_QUESTIONS[language][field])
        .filter(Boolean)
        .slice(0, 3);
      if (questions.length) {
        await sendFixedText({
          orgId: message.orgId,
          conversationId: conversation.id,
          to: conversation.participantPhone,
          body: questions.join("\n"),
          followUpIndex: conversation.followUpCount + 1,
        });
        await db
          .update(conversations)
          .set({ followUpCount: conversation.followUpCount + 1, state: "awaiting_customer", updatedAt: new Date() })
          .where(eq(conversations.id, conversation.id));
      }
    }
  } catch (error) {
    await finishRun(runId, { state: "failed", error: (error as Error).message.slice(0, 1000) });
  }
}

const QUOTE_API_SCOPES: AgentScope[] = [
  AGENT_SCOPES.jobsRead,
  AGENT_SCOPES.priceBookRead,
  AGENT_SCOPES.quoteProposalsCreate,
];

const QUOTE_SYSTEM = [
  "You prepare an internal repair quote draft from the offered price-book candidates.",
  "Choose only candidateId, kind and quantity from the supplied snapshot. Never write a price, total or amount.",
  "A candidate with no range means the price is unknown: select it with needsManualPrice true if it is genuinely needed.",
  "Keep the line list short. Include assumptions and missing information as short factual notes; never claim a diagnosis.",
  "Return only JSON matching the requested quote draft schema.",
].join(" ");

const FORBIDDEN_PRICE_KEYS = new Set([
  "price", "unitPrice", "unitPriceCents", "amount", "amountCents",
  "total", "totalCents", "costCents", "lowCents", "highCents", "weightedCents",
]);

function rejectModelPrices(value: unknown, path = "output"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectModelPrices(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_PRICE_KEYS.has(key)) {
      throw new Error(`model output contained forbidden price field ${path}.${key}`);
    }
    rejectModelPrices(nested, `${path}.${key}`);
  }
}

function quotePrompt(input: {
  job: { title: string; description: string | null; serviceArea: string | null };
  candidates: PricedCandidateDTO[];
}): string {
  return JSON.stringify(
    {
      job: input.job,
      instruction: "Select candidate ids and quantities only. Prices come from the server, never from you.",
      candidates: input.candidates.map((candidate) => ({
        candidateId: candidate.itemId ?? candidate.rateId,
        kind: candidate.kind,
        name: candidate.name,
        aliases: candidate.aliases,
        unit: candidate.unit,
        range: candidate.range,
      })),
    },
    null,
    2,
  );
}

async function agentFetch<T>(path: string, orgId: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${agentToken(orgId, QUOTE_API_SCOPES)}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: unknown };
  if (!response.ok) throw new Error(`quote API ${path} returned ${response.status}: ${JSON.stringify(json.error ?? json)}`);
  return json;
}

function serviceAreaFromAddress(address: string | null): string | null {
  const parts = (address ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  return parts.slice(-2).join(", ") || null;
}

async function processQuoteJob(job: {
  id: string;
  orgId: string;
  title: string;
  description: string | null;
  serviceAddress: string | null;
}): Promise<void> {
  const runId = await startRun({
    orgId: job.orgId,
    jobId: job.id,
    task: "agent.quote",
    payload: { jobId: job.id, serviceArea: serviceAreaFromAddress(job.serviceAddress) },
  });
  try {
    const candidates = await agentFetch<PricedCandidateDTO[]>("/api/v1/agent/quotes/candidates", job.orgId);
    if (!candidates.length) {
      await finishRun(runId, { state: "skipped", error: "no priced candidates available" });
      return;
    }
    const settings = await settingsStore.get(job.orgId);
    const order = settings.textProviderOrder.length ? settings.textProviderOrder : (["OPENAI"] as const);
    const generated = await registry.generateTextWithFallback(
      job.orgId,
      {
        system: QUOTE_SYSTEM,
        prompt: quotePrompt({
          job: {
            title: job.title,
            description: job.description,
            serviceArea: serviceAreaFromAddress(job.serviceAddress),
          },
          candidates,
        }),
        structured: true,
        temperature: 0,
        maxTokens: 1600,
        task: "agent.quote",
        runId,
      },
      [...order],
    );
    rejectModelPrices(generated.result.structuredData);
    const parsed = quoteProposalDraftSchema.safeParse(generated.result.structuredData);
    if (!parsed.success) throw new Error(`invalid quote draft: ${parsed.error.message.slice(0, 300)}`);
    const draft: QuoteProposalDraft = { ...parsed.data };
    if (draft.diagnosticVisitRecommended && !draft.lines.some((line) => line.kind === "diagnostic")) {
      const diagnostic = candidates.find((candidate) => candidate.kind === "diagnostic");
      if (diagnostic) {
        const candidateId = diagnostic.itemId ?? diagnostic.rateId ?? "";
        draft.lines.push({
          candidateId,
          kind: "diagnostic",
          quantity: 1,
          reason: "Diagnostic visit recommended by the agent.",
          needsManualPrice: diagnostic.range.lowCents === null,
        });
      }
    }
    const proposal = await agentFetch<{ id: string }>("/api/v1/agent/quotes/proposals", job.orgId, {
      orgId: job.orgId,
      jobId: job.id,
      runId,
      model: generated.result.model,
      draft,
    });
    await finishRun(runId, {
      state: "completed",
      output: { proposalId: proposal.id, draft },
      provider: generated.result.provider,
      model: generated.result.model,
      jobId: job.id,
    });
  } catch (error) {
    await finishRun(runId, { state: "failed", error: (error as Error).message.slice(0, 1000), jobId: job.id });
  }
}

async function quotingTick(): Promise<void> {
  const eligible = await db
    .select({
      id: jobs.id,
      orgId: jobs.orgId,
      title: jobs.title,
      description: jobs.description,
      serviceAddress: jobs.serviceAddress,
    })
    .from(jobs)
    .where(inArray(jobs.status, ["lead", "scheduled", "in_progress"]))
    .orderBy(asc(jobs.createdAt))
    .limit(50);
  if (!eligible.length) return;
  const quoted = await db.select({ jobId: quoteProposals.jobId }).from(quoteProposals);
  const quotedSet = new Set(quoted.map((row) => row.jobId));
  const quoteRuns = await db
    .select({ jobId: agentRuns.jobId, state: agentRuns.state, attempts: agentRuns.attempts })
    .from(agentRuns)
    .where(eq(agentRuns.task, "agent.quote"));
  const handled = new Map<string, { done: boolean; attempts: number }>();
  for (const run of quoteRuns) {
    if (!run.jobId) continue;
    const prior = handled.get(run.jobId);
    handled.set(run.jobId, {
      done: (prior?.done ?? false) || run.state === "completed" || run.state === "skipped",
      attempts: Math.max(prior?.attempts ?? 0, run.attempts ?? 0),
    });
  }

  for (const job of eligible) {
    if (quotedSet.has(job.id) || handled.get(job.id)?.done) continue;
    if ((handled.get(job.id)?.attempts ?? 0) >= MAX_ATTEMPTS) continue;
    if ((await dailySpendCents(job.orgId, QUOTING_RUN_TASKS)) >= QUOTE_DAILY_COST_CAP_CENTS) {
      console.warn(`[agent] quoting daily AI cost cap reached for org ${job.orgId}`);
      return;
    }
    await processQuoteJob(job);
  }
}

async function sweepExpiredMedia(): Promise<void> {
  const expired = await db
    .select()
    .from(agentMedia)
    .where(and(isNull(agentMedia.attachedAt), lt(agentMedia.expiresAt, new Date())))
    .limit(100);
  for (const media of expired) {
    try {
      await deleteAgentMedia(media.objectKey);
    } catch {
      // A missing file is fine: the retention row still needs to go.
    }
    await db.delete(agentMedia).where(eq(agentMedia.id, media.id));
  }
}

let sweepAt = 0;

async function tick(): Promise<void> {
  const runs = await db
    .select({ messageId: agentRuns.messageId, state: agentRuns.state, attempts: agentRuns.attempts })
    .from(agentRuns)
    .where(eq(agentRuns.task, "agent.extract"));
  const handled = new Map<string, { done: boolean; attempts: number }>();
  for (const run of runs) {
    if (!run.messageId) continue;
    const prior = handled.get(run.messageId);
    handled.set(run.messageId, {
      done: (prior?.done ?? false) || run.state === "completed" || run.state === "skipped",
      attempts: Math.max(prior?.attempts ?? 0, run.attempts ?? 0),
    });
  }

  const pending = await db
    .select({ id: messages.id, orgId: messages.orgId })
    .from(messages)
    .where(eq(messages.direction, "inbound"))
    .orderBy(asc(messages.createdAt))
    .limit(50);
  for (const message of pending) {
    const state = handled.get(message.id);
    if (state?.done) continue;
    if ((state?.attempts ?? 0) >= MAX_ATTEMPTS) {
      await db
        .insert(agentRuns)
        .values({
          orgId: message.orgId,
          messageId: message.id,
          state: "skipped",
          task: "agent.extract",
          input: {},
          error: "max attempts exceeded",
          attempts: MAX_ATTEMPTS,
        });
      continue;
    }
    if ((await dailySpendCents(message.orgId, INTAKE_RUN_TASKS)) >= DAILY_COST_CAP_CENTS) {
      console.warn(`[agent] daily AI cost cap reached for org ${message.orgId}`);
      return;
    }
    const [configured] = await db.select({ id: whatsappConfigs.id }).from(whatsappConfigs).where(eq(whatsappConfigs.orgId, message.orgId)).limit(1);
    const envConfigured = Boolean(process.env.AGENT_WHATSAPP_PHONE_NUMBER_ID && process.env.AGENT_WHATSAPP_ACCESS_TOKEN);
    if (!configured && !envConfigured) continue;
    await processMessage(message.id);
  }

  if (Date.now() - sweepAt > 3_600_000) {
    await sweepExpiredMedia();
    sweepAt = Date.now();
  }
}

setInterval(() => {
  void tick().catch((error) => console.error("[agent] intake tick failed:", error));
  void quotingTick().catch((error) => console.error("[agent] quoting tick failed:", error));
}, POLL_MS).unref();

void tick().catch((error) => console.error("[agent] initial intake tick failed:", error));
void quotingTick().catch((error) => console.error("[agent] initial quoting tick failed:", error));
console.log(
  `[agent] intake + quoting workers started (poll ${POLL_MS}ms, intake cap ${DAILY_COST_CAP_CENTS}c, quoting cap ${QUOTE_DAILY_COST_CAP_CENTS}c)`,
);
