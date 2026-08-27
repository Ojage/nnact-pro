"use client";

import { useMemo } from "react";
import {
  walkthroughsForRole,
  type WalkthroughRole,
} from "@nnact/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * First-run welcome. Shown once per role until dismissed (never re-opens after
 * the user closes it once). Recommends the first few role-available tours;
 * "Start" runs tour #1, "Browse walkthroughs" opens the Learn center.
 */

export function WelcomeDialog({
  open,
  onOpenChange,
  role,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: WalkthroughRole;
  onStart: (tourId: string, opts?: { resume?: boolean }) => void;
}) {
  const roster = useMemo(() => (role ? walkthroughsForRole(role) : []), [role]);
  const recommended = roster
    .filter((tour) => tour.id !== "getting-started")
    .slice(0, 3);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,440px)]">
        <DialogHeader className="text-left">
          <DialogTitle>Welcome to NNACT</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-fg-muted">
            Take a two-minute guided tour of the essentials — skip any time.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {roster.slice(0, 1).map((tour) => (
            <Button
              key={tour.id}
              className="justify-between"
              onClick={() => {
                onStart(tour.id);
                onOpenChange(false);
              }}
            >
              <span>Start “{tour.title}”</span>
              <span aria-hidden="true">→</span>
            </Button>
          ))}
          {recommended.length > 0 && (
            <Button
              variant="outline"
              className="justify-between"
              onClick={() => onOpenChange(false)}
            >
              <span>Browse walkthroughs</span>
              <span aria-hidden="true">→</span>
            </Button>
          )}
        </div>

        <DialogFooter className="justify-start">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}