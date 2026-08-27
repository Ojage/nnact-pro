"use client";

import { useMemo } from "react";
import {
  walkthroughsForRole,
  type WalkthroughProgressMap,
  type WalkthroughRole,
} from "@nnact/shared";
import {
  isTourCompleted,
  isTourInProgress,
  recordMatchesVersion,
} from "@/lib/walkthroughs/runtime";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Learn NNACT center — the catalog of every walkthrough the signed-in role can
 * run, with resume/restart affordances and completed state. Driven purely by
 * the shared definitions + persisted progress; no hard-coded list here.
 */

export function LearnCenter({
  open,
  onOpenChange,
  role,
  progress,
  onStart,
  onRestart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: WalkthroughRole;
  progress: WalkthroughProgressMap;
  onStart: (tourId: string, opts?: { resume?: boolean }) => void;
  onRestart: (tourId: string) => void;
}) {
  const catalog = useMemo(() => (role ? walkthroughsForRole(role) : []), [role]);
  const completed = catalog.filter((tour) => {
    const record = progress[tour.id];
    return isTourCompleted(tour, record);
  }).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[82vh] w-[min(92vw,520px)] overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle>Learn NNACT</DialogTitle>
          <DialogDescription className="text-sm text-fg-muted">
            Guided walkthroughs for {role ?? "your role"}.
            {completed > 0 ? ` ${completed} of ${catalog.length} completed.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {catalog.map((tour) => {
            const record = progress[tour.id];
            const tourCompleted = isTourCompleted(tour, record);
            const inProgress =
              !tourCompleted &&
              isTourInProgress(tour, record) &&
              recordMatchesVersion(tour, record);
            return (
              <div
                key={tour.id}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border bg-card p-3",
                  tour.field && "border-green/30",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                      {tour.field && (
                        <span
                          aria-label="Field tour"
                          className="rounded bg-green/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-green"
                        >
                          Field
                        </span>
                      )}
                      {tourCompleted && (
                        <span className="rounded bg-green/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-green">
                          Done
                        </span>
                      )}
                      {inProgress && (
                        <span className="rounded bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-foreground">
                          In progress
                        </span>
                      )}
                      <span className="truncate">{tour.title}</span>
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{tour.summary}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-fg-dim">
                      {tour.duration} · {tour.steps.length} steps
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {tourCompleted ? (
                    <Button variant="outline" size="sm" onClick={() => onRestart(tour.id)}>
                      Replay
                    </Button>
                  ) : inProgress ? (
                    <Button size="sm" onClick={() => onStart(tour.id, { resume: true })}>
                      Continue
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => onStart(tour.id)}>
                      Start
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {catalog.length === 0 && (
            <p className="text-sm text-fg-muted">No walkthroughs configured for this role yet.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}