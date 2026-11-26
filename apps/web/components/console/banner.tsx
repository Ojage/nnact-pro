import type { ReactNode } from "react";
import { CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "warning" | "danger" | "success";

const TONE = {
  info: { icon: Info, ink: "var(--console-info-fg)", word: "" },
  success: { icon: CheckCircle2, ink: "var(--console-success-fg)", word: "" },
  warning: { icon: TriangleAlert, ink: "var(--color-attention-fg)", word: "Warning: " },
  danger: { icon: XCircle, ink: "var(--color-danger-fg)", word: "Error: " },
} as const;

/** Console notification banner. Danger banners are announced as alerts. */
export function Banner({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { icon: Icon, ink, word } = TONE[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn("flex flex-wrap items-start gap-x-3 gap-y-1 rounded-[8px] border px-4 py-2.5 text-sm", className)}
      style={{
        borderColor: `color-mix(in srgb, ${ink} 35%, transparent)`,
        background: `color-mix(in srgb, ${ink} 7%, var(--shell-panel))`,
      }}
    >
      <Icon className="mt-0.5 size-4 shrink-0" style={{ color: ink }} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-fg">
        {title ? (
          <p className="font-medium">
            {word && typeof title === "string" ? <span className="sr-only">{word}</span> : null}
            {title}
          </p>
        ) : null}
        {children ? <div className={cn(title ? "mt-0.5 text-fg-muted" : "")}>{children}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
