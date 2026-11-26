import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { cn } from "@/lib/utils";
import { Breadcrumb, type Crumb } from "./breadcrumb";
import { primaryButton, toolbarButton } from "./styles";

/** Page column: one minmax(0,1fr) track so wide children never push the page sideways. */
export function ConsolePage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5", className)}>{children}</div>;
}

/**
 * Console page header: optional breadcrumb, a 22px title with status and
 * meta beside it, an optional description, then the action toolbar.
 */
export function ConsoleHeader({
  title,
  breadcrumb,
  status,
  meta,
  description,
  toolbar,
  toolbarLabel,
  aside,
  divider = true,
}: {
  title: ReactNode;
  breadcrumb?: Crumb[];
  status?: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  toolbar?: ReactNode;
  toolbarLabel?: string;
  aside?: ReactNode;
  divider?: boolean;
}) {
  return (
    <header className={cn("grid min-w-0 gap-3", divider && "border-b border-[var(--shell-border)] pb-3")}>
      {breadcrumb?.length ? <Breadcrumb items={breadcrumb} /> : null}
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="min-w-0 break-words text-[22px] font-normal leading-tight text-fg">{title}</h1>
        {status}
        {meta ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">{meta}</div> : null}
        {aside ? <div className="ml-auto flex flex-wrap items-center gap-2">{aside}</div> : null}
      </div>
      {description ? <p className="max-w-3xl text-sm text-fg-muted">{description}</p> : null}
      {toolbar ? (
        <div
          className="-ml-2.5 flex min-w-0 flex-wrap items-center gap-1"
          role="toolbar"
          aria-label={toolbarLabel ?? (typeof title === "string" ? `${title} actions` : "Page actions")}
        >
          {toolbar}
        </div>
      ) : null}
    </header>
  );
}

type ToolbarButtonProps = ComponentProps<"button"> & { icon?: LucideIcon; spinning?: boolean };

export function ToolbarButton({ icon: Icon, spinning, children, className, type = "button", ...props }: ToolbarButtonProps) {
  return (
    <button type={type} className={cn(toolbarButton, className)} {...props}>
      {Icon ? <Icon className={cn("size-4", spinning && "motion-safe:animate-spin")} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function ToolbarLink({
  icon: Icon,
  children,
  className,
  primary,
  ...props
}: ComponentProps<typeof Link> & { icon?: LucideIcon; primary?: boolean }) {
  return (
    <Link className={cn(primary ? primaryButton : toolbarButton, primary && "mr-1.5 ml-2.5", className)} {...props}>
      {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
      {children}
    </Link>
  );
}

export function ToolbarDivider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-[var(--shell-border)]" aria-hidden="true" />;
}

/** A titled section of a page (h2 + optional actions) without a frame. */
export function ConsoleSection({
  title,
  description,
  actions,
  children,
  id,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("grid min-w-0 gap-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 id={id} className="text-base font-medium text-fg">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-1">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
