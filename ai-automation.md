# AI Content Automation

The AI automation module generates and publishes a scheduled stream of **two posts per weekday**: an **early-morning** (08:00 West-Central Africa / UTC+1) and an **evening** (18:00) slot. Each slot is filled by asking a language model for a maintenance- or engineering-focused article, optionally generating an accompanying stock image, running the result through quality checks, and then publishing it first to the website blog and, as a best-effort secondary action, to LinkedIn.

The system is designed to run completely unattended. A worker process wakes every tick (15 minutes), checks whether any slot is due (including late catch-up), and executes the full generate → review → publish pipeline autonomously. Failures are isolated to the individual slot, logged, and surfaced via optional push notifications and the admin UI.

---

## Architecture at a glance

```
┌────────────────────────────────────────────────────────────────────┐
│                         Worker tick (15 min)                       │
│                                                                    │
│  runAiAutomation(now)                                              │
│    ├─ for each org where enabled = true                            │
│    │   └─ engine.runDueSlots(orgId, now)                           │
│    │       ├─ dueSlots(now, settings) → [MORNING, EVENING, ...]   │
│    │       └─ for each due slot:                                   │
│    │           └─ engine.executeIteration(orgId, slot, date, now)  │
│    │               ├─ state machine:                               │
│    │               │   PLANNING → GENERATING_TEXT → REVIEWING_TEXT │
│    │               │   → SELECTING_MEDIA → CREATING_CONTENT       │
│    │               │   → PUBLISHING_WEBSITE → PUBLISHING_LINKEDIN │
│    │               └─ result: PUBLISHED / PARTIALLY_PUBLISHED /   │
│    │                   FAILED / NEEDS_ATTENTION                   │
│    └─ inform("slot_succeeded" | "slot_failed", ...)               │
└────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐   ┌───────────────────────────────────────┐
│   Admin Web UI       │   │         Admin API (staff-gated)       │
│  /ai page            │   │  GET  /api/ai/settings                │
│  - settings form     │   │  PUT  /api/ai/settings                │
│  - provider cards    │   │  GET  PUT  /api/ai/providers          │
│  - usage overview    │   │  POST /api/ai/providers/:id/probe     │
│  - recent runs       │   │  GET  /api/ai/health                  │
│  - Generate now btn  │   │  GET  /api/ai/runs                    │
│                      │   │  POST /api/ai/trigger (runNow)        │
│                      │   │  GET  /api/ai/usage                   │
│                      │   │  GET  /api/ai/reserve                 │
└──────────────────────┘   └───────────────────────────────────────┘
```

---

## How each slot runs

### 1. Scheduling

The engine converts the configured `morningTime` and `eveningTime` into UTC from the org's `timezone` (default `Africa/Douala`). A slot is considered **due** when `now` is within `catchUpWindowMinutes` (default 180) of its target time and `now ≥ dueAt`. If the tick lands after the window has closed, the slot is skipped for that day. Only slots whose day-of-week appears in `enabledDays` are eligible.

A `slotKey` = `{orgId}:{isoDate}:{slot}` is kept unique; duplicate keys are never processed twice, even if the worker tick overlaps.

### 2. Planning

The planner picks a topic from the configured topic categories (field stories, maintenance, safety, etc.) using a seeded random generator so different dates produce different topics. The prompt includes brand context (`companyName`), recent post excerpts (`recentPostSummaries`), and, optionally, `businessContext` from the DB to avoid repeating the same subjects.

### 3. Generating text

The primary text generator is called with a structured output mode (`structured: true`). The response includes the `title`, `body` (in Markdown, later converted to BlockNote JSON for the CMS), and `hashtags`. A chain of providers is tried in order (default: `CLAUDE → OPENAI → GROK`); each provider is skipped if disabled or its API key is missing, so the system degrades gracefully and only fails if *every* provider is unavailable.

### 4. Reviewing text

Before publishing, the draft runs through:

- **Rule gate** (always, zero-latency): checks for unsafe DIY guidance, marketing-only content, contact-leak patterns, short titles/bodies, and promotional CTAs. A violation results in an immediate `BLOCK` or `REGENERATE` decision without calling any LLM.
- **LLM review** (optional, only when `reviewProvider` is set): the chosen provider is asked to score the draft and flag hallucinated claims, style violations, or anything off-brand. A score below the `qualityThreshold` (default 70) causes regeneration up to `maxRetries` times.

A `BLOCK` is never published. After exhausting retries without meeting the threshold, the slot is marked `NEEDS_ATTENTION`.

### 5. Selecting media

If image generation is enabled and at least one image provider is configured (`OPENAI` is the current option), the system picks up to two prompts from the article body and generates 1024×1024 images asynchronously. Generation failures are logged but do not block text publishing.

### 6. Creating content

The article is persisted as a `contentItem` (`status: DRAFT`) and linked media as `contentMedia` rows with the `source: "ai"` tag. A best-effort audit entry is written for traceability.

### 7. Publishing to the website

The content item is transitioned to `READY` and enqueued for the existing `PublicationWorker`, which deploys it as a blog post at `/blog/{slug}-{hash}`. The slug incorporates a short base-36 hash of the ISO date + slot, so two articles on the same day never collide. The canonical URL is returned on success.

### 8. Publishing to LinkedIn (best-effort)

A LinkedIn-only variant is created by appending the canonical blog URL and hashtags to a caption. The post is sent to the org's LinkedIn Company Page (not a personal profile). A failure here does **not** mark the slot as failed—the slot is `PUBLISHED` as long as the website post succeeded; LinkedIn degradation is captured in `linkedInPublished: false`.

---

## What it needs to function

### Database

The migration `0036_ai_content_automation.sql` adds these tables (already applied in dev; applied automatically by the deploy migrator on production):

| Table | Purpose |
|---|---|
| `ai_automation_settings` | Per-org schedule, enabled-days, catch-up, budgets |
| `ai_provider_configs` | Encrypted provider API keys and per-provider settings |
| `ai_generation_runs` | One row per slot execution: state, attempts, timing, cost |
| `ai_media_reservations` | Content-media reservation pool |
| `ai_content_sub_systems` | Per-org content sub-system status |
| `ai_usage_snapshots` | Daily/monthly cost ledger |

Two new columns were also added to existing tables:

- `content_media.ai_usage_count` / `ai_last_used_at`
- `content_items.ai_metadata` (JSONB, stores slug, blog ID, LinkedIn post ID, etc.)

### Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `AI_AUTOPUBLISH_DISABLED` | No | `false` | Kill switch: set to `true` to halt **all** AI slots immediately |
| `AI_AUTOMATION_ENABLED` | No | `true` | Worker gate: set to `false` to stop the worker from even checking for AI slots |
| `NTFY_URL` | No | *(console only)* | Push notification endpoint (e.g. `https://ntfy.sh/nnact-alerts`) for slot success/failure, provider degradation, budget alarms, and weekly digests |

Both are already present in `infra/production.env.example` and wired into the `api` and `worker` services in `compose.prod.yml`.

### AI provider API keys

Keys are stored **encrypted at rest** in the `ai_provider_configs` table (AES-GCM via `AES_ENCRYPTION_KEY`) and set through the admin UI at `/ai`. The system never reads raw API keys from environment variables.

The UI handles this for you:

1. Go to **/ai** in the staff dashboard.
2. Paste a key for at least one provider (Claude, OpenAI, or Grok) and click **Save**.
3. Click **Probe** to verify the key is valid and the provider reports `CONNECTED`.
4. Optionally set a **Review provider** to enable LLM quality review on top of the rule gate.

**Important:** Until at least one provider key is configured and shows `CONNECTED`, all AI slots will stall at `GENERATING_TEXT` and be marked `NEEDS_ATTENTION`. The system will never publish unreviewed content.

### Run now (manual trigger)

Use the **Generate now** button on the `/ai` page, or call:

```bash
curl -X POST https://api.pro.nnact.com/api/ai/trigger \
  -H "Authorization: Bearer <staff_jwt>"
```

The trigger is **fire-and-forget**: the API replies `202 { runId, state }` immediately and the pipeline
executes in the background (the same `claimRun` gate the worker uses, so a duplicate request can never
run the slot twice). Watch it live from the **AI system tray** — a floating dock at the bottom right of
every staff page that shows the run's progress step-by-step as it happens, minimizes to a status pill,
and slides away shortly after the run finishes.

---

## Quality gates

| Gate | Applies when | Action on failure |
|---|---|---|
| **Rule gate** | Always (before any LLM call) | `BLOCK` (unsafe) or `REGENERATE` (too short / promotional) |
| **LLM review** | `reviewProvider` is set | Score below threshold → `REGENERATE` up to `maxRetries` times, then `NEEDS_ATTENTION` |
| **Duplicate check** | Always | Blocks content matching a recent post above the similarity threshold |

The rule gate checks for:
- DIY safety guidance (`refrigerant`, `circuit`, etc.)
- Marketing-only content with no actionable value
- Contact info leaks (email addresses, phone numbers)
- Titles under 10 characters
- Bodies under 200 characters
- Promotional CTAs (`schedule a free visit`, `learn more by contacting`, etc.)

---

## Safety and guardrails

- **Kill switch** (`AI_AUTOPUBLISH_DISABLED=true`): immediately stops all AI slot execution across every org.
- **Budget caps**: optional `dailyBudgetCents` and `monthlyBudgetCents` in settings. When a slot exceeds the cap, it is skipped for the day.
- **Idempotency**: `slot_key` is unique. Re-processing the same date/slot is always a no-op.
- **Catch-up window**: only late slots within the configurable `catchUpWindowMinutes` (default 180) are executed; older missed slots are not retroactively run.
- **Retry budget**: `maxRetries` (default 2) limits the number of regeneration attempts before marking the slot `NEEDS_ATTENTION` (or `FAILED` when all retries are exhausted).
- **Org-level opt-in**: automation is `enabled: false` by default; a slot only runs when an org explicitly enables it in the admin UI.

---

## Notifications

When `NTFY_URL` is set, the system sends push notifications for:

| Event | Priority | When |
|---|---|---|
| `slot_succeeded` | low | Slot published successfully |
| `slot_failed` | high | Slot failed after all retries |
| `provider_failed` | default | A provider returned an error mid-run |
| `budget_alarm` | high | A slot was skipped due to budget cap |
| `weekly_digest` | low | (Scheduled elsewhere) summary of the week |
| `health_critical` | critical | All providers unreachable |

When `NTFY_URL` is unset, all events are logged to `console.warn`.

---

## Admin API endpoints

All AI routes are staff-gated (require a valid JWT with `role === "staff"`). Base path: `/api/ai`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/settings` | Current automation settings |
| `PUT` | `/settings` | Update schedule, budgets, thresholds |
| `GET` | `/providers` | List configured providers (keys masked) |
| `PUT` | `/providers/:id` | Save/update a provider config |
| `POST` | `/providers/:id/probe` | Verify provider connectivity |
| `GET` | `/health` | Provider health + org config summary |
| `GET` | `/runs` | Recent run history (paginated) |
| `GET` | `/runs/:id` | Single run details |
| `POST` | `/trigger` | Execute the next due slot immediately |
| `GET` | `/usage` | Current billing period usage |
| `GET` | `/reserve` | Media reservation pool status |

---

## Running the test suite

The AI tests are fully self-contained and require **no database**. They exercise the domain math, quality rule gates, fake adapter contracts, and a 14-day unattended autopilot simulation.

```bash
# from the repo root
pnpm --dir apps/api exec node --import tsx --test \
  test/ai-domain.test.ts \
  test/ai-guards.test.ts \
  test/ai-schedule-sim.test.ts
```

All 22 tests should pass in under 1 second.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Slots always `NEEDS_ATTENTION` | No provider keys configured | Go to `/ai`, save a key, probe it, confirm `CONNECTED` |
| Slots stuck in `PLANNING` | All providers disabled or failing | Check `/api/ai/health`; re-enable a provider or add a new key |
| `slot_failed` notifications | Rule gate blocking content | Review the `blockingIssues` on the run detail; adjust `fieldStorySummaries` if topics are off |
| No notifications arriving | `NTFY_URL` not set or invalid | Set a valid ntfy topic URL in `.env`, redeploy |
| Autopilot not running | `AI_AUTOMATION_ENABLED=false` or org `enabled=false` | Check `.env` and org settings in `/ai` |
| `runNow` returns early | Slot already `PUBLISHED` | Idempotency guard; wait for the next scheduled slot |
| Migration not applied | `ALLOW_SCHEMA_PUSH=false` | The 0036 migration is tracked; it applies automatically on deploy. If not, run `pnpm --dir packages/db exec drizzle-kit migrate` with `ALLOW_SCHEMA_PUSH=true` |
