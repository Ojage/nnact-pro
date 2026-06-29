import { Card } from "@/components/ui/card";

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
    <Card
      className={`flex-1 min-w-0 transition-all duration-200 ${
        href ? "hover:bg-surface-400 cursor-pointer hover:shadow-md" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-fg-muted font-medium tracking-wide uppercase">
          {label}
        </p>
        {icon && (
          <span className="text-lg opacity-60">{icon}</span>
        )}
      </div>
      <p className="text-2xl font-bold tracking-tight" style={{ color: color ?? "var(--color-fg)" }}>
        {value}
      </p>
      {trend && (
        <p
          className={`text-xs mt-1.5 font-medium ${
            trend.direction === "up" ? "text-green" : "text-red"
          }`}
        >
          {trend.direction === "up" ? "↑" : "↓"} {trend.label}
        </p>
      )}
    </Card>
  );

  if (href) {
    return (
      <a href={href} className="no-underline hover:no-underline flex-1 min-w-0">
        {content}
      </a>
    );
  }

  return content;
}
