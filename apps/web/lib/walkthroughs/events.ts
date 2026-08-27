/**
 * Walkthrough analytics — a clean internal event bus with no third-party
 * tracker.
 *
 * Model: fire-and-forget, never throws. Events are appended to a capped
 * localStorage journal in the web app so the funnel (started → step → completed /
 * skipped) is inspectable and auditable without any network dependency. When a
 * server-side analytics sink is introduced, extend `pushWalkthroughEvent` to
 * forward — the call sites below never change.
 *
 * Pages that complete a REAL user action (e.g. a customer was created) signal
 * the runner through these window events:
 *   - nnact:walkthrough:advance  → fulfils action-step advance-on tags
 * The DOM-completion dispatch is a plain CustomEvent so the engine and any QA
 * harness both listen.
 */

import type { AdvanceTag, WalkthroughStep } from "@nnact/shared";

export const ADVANCE_EVENT = "nnact:walkthrough:advance";
export const START_TOUR_EVENT = "nnact:walkthrough:start";
export const OPEN_LEARN_EVENT = "nnact:walkthrough:learn";
const ANALYTICS_KEY = "nnact:walkthrough:events";
const ANALYTICS_CAP = 250;

export interface WalkthroughAnalyticEvent {
  kind:
    | "tour_started"
    | "tour_resumed"
    | "tour_step"
    | "tour_completed"
    | "tour_skipped"
    | "tour_closed"
    | "tour_restarted"
    | "action_fulfilled"
    | "target_missing"
    | "target_timeout";
  tourId: string;
  stepIndex?: number;
  stepKind?: WalkthroughStep["kind"];
  route?: string;
  at: string;
}

function readJournal(): WalkthroughAnalyticEvent[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(ANALYTICS_KEY);
    const parsed = raw ? (JSON.parse(raw) as WalkthroughAnalyticEvent[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJournal(events: WalkthroughAnalyticEvent[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ANALYTICS_KEY, JSON.stringify(events.slice(-ANALYTICS_CAP)));
  } catch {
    // Storage full / denied — analytics are best-effort by design.
  }
}

/** Append one analytics record. Never throws. */
export function pushWalkthroughEvent(event: WalkthroughAnalyticEvent): void {
  const journal = readJournal();
  journal.push(event);
  writeJournal(journal);
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[walkthrough]", event.kind, event.tourId, event.stepIndex ?? "");
  }
}

/** The ordering of the latest event of each tour id (for tests/analytics). */
export function latestWalkthroughEvents(tourId: string): WalkthroughAnalyticEvent[] {
  return readJournal().filter((event) => event.tourId === tourId);
}

/** Clear the journal (dev/test helper). */
export function clearWalkthroughEvents(): void {
  writeJournal([]);
}

/**
 * Signal a REAL operation completed. Pages call this right after their API
 * mutation resolves (see ADVANCE_TAG in packages/shared/src/walkthroughs.ts).
 * The walkthrough engine listens and auto-advances action steps awaiting this tag.
 */
export function emitWalkthroughDone(tag: AdvanceTag): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ADVANCE_EVENT, { detail: { tag } }),
  );
}

/**
 * Ask the mounted walkthrough provider to start (or resume) a tour. Pages that
 * don't sit inside the React tree under the provider — or that only want to
 * signal intent — dispatch this window event; the provider listens once.
 */
export function requestTour(tourId: string, opts?: { resume?: boolean }): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(START_TOUR_EVENT, { detail: { tourId, resume: opts?.resume ?? false } }),
  );
}

/** Ask the mounted walkthrough provider to open the Learn NNACT center. */
export function requestLearn(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_LEARN_EVENT, { detail: {} }));
}