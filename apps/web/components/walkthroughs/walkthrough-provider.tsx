"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  WALKTHROUGH_INDEX,
  getWalkthrough,
  roleOf,
  walkthroughAccessibleTo,
  walkthroughsForRole,
  type Walkthrough,
  type WalkthroughProgressMap,
  type WalkthroughProgressRecord,
  type WalkthroughRole,
} from "@nnact/shared";
import { useSessionUser } from "@/lib/use-session-user";
import { api } from "@/lib/api";
import {
  loadLocalProgress,
  mergeProgress,
  normalizeProgress,
  saveLocalProgress,
} from "@/lib/walkthroughs/progress";
import {
  ADVANCE_EVENT,
  OPEN_LEARN_EVENT,
  START_TOUR_EVENT,
  pushWalkthroughEvent,
} from "@/lib/walkthroughs/events";
import {
  isTourCompleted,
  isTourInProgress,
  pathMatches,
  recordMatchesVersion,
  resolveStatus,
  routeLabel,
  stepBlocksNext,
  stepFulfilled,
  stepIsAutoAdvancing,
  stepNeedsNavigation,
  targetSelector,
} from "@/lib/walkthroughs/runtime";
import { waitForTarget } from "@/lib/walkthroughs/target";
import { CoachmarkPanel } from "./coachmark";
import { Spotlight, useElementRect } from "./spotlight";
import { LearnCenter } from "./learn-center";
import { WelcomeDialog } from "./welcome-dialog";
import { Button } from "@/components/ui/button";

export interface WalkthroughContextValue {
  progress: WalkthroughProgressMap;
  canRun: (tourId: string) => boolean;
  isCompleted: (tourId: string) => boolean;
  isInProgress: (tourId: string) => boolean;
  startTour: (tourId: string, opts?: { resume?: boolean }) => void;
  restartTour: (tourId: string) => void;
  openLearn: () => void;
  closeLearn: () => void;
  learnOpen: boolean;
  activeTourId: string | null;
  role?: WalkthroughRole;
}

export const WalkthroughContext = createContext<WalkthroughContextValue | null>(null);

export function useWalkthrough(): WalkthroughContextValue {
  const ctx = useContext(WalkthroughContext);
  if (!ctx) throw new Error("useWalkthrough must be used inside <WalkthroughProvider>");
  return ctx;
}

type ResolvedTarget =
  | { state: "pending" }
  | { state: "targetless" }
  | { state: "missing" }
  | { state: "found"; el: HTMLElement };

const BANNER_KEY_PREFIX = "nnact:walkthrough:banner-dismissed";

function nowIso(): string {
  return new Date().toISOString();
}

export function WalkthroughProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useSessionUser();
  const role = useMemo<WalkthroughRole | undefined>(
    () => (user ? roleOf({ role: user.role }) : undefined),
    [user],
  );

  const [progress, setProgress] = useState<WalkthroughProgressMap>({});
  const progressRef = useRef<WalkthroughProgressMap>({});

  const [active, setActive] = useState<{ tourId: string; stepIndex: number } | null>(null);
  const activeRef = useRef<{ tourId: string; stepIndex: number } | null>(null);

  const [fulfilled, setFulfilled] = useState(false);
  const [resolved, setResolved] = useState<ResolvedTarget>({ state: "pending" });
  const [learnOpen, setLearnOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  const pushTimer = useRef<number | undefined>(undefined);

  // ── Keep latest values reachable from window/document listeners ──
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // ── Progress: hydrate from localStorage + server, keep both in sync ──
  useEffect(() => {
    const local = normalizeProgress(loadLocalProgress());
    progressRef.current = local;
    setProgress(local);
    void (async () => {
      try {
        const server = normalizeProgress((await api.walkthroughProgress()).progress);
        const merged = mergeProgress(server, local);
        if (merged !== local) {
          progressRef.current = merged;
          setProgress(merged);
        }
        saveLocalProgress(merged);
      } catch {
        // Offline / 401 — the local cache is authoritative until we can sync.
      }
    })();
    return () => {
      if (pushTimer.current) window.clearTimeout(pushTimer.current);
    };
  }, []);

  const schedulePush = useCallback((map: WalkthroughProgressMap): void => {
    if (pushTimer.current) window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => {
      pushTimer.current = undefined;
      void api.patchWalkthroughProgress(map).catch(() => {
        // Best-effort: next local change will retry the full map.
      });
    }, 700);
  }, []);

  /** Apply an update to one tour's record (state + refs + localStorage + PATCH). */
  const writeRecord = useCallback(
    (tourId: string, updater: (record: WalkthroughProgressRecord) => WalkthroughProgressRecord): void => {
      const tour = getWalkthrough(tourId);
      if (!tour) return;
      setProgress((prev) => {
        const existing = prev[tourId];
        const base: WalkthroughProgressRecord = existing
          ? { ...existing }
          : {
              state: "in_progress",
              step: 0,
              version: tour.version,
              starts: 0,
              completions: 0,
              startedAt: nowIso(),
              updatedAt: nowIso(),
            };
        const next = { ...updater(base), updatedAt: nowIso() };
        const map = { ...prev, [tourId]: next };
        progressRef.current = map;
        saveLocalProgress(map);
        schedulePush(map);
        return map;
      });
    },
    [schedulePush],
  );

  const goTo = useCallback((tourId: string, rawIndex: number): void => {
    const tour = getWalkthrough(tourId);
    if (!tour) return;
    const index = Math.max(0, Math.min(rawIndex, tour.steps.length - 1));
    setActive({ tourId, stepIndex: index });
    setFulfilled(false);
    setResolved({ state: "pending" });
    if (index === tour.steps.length - 1) {
      writeRecord(tourId, (record) => {
        const already = record.state === "completed" && record.version === tour.version;
        return {
          ...record,
          state: "completed",
          step: 0,
          completions: already ? record.completions : record.completions + 1,
          startedAt: record.startedAt ?? nowIso(),
          finishedAt: nowIso(),
        };
      });
      pushWalkthroughEvent({ kind: "tour_completed", tourId, stepIndex: index, at: nowIso() });
    }
  }, [writeRecord]);

  const advance = useCallback((): void => {
    const current = activeRef.current;
    if (!current) return;
    const tour = getWalkthrough(current.tourId);
    if (!tour) return;
    if (current.stepIndex + 1 > tour.steps.length - 1) return;
    goTo(current.tourId, current.stepIndex + 1);
  }, [goTo]);

  const back = useCallback((): void => {
    const current = activeRef.current;
    if (!current) return;
    goTo(current.tourId, current.stepIndex - 1);
  }, [goTo]);

  const startTour = useCallback(
    (tourId: string, opts?: { resume?: boolean }): void => {
      if (!role) return;
      const tour = getWalkthrough(tourId);
      if (!tour || !walkthroughAccessibleTo(tour, role)) return;
      const record = progressRef.current[tourId];
      const resume =
        opts?.resume === true &&
        record &&
        record.state === "in_progress" &&
        record.step >= 0 &&
        record.step < tour.steps.length;
      const startIndex = resume ? record.step : 0;
      setLearnOpen(false);
      setWelcomeOpen(false);
      setActive({ tourId, stepIndex: startIndex });
      setFulfilled(false);
      setResolved({ state: "pending" });
      if (resume) {
        pushWalkthroughEvent({ kind: "tour_resumed", tourId, stepIndex: startIndex, at: nowIso() });
      } else {
        writeRecord(tourId, (record) => ({
          ...record,
          state: "in_progress",
          step: 0,
          starts: record.starts + 1,
          startedAt: record.startedAt ?? nowIso(),
        }));
        pushWalkthroughEvent({ kind: "tour_started", tourId, stepIndex: 0, at: nowIso() });
      }
    },
    [role, writeRecord],
  );

  const restartTour = useCallback(
    (tourId: string): void => {
      if (!role) return;
      const tour = getWalkthrough(tourId);
      if (!tour || !walkthroughAccessibleTo(tour, role)) return;
      writeRecord(tourId, (record) => ({
        ...record,
        state: "in_progress",
        step: 0,
        starts: record.starts + 1,
        startedAt: nowIso(),
      }));
      pushWalkthroughEvent({ kind: "tour_restarted", tourId, stepIndex: 0, at: nowIso() });
      setLearnOpen(false);
      setActive({ tourId, stepIndex: 0 });
      setFulfilled(false);
      setResolved({ state: "pending" });
    },
    [role, writeRecord],
  );

  const closeTour = useCallback((): void => {
    const current = activeRef.current;
    if (!current) return;
    const tour = getWalkthrough(current.tourId);
    if (!tour) return;
    if (current.stepIndex < tour.steps.length - 1) {
      writeRecord(current.tourId, (record) => ({
        ...record,
        state: "in_progress",
        step: current.stepIndex,
      }));
    }
    pushWalkthroughEvent({ kind: "tour_closed", tourId: current.tourId, stepIndex: current.stepIndex, at: nowIso() });
    setActive(null);
  }, [writeRecord]);

  const skipTour = useCallback((): void => {
    const current = activeRef.current;
    if (!current) return;
    writeRecord(current.tourId, (record) => ({
      ...record,
      state: "dismissed",
      step: current.stepIndex,
    }));
    pushWalkthroughEvent({ kind: "tour_skipped", tourId: current.tourId, stepIndex: current.stepIndex, at: nowIso() });
    setActive(null);
  }, [writeRecord]);

  const navigateToStepRoute = useCallback((): void => {
    const current = activeRef.current;
    if (!current) return;
    const tour = getWalkthrough(current.tourId);
    const step = tour?.steps[current.stepIndex];
    if (step?.route) router.push(step.route);
  }, [router]);

  const openLearn = useCallback(() => setLearnOpen(true), []);
  const closeLearn = useCallback(() => setLearnOpen(false), []);

  // Mirror actions into refs for the mount-once listeners.
  const startTourRef = useRef(startTour);
  startTourRef.current = startTour;
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  // ── Global listeners (registered once) ──
  useEffect(() => {
    const onAdvance = (event: Event): void => {
      const tag = (event as CustomEvent<{ tag?: string }>).detail?.tag;
      if (!tag) return;
      const current = activeRef.current;
      if (!current) return;
      const tour = getWalkthrough(current.tourId);
      const step = tour?.steps[current.stepIndex];
      if (!step || step.kind !== "action") return;
      const context = { tag, pathname: window.location.pathname };
      if (stepFulfilled(step, context)) {
        setFulfilled(true);
        pushWalkthroughEvent({
          kind: "action_fulfilled",
          tourId: current.tourId,
          stepIndex: current.stepIndex,
          stepKind: step.kind,
          at: nowIso(),
        });
      }
    };

    const onClick = (event: MouseEvent): void => {
      const current = activeRef.current;
      if (!current) return;
      const tour = getWalkthrough(current.tourId);
      const step = tour?.steps[current.stepIndex];
      if (!step || step.kind !== "action" || !step.advanceOn?.length) return;
      const target = event.target as Element | null;
      if (!target) return;
      const clicked = step.advanceOn.some((condition) => {
        if (condition.event && condition.event !== "click") return false;
        const selector = condition.selector ?? (condition.target ? targetSelector(condition.target) : null);
        return selector ? target.closest(selector) !== null : false;
      });
      if (clicked) {
        const context = { tag: undefined, pathname: window.location.pathname };
        if (stepFulfilled(step, context)) {
          setFulfilled(true);
          pushWalkthroughEvent({
            kind: "action_fulfilled",
            tourId: current.tourId,
            stepIndex: current.stepIndex,
            stepKind: step.kind,
            at: nowIso(),
          });
        }
      }
    };

    const onStart = (event: Event): void => {
      const detail = (event as CustomEvent<{ tourId?: string; resume?: boolean }>).detail ?? {};
      if (typeof detail.tourId === "string") {
        startTourRef.current(detail.tourId, { resume: detail.resume === true });
      }
    };

    const onLearn = (): void => setLearnOpen(true);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && activeRef.current) {
        event.stopPropagation();
        closeTour();
      }
    };

    window.addEventListener(ADVANCE_EVENT, onAdvance);
    document.addEventListener("click", onClick, true);
    window.addEventListener(START_TOUR_EVENT, onStart);
    window.addEventListener(OPEN_LEARN_EVENT, onLearn);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener(ADVANCE_EVENT, onAdvance);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(START_TOUR_EVENT, onStart);
      window.removeEventListener(OPEN_LEARN_EVENT, onLearn);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [closeTour]);

  // ── Resolve the current step against the DOM / route ──
  const tour = active ? getWalkthrough(active.tourId) : undefined;
  const step = tour?.steps[active?.stepIndex ?? 0];

  useEffect(() => {
    if (!active || !tour) {
      setResolved({ state: "pending" });
      setFulfilled(false);
      return;
    }
    const current = tour.steps[active.stepIndex];
    let cancelled = false;

    if (stepNeedsNavigation(current, pathname)) {
      setResolved({ state: "pending" });
      setFulfilled(false);
      return;
    }

    if (!current.target) {
      setResolved({ state: "targetless" });
      return;
    }

    setResolved({ state: "pending" });
    void waitForTarget(current.target).then((el) => {
      if (cancelled) return;
      if (el) {
        setResolved({ state: "found", el });
      } else {
        setResolved({ state: "missing" });
        pushWalkthroughEvent({
          kind: "target_missing",
          tourId: active.tourId,
          stepIndex: active.stepIndex,
          stepKind: current.kind,
          route: window.location.pathname,
          at: nowIso(),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [active?.tourId, active?.stepIndex, pathname, active, tour]);

  // ── Auto-advance once an action step is fulfilled ──
  useEffect(() => {
    const current = activeRef.current;
    if (!current) return;
    const t = getWalkthrough(current.tourId);
    const s = t?.steps[current.stepIndex];
    if (!t || !s || !fulfilled || !stepIsAutoAdvancing(s) || current.stepIndex >= t.steps.length - 1) {
      return;
    }
    const id = window.setTimeout(() => advanceRef.current(), 520);
    return () => window.clearTimeout(id);
  }, [fulfilled, active?.stepIndex, active?.tourId]);

  // ── First-run welcome + dev-mode ?tour= override ──
  useEffect(() => {
    if (localStorage.getItem(BANNER_KEY_PREFIX + ":learn") === "1") return;
    const qp = new URLSearchParams(window.location.search);
    const override = qp.get("tour");
    if (override && WALKTHROUGH_INDEX[override]) {
      startTourRef.current(override);
      return;
    }
    if (qp.get("learn")) {
      setLearnOpen(true);
      return;
    }
    if (!role || activeRef.current) return;
    const roster = walkthroughsForRole(role);
    const untouched = roster.filter((t) => !progressRef.current[t.id]);
    if (untouched.length === roster.length && roster.length > 0) {
      const id = window.setTimeout(() => setWelcomeOpen(true), 650);
      return () => window.clearTimeout(id);
    }
  }, [role]);

  // ── Resume offer: one in-progress tour whose step matches this route ──
  const [resumeOffer, setResumeOffer] = useState<{ tourId: string } | null>(null);
  useEffect(() => {
    if (!role || activeRef.current) {
      setResumeOffer(null);
      return;
    }
    const matches = walkthroughsForRole(role)
      .map((candidate) => ({ candidate, record: progressRef.current[candidate.id] }))
      .filter(({ candidate, record }) => {
        if (!record || record.state !== "in_progress") return false;
        if (!recordMatchesVersion(candidate, record)) return false;
        const stepIndex = Math.min(record.step, candidate.steps.length - 1);
        const stepRoute = candidate.steps[stepIndex]?.route;
        if (!stepRoute) return false;
        if (!pathMatches(pathname, stepRoute)) return false;
        return localStorage.getItem(BANNER_KEY_PREFIX + ":" + candidate.id) !== "1";
      });
    setResumeOffer(matches.length === 1 ? { tourId: matches[0].candidate.id } : null);
  }, [pathname, role, progress]);

  // ── Derived UI state ──
  const status = step ? resolveStatus(step, pathname, resolved.state === "found", resolved.state === "pending") : "idle";
  const targetEl = resolved.state === "found" ? resolved.el : null;
  const targetRect = useElementRect(targetEl);
  const blocked = step ? stepBlocksNext(step, fulfilled) : false;
  const showPanel = !!step && status !== "idle";

  const primaryRouteLabel = step?.route ? routeLabel(step.route) : null;

  const contextValue = useMemo<WalkthroughContextValue>(
    () => ({
      progress,
      canRun: (tourId: string) => {
        const t = getWalkthrough(tourId);
        return !!t && !!role && walkthroughAccessibleTo(t, role);
      },
      isCompleted: (tourId: string) => {
        const t = getWalkthrough(tourId);
        return !!t && isTourCompleted(t, progress[tourId]);
      },
      isInProgress: (tourId: string) => {
        const t = getWalkthrough(tourId);
        return !!t && isTourInProgress(t, progress[tourId]);
      },
      startTour,
      restartTour,
      openLearn,
      closeLearn,
      learnOpen,
      activeTourId: active?.tourId ?? null,
      role,
    }),
    [progress, role, startTour, restartTour, openLearn, closeLearn, learnOpen, active?.tourId],
  );

  return (
    <WalkthroughContext.Provider value={contextValue}>
      {children}

      {active && step && tour && status === "ready" ? (
        <Spotlight rect={targetRect} placement={step.placement} />
      ) : null}
      {active && step && showPanel ? (
        <CoachmarkPanel
          step={step}
          placement={step.placement}
          rect={status === "navigate" ? null : status === "ready" ? targetRect : null}
          stepIndex={active.stepIndex}
          totalSteps={tour.steps.length}
          needsNavigation={status === "navigate"}
          blocked={blocked}
          fulfilled={fulfilled}
          routeLabel={primaryRouteLabel}
          primaryLabel={status === "navigate" ? (primaryRouteLabel ?? "Go there") : undefined}
          onPrimary={() => {
            if (status === "navigate") {
              navigateToStepRoute();
            } else if (!(blocked && !fulfilled)) {
              advance();
            }
          }}
          onBack={back}
          onSkip={skipTour}
          onClose={closeTour}
        />
      ) : null}

      {resumeOffer && !learnOpen && !active && role ? (
        <div className="fixed bottom-4 left-4 z-[80] flex items-center gap-3 rounded-lg border bg-popover px-3 py-2.5 shadow-lg">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-fg">Continue your walkthrough?</p>
            {(() => {
              const t = getWalkthrough(resumeOffer.tourId);
              return t ? <p className="text-[11px] text-fg-muted">{t.title}</p> : null;
            })()}
          </div>
          <Button size="sm" onClick={() => startTour(resumeOffer.tourId, { resume: true })}>
            Continue
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss"
            onClick={() => {
              localStorage.setItem(BANNER_KEY_PREFIX + ":" + resumeOffer.tourId, "1");
              setResumeOffer(null);
            }}
          >
            ✕
          </Button>
        </div>
      ) : null}

      <LearnCenter
        open={learnOpen}
        onOpenChange={(open) => (open ? openLearn() : closeLearn())}
        role={role}
        progress={progress}
        onStart={startTour}
        onRestart={restartTour}
      />

      <WelcomeDialog
        open={welcomeOpen}
        onOpenChange={(open) => {
          setWelcomeOpen(open);
          if (!open) localStorage.setItem(BANNER_KEY_PREFIX + ":learn", "1");
        }}
        role={role}
        onStart={startTour}
      />
    </WalkthroughContext.Provider>
  );
}