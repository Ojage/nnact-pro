"use client";

import { useMemo } from "react";
import { Joyride, type Step as JoyrideStep } from "react-joyride";
import type { WalkthroughStep } from "@nnact/shared";
import { targetSelector } from "@/lib/walkthroughs/runtime";
import { CoachmarkPanel } from "./coachmark";
import { Spotlight, type SpotlightRect } from "./spotlight";
import { TourTooltip, type TourTooltipData } from "./tour-tooltip";

/**
 * Presentation stage for one active tour step.
 *
 * React Joyride (controlled, single-step, remounted per step) is the anchor
 * and floater: it scrolls the [data-tour] element into view, computes a
 * collision-safe placement through Floating UI and keeps the bubble pinned.
 * The tooltip itself is `TourTooltip` — pure shadcn primitives + design tokens.
 *
 * The engine stays the single source of truth. `hideOverlay` keeps the tour
 * non-blocking (the dim "hole" is our own pointer-events-none Spotlight), the
 * focus trap is disabled, and ESC is handled by the provider, so no Joyride
 * default swallows user control. Steps without a resolved anchor fall back to
 * the existing bottom-sheet coachmark so navigation/resolving/missing states
 * behave exactly as before.
 */

export type TourStepState = "found" | "targetless" | "pending" | "missing";

export interface TourStageProps {
  step: WalkthroughStep;
  state: TourStepState;
  rect: SpotlightRect | null;
  stepIndex: number;
  totalSteps: number;
  needsNavigation: boolean;
  blocked: boolean;
  fulfilled: boolean;
  routeLabel: string | null;
  onPrimary: () => void;
  onBack: () => void;
  onSkip: () => void;
  onClose: () => void;
  primaryLabel?: string;
}

export function TourStage({
  step,
  state,
  rect,
  stepIndex,
  totalSteps,
  needsNavigation,
  blocked,
  fulfilled,
  routeLabel,
  onPrimary,
  onBack,
  onSkip,
  onClose,
  primaryLabel,
}: TourStageProps) {
  const anchored = state === "found" || state === "targetless";

  const joyrideSteps = useMemo<JoyrideStep[]>(() => {
    const data: TourTooltipData = {
      step,
      handlers: { onPrimary, onBack, onSkip, onClose, blocked, fulfilled, primaryLabel },
    };
    return [
      {
        target: state === "found" && step.target ? targetSelector(step.target) : "body",
        content: <></>,
        placement: step.placement ?? "auto",
        hideOverlay: true,
        skipBeacon: true,
        disableFocusTrap: true,
        dismissKeyAction: false,
        overlayClickAction: false,
        blockTargetInteraction: false,
        spotlightPadding: 6,
        scrollOffset: 24,
        scrollDuration: 320,
        zIndex: 100,
        floatingOptions: { hideArrow: true },
        data,
      },
    ];
  }, [step, state, onPrimary, onBack, onSkip, onClose, blocked, fulfilled, primaryLabel]);

  if (!anchored) {
    return (
      <CoachmarkPanel
        step={step}
        placement={step.placement}
        rect={null}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        needsNavigation={needsNavigation}
        blocked={blocked}
        fulfilled={fulfilled}
        routeLabel={routeLabel}
        onPrimary={onPrimary}
        onBack={onBack}
        onSkip={onSkip}
        onClose={onClose}
        primaryLabel={primaryLabel}
      />
    );
  }

  return (
    <>
      <Spotlight
        rect={state === "found" ? rect : null}
        placement={step.placement}
      />
      <Joyride
        run
        stepIndex={0}
        steps={joyrideSteps}
        tooltipComponent={TourTooltip}
        scrollToFirstStep={false}
      />
    </>
  );
}