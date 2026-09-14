import { cn } from "@/lib/utils";

const SIZES = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-7 w-7 text-[11px]",
  default: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
  xl: "h-20 w-20 text-lg",
} as const;

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase() || "?";
}

/** Circular member avatar: shows the profile picture when set, else initials. */
export function UserAvatar({
  name,
  src,
  size = "default",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const dimensions = SIZES[size];
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={cn("shrink-0 select-none rounded-full object-cover", dimensions, className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full border border-border bg-accent/15 font-semibold text-accent",
        dimensions,
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}