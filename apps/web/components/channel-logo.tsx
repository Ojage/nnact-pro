// Channel brand marks for the Channels page.
//
// These are inline SVG rather than remote images: brand marks are small, render
// at every density, must survive an offline staff install, and must not add a
// third-party CDN request (or a cookie banner) to authenticate the operator.
// The Website channel is the exception — it is NNACT itself, so it reuses the
// product logo through next/image.
import Image from "next/image";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { SITE_CONFIG } from "@/lib/site-metadata";

type ChannelBrand = "WEBSITE" | "LINKEDIN" | "FACEBOOK" | "INSTAGRAM";

/** Brand tints for the logo tile, tuned to stay legible on light and dark. */
const TILE_TINT: Record<ChannelBrand, string> = {
  WEBSITE: "bg-surface-300/70",
  LINKEDIN: "bg-[#0A66C2]/10",
  FACEBOOK: "bg-[#1877F2]/12",
  INSTAGRAM: "bg-[#DD2A7B]/10",
};

function LinkedInMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="LinkedIn">
      <path
        fill="#0A66C2"
        d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z"
      />
    </svg>
  );
}

function FacebookMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Facebook">
      <path
        fill="#1877F2"
        d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"
      />
    </svg>
  );
}

function InstagramMark({ className }: { className?: string }) {
  // The gradient needs a document-unique id or every card on the page would
  // share (and, in some browsers, shadow) the first definition.
  const gid = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Instagram">
      <defs>
        <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#FEDA75" />
          <stop offset="30%" stopColor="#F58529" />
          <stop offset="65%" stopColor="#DD2A7B" />
          <stop offset="100%" stopColor="#8134AF" />
        </linearGradient>
      </defs>
      <rect x="3.1" y="3.1" width="17.8" height="17.8" rx="5" fill="none" stroke={`url(#${gid})`} strokeWidth="2" />
      <circle cx="12" cy="12" r="4.1" fill="none" stroke={`url(#${gid})`} strokeWidth="2" />
      <circle cx="17.1" cy="6.9" r="1.15" fill={`url(#${gid})`} />
    </svg>
  );
}

export function ChannelLogo({
  channel,
  className,
  tileClassName,
}: {
  channel: string;
  className?: string;
  tileClassName?: string;
}) {
  const brand = (channel in TILE_TINT ? channel : "WEBSITE") as ChannelBrand;

  return (
    <span
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl",
        TILE_TINT[brand],
        tileClassName,
      )}
    >
      {brand === "LINKEDIN" ? <LinkedInMark className={cn("h-6 w-6", className)} /> : null}
      {brand === "FACEBOOK" ? <FacebookMark className={cn("h-6 w-6", className)} /> : null}
      {brand === "INSTAGRAM" ? <InstagramMark className={cn("h-6 w-6", className)} /> : null}
      {brand === "WEBSITE" ? (
        <Image
          src={SITE_CONFIG.logoPath}
          alt={`${SITE_CONFIG.productName} logo`}
          width={28}
          height={28}
          className={cn("h-7 w-7 object-contain", className)}
        />
      ) : null}
    </span>
  );
}
