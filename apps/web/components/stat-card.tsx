import { PrefetchLink as Link } from "@/components/prefetch-link";

/** Console summary card: small label, large number, optional trend in words. */
export function StatCard({
  label,
  value,
  icon,
  trend,
  color,
  href,
}: {
  label: string;
  value: string;
  icon?: string;
  trend?: { direction: "up" | "down"; label: string };
  color?: string;
  href?: string;
}) {
  const content = (
    <div
      className={`h-full min-w-0 flex-1 rounded-[8px] border border-[var(--shell-border)] bg-[var(--shell-panel)] p-4 ${
        href ? "transition-colors hover:bg-[var(--shell-canvas)]" : ""
      }`}
    >
      <p className="flex items-center gap-2 text-xs font-medium text-fg-muted">
        {icon && (
          <span className="text-sm" aria-hidden="true">
            {icon}
          </span>
        )}
        {label}
      </p>
      <p className="mt-2 text-2xl font-normal tabular-nums text-fg" style={color ? { color } : undefined}>
        {value}
      </p>
      {trend && (
        <p className={`mt-1 text-xs font-medium ${trend.direction === "up" ? "text-[var(--console-success-fg)]" : "text-[var(--console-danger-fg)]"}`}>
          {trend.direction === "up" ? "▲" : "▼"} {trend.label}
        </p>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block min-w-0 flex-1 rounded-[8px] no-underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]">
        {content}
      </Link>
    );
  }

  return content;
}
