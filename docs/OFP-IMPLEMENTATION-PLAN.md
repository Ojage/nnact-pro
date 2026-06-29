# OpenFieldPro — Bracketed Structure & Implementation Plan

_Companion to `docs/HCP-PARITY-AND-PLUGIN-PORTAL.md` (the what/why). This is the **how**: a
bracketed work-breakdown structure (WBS) for (1) cleaning up the repo, (2) integrating every
missing feature, and (3) the plugin portal. Every work item has a **bracketed ID** so it can be
referenced, assigned, and tracked. Generated 2026-06-28._

**Legend** — Effort: `S`≈1–2d · `M`≈3–5d · `L`≈1–2wk. Slice: `db`=schema, `api`=route,
`web`=page, `wkr`=worker, `mob`=mobile. Each task names a **✓check** = the one runnable thing
that fails if the logic breaks (Ponytail rule). `→[id]` = depends on.

---

## PART 0 — Ground truth (verified 2026-06-28)

```
[repo] niko4244/openfieldpro   (origin has ONLY: ofp-monorepo [default], archive/odysseus-original)
│
├── [clone A] ~/openfieldpro          branch ofp-monorepo @6223a28   ← THE RUNNING APP (web :3000)
│     ├─ BUG: apps/api/src/server.ts:41 buggy isMain → API never binds :3001 on Windows
│     ├─ behind: missing the 6 commits that live only in clone B
│     └─ dirty: uncommitted WIP on invoices.ts, customers/*, schedule, layout, login, api.ts, mobile
│
└── [clone B] ~/openfieldpro-app      branch phase-5a/answer-route @b4a5079  (= origin/ofp-monorepo +6)
      ├─ HAS FIX: server.ts uses pathToFileURL (isMain correct) + atomic seed + exit-on-skip
      ├─ extra committed routes: apps/api/src/routes/{sync.ts, answer.ts}
      ├─ unpushed local branches: phase-5a/pr1-schema-sync, pr2-mobile-sync, pr4-photos,
      │                            feat/answer-pipeline, master
      └─ dirty: its OWN uncommitted WIP (recurring.ts, server.ts, customers/*, schedule, …)
            ⚠ the two clones' WIP DIFFERS (customers/page.tsx alone = 384 changed lines)
```

**Verdict:** not a fork — clone B's history is clone A + 6 linear commits including the boot fix.
The mess is (a) the fix never reached the published branch, (b) two clones each hold *different*
uncommitted work on the *same* files, (c) four useful feature branches are unpushed and unmerged.

---

## PART I — Target repo structure (where new code lands)

Bracketed tree of the **end state**. New items marked `(+)`. Keep the monorepo + vertical-slice
method (`db → api → web`).

```
openfieldpro/
├── apps/
│   ├── api/src/
│   │   ├── routes/
│   │   │   ├── customers.ts jobs.ts estimates.ts invoices.ts appointments.ts
│   │   │   ├── lineitems.ts payments(reviews recurring activities org auth public reports).ts
│   │   │   ├── sync.ts answer.ts                      (from clone B; answer.ts = park, see [R5])
│   │   │   ├── (+) settings.ts team.ts                [A1]
│   │   │   ├── (+) attachments.ts                     [A2]
│   │   │   ├── (+) catalog.ts                         [A3]  price book
│   │   │   ├── (+) estimate-options.ts signatures.ts  [A4]
│   │   │   ├── (+) equipment.ts tags.ts custom-fields.ts [A5]
│   │   │   ├── (+) automations.ts events.ts           [B1]
│   │   │   ├── (+) messages.ts templates.ts           [B2]  comms hub
│   │   │   ├── (+) timeentries.ts                     [C3]
│   │   │   ├── (+) plans.ts subscriptions.ts          [D2]  memberships
│   │   │   └── (+) plugins.ts webhooks.ts             [E1]
│   │   └── lib/ (+) events/  (+) plugins/  (+) pdf/
│   ├── web/app/
│   │   ├── (existing) pipeline jobs customers schedule estimates invoices price-book reviews reports book
│   │   ├── (+) settings/        [A1]   (+) integrations/   [E2]  ← new nav tabs
│   │   ├── (+) dispatch/        [C1]   (+) reports/(tabs)  [D3]
│   │   └── (+) portal/          [B3]   customer self-service (public_token)
│   ├── worker/src/  index.ts notify.ts
│   │   └── (+) dispatchers/ {events.ts reminders.ts review-request.ts plugin-fanout.ts}
│   └── mobile/  (+) payments photos signatures lineitems navigation   [C4]
├── packages/
│   ├── db/src/schema.ts   (13 tables → ~30; grouped below)
│   ├── shared/            (DTOs, money, formatters)
│   └── (+) plugin-sdk/    @ofp/plugin-sdk — Manifest type, event union, scoped client, HMAC, UI slots [E1]
├── plugins/  (+)          first-party plugins, dogfood the SDK
│   ├── google-maps/  mailchimp/  twilio/  quickbooks/  companycam/  zapier/  stripe/   [E3]
└── docs/  HCP-PARITY-AND-PLUGIN-PORTAL.md  OFP-IMPLEMENTATION-PLAN.md (this)
```

**Schema growth (grouped by phase):**
```
[now]  orgs users customers properties jobs line_items estimates invoices payments
       recurring_jobs reviews activities appointments
[A1] (+) org_settings service_areas tax_rates ; users += phone,color,working_hours,hourly_cost
[A2] (+) attachments(entity_type,entity_id,s3_key,kind,uploaded_by)
[A3] (+) catalog_items catalog_categories  (price+cost+markup+taxable+image+active)
[A4] (+) estimate_options estimate_line_items signatures ; estimates += expires_at,deposit_cents
[A5] (+) equipment(property_id,make,model,serial,installed_at,warranty_until) tags taggables
        custom_field_defs custom_field_values ; customers/jobs += lead_source
[B1] (+) events automations automation_runs
[B2] (+) messages message_templates
[C3] (+) time_entries
[D1] (+) invoice_line_items invoice_reminders ; invoices += deposit_cents
[D2] (+) service_plans subscriptions
[E1] (+) plugins plugin_installs plugin_events api_tokens
```

---

## PART II — [R] Repo cleanup & consolidation (do FIRST, before any feature work)

Goal: **one canonical clone, one canonical branch that has the boot fix, nothing lost.** Ordered,
each step reversible until [R6]. Steps marked ⚠ are outward-facing/irreversible — they need your
explicit go-ahead (push, branch delete, deleting a clone).

```
[R0] SAFETY NET — lose nothing                                                 S
     [R0.1] In BOTH clones, commit WIP to a dated branch (don't discard):
            (A) git -C ~/openfieldpro        switch -c wip/clone-A-$(date +%F) && git add -A && git commit -m "WIP snapshot clone A"
            (B) git -C ~/openfieldpro-app    switch -c wip/clone-B-$(date +%F) && git add -A && git commit -m "WIP snapshot clone B"
     [R0.2] Belt & suspenders: git bundle BOTH clones to scratchpad (full history backup).
     ✓check: `git -C <each> status` clean; two wip/* branches exist; two .bundle files on disk.

[R1] PICK THE CANONICAL LINE                                                    S   →[R0]
     Decision (see §Decisions): recommend clone B's line as canonical because it already
     contains origin + the isMain/seed fixes (commit 21dcc34) + sync route. Keep ~/openfieldpro
     as the SINGLE working dir (it's what's wired to run); retire ~/openfieldpro-app.
     [R1.1] In clone A: git fetch, then create integration branch:
            git -C ~/openfieldpro switch -c chore/consolidate origin/ofp-monorepo
     ✓check: chore/consolidate exists off the published base.

[R2] LAND THE BOOT FIX (the actual "repo issue")                               S   →[R1]
     [R2.1] Cherry-pick the fix commit (isMain + atomic seed + exit-on-skip):
            bring 21dcc34 onto chore/consolidate (cherry-pick or re-apply the 1-line
            pathToFileURL change to apps/api/src/server.ts + the seed fixes).
     ✓check: `grep pathToFileURL apps/api/src/server.ts` present; `pnpm dev:api` BINDS :3001;
            `curl localhost:3001/api/health` → 200.

[R3] RECONCILE THE TWO WIP SETS                                                 M   →[R2]
     The clones' uncommitted edits differ on the same files. Port the wanted changes, don't
     blind-merge.
     [R3.1] Diff wip/clone-A-* vs wip/clone-B-* per file (customers/*, schedule, invoices,
            layout, login, mobile App.tsx, api.ts, recurring.ts).
     [R3.2] For each file choose the newer/correct version (B is generally ahead); cherry-pick
            or hand-merge onto chore/consolidate. Record the choice in the commit message.
     ✓check: web build clean (`pnpm --filter @ofp/web build`); 47 API tests still pass.

[R4] FOLD IN THE UNPUSHED FEATURE BRANCHES                                      M   →[R3]
     Triage clone B's local branches:
     [R4.1] phase-5a/pr1-schema-sync  → MERGE (schema version cols + sync route; needed for offline) 
     [R4.2] phase-5a/pr2-mobile-sync  → MERGE (mobile outbox sync)        → maps to [C4]
     [R4.3] phase-5a/pr4-photos       → MERGE (attachments)               → becomes/supersedes [A2]
     [R4.4] feat/answer-pipeline / answer.ts → PARK on its own branch (experimental NLP, not core
            HCP parity). Keep, don't merge to main line yet.
     ✓check: merged branches build + test; answer-pipeline isolated on a branch, not on canonical.

[R5] MIGRATIONS & DB SANITY                                                     S   →[R4]
     [R5.1] Regenerate drizzle migration so committed SQL == schema.ts (the prior drift bug).
            Confirm drizzle.config out path = ./drizzle.
     ✓check: `pnpm db:push` from clean DB then `pnpm db:seed` succeed; row counts > 0;
            login owner@demo.test / demo12345 works against the booted API.

[R6] ⚠ PUBLISH (needs your yes — outward-facing)                               S   →[R5]
     [R6.1] Fast-forward/merge chore/consolidate → ofp-monorepo, push origin/ofp-monorepo.
     [R6.2] Push the wanted feature branches as PRs (optional, for review trail).
     ✓check: origin/ofp-monorepo boots clean on a fresh clone; CI green.

[R7] ⚠ RETIRE THE SECOND CLONE (needs your yes — deletes a working dir)        S   →[R6]
     [R7.1] Confirm ~/openfieldpro-app has nothing unique not captured by wip/clone-B-* + branches.
     [R7.2] Archive it (zip to backup) then remove, OR repoint it to a fresh clone.
     [R7.3] Update CLAUDE.md / launchers / memory to name ~/openfieldpro as the ONLY OFP dir.
     ✓check: only one OFP working dir remains; launcher + docs reference it.
```

> **Quick Win #0** = `[R2]` alone (the 1-line `pathToFileURL`). ~10 min, unblocks the live app so
> every later phase can be verified in the browser. Do it even before the full consolidation.

---

## PART III — Feature integration WBS

Each phase is a milestone. Tasks are vertical slices on the existing spine. Phases A→E are
ordered by dependency; within a phase, tasks can mostly parallelize unless `→` says otherwise.

### [A] Phase A — Close the parity holes  (milestone: "sells & schedules like HCP")

```
[A1] Settings & Team                                                           M
   [A1.1] db: org_settings(business_hours,tax_rates,branding,timezone), service_areas;
          users += phone,color,working_hours,hourly_cost                       db
   [A1.2] api: settings.ts (GET/PATCH org), team.ts (CRUD users, role guard)   api  →[A1.1]
   [A1.3] web: /settings (company, team, roles, tax, hours, notifications)     web  →[A1.2]
   ✓check: owner edits tax rate + adds a tech with role=dispatcher; persists; non-owner 403.

[A2] Attachments / Photos   (prefer folding in phase-5a/pr4-photos [R4.3])     M
   [A2.1] db: attachments(entity_type,entity_id,s3_key,kind,size,uploaded_by)  db
   [A2.2] api: presigned PUT (MinIO already wired) + list/delete, org-scoped    api  →[A2.1]
   [A2.3] web: uploader + gallery on job & customer detail; mob: capture upload web/mob →[A2.2]
   ✓check: upload a photo to a job → appears in gallery, row in attachments, object in MinIO.

[A3] Price Book catalog  (replace the localStorage hack)                       M
   [A3.1] db: catalog_categories, catalog_items(name,price_cents,cost_cents,   db
          taxable,image_key,active,category_id)
   [A3.2] api: catalog.ts CRUD + search; migrate any localStorage data path     api  →[A3.1]
   [A3.3] web: rebuild /price-book against the API; remove localStorage         web  →[A3.2]
   [A3.4] web: "Add from Price Book" autocomplete → job/estimate line item      web  →[A3.3]
   ✓check: create catalog item with price+cost; insert into a job; line item carries cost→margin.

[A4] Estimates: line items + Good/Better/Best + e-sign + portal approve + PDF  L
   [A4.1] db: estimate_options(label,total), estimate_line_items(option_id,…),  db
          signatures; estimates += expires_at,deposit_cents
   [A4.2] api: build multi-option estimate from catalog; accept(option) →       api  →[A4.1]
          converts to scheduled job; capture signature; PDF render (lib/pdf)
   [A4.3] web: estimate builder (G/B/B columns); /portal approve+sign           web  →[A4.2,B3]
   ✓check: 3-option estimate sent → customer approves "Better" + signs in portal → job created at
          that total; signature + PDF stored.
[A] EXIT: a lead can be quoted (multi-option), approved+signed online, and scheduled — end to end.
```

### [B] Phase B — Event bus, comms & automations  (the plugin backbone)

```
[B1] Event bus + Automations engine                                            M
   [B1.1] db: events(name,entity,payload,occurred_at), automations(trigger,    db
          conditions_json,action_json,enabled), automation_runs
   [B1.2] api/lib: typed OfpEvent emitter; emit on customer/job/estimate/       api
          invoice/payment/appointment/review transitions (reuse activities)
   [B1.3] wkr: automation dispatcher consumes events (BullMQ) → runs actions    wkr  →[B1.2]
   ✓check: rule "job.completed → log action" fires exactly once on completion; visible in runs.

[B2] Comms hub (SMS + email) behind notify()                                   M   →[B1]
   [B2.1] db: messages(channel,direction,to,body,status,provider_id),          db
          message_templates
   [B2.2] api/wkr: Twilio (SMS) + Resend (email) providers; templated sends     api/wkr →[B2.1]
          for reminder/on-the-way/estimate-sent/invoice-sent/receipt
   [B2.3] web: comms log on customer timeline; per-event toggles in /settings   web  →[B2.2,A1]
   ✓check: appointment reminder + invoice-sent send via provider (sandbox), logged on timeline.

[B3] Customer portal (self-service on public_token)                            M
   [B3.1] api: token-scoped read of estimate/invoice/history; pay; approve      api
   [B3.2] web: /portal/[token] — view, approve+sign estimate, pay invoice       web  →[B3.1]
   ✓check: portal link opens without login → customer pays an invoice → status flips to paid.

[B4] Auto review-request                                                       S   →[B1,B2]
   [B4.1] automation: job.completed → send review link (SMS/email) after N hrs  wkr
   ✓check: completing a job queues one review-request message (dedupe: not twice).
[B] EXIT: every customer touch can trigger a templated SMS/email automatically; portal is live.
```

### [C] Phase C — Dispatch & field ops

```
[C1] Drag-drop dispatch board                                                  M
   [C1.1] web: /dispatch calendar (day/week) on existing PATCH /appointments;   web
          drag = reschedule/reassign; color by tech; availability from [A1]
   ✓check: dragging a job to another tech/time issues PATCH and persists on reload.

[C2] Map view + route optimization   (first map plugin, see [E3])              M   →[E1]
   [C2.1] api: geocode properties (lat/lng exist) via maps plugin              api
   [C2.2] web: day-map of jobs + optimized order; "on my way" ETA → [B2]        web  →[C2.1]
   ✓check: day's jobs render as pins; "optimize" reorders by drive time.

[C3] Time tracking & timesheets                                                M   →[A1]
   [C3.1] db: time_entries(user_id,job_id,started_at,ended_at,source)          db
   [C3.2] api: clock in/out; web+mob UI; timesheet + payroll CSV export         api/web/mob →[C3.1]
   ✓check: tech clocks in/out on a job → entry created; timesheet sums hours; CSV exports.

[C4] Mobile depth   (fold in phase-5a/pr2-mobile-sync [R4.2])                  L
   [C4.1] mob: take payment, photos[A2], signatures[A4], edit line items,      mob
          navigation; offline outbox (Phase-5a) syncs via sync.ts
   ✓check: offline → complete a job + capture signature + photo → reconnect → syncs to server.
[C] EXIT: a dispatcher schedules on a board/map; a tech runs the whole job from the phone, offline.
```

### [D] Phase D — Financial depth & growth

```
[D1] Invoice PDF + email + reminders + deposits                                M   →[B2]
   [D1.1] db: invoice_line_items, invoice_reminders; invoices += deposit_cents db
   [D1.2] api: PDF (lib/pdf), email send, dunning schedule, deposit capture     api  →[D1.1]
   ✓check: send invoice → PDF emailed; unpaid after T → reminder; deposit recorded as payment.

[D2] Service plans / memberships (recurring billing)                           L   →[D1]
   [D2.1] db: service_plans, subscriptions; extend recurring_jobs link         db
   [D2.2] api: Stripe subscriptions; auto-generate member jobs/invoices         api  →[D2.1]
   ✓check: enrolling a customer creates a subscription + materializes the next member visit.

[D3] Reporting suite                                                           L
   [D3.1] api: revenue-over-time, AR aging, estimate→job→invoice funnel,        api
          tech scorecards, lead-source ROI, LTV; CSV/PDF export
   [D3.2] web: /reports tabs + charts + date range                             web  →[D3.1]
   ✓check: AR-aging buckets reconcile to sum of unpaid invoices; export downloads.

[D4] Accounting + financing (as plugins, see [E3])                             L   →[E1]
   [D4.1] QuickBooks Online sync (invoices/payments/customers); consumer
          financing (Wisetack-style) display on estimates.
   ✓check: paying an invoice creates the matching QBO entry (sandbox).
[D] EXIT: recurring revenue, automated AR, and the reports an owner runs the business on.
```

### [E] Phase E — Plugin Portal (the marketplace)  →[B1] event bus

```
[E1] Plugin core                                                               L
   [E1.1] db: plugins, plugin_installs, plugin_events, api_tokens              db
   [E1.2] pkg: @ofp/plugin-sdk (Manifest type, OfpEvent union, scoped OfpClient, db/api
          HMAC verify, <PluginSlot> components)
   [E1.3] api: plugins.ts (list/install/configure/enable), scoped-token mint,   api  →[E1.1]
          consent (scopes), encrypted secrets
   [E1.4] wkr: plugin-fanout — signed (HMAC) webhook delivery + retries on      wkr  →[E1.1,B1]
          subscribed events; plugin_events delivery log
   ✓check: a test webhook plugin installs (consent), subscribes job.completed, receives a signed
          payload on completion, verified via SDK; delivery logged.

[E2] Integrations UI (App Store)                                               M   →[E1]
   [E2.1] web: /integrations grid; install→consent→config (rendered from        web
          manifest JSON-Schema)→enable; per-install health/logs/secrets;
          Developer sub-tab (sideload + validate manifest)
   ✓check: install + configure a plugin entirely from the UI; toggle enable; see delivery log.

[E3] First-party plugins (dogfood the SDK)                                      L   →[E1]
   [E3.1] google-maps (geocode+routing → powers [C2])  [E3.2] mailchimp (audience sync+triggers)
   [E3.3] twilio (powers [B2])  [E3.4] quickbooks (powers [D4])  [E3.5] companycam (photos→[A2])
   [E3.6] zapier/generic-webhook  [E3.7] stripe (wrap existing checkout)
   ✓check: Mailchimp install → customer.created adds them to the configured audience;
          Google-Maps install → dispatch map + routing light up.
[E] EXIT: third parties (and you) extend OFP via manifest+webhook+scoped-token, no core changes.
```

### [X] Cross-cutting — AI layer (the "better than HCP" wedge; ships as plugins on [E])

```
[X1] AI estimate drafting — description → line items from catalog            M   →[A3,E1]
[X2] AI dispatch/route suggestions — daily plan proposal                     M   →[C1,C2]
[X3] AI review responses + comms drafting                                    S   →[B2]
[X4] Demand/churn forecasting on the local LLM stack                         M
   ✓check (each): output is a draft a human approves (never auto-sent), logged as an event.
```

---

## PART IV — Sequencing, critical path & milestones

```
[R] repo cleanup  ─────────────►  (gate: live stack boots; one canonical clone)
        │
        ▼
[A] parity ──────────────►  M1  "quote→approve→schedule→invoice→pay" end to end
        │
        ▼
[B] events+comms ────────►  M2  automations fire; portal live   (UNLOCKS [E])
        │              ╲
        ▼               ╲────────────────────────────►
[C] dispatch+field      [E] plugin portal ──────────►  M4  open marketplace + first-party plugins
        │                         ▲
        ▼                         │ (maps/twilio/qbo are plugins)
[D] financial+reports ──┴──────►  M3  recurring revenue + owner reports
        │
        ▼
[X] AI layer  (rides [E])  ─────►  M5  AI assists across the app
```

- **Critical path:** `[R] → [A] → [B] → [E]`. Build comms ([B2]) as the *first* plugin so [E] is
  dogfooded the moment it exists; maps/QBO/financing then drop in as plugins, not core work.
- **Parallelizable:** [C] and [D] can run alongside [E] once [B1] (event bus) exists.
- **Milestones:** M1 sells, M2 automates, M3 monetizes recurring, M4 opens the ecosystem, M5 AI.

---

## PART V — Conventions & Definition of Done (so any agent can execute this)

```
[DoD per task]
  [1] Vertical slice complete: db migration generated + api route (Zod-validated, org-scoped) +
      web/mobile UI wired.
  [2] Money is integer cents; every entity carries org_id; cost captured wherever price is (margin).
  [3] ✓check from this doc passes (the one runnable check) + existing 47 API tests stay green.
  [4] New cross-entity touch emits an event (so automations/plugins see it) — once [B1] lands.
  [5] Secrets via env/secret_ref, never in code or returned by API. Webhooks signed.
  [6] ponytail: comment any intentional shortcut + its ceiling/upgrade path.
[Branching] one feature = one branch off ofp-monorepo named by bracket id (e.g. feat/A3-price-book);
            PR; squash-merge. No more parallel clones (the [R7] rule).
```

---

## Decisions needed (blocking [R1]/[E1]/[B2]/[X])
1. **Canonical clone/branch** — adopt clone B's line as canonical and keep **`~/openfieldpro`** as
   the single working dir, retiring `~/openfieldpro-app`? (Recommended.)
2. **`answer-pipeline`** — park it on a branch (recommended; it's experimental NLP, not HCP parity)
   or is it meant to be core?
3. **Plugin model v1** — confirm **manifest + signed webhook + scoped token** (no third-party code
   in-process) before [E1].
4. **Comms providers** — Twilio (SMS) + Resend (email) as the default first-party plugins?
5. **AI-first** — which of [X1]–[X4] leads?

> On your go-ahead I can execute **[R0]–[R2]** immediately (snapshot WIP, back up, land the 1-line
> boot fix) — all reversible. The ⚠ steps ([R6] push, [R7] delete-a-clone) I'll only do on an
> explicit yes.
