/**
 * NNACT Guided Walkthroughs — shared contract.
 *
 * Product onboarding is defined here so the web coachmark engine and a future
 * native mobile engine consume the SAME definitions and progress shape.
 *
 * Design invariants (see docs/onboarding/WALKTHROUGHS.md):
 *  - Tours are task-oriented: they walk people through real workflows, they do
 *    not "point at buttons". Spotlights only ever accompany a real action.
 *  - Definitions are versioned; progress is keyed by id and remembers the
 *    definition `version` it was started/stopped against.
 *  - Every step keeps "skip / close / exit" reachable. No tour traps the user.
 *  - Tour visibility is filtered by role (and derived permissions). Backend
 *    authorization stays authoritative — a walkthrough can never bypass it.
 *  - "Guided explanation" (spotlight/info/tip) is distinct from "real
 *    operation" (action). Action steps only auto-advance after the user really
 *    mutates state (a completion tag fired by the page in question).
 *  - Copy is English-first; every string lives here, so a future i18n pass can
 *    swap this module for a locale-aware one without touching the engine.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Roles + derived permissions
//
// NNACT ships three staff roles: owner | dispatcher | technician. There is no
// "senior technician" role; knowledge review genuinely requires senior staff,
// so in this product the review capability sits with owners + dispatchers.
// Preserve this mapping when a management role is introduced later.
// ──────────────────────────────────────────────────────────────────────────────

export const WALKTHROUGH_ROLES = ["owner", "dispatcher", "technician"] as const;
export type WalkthroughRole = (typeof WALKTHROUGH_ROLES)[number];

export const WALKTHROUGH_PERMISSIONS = [
  "manage_customers",
  "manage_jobs",
  "dispatch_jobs",
  "perform_visits",
  "use_repair_brain",
  "diagnose",
  "contribute_knowledge",
  "review_knowledge",
  "manage_money",
] as const;
export type WalkthroughPermission = (typeof WALKTHROUGH_PERMISSIONS)[number];

/** Role → derived capability matrix. Source of truth for tour eligibility. */
export const ROLE_PERMISSIONS: Record<
  WalkthroughRole,
  readonly WalkthroughPermission[]
> = {
  owner: [
    "manage_customers",
    "manage_jobs",
    "dispatch_jobs",
    "perform_visits",
    "use_repair_brain",
    "diagnose",
    "contribute_knowledge",
    "review_knowledge",
    "manage_money",
  ],
  dispatcher: [
    "manage_customers",
    "manage_jobs",
    "dispatch_jobs",
    "use_repair_brain",
    "diagnose",
    "contribute_knowledge",
    "review_knowledge",
    "manage_money",
  ],
  technician: ["perform_visits", "use_repair_brain", "diagnose", "contribute_knowledge"],
};

export function walkthroughAccessibleTo(
  tour: Walkthrough,
  role: WalkthroughRole,
): boolean {
  if (!tour.roles.includes(role)) return false;
  return tour.permissions.every((permission) =>
    ROLE_PERMISSIONS[role].includes(permission),
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Progress persistence shape (server-authoritative, localStorage cache)
// ──────────────────────────────────────────────────────────────────────────────

export const WALKTHROUGH_PROGRESS_STATES = [
  "not_started",
  "in_progress",
  "completed",
  "dismissed",
] as const;
export type WalkthroughProgressState = (typeof WALKTHROUGH_PROGRESS_STATES)[number];

/** One tour's persisted progress for one user, keyed by tour id. */
export interface WalkthroughProgressRecord {
  state: WalkthroughProgressState;
  /** 0-based step the user was on when they paused/left. */
  step: number;
  /** Definition `version` this progress refers to. */
  version: number;
  /** Times the user has started this tour (fresh starts, not resumes). */
  starts: number;
  /** Times the user completed it. */
  completions: number;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}

export type WalkthroughProgressMap = Record<string, WalkthroughProgressRecord>;

export const WALKTHROUGH_PROGRESS_API_PREFIX = "/api/me/walkthrough-progress";

// ──────────────────────────────────────────────────────────────────────────────
// Step model
//
// One merged Step interface covers the behavioural taxonomy:
//   info        — context, no anchor (centered card).
//   spotlight   — guided explanation pointing at a [data-tour] target.
//   action      — user performs the REAL operation; auto-advances on
//                 fulfilment (completion tag, or a matching click target).
//                 Next is gated until fulfilled unless the step is `optional`.
//   navigation  — brings the user to another route (cross-page step). The
//                 engine navigates on Next and then resolves the step's target.
//   tip         — lightweight non-blocking note; "Got it" dismisses, never traps.
//   success     — celebratory final state.
// A navigation or action step can also spotlights a target. A step may combine
// `route` + `target`: navigating positions the target, then spotlight shows.
// ──────────────────────────────────────────────────────────────────────────────

export const WALKTHROUGH_STEP_KINDS = [
  "info",
  "spotlight",
  "action",
  "navigation",
  "tip",
  "success",
] as const;
export type WalkthroughStepKind = (typeof WALKTHROUGH_STEP_KINDS)[number];

export const WALKTHROUGH_PLACEMENTS = ["auto", "top", "bottom", "left", "right", "center"] as const;
export type WalkthroughPlacement = (typeof WALKTHROUGH_PLACEMENTS)[number];

/** Completion tags fired by the app itself after a real mutation succeeds.
 *  Pages call `emitWalkthroughDone(tag)` (web) after the API call resolves. */
export const ADVANCE_TAG = {
  customerCreated: "customer.created",
  equipmentCreated: "equipment.created",
  jobCreated: "job.created",
  technicianAssigned: "technician.assigned",
  visitStarted: "visit.started",
  visitCompleted: "visit.completed",
  diagnosisRecorded: "diagnosis.recorded",
  knowledgeContributed: "knowledge.contributed",
  knowledgeReviewed: "knowledge.reviewed",
  estimateSent: "estimate.sent",
  invoiceSent: "invoice.sent",
  paymentRecorded: "payment.recorded",
} as const;
export type AdvanceTag = (typeof ADVANCE_TAG)[keyof typeof ADVANCE_TAG];

export interface WalkthroughAdvanceCondition {
  /** DOM event to listen for on a matching target. */
  event?: "click" | "change" | "input";
  /** [data-tour="..."] id the event must land on. */
  target?: string;
  /** Raw CSS selector; takes precedence over `target` when both given. */
  selector?: string;
  /** Completion tag fired by the page (see ADVANCE_TAG). */
  tag?: string;
}

export interface WalkthroughStep {
  kind: WalkthroughStepKind;
  title: string;
  body: string;
  /** [data-tour="..."] id to spotlight / observe. */
  target?: string;
  /** Route to be on for this step (cross-page). Engine navigates on Next. */
  route?: string;
  /** What fulfils an `action` step. When absent the step behaves like a
   *  spotlight (user clicks Next). */
  advanceOn?: WalkthroughAdvanceCondition[];
  /** Action/tip details. */
  required?: boolean;
  /** Auto-advance as soon as the condition is fulfilled (default true for action). */
  autoAdvance?: boolean;
  /** Preferred coachmark placement; defaults to `auto`. */
  placement?: WalkthroughPlacement;
  /** `tip` steps: auto-dismiss after this many ms (default 6000). */
  dismissAfterMs?: number;
}

export interface WalkthroughPrerequisite {
  /** Stable id resolved by the engine (e.g. "has-any-customer"). */
  id: string;
  /** Short human explanation shown in the Learn NNACT center. */
  help: string;
}

export interface Walkthrough {
  /** Kebab-case stable id — the progress map key. */
  id: string;
  /** Definition version. Bump to reset stale progress and re-engage users. */
  version: number;
  title: string;
  /** One-line pitch shown in the Learn NNACT center. */
  summary: string;
  /** e.g. "2 min". */
  duration: string;
  /** Roles allowed to run this tour. */
  roles: WalkthroughRole[];
  /** Derived capabilities the user must hold, in addition to roles. */
  permissions: WalkthroughPermission[];
  /** Route where the tour is anchored (used by contextual recall + welcome). */
  primaryRoute: string;
  /** Pathname prefixes this tour is about; drives the contextual "Learn" entry. */
  relatesTo: string[];
  /** Optional eligibility gate. If unmet, the tour hides from the catalog. */
  prerequisite?: WalkthroughPrerequisite;
  /** Whether a technician field-flow tour (drives the mobile badge). */
  field?: boolean;
  steps: WalkthroughStep[];
}

// ──────────────────────────────────────────────────────────────────────────────
// P0 definitions
//
// Only definitions with targets that exist on their page ship. Every `data-tour`
// id here must be present in the web app (see docs/onboarding/WALKTHROUGHS.md
// target inventory). Completing a definition set = the walked-through workflow
// is production-ready. Do not add tours referencing data-tour ids that are not
// actually placed in pages.
// ──────────────────────────────────────────────────────────────────────────────

export const WALKTHROUGHS: readonly Walkthrough[] = [
  {
    id: "getting-started",
    version: 1,
    title: "Getting started",
    summary: "A two-minute tour of your workspace and where each task lives.",
    duration: "2 min",
    roles: [...WALKTHROUGH_ROLES],
    permissions: [],
    primaryRoute: "/",
    relatesTo: ["/"],
    steps: [
      {
        kind: "info",
        title: "Welcome to NNACT Pro",
        body: "We'll walk you around your workspace: Customers, Jobs, Dispatch, Repair Brain, and money. Nothing modifies your data — skip or close anytime.",
      },
      {
        kind: "navigation",
        route: "/customers",
        target: "nav-customers",
        title: "Your customers come first",
        body: "Customers is where every contact lives. Jobs, equipment, invoices, and the portal all hang off a customer record.",
      },
      {
        kind: "navigation",
        route: "/jobs",
        target: "nav-jobs",
        title: "Service jobs",
        body: "Jobs track a service visit end-to-end: created from a customer, scheduled, assigned, diagnosed, and closed out.",
      },
      {
        kind: "navigation",
        route: "/dispatch",
        target: "nav-dispatch",
        title: "Dispatch",
        body: "Dispatch pairs jobs with technicians and keeps the day's route visible. Owners and dispatchers run the board.",
      },
      {
        kind: "navigation",
        route: "/repair-brain",
        target: "nav-repair-brain",
        title: "Repair Brain",
        body: "Repair Brain is NNACT's institutional knowledge base: model catalogs, symptoms, faults, and verified repair procedures.",
      },
      {
        kind: "navigation",
        route: "/invoices",
        target: "nav-invoices",
        title: "Invoicing & payment",
        body: "Estimates and invoices turn completed work into money. Payments can be recorded here or collected through the customer portal.",
      },
      {
        kind: "success",
        title: "You have the map",
        body: "From here, run a task tour whenever you're about to do something new: Create customer, Service job, Diagnose with Repair Brain, and more.",
      },
    ],
  },
  {
    id: "create-customer",
    version: 1,
    title: "Create a customer",
    summary: "Set up your first customer with the details that power everything after.",
    duration: "2 min",
    roles: ["owner", "dispatcher"],
    permissions: ["manage_customers"],
    primaryRoute: "/customers",
    relatesTo: ["/customers"],
    steps: [
      {
        kind: "info",
        title: "Customers are the root of your records",
        body: "Every job, piece of equipment, estimate, and invoice belongs to a customer. Let's create one.",
      },
      {
        kind: "action",
        route: "/customers",
        target: "customers-add",
        title: "Open the New Customer form",
        body: "Click “Add customer” to open the form.",
        advanceOn: [{ event: "click", target: "customers-add" }],
      },
      {
        kind: "spotlight",
        target: "customer-create-name",
        title: "Name is the only required field",
        body: "Phone and email are optional now, but they unlock SMS/email templates and the customer portal later.",
      },
      {
        kind: "spotlight",
        target: "customer-create-submit",
        title: "Save",
        body: "Saving creates the record. The customer then appears in the list and can be opened for equipment and jobs.",
      },
      {
        kind: "action",
        target: "customer-create-dialog",
        title: "Try it — create a real customer",
        body: "Fill the form and save. We'll continue automatically once the customer is created. Use a real customer so the walk-through stays truthful.",
        advanceOn: [{ tag: "customer.created" }],
        required: true,
      },
      {
        kind: "success",
        title: "Customer created",
        body: "You can edit details anytime from the customer's page, add equipment, link the portal, and open jobs from there.",
      },
    ],
  },
  {
    id: "register-equipment",
    version: 1,
    title: "Register equipment",
    summary: "Attach a real appliance/unit to a customer so diagnostics link to Repair Brain.",
    duration: "3 min",
    roles: ["owner", "dispatcher"],
    permissions: ["manage_customers"],
    primaryRoute: "/customers",
    relatesTo: ["/customers", "/equipment"],
    steps: [
      {
        kind: "info",
        title: "Equipment is where repair work happens",
        body: "A registered unit carries its make, model, and serial. Diagnostics on it feed Repair Brain with field-proven data.",
      },
      {
        kind: "action",
        route: "/customers",
        target: "customers-list",
        title: "Open the customer",
        body: "Open any customer from the list. An existing customer keeps this truthful — no throwaway records.",
        advanceOn: [{ event: "click", target: "customers-link" }],
      },
      {
        kind: "spotlight",
        target: "equipment-section",
        title: "The Equipment section",
        body: "Each customer page lists their units. Empty here is common for new customers.",
      },
      {
        kind: "action",
        target: "equipment-add",
        title: "Add a unit",
        body: "Click “Add” to open the equipment form.",
        advanceOn: [{ event: "click", target: "equipment-add" }],
      },
      {
        kind: "spotlight",
        target: "equipment-form",
        title: "Capture the unit's identity",
        body: "Type (fridge, washer, AC…), make, and model matter most — they connect this unit to a Repair Brain model catalog entry.",
      },
      {
        kind: "action",
        target: "equipment-form",
        title: "Save the real unit",
        body: "Fill in the details and save. We'll continue when the equipment exists.",
        advanceOn: [{ tag: "equipment.created" }],
        required: true,
      },
      {
        kind: "success",
        title: "Unit registered",
        body: "Future service visits on this unit can link to diagnostics and to Repair Brain procedures for its model.",
      },
    ],
  },
  {
    id: "create-service-job",
    version: 1,
    title: "Create a service job",
    summary: "Turn a customer request into a scheduled, staffed service job.",
    duration: "3 min",
    roles: ["owner", "dispatcher"],
    permissions: ["manage_jobs"],
    primaryRoute: "/jobs/new",
    relatesTo: ["/jobs"],
    steps: [
      {
        kind: "info",
        title: "A job is one service engagement",
        body: "A job tracks one visit or repair: title, customer, schedule, assignee, diagnosis, and outcome. Incoming requests become jobs here.",
      },
      {
        kind: "action",
        route: "/jobs",
        target: "jobs-add",
        title: "Start a new job",
        body: "Click “New job” to open the intake form.",
        advanceOn: [{ event: "click", target: "jobs-add" }],
      },
      {
        kind: "spotlight",
        target: "job-form-title",
        title: "Describe the work",
        body: "A concise title like “Cold wash — no error code”. The customer and any equipment set the context for everything after.",
      },
      {
        kind: "spotlight",
        target: "job-form-submit",
        title: "Save the job",
        body: "Saving creates the job as a lead. Dispatch later schedules and assigns it.",
      },
      {
        kind: "action",
        target: "job-form",
        title: "Create a real job",
        body: "Flesh out the form and save. Existing customers only — we continue once the job exists.",
        advanceOn: [{ tag: "job.created" }],
        required: true,
      },
      {
        kind: "success",
        title: "Job created",
        body: "Head to Dispatch to schedule it and assign a technician, then it becomes a field visit.",
      },
    ],
  },
  {
    id: "dispatch-assign-technician",
    version: 1,
    title: "Dispatch & assign a technician",
    summary: "Schedule a job and hand it to the right technician.",
    duration: "3 min",
    roles: ["owner", "dispatcher"],
    permissions: ["dispatch_jobs"],
    primaryRoute: "/dispatch",
    relatesTo: ["/dispatch"],
    steps: [
      {
        kind: "info",
        title: "Dispatch keeps the day moving",
        body: "The board groups reachable jobs and shows who is doing what. Let's schedule and assign one.",
      },
      {
        kind: "navigation",
        route: "/dispatch",
        target: "dispatch-board",
        title: "The dispatch board",
        body: "Each card is a job waiting for a slot or a technician. Filters narrow the view by day and crew.",
      },
      {
        kind: "spotlight",
        target: "dispatch-assign",
        title: "Assign a technician",
        body: "Every unscheduled card has an Assign control. Pick the technician whose skills match the unit type and the visit.",
      },
      {
        kind: "action",
        target: "dispatch-assign",
        title: "Make a real assignment",
        body: "Assign the technician to a job that's actually reachable. We'll continue after the assignment is saved.",
        advanceOn: [{ tag: "technician.assigned" }],
        required: false,
      },
      {
        kind: "tip",
        title: "Grouped by route, not by queue",
        body: "Cards group by technician route so a technician can pick up several nearby jobs in one pass.",
        dismissAfterMs: 6000,
      },
      {
        kind: "success",
        title: "Slot filled",
        body: "The technician now sees the job on their route. Next, walk through the field visit flow.",
      },
    ],
  },
  {
    id: "technician-service-visit",
    version: 1,
    title: "Technician service visit",
    summary: "The field flow: open your job, drive it in progress, diagnose, repair, record the outcome.",
    duration: "4 min",
    roles: ["technician", "owner"],
    permissions: ["perform_visits"],
    primaryRoute: "/jobs",
    relatesTo: ["/jobs"],
    field: true,
    steps: [
      {
        kind: "info",
        title: "Your field workflow",
        body: "This is the daily loop: open a job → start the visit → capture the diagnosis → repair → record the outcome. It mirrors what you do on site.",
      },
      {
        kind: "navigation",
        route: "/jobs",
        target: "jobs-list",
        title: "Find your next job",
        body: "Jobs assigned to you land on the list with their status and date.",
      },
      {
        kind: "action",
        target: "jobs-link",
        title: "Open the job",
        body: "Open the job you're about to work. We'll switch to its detail page.",
        advanceOn: [{ event: "click", target: "jobs-link" }],
      },
      {
        kind: "spotlight",
        target: "job-detail-status",
        title: "Move it to In progress",
        body: "The status control follows the real lifecycle: lead → scheduled → in_progress → completed. Flip it when you start.",
      },
      {
        kind: "action",
        target: "job-detail-status",
        title: "Start the visit",
        body: "Mark the job in progress when you begin work so the timeline and reporting stay honest.",
        advanceOn: [{ tag: "visit.started" }],
        required: false,
      },
      {
        kind: "spotlight",
        target: "job-detail-diagnose",
        title: "Diagnose before you repair",
        body: "A diagnostic session captures symptom, steps, and measurements. If the unit's model is in Repair Brain you'll see live guidance.",
      },
      {
        kind: "spotlight",
        target: "job-detail-outcome",
        title: "Record the outcome",
        body: "Outcome entries — what failed, what was done, parts used — become the field evidence Repair Brain learns from.",
      },
      {
        kind: "action",
        target: "job-detail-outcome",
        title: "Close the loop",
        body: "When the visit wraps, record the outcome (or keep it for the next visit). We proceed when the outcome exists.",
        advanceOn: [{ tag: "visit.completed" }],
        required: false,
      },
      {
        kind: "success",
        title: "Visit handled",
        body: "That loop just made this repair safer for the next technician. Keep contributing outcomes and Repair Brain gets sharper.",
      },
    ],
  },
  {
    id: "repair-brain-introduction",
    version: 1,
    title: "Repair Brain introduction",
    summary: "Explore NNACT's institutional knowledge base and how it's organized.",
    duration: "2 min",
    roles: [...WALKTHROUGH_ROLES],
    permissions: ["use_repair_brain"],
    primaryRoute: "/repair-brain",
    relatesTo: ["/repair-brain"],
    steps: [
      {
        kind: "info",
        title: "Institutional memory, not tribal knowledge",
        body: "Repair Brain grows with every verified repair in your business: models, symptoms, faults, and procedures — searchable on demand.",
      },
      {
        kind: "navigation",
        route: "/repair-brain",
        target: "rb-search",
        title: "Search is the front door",
        body: "Type a model number, brand, symptom, or fault code to search. Results mix models, faults, parts, and procedures.",
      },
      {
        kind: "spotlight",
        target: "rb-models",
        title: "Model catalog",
        body: "Every appliance model your shop has met lives here with its aliases and specifications.",
      },
      {
        kind: "spotlight",
        target: "rb-contribute",
        title: "You can grow it",
        body: "Rooms to contribute live right in the catalog — propose a fault, procedure, part, or document. Reviews keep the fact base trustworthy.",
      },
      {
        kind: "tip",
        title: "Confidence is visible",
        body: "Every entry carries a confidence status from field observation up to manufacturer-confirmed — so you know how much to trust it.",
        dismissAfterMs: 7000,
      },
    ],
  },
  {
    id: "diagnose-using-repair-brain",
    version: 1,
    title: "Diagnose using Repair Brain",
    summary: "Run a guided diagnostic session that leans on verified procedures.",
    duration: "4 min",
    roles: [...WALKTHROUGH_ROLES],
    permissions: ["diagnose"],
    primaryRoute: "/repair-brain",
    relatesTo: ["/repair-brain", "/diagnostics"],
    steps: [
      {
        kind: "info",
        title: "Guided, evidence-based diagnosis",
        body: "You'll run one diagnostic session: choose the equipment model, record the symptom, run the checks a procedure suggests, then record the result.",
      },
      {
        kind: "navigation",
        route: "/repair-brain",
        target: "rb-search",
        title: "Find the unit's model",
        body: "Search the model number of a unit you're genuinely working on. If the model isn't catalogued, you can register it first.",
      },
      {
        kind: "spotlight",
        target: "rb-diagnose",
        title: "Begin a diagnostic session",
        body: "From a model, start a diagnostic session. It captures symptoms and measurements against that model's verified knowledge.",
      },
      {
        kind: "spotlight",
        target: "diag-run",
        title: "Run the procedure",
        body: "The session walks you through suggested checks and measurements. Follow them on the machine — that's real diagnosis, not a demo.",
      },
      {
        kind: "spotlight",
        target: "diag-outcome",
        title: "Record the result",
        body: "Finish the session by recording what resolved the fault. That entry is your contribution to Repair Brain.",
      },
      {
        kind: "action",
        target: "diag-outcome",
        title: "Finish a genuine session",
        body: "Complete the session's outcome for a real unit. We continue when the diagnosis is recorded.",
        advanceOn: [{ tag: "diagnosis.recorded" }],
        required: false,
      },
      {
        kind: "success",
        title: "Diagnosis captured",
        body: "Verified sessions improve matching for everyone. Next: contribute knowledge you've proven in the field.",
      },
    ],
  },
  {
    id: "contribute-repair-knowledge",
    version: 1,
    title: "Contribute repair knowledge",
    summary: "Turn a successful repair into reusable, reviewable knowledge.",
    duration: "3 min",
    roles: [...WALKTHROUGH_ROLES],
    permissions: ["contribute_knowledge"],
    primaryRoute: "/repair-brain",
    relatesTo: ["/repair-brain"],
    steps: [
      {
        kind: "info",
        title: "Every successful repair is knowledge",
        body: "A verified procedure today spares the next technician diagnosing the same fault from scratch. This tour turns one repair into knowledge.",
      },
      {
        kind: "navigation",
        route: "/repair-brain",
        target: "rb-models",
        title: "Pick the model",
        body: "Open the model you just repaired (or searched). Proposals attach to a model catalog entry.",
      },
      {
        kind: "action",
        target: "rb-contribute",
        title: "Open the contribution composer",
        body: "Click the contribution control — it offers fault, procedure, part, and document proposals.",
        advanceOn: [{ event: "click", target: "rb-contribute" }],
      },
      {
        kind: "spotlight",
        target: "rb-contribute",
        title: "Describe what actually worked",
        body: "Be specific: symptom, checks, root cause, exact steps and parts. This is what makes the entry trustworthy.",
      },
      {
        kind: "action",
        target: "rb-contribute",
        title: "Submit a real proposal",
        body: "Submit one proposal based on a repair you actually did. It enters the review queue (you can also walk the review tour next).",
        advanceOn: [{ tag: "knowledge.contributed" }],
        required: false,
      },
      {
        kind: "success",
        title: "Knowledge contributed",
        body: "It now sits in the review queue. Owners/reviewers verify it, and once verified it guides future diagnoses.",
      },
    ],
  },
  {
    id: "review-verify-knowledge",
    version: 1,
    title: "Review & verify knowledge",
    summary: "Keep the fact base trustworthy: review the proposal queue and verify entries.",
    duration: "3 min",
    roles: ["owner", "dispatcher"],
    permissions: ["review_knowledge"],
    primaryRoute: "/repair-brain",
    relatesTo: ["/repair-brain"],
    steps: [
      {
        kind: "info",
        title: "Reviews keep Repair Brain honest",
        body: "Field proposals are only as good as their review. Owners and dispatchers verify, reject, or send entries back with notes.",
      },
      {
        kind: "navigation",
        route: "/repair-brain",
        target: "rb-review",
        title: "The review queue",
        body: "The review control lists everything awaiting review, grouped by kind: procedures, faults, parts, documents.",
      },
      {
        kind: "spotlight",
        target: "rb-proposals",
        title: "Read the proposal",
        body: "Each entry shows the source repair, confidence, and payload. Check it against what the field actually reported.",
      },
      {
        kind: "action",
        target: "rb-proposals",
        title: "Verify a genuine entry",
        body: "Move one real proposal forward (or reject with notes). We continue when the review is recorded.",
        advanceOn: [{ tag: "knowledge.reviewed" }],
        required: false,
      },
      {
        kind: "success",
        title: "Fact base protected",
        body: "Verified entries rise in confidence and become guidance for future diagnoses across the whole team.",
      },
    ],
  },
  {
    id: "create-quotation",
    version: 1,
    title: "Create a quotation",
    summary: "Turn a job into a customer-facing estimate and send it for approval.",
    duration: "3 min",
    roles: ["owner", "dispatcher"],
    permissions: ["manage_money"],
    primaryRoute: "/estimates",
    relatesTo: ["/estimates"],
    steps: [
      {
        kind: "info",
        title: "From job to quote",
        body: "Estimates propose scope and price before work (or before paid work continues). They're built from a job and sent for approval.",
      },
      {
        kind: "action",
        route: "/estimates",
        target: "estimates-add",
        title: "Start from a job",
        body: "Click “New estimate”. Estimates always derive from a job, so line items inherit real context.",
        advanceOn: [{ event: "click", target: "estimates-add" }],
      },
      {
        kind: "spotlight",
        target: "estimates-form",
        title: "Price the options",
        body: "Add catalog items or custom lines. Numbering and tax follow your business settings automatically.",
      },
      {
        kind: "spotlight",
        target: "estimates-send",
        title: "Send for approval",
        body: "Sending emails a branded PDF and opens the customer portal approval link.",
      },
      {
        kind: "action",
        target: "estimates-send",
        title: "Send a real quotation",
        body: "Send one quotation for a genuine job to continue the booking flow. We proceed when it's out the door.",
        advanceOn: [{ tag: "estimate.sent" }],
        required: false,
      },
      {
        kind: "success",
        title: "Quotation sent",
        body: "Approvals land back and the approved scope can be copied into the job. Next up: invoice the completed work.",
      },
    ],
  },
  {
    id: "issue-invoice",
    version: 1,
    title: "Issue an invoice",
    summary: "Bill completed work: create the invoice, add lines, send it, record payment.",
    duration: "3 min",
    roles: ["owner", "dispatcher"],
    permissions: ["manage_money"],
    primaryRoute: "/invoices",
    relatesTo: ["/invoices"],
    steps: [
      {
        kind: "info",
        title: "Move work into money",
        body: "An invoice captures what was done and what's owed. It attaches to a job and can be sent as a portable document.",
      },
      {
        kind: "action",
        route: "/invoices",
        target: "invoices-add",
        title: "Create an invoice",
        body: "Click “New invoice” and pick the job. Lines can come from the job or be added manually.",
        advanceOn: [{ event: "click", target: "invoices-add" }],
      },
      {
        kind: "spotlight",
        target: "invoices-form",
        title: "Line it up",
        body: "Add labor and parts. Totals, VAT/tax, and numbering follow business settings; deposits and discounts slot in where configured.",
      },
      {
        kind: "spotlight",
        target: "invoices-send",
        title: "Send it",
        body: "Sending emails the PDF and makes the invoice visible in the customer portal for payment.",
      },
      {
        kind: "action",
        target: "invoices-send",
        title: "Send a real invoice",
        body: "Send one invoice for real completed work. We continue when it's sent.",
        advanceOn: [{ tag: "invoice.sent" }],
        required: false,
      },
      {
        kind: "success",
        title: "Invoice out",
        body: "Now track payment — either it arrives via the portal or you record it by hand (see the Record payment tour).",
      },
    ],
  },
  {
    id: "record-payment",
    version: 1,
    title: "Record a payment",
    summary: "Close the loop on money: mark an invoice paid when payment arrives.",
    duration: "2 min",
    roles: ["owner", "dispatcher"],
    permissions: ["manage_money"],
    primaryRoute: "/invoices",
    relatesTo: ["/invoices", "/reports"],
    steps: [
      {
        kind: "info",
        title: "Every paid invoice is a lesson",
        body: "Recording payment keeps aging, revenue, and the customer portal balance truthful. Portal payments record themselves — this tour covers the manual path.",
      },
      {
        kind: "navigation",
        route: "/invoices",
        target: "invoices-list",
        title: "Open the invoice",
        body: "From the invoice list, open the invoice that received payment.",
      },
      {
        kind: "spotlight",
        target: "invoices-pay",
        title: "The payment control",
        body: "The Record payment control takes an amount and method. Anything over the balance becomes an overpayment to refund or credit.",
      },
      {
        kind: "action",
        target: "invoices-pay",
        title: "Record a real payment",
        body: "Record the payment for a genuinely received amount. We continue when it's saved.",
        advanceOn: [{ tag: "payment.recorded" }],
        required: false,
      },
      {
        kind: "success",
        title: "Paid in full",
        body: "The invoice is now settled: aging, revenue trends, and the portal balance all reflect it.",
      },
    ],
  },
];

export const WALKTHROUGH_INDEX: Record<string, Walkthrough> = Object.fromEntries(
  WALKTHROUGHS.map((tour) => [tour.id, tour]),
);

export function getWalkthrough(id: string): Walkthrough | undefined {
  return WALKTHROUGH_INDEX[id];
}

/** Tours a role can run, in definition order (catalog + welcome recommendation). */
export function walkthroughsForRole(
  role: WalkthroughRole,
  list: readonly Walkthrough[] = WALKTHROUGHS,
): Walkthrough[] {
  return list.filter((tour) => walkthroughAccessibleTo(tour, role));
}

/** Tours relevant to a given pathname prefix (contextual "Learn" entry + recall). */
export function walkthroughsForRoute(
  pathname: string,
  role: WalkthroughRole,
  list: readonly Walkthrough[] = WALKTHROUGHS,
): Walkthrough[] {
  return walkthroughsForRole(role, list).filter((tour) =>
    tour.relatesTo.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
}

/** A fresh, empty progress record for a definition version. */
export function newWalkthroughProgress(
  tour: Pick<Walkthrough, "id" | "version">,
  step = 0,
): WalkthroughProgressRecord {
  return {
    state: "in_progress",
    step,
    version: tour.version,
    starts: 1,
    completions: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Bind a user role to a typed role; tolerant of legacy/unknown role strings. */
export function roleOf(user: { role: string }): WalkthroughRole {
  return (WALKTHROUGH_ROLES as readonly string[]).includes(user.role)
    ? (user.role as WalkthroughRole)
    : "technician";
}