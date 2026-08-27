/**
 * Guided-walkthrough runtime logic — pure, DOM-free, unit-tested.
 *
 * Everything here is a function of (definition, progress, pathname, event
 * context) so the engine in components/walkthroughs can stay thin and the
 * tricky rules — step blocking, cross-page navigation, version-aware resume —
 * are verified without a browser.
 */

import type {
  Walkthrough,
  WalkthroughAdvanceCondition,
  WalkthroughProgressRecord,
  WalkthroughStep,
} from "@nnact/shared";

export const TOUR_ATTRIBUTE = "data-tour";

/** Stable attribute selector for a given tour id. */
export function targetSelector(id: string): string {
  return `[${TOUR_ATTRIBUTE}="${id}"]`;
}

/** Compare a pathname with a step route (prefix match, e.g. "/jobs/1" ⊆ "/jobs"). */
export function pathMatches(pathname: string, route: string): boolean {
  if (route === "/") return pathname === "/" || pathname.startsWith("/?");
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function stepNeedsNavigation(step: WalkthroughStep, pathname: string): boolean {
  return Boolean(step.route && !pathMatches(pathname, step.route));
}

/** Context for evaluating advance-on conditions at a single point in time. */
export interface AdvanceContext {
  /** Fulfilled completion tag (from a page-emitted success). */
  tag?: string;
  /** Element a DOM event landed on (implements .matches(selector)). */
  target?: { matches(selector: string): boolean } | null;
}

export function conditionMatches(
  condition: WalkthroughAdvanceCondition,
  ctx: AdvanceContext = {},
): boolean {
  if (condition.tag) return ctx.tag === condition.tag;
  if (condition.selector) return Boolean(ctx.target?.matches(condition.selector));
  if (condition.target) return Boolean(ctx.target?.matches(targetSelector(condition.target)));
  return false;
}

/** True when an action step's conditions are satisfied by the given context. */
export function stepFulfilled(
  step: Pick<WalkthroughStep, "advanceOn">,
  ctx: AdvanceContext = {},
): boolean {
  if (!step.advanceOn || step.advanceOn.length === 0) return true;
  return step.advanceOn.some((condition) => conditionMatches(condition, ctx));
}

/**
 * A step traps the user at "Next" until it's genuinely fulfilled — but only when
 * it is an action step that asks for an advance (auto-advance stays available
 * for agents/QA). `required: false` is the escape hatch for optional actions.
 */
export function stepBlocksNext(step: WalkthroughStep, fulfilled: boolean): boolean {
  if (step.kind !== "action") return false;
  if (step.advanceOn && step.advanceOn.length === 0) return false;
  if (step.required === false) return false;
  return !fulfilled;
}

export function stepIsAutoAdvancing(step: WalkthroughStep): boolean {
  if (step.kind !== "action") return false;
  if (!step.advanceOn || step.advanceOn.length === 0) return false;
  return step.autoAdvance !== false;
}

/**
 * A definition version bump is the retirement trigger for older progress:
 * a tour completed under version N is offered again under version N+1.
 */
export function recordMatchesVersion(tour: Walkthrough, record?: WalkthroughProgressRecord): boolean {
  return Boolean(record && record.version === tour.version);
}

export function isTourCompleted(tour: Walkthrough, record?: WalkthroughProgressRecord): boolean {
  return Boolean(record && record.state === "completed" && recordMatchesVersion(tour, record));
}

export function isTourInProgress(tour: Walkthrough, record?: WalkthroughProgressRecord): boolean {
  return Boolean(record && record.state === "in_progress" && recordMatchesVersion(tour, record));
}

export function isTourDismissed(tour: Walkthrough, record?: WalkthroughProgressRecord): boolean {
  return Boolean(record && record.state === "dismissed" && recordMatchesVersion(tour, record));
}

/** Human label for navigation CTA ("Go to Customers"); falls back to null. */
const ROUTE_LABELS: Record<string, string> = {
  "/": "Go to Dashboard",
  "/customers": "Go to Customers",
  "/jobs": "Go to Jobs",
  "/dispatch": "Go to Dispatch",
  "/repair-brain": "Go to Repair Brain",
  "/estimates": "Go to Estimates",
  "/invoices": "Go to Invoices",
  "/reports": "Go to Reports",
};

export function routeLabel(route: string): string | null {
  return ROUTE_LABELS[route] ?? null;
}

export function stepCountLabel(index: number, total: number): string {
  return `${Math.min(index + 1, total)} of ${total}`;
}

export type ResolveStatus = "idle" | "navigate" | "resolving" | "ready" | "missing";

/**
 * Position of the runner relative to the current step. The engine transitions
 * idle → navigate (needs to move to the step's route) → resolving (retrying for
 * the target) → ready (coachmark shown), or → missing (target absent after
 * bounded retries; only non-required steps proceed).
 */
export function resolveStatus(
  step: WalkthroughStep | undefined,
  pathname: string,
  targetFound: boolean,
  resolving: boolean,
): ResolveStatus {
  if (!step) return "idle";
  if (step.route && !pathMatches(pathname, step.route)) return "navigate";
  if (targetFound) return "ready";
  if (resolving) return "resolving";
  return "missing";
}

/** Tour ids that relate to a pathname, highest-priority first (definitions order). */
export function toursForPathname(
  tours: readonly Walkthrough[],
  pathname: string,
): Walkthrough[] {
  return tours.filter((tour) =>
    tour.relatesTo.some((prefix) => pathMatches(pathname, prefix)),
  );
}