/** Shared console class strings, generalised from the Agent Office pages. */
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]";

export const toolbarButton =
  "inline-flex h-9 shrink-0 items-center gap-2 rounded-[6px] px-2.5 text-sm font-medium text-[var(--shell-accent-text)] no-underline hover:bg-[var(--shell-tint)] hover:no-underline disabled:pointer-events-none disabled:opacity-50 " +
  focusRing;

export const primaryButton =
  "inline-flex h-9 shrink-0 items-center gap-2 rounded-[6px] border border-primary/80 bg-primary px-3.5 text-sm font-semibold text-primary-foreground no-underline hover:bg-accent-hover hover:no-underline disabled:pointer-events-none disabled:opacity-50 " +
  focusRing;

export const outlineButton =
  "inline-flex h-9 shrink-0 items-center gap-2 rounded-[6px] border border-[var(--shell-border)] bg-[var(--shell-panel)] px-3 text-sm font-medium text-[var(--shell-accent-text)] no-underline hover:bg-[var(--shell-tint)] hover:no-underline disabled:pointer-events-none disabled:opacity-50 " +
  focusRing;

export const resourceLink =
  "font-medium text-[var(--shell-accent-text)] underline-offset-2 hover:underline " + focusRing;

export const card = "min-w-0 rounded-[8px] border border-[var(--shell-border)] bg-[var(--shell-panel)]";
export const cardHead = "flex min-h-12 items-center justify-between gap-3 border-b border-[var(--shell-border)] px-4 py-2.5";
export const cardTitle = "text-sm font-medium text-fg";

export const iconButton =
  "grid size-8 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-[var(--shell-hover)] hover:text-fg " + focusRing;
