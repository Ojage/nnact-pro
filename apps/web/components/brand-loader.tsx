import Image from "next/image";
import { SITE_CONFIG } from "@/lib/site-metadata";

/**
 * Full-screen loading state: the NNACT Pro logo squashes, jumps, lands with a
 * small rebound and shakes before resting, over a shadow that shrinks as it
 * rises. With reduced motion it only fades gently. The words are announced
 * to assistive technology and shown beneath the logo.
 */
export function BrandLoader({ label, inline = false }: { label: string; inline?: boolean }) {
  return (
    <div
      className={
        inline
          ? "brand-loader flex min-h-[50vh] flex-col items-center justify-center gap-5"
          : "brand-loader flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-[var(--shell-canvas)]"
      }
    >
      <div className="brand-loader-stage" aria-hidden="true">
        <span className="brand-loader-logo">
          <Image src={SITE_CONFIG.productLogoPath} alt="" width={96} height={96} priority />
        </span>
        <span className="brand-loader-shadow" />
      </div>
      <p role="status" className="text-sm text-fg-muted">
        {label}
      </p>
    </div>
  );
}
