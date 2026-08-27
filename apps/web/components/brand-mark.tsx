import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SITE_CONFIG } from "@/lib/site-metadata";

type BrandMarkProps = {
  href?: string;
  size?: "sm" | "md" | "lg";
  showSubtitle?: boolean;
  className?: string;
};

const sizeClasses = {
  sm: { logo: "h-8 w-8", title: "text-sm", subtitle: "text-[10px]" },
  md: { logo: "h-9 w-9", title: "text-sm font-semibold", subtitle: "text-[10px]" },
  lg: { logo: "h-10 w-10", title: "text-base font-black", subtitle: "text-[10px]" },
} as const;

function BrandContent({ size = "md", showSubtitle = true }: Pick<BrandMarkProps, "size" | "showSubtitle">) {
  const sizes = sizeClasses[size];

  return (
    <>
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent shadow-sm",
          sizes.logo,
        )}
      >
        <Image
          src={SITE_CONFIG.logoPath}
          alt={`${SITE_CONFIG.productName} logo`}
          fill
          sizes={size === "lg" ? "40px" : "32px"}
          className="object-cover"
          priority={size === "lg"}
        />
      </span>
      <div className="min-w-0">
        <span className={cn("block truncate tracking-tight text-fg", sizes.title)}>{SITE_CONFIG.productName}</span>
        {showSubtitle ? (
          <span className={cn("block truncate text-fg-dim", sizes.subtitle)}>{SITE_CONFIG.subtitle}</span>
        ) : null}
      </div>
    </>
  );
}

export function BrandMark({ href, size = "md", showSubtitle = true, className }: BrandMarkProps) {
  const content = <BrandContent size={size} showSubtitle={showSubtitle} />;

  if (href) {
    return (
      <Link href={href} className={cn("flex min-w-0 items-center gap-2.5 no-underline", className)}>
        {content}
      </Link>
    );
  }

  return <div className={cn("flex min-w-0 items-center gap-2.5", className)}>{content}</div>;
}
