# Guided Walkthroughs & Product Onboarding

NNACT Pro ships a first-run onboarding system: role-aware, resumable, guided
walkthroughs that highlight real UI via coachmarks and spotlight holes, wait for
genuine work (not demos), and persist per-user progress so a user can stop and
pick up later — including across the native and mobile clients later.

## How it works at a glance

1. **Definitions** live in `packages/shared/src/walkthroughs.ts` (the single
   source of truth, shared with future native clients). A walkthrough is a
   versioned list of steps.
2. **Targets** are stable `data-tour="<target-id>"` attributes on real elements.
   No positional maths, no brittle selectors. Pages never know a tour is
   running — they only hold targets and fire completion events.
3. **Engine** (`apps/web/components/walkthroughs/walkthrough-provider.tsx`)
   listens for events, resolves targets, positions the spotlight/coachmark, and
   advances as the user works.
4. **Progress** is stored server-side (`users.walkthrough_progress` JSONB, via
   `GET/PATCH /api/me/walkthrough-progress`) with a localStorage cache for
   instant boot + offline tolerance.
5. **Completion** is emitted by pages with real mutations:
   `emitWalkthroughDone(ADVANCE_TAG.jobCreated)` after a job is created, etc.

## Tour definition contract

Each tour in `walkthroughs.ts`:

```ts
{
  id: "create-customer",
  version: 1,                        // bump to offer the tour again on next release
  title, summary, duration,
  roles: ["owner", "dispatcher"],    // who may run it
  permissions: ["manage_customers"], // capability gate (ROLE_PERMISSIONS)
  primaryRoute: "/customers",        // "Continue" entry point
  relatesTo: ["/customers"],         // pathname prefixes that surface the tour
  steps: [
    { kind: "info", title, body },                    // just reads
    { kind: "navigation", route: "/customers", target: "customers-add", ... },
    { kind: "spotlight", target: "customer-create-dialog", ... },
    { kind: "action", target: "customer-create-submit",
      advanceOn: [{ tag: "customer.created" }],       // gates Next until real work
      required: false,                                // escape hatch (skip allowed)
      autoAdvance: true },                            // advance without pressing Next
    { kind: "tip", dismissAfterMs: 7000, ... },       // transient toast-style info
    { kind: "success", ... },                         // completion
  ],
}
```

Step kinds:

| kind        | behavior                                                        |
| ----------- | --------------------------------------------------------------- |
| `info`      | Coachmark card, no target needed                                |
| `spotlight` | Coachmark anchored to `[data-tour]`, hole in a dim overlay      |
| `action`    | Like spotlight, but `advanceOn` conditions must be met          |
| `navigation`| Moves the user to `step.route`, then resolves the target        |
| `tip`       | Auto-dismissing informational card                              |
| `success`   | Final card; marks the tour completed                            |

`advanceOn` conditions are `{ tag }` (an `ADVANCE_TAG` emitted by a page),
`{ selector }`, or `{ target }` (a `data-tour` id clicked). Navigation steps
auto-redirect when `pathMatches` shows the user is elsewhere, so a tour can
thread across pages.

## Recording completion from pages

Import and emit *after* the mutation truly succeeds — never around fake data:

```ts
import { emitWalkthroughDone } from "@/lib/walkthroughs/events";
import { ADVANCE_TAG } from "@nnact/shared";

// after api.createJob(...) resolves:
emitWalkthroughDone(ADVANCE_TAG.jobCreated);
```

Tags: `customer.created`, `equipment.created`, `job.created`,
`technician.assigned`, `visit.started`, `visit.completed`,
`diagnosis.recorded`, `knowledge.contributed`, `knowledge.reviewed`,
`estimate.sent`, `invoice.sent`, `payment.recorded`.

## Targets already wired (P0)

| Tour | Targets |
| ---- | ------- |
| getting-started | `nav-customers`, `nav-jobs`, `nav-dispatch`, `nav-repair-brain`, `nav-invoices` |
| create-customer | `customers-add`, `customer-create-dialog`, `customer-create-name`, `customer-create-submit` |
| register-equipment | `customers-list`, `customers-link`, `equipment-section`, `equipment-add`, `equipment-form` |
| create-service-job | `jobs-add`, `jobs-list`, `jobs-link`, `job-form`, `job-form-title`, `job-form-submit` |
| dispatch-assign-technician | `dispatch-board`, `dispatch-assign` |
| technician-service-visit | `jobs-list`, `jobs-link`, `job-detail-status`, `job-detail-diagnose`, `job-detail-outcome` |
| diagnose-using-repair-brain | `rb-search`, `rb-diagnose`, `diag-run`, `diag-outcome` |
| contribute-repair-knowledge | `rb-models`, `rb-contribute` (composer on `/repair-brain`) |
| review-verify-knowledge | `rb-review`, `rb-proposals` (pending queue, owner/dispatcher) |
| create-quotation | `estimates-add`, `estimates-form`, `estimates-send` |
| issue-invoice | `invoices-add`, `invoices-form`, `invoices-send`, `invoices-list` |
| record-payment | `invoices-add`, `invoices-list`, `invoices-pay` |

## Progress model & reconciliation

- Server JSONB is the source of truth. The engine debounces PATCHes (~700ms)
  and merges per tour id, never wiping other keys.
- `localStorage["nnact:walkthrough:progress"]` is a cache for instant boot and
  offline blips. Merge rule: later `updatedAt` wins; ties favor the server.
- Records are `{ state, step, version, starts, completions, startedAt,
  finishedAt, updatedAt }`. `state: "completed"` only counts when
  `record.version === tour.version`, so a definition bump retires stale
  completions and re-offers the tour.
- `state: "dismissed"` / explicit close hides a tour until its version bumps.

## Dev / QA entry points

- `?tour=<walkthrough-id>` auto-starts (or resumes) a tour on load.
- `?learn=1` opens the Learn NNACT center on load.
- The Learn NNACT button (sidebar footer) opens the catalog of role-filtered
  tours; a first-run **Welcome** dialog recommends getting-started.
- A tour still in progress shows a resume banner when you land on the route of
  its current step. ESC closes the active coachmark.

## Adding a tour

1. Define it in `packages/shared/src/walkthroughs.ts`; export/bump nothing else.
2. Add `data-tour` attributes to the real UI elements it points at.
3. Emit the matching `ADVANCE_TAG` after the genuine mutation (or use
   `{ selectors }`/`{ target }` click conditions).
4. Cover the pure logic in `apps/web/lib/walkthroughs/runtime.test.ts` /
   `progress.test.ts` and role/route rules in
   `packages/shared/test/walkthroughs.test.mjs`.
5. `pnpm build`, `pnpm test`, `pnpm --filter @nnact/web test:unit`, and
   `pnpm release:safety` before committing.

## Key files

- `packages/shared/src/walkthroughs.ts` — definitions, roles, `ADVANCE_TAG`
- `apps/web/lib/walkthroughs/{runtime,events,target,progress}.ts` — pure logic
- `apps/web/components/walkthroughs/{walkthrough-provider,coachmark,spotlight,learn-center,welcome-dialog}.tsx` — engine + UI
- `apps/api/src/routes/walkthroughs.ts` — progress persistence
- `packages/db/drizzle/0021_walkthrough_progress.sql` — `users.walkthrough_progress`