// Automation engine — the slot state machine that drives planning → text →
// quality → image → content creation → website publish → LinkedIn publish.
// Runs either from the worker's tick (attended) or on demand from the admin
// UI, always guarded by the slot_key idempotency constraint, the global
// AI_AUTOPUBLISH_DISABLED kill switch, and budget limits. Website publishing is
// always attempted first; LinkedIn is best-effort and degrades to a partial.
import { and, asc, eq } from "drizzle-orm";
import { db, aiContentAutomation, users } from "@nnact/db";
import type { AiAutomationSettingsDTO, AiSlot, AiProviderId, AiRunState } from "@nnact/shared";
import { AI_PROVIDERS } from "@nnact/shared";
import { AiProviderRegistry, settingsOrder } from "./registry.js";
import type { AiAutomationRuntimePorts, AiRunStorePort, LogoCompositorPort } from "./ports.js";
import { dueSlots, nextSlot, hashValue, type SlotSchedule } from "./domain.js";
import { buildArticlePrompt } from "./prompts.js";
import { planSlot } from "./planner.js";
import { blocksToBodyDocument, type ArticleBlock } from "./blocknote.js";
import { resolveFeaturedImage } from "./image.js";
import { findNearDuplicate } from "./duplicate.js";
import { buildBusinessContext, buildMarketingKnowledge, buildMediaContext, listRecentContentForDedupe } from "./context.js";
import { createContent, ensureTags, upsertCategory, upsertVariant, slugify } from "../publishing/infra/content-repo.js";
import { ContentTransformService } from "../publishing/application/content-transform.js";
import { PublishContentUseCase } from "../publishing/application/publish.js";
import { PublicationWorker } from "../publishing/application/worker.js";
import { defaultRegistry, publicSiteUrl } from "../publishing/registry.js";
import { DbMediaProvider } from "../publishing/infra/media.js";
import { windowStarts, costCentsForTextResult } from "./usage.js";

/** System actor for AI-generated content; not a real user, never exposed. */
const AI_ACTOR = "00000000-0000-4000-8000-0000000000a1";

export interface AutomationEngineDeps extends AiAutomationRuntimePorts {
  registry: AiProviderRegistry;
  publicApiBaseUrl: string;
}

interface SlotRun {
  orgId: string;
  settings: AiAutomationSettingsDTO;
  run: NonNullable<Awaited<ReturnType<AiRunStorePort["getRun"]>>>;
}

function paramError(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

/** Normalize model-supplied tags into clean, deduped, "AI"-free site tags. */
function normalizeArticleTags(raw: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const tag = typeof entry === "string"
      ? entry.trim().toLowerCase().replace(/^#/, "").replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "").slice(0, 40)
      : "";
    if (!tag || tag === "ai" || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 10) break;
  }
  return out;
}

function publishingServices() {
  const registry = defaultRegistry();
  const media = new DbMediaProvider({ publicApiBaseUrl: (process.env.PUBLIC_API_URL ?? process.env.PUBLIC_WEB_URL ?? "http://localhost:3003").replace(/\/$/, "") });
  return {
    registry,
    media,
    publishUseCase: new PublishContentUseCase({ registry, media }),
    worker: new PublicationWorker({ registry, media }),
  };
}

async function resolveAuthor(orgId: string): Promise<string> {
  const [first] = await db.select({ id: users.id }).from(users).where(eq(users.orgId, orgId)).orderBy(asc(users.createdAt)).limit(1);
  if (!first) throw paramError("organization has no users to attribute content to");
  return first.id;
}

async function touchMarker(orgId: string, slot: AiSlot): Promise<void> {
  const column = slot === "MORNING" ? { lastMorningRunAt: new Date() } : { lastEveningRunAt: new Date() };
  await db.update(aiContentAutomation).set({ ...column, updatedAt: new Date() }).where(eq(aiContentAutomation.orgId, orgId));
}

function rewriteDirective(appended: string): string {
  return `REWRITE ENTIRELY from scratch: choose a new title, a new angle, and a new structure. ${appended}`;
}

export class AutomationEngine {
  constructor(private readonly deps: AutomationEngineDeps) {}

  async settings(orgId: string): Promise<AiAutomationSettingsDTO> {
    return this.deps.settings.get(orgId);
  }

  async saveSettings(orgId: string, patch: Partial<AiAutomationSettingsDTO>): Promise<AiAutomationSettingsDTO> {
    return this.deps.settings.save(orgId, patch);
  }

  async listProviders(orgId: string) {
    return this.deps.configStore.list(orgId);
  }

  async saveProvider(orgId: string, provider: AiProviderId, input: import("@nnact/shared").AiProviderConfigWrite) {
    if (!AI_PROVIDERS.includes(provider)) throw paramError(`unknown AI provider: ${String(provider)}`);
    return this.deps.configStore.upsert(orgId, provider, input);
  }

  async probeProvider(orgId: string, provider: AiProviderId) {
    if (!AI_PROVIDERS.includes(provider)) throw paramError(`unknown AI provider: ${String(provider)}`);
    return this.deps.registry.probe(orgId, provider);
  }

  async usage(orgId: string) {
    const now = this.deps.now();
    const { todayStart, monthStart } = windowStarts(now);
    const [summary] = await Promise.all([
      this.deps.usage.usageSummary(orgId, todayStart, monthStart),
    ]);
    const todaySpend = await this.deps.usage.spendBetween(orgId, todayStart, now);
    const monthSpend = await this.deps.usage.spendBetween(orgId, monthStart, now);
    const settings = await this.deps.settings.get(orgId);
    return { ...summary, todaySpend, monthSpend, dailyBudgetCents: settings.dailyBudgetCents, monthlyBudgetCents: settings.monthlyBudgetCents };
  }

  async reserve(orgId: string) {
    const settings = await this.deps.settings.get(orgId);
    const [count, ready, recent] = await Promise.all([
      this.deps.reserve.countReady(orgId),
      this.deps.reserve.listReady(orgId, 100),
      this.deps.reserve.recent(orgId, 20),
    ]);
    return { enabled: settings.reserveEnabled, target: settings.reserveTarget, count, ready: ready.slice(0, 12), recent };
  }

  async listRuns(orgId: string, query: import("./ports.js").AiRunListQuery) {
    return this.deps.runs.listRuns(query);
  }

  async getRun(orgId: string, runId: string) {
    return this.deps.runs.getRun(orgId, runId);
  }

  /** Worker entry: execute every due slot for an enabled org, then catch up stale runs. */
  async runDueSlots(orgId: string): Promise<{ executedCount: number }> {
    const now = this.deps.now();
    const settings = await this.deps.settings.get(orgId);
    if (!settings.enabled) return { executedCount: 0 };
    if (this.deps.settings.killSwitchActive()) return { executedCount: 0 };
    if (!(await this.budgetOK(orgId, settings))) return { executedCount: 0 };

    let executedCount = 0;
    for (const schedule of dueSlots(now, settings)) {
      await this.executeIteration(orgId, settings, schedule);
      executedCount += 1;
    }
    await this.attemptCatchUp(orgId, settings, now);
    return { executedCount };
  }

  private async budgetOK(orgId: string, settings: AiAutomationSettingsDTO): Promise<boolean> {
    const now = this.deps.now();
    const { todayStart, monthStart } = windowStarts(now);
    const todaySpend = await this.deps.usage.spendBetween(orgId, todayStart, now);
    const monthSpend = await this.deps.usage.spendBetween(orgId, monthStart, now);
    if (todaySpend >= settings.dailyBudgetCents || monthSpend >= settings.monthlyBudgetCents) {
      await this.deps.notifications.inform("budget_alarm", {
        dailySpentCents: todaySpend,
        dailyLimitCents: settings.dailyBudgetCents,
        monthlySpentCents: monthSpend,
        monthlyLimitCents: settings.monthlyBudgetCents,
      });
      return false;
    }
    return true;
  }

  private async attemptCatchUp(orgId: string, settings: AiAutomationSettingsDTO, now: Date): Promise<void> {
    const threshold = new Date(now.getTime() - settings.catchUpWindowMinutes * 60_000);
    const runs = await this.deps.runs.listScheduledRuns(orgId);
    for (const run of runs) {
      if (run.attempts === 0) continue;
      const lastTouched = run.updatedAt ? new Date(run.updatedAt) : new Date(run.createdAt);
      if (lastTouched.getTime() >= threshold.getTime()) continue;
      if (run.attempts >= settings.maxRetries) continue;
      const schedule: SlotSchedule = { isoDate: run.scheduledDate, slot: run.slot, dueAt: now };
      try {
        await this.executeIteration(orgId, settings, schedule, run);
      } catch {
        /* attemptCatchUp is best-effort; failure already persisted */
      }
    }
  }

  /** "Run now" from the admin UI. Rejects when the kill switch is active. */
  async runNow(orgId: string, isoDate: string, slot: AiSlot): Promise<{ runId: string; state: string }> {
    if (this.deps.settings.killSwitchActive()) throw paramError("global kill switch is active (AI_AUTOPUBLISH_DISABLED)");
    const settings = await this.deps.settings.get(orgId);
    const schedule: SlotSchedule = { isoDate, slot, dueAt: this.deps.now() };
    const run = await this.deps.runs.ensureRun(orgId, schedule);
    if (run.state === "PUBLISHED" || run.state === "PARTIALLY_PUBLISHED") {
      return { runId: run.id, state: run.state };
    }
    try {
      await this.executeIteration(orgId, settings, schedule, run);
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    const latest = await this.deps.runs.getRun(orgId, run.id);
    return { runId: run.id, state: latest?.state ?? "UNKNOWN" };
  }

  /**
   * "Run now" queued in the background. Claims the slot synchronously (so the
   * caller gets a stable runId immediately) but executes the pipeline on the
   * event loop instead of inside the HTTP request. The worker and the API both
   * use claimRun() as the single executor gate, so a duplicate request (or a
   * concurrent worker sweep) can never execute the same slot twice.
   */
  async runNowQueued(orgId: string, isoDate: string, slot: AiSlot): Promise<{ runId: string; state: string }> {
    if (this.deps.settings.killSwitchActive()) throw paramError("global kill switch is active (AI_AUTOPUBLISH_DISABLED)");
    const schedule: SlotSchedule = { isoDate, slot, dueAt: this.deps.now() };
    const run = await this.deps.runs.ensureRun(orgId, schedule);
    if (run.state === "PUBLISHED" || run.state === "PARTIALLY_PUBLISHED") {
      return { runId: run.id, state: run.state };
    }
    setImmediate(() => {
      this.runNow(orgId, isoDate, slot)
        .then(() => undefined)
        .catch((error) => {
          this.deps.notifications.inform("slot_failed", {
            slot,
            isoDate,
            error: (error as Error).message,
            level: "error",
          });
        });
    });
    return { runId: run.id, state: run.state };
  }

  private async executeIteration(orgId: string, settings: AiAutomationSettingsDTO, schedule: SlotSchedule, preClaimedRun?: NonNullable<Awaited<ReturnType<AiRunStorePort["getRun"]>>>): Promise<void> {
    let run = preClaimedRun ?? (await this.deps.runs.ensureRun(orgId, schedule));
    if (preClaimedRun) {
      await this.deps.runs.markAttempt(orgId, run.id);
      const resumed = await this.deps.runs.getRun(orgId, run.id);
      if (resumed) run = resumed;
    } else {
      const claimed = await this.deps.runs.claimRun(orgId, run.id);
      if (!claimed) return; // another process owns this slot
      const fresh = await this.deps.runs.getRun(orgId, run.id);
      if (fresh) run = fresh;
    }

    const slot: SlotRun = { orgId, settings, run };
    try {
      const outcome = await this.executeSlot(slot);
      await this.deps.runs.updateRun(orgId, run.id, {
        state: outcome.finalState,
        completedAt: this.deps.now().toISOString(),
        websitePublished: outcome.websitePublished,
        linkedinPublished: outcome.linkedinPublished,
      });
      await touchMarker(orgId, schedule.slot);
      await this.deps.notifications.inform("slot_succeeded", {
        isoDate: schedule.isoDate,
        slot: schedule.slot,
        website: outcome.websitePublished,
        linkedin: outcome.linkedinPublished,
        provider: outcome.writerProvider ?? "n/a",
      });
    } catch (error) {
      const message = (error as Error).message;
      await this.deps.runs.updateRun(orgId, run.id, {
        state: run.attempts + 1 >= settings.maxRetries ? "FAILED" : "NEEDS_ATTENTION",
        error: message,
        completedAt: this.deps.now().toISOString(),
      });
      await this.deps.notifications.inform("slot_failed", {
        slot: schedule.slot,
        isoDate: schedule.isoDate,
        error: message,
        level: "error",
      });
      throw error;
    }
  }

  private async executeSlot(ctx: SlotRun): Promise<{ finalState: AiRunState; websitePublished: boolean; linkedinPublished: boolean; writerProvider: AiProviderId | null }> {
    const { orgId, settings } = ctx;
    const runId = ctx.run.id;
    const now = this.deps.now();
    const textOrder = settingsOrder(settings);

    await this.deps.runs.updateRun(orgId, runId, { state: "PLANNING", startedAt: now.toISOString() });

    // 1 · Business/media context + plan
    const business = await buildBusinessContext(orgId);
    const knowledge = buildMarketingKnowledge(business);
    const imageGeneratorsAvailable = Boolean(await this.deps.registry.imageFactory(orgId, settings.imageProvider));
    const media = await buildMediaContext(orgId, this.deps.publicApiBaseUrl, imageGeneratorsAvailable);

    const plan = await planSlot({
      orgId,
      slot: ctx.run.slot,
      isoDate: ctx.run.scheduledDate,
      ctx: business,
      media,
      knowledge,
      registry: this.deps.registry,
      textProviderOrder: textOrder,
      imageGeneratorsAvailable,
    });
    await this.deps.runs.updateRun(orgId, runId, {
      state: "GENERATING_TEXT",
      topic: plan.topic,
      angle: plan.angle,
      categoryName: plan.categoryName,
      contentType: plan.contentType,
      writerProvider: plan.providerUsed === "LOCAL" ? null : plan.providerUsed,
      imageSourceType: plan.imageStrategy,
    });

    // 2 · Dedupe guard against recently published titles
    const recentTitles = (await listRecentContentForDedupe(orgId)).map((r) => r.title);
    const duplicateOf = findNearDuplicate(plan.topic, recentTitles);
    if (duplicateOf) throw new Error(`topic is a near-duplicate of recently published: ${duplicateOf}`);

    // 3 · Article generation with one regeneration pass
    const articlePrompt = buildArticlePrompt({
      brief: JSON.stringify({ ...plan.brief, imageStrategy: plan.imageStrategy, imageAvailable: media.approved.length > 0 }),
      dx: business,
      knowledge,
      recentTitles: recentTitles.slice(0, 8),
    });

    let article: { title: string; seoTitle: string; seoDescription?: string; summary?: string; blocks: ArticleBlock[]; hashtags: string[]; tags: string[]; linkedinCaption?: string } | null = null;
    let writerProvider: AiProviderId | null = null;
    for (let attempt = 0; attempt <= 1 && !article; attempt++) {
      const prompt = attempt === 1 ? rewriteDirective(articlePrompt) : articlePrompt;
      const { result } = await this.deps.registry.generateTextWithFallback(orgId, { prompt, structured: true, task: "article", maxTokens: 2400 }, textOrder);
      writerProvider = result.provider;
      await this.deps.usage.record(orgId, { runId, task: "article", provider: result.provider, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs: result.latencyMs, costCents: costCentsForTextResult(result.model, result.inputTokens, result.outputTokens) });

      const data = (result.structuredData ?? {}) as Record<string, unknown>;
      const title = String(data.title ?? "").trim();
      const blocks: ArticleBlock[] = Array.isArray(data.blocks)
        ? (data.blocks as { type?: string; text?: string }[])
            .map((b) => ({ type: b.type as ArticleBlock["type"], text: String(b.text ?? "").trim() }))
            .filter((b) => ["heading", "paragraph", "maintenanceTip", "safetyNotice", "serviceCta"].includes(b.type))
        : [];
      if (!title || blocks.length === 0) {
        if (attempt === 1) throw new Error("model did not return a valid article");
        continue;
      }

      const assessment = await this.deps.quality.assess(orgId, {
        brief: data,
        title,
        body: blocks.map((b) => b.text).join("\n"),
        hashtags: Array.isArray(data.hashtags) ? data.hashtags.map(String) : [],
      });

      if (assessment.publishDecision === "BLOCK") {
        await this.deps.runs.updateRun(orgId, runId, { state: "FAILED", quality: assessment.overall, error: assessment.blockingIssues.join("; ") });
        throw new Error(`article blocked: ${assessment.blockingIssues.join("; ")}`);
      }
      if (assessment.publishDecision === "REGENERATE" && attempt === 0) continue;
      await this.deps.runs.updateRun(orgId, runId, { state: "REVIEWING_TEXT", quality: assessment.overall, reviewProvider: settings.reviewProvider ?? null });

      article = {
        title,
        seoTitle: String(data.seoTitle ?? title).slice(0, 60),
        seoDescription: typeof data.seoDescription === "string" ? data.seoDescription.slice(0, 155) : undefined,
        summary: typeof data.summary === "string" ? data.summary : undefined,
        blocks,
        hashtags: Array.isArray(data.hashtags) ? data.hashtags.map(String).filter((h) => /^#[\w-]{2,}$/.test(h)).slice(0, 6) : ["#nnact"],
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        linkedinCaption: typeof data.linkedinCaption === "string" ? data.linkedinCaption : undefined,
      };
    }
    if (!article) throw new Error("unable to produce an acceptable article draft");

    // 4 · Featured image (existing or AI-generated)
    await this.deps.runs.updateRun(orgId, runId, { state: "SELECTING_MEDIA" });
    const featured = await resolveFeaturedImage({
      orgId,
      brief: plan.brief,
      media,
      registry: this.deps.registry,
      imageProvider: settings.imageProvider,
      reviewProvider: settings.reviewProvider,
      compositor: this.deps.compositor,
    });
    if (featured.mediaId && featured.sourceType !== "existing") {
      await this.deps.runs.updateRun(orgId, runId, { imageProvider: settings.imageProvider ?? null });
    } else if (featured.sourceType === "existing") {
      await this.deps.runs.updateRun(orgId, runId, { imageProvider: null });
    }

    // 5 · Persist as a real Content Studio item
    await this.deps.runs.updateRun(orgId, runId, { state: "CREATING_CONTENT" });
    const transform = new ContentTransformService(this.deps.publicApiBaseUrl);
    const bodyDocument = blocksToBodyDocument(article.blocks, featured.mediaId ?? null);
    const derived = await transform.derive(bodyDocument);
    const category = await upsertCategory(orgId, plan.categoryName, slugify(plan.categoryName), `AI-generated ${plan.contentType.toLowerCase()} articles`);
    const spec = normalizeArticleTags([...(article.tags ?? []), ...article.hashtags.map((h) => h.replace(/^#/, ""))]);
    const tagNames = spec.length > 0 ? spec : [slugify(plan.categoryName)];
    const tagIds = await ensureTags(orgId, tagNames);
    const slug = `${slugify(article.title) || "article"}-${(hashValue(`${ctx.run.scheduledDate}:${ctx.run.slot}`) % 46656).toString(36)}`;
    const created = await createContent({
      orgId,
      authorId: await resolveAuthor(orgId),
      type: "ARTICLE",
      title: article.title,
      slug,
      summary: article.summary ?? derived.body.slice(0, 200),
      body: derived.body,
      bodyDocument: derived.bodyDocument ?? null,
      bodyHtml: derived.bodyHtml,
      bodyMarkdown: derived.bodyMarkdown,
      categoryId: category.id,
      tagIds,
      featuredMediaId: featured.mediaId,
      visibility: "PUBLIC",
      language: "en",
    });

    // 6 · Website publish (blog canonical) + drain the publication outbox
    await this.deps.runs.updateRun(orgId, runId, { state: "PUBLISHING_WEBSITE", contentId: created.id });
    const services = publishingServices();
    await services.publishUseCase.publish({ orgId, contentId: created.id, actorId: AI_ACTOR, channels: ["WEBSITE"] });
    await services.worker.sweep(this.deps.now());
    // The marketing site only routes locale-prefixed blog URLs
    // (/:locale/blog/:slug); a bare /blog/:slug hits its catch-all 404 page.
    const canonicalUrl = `${publicSiteUrl(process.env).replace(/\/$/, "")}/en/blog/${created.slug}`;
    await this.deps.runs.updateRun(orgId, runId, { canonicalUrl });

    // 7 · LinkedIn (best-effort, after website success)
    let linkedinPublished = false;
    if (settings.channels.includes("LINKEDIN")) {
      const caption = article.linkedinCaption?.trim() || article.summary?.trim() || article.title;
      await upsertVariant(orgId, {
        contentId: created.id,
        channel: "LINKEDIN",
        enabled: true,
        titleOverride: article.title,
        bodyOverride: `${caption}\n\n${canonicalUrl}`,
        caption: null,
        hashtags: article.hashtags,
      });
      await this.deps.runs.updateRun(orgId, runId, { state: "PUBLISHING_LINKEDIN" });
      await services.publishUseCase.publish({ orgId, contentId: created.id, actorId: AI_ACTOR, channels: ["LINKEDIN"] });
      await services.worker.sweep(this.deps.now());
      linkedinPublished = true;
    }

    const finalState: AiRunState = linkedinPublished || !settings.channels.includes("LINKEDIN") ? "PUBLISHED" : "PARTIALLY_PUBLISHED";
    return { finalState, websitePublished: true, linkedinPublished, writerProvider };
  }

  /** Health/monitoring snapshot for the admin UI. */
  async health(orgId: string): Promise<Record<string, unknown>> {
    const now = this.deps.now();
    const settings = await this.deps.settings.get(orgId);
    const morning = nextSlot(now, settings);
    const providers = await this.deps.configStore.list(orgId).then((rows) => Object.fromEntries(rows.map((r) => [r.provider, r.status])) as unknown as Record<string, string>);
    const { todayStart, monthStart } = windowStarts(now);
    const usage = await this.deps.usage.usageSummary(orgId, todayStart, monthStart);
    const recentRuns = await this.deps.runs.recentRuns(orgId, new Date(now.getTime() - 7 * 86_400_000));
    const states: Record<string, number> = {};
    for (const run of recentRuns) states[run.state] = (states[run.state] ?? 0) + 1;
    return {
      automationEnabled: settings.enabled,
      killSwitch: this.deps.settings.killSwitchActive(),
      lastMorningRunAt: settings.lastMorningRunAt,
      lastEveningRunAt: settings.lastEveningRunAt,
      nextRun: morning ? { slot: morning.slot, isoDate: morning.isoDate, dueAt: morning.dueAt.toISOString() } : null,
      providers,
      usage,
      reserveAvailable: settings.reserveEnabled ? await this.deps.reserve.countReady(orgId) : 0,
      reserveTarget: settings.reserveTarget,
      runStateDistribution: states,
      recentRuns: recentRuns.slice(0, 8).map((r) => ({ id: r.id, slot: r.slot, scheduledDate: r.scheduledDate, state: r.state, topic: r.topic, quality: r.quality, error: r.error })),
    };
  }
}