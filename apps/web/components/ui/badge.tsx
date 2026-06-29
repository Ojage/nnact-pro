import * as React from "react";
import { cn } from "@/lib/utils";

const variants = {
  default: "bg-surface-500 text-fg-muted",
  lead: "bg-surface-400 text-fg-dim",
  scheduled: "bg-blue/10 text-blue border border-blue/20",
  in_progress: "bg-yellow/10 text-yellow border border-yellow/20",
  completed: "bg-green/10 text-green border border-green/20",
  canceled: "bg-red/10 text-red border border-red/20",
  draft: "bg-surface-400 text-fg-dim",
  sent: "bg-yellow/10 text-yellow border border-yellow/20",
  paid: "bg-green/10 text-green border border-green/20",
  void: "bg-red/10 text-red border border-red/20",
} as const;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variants;
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
