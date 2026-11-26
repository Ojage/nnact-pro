"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { SITE_CONFIG } from "@/lib/site-metadata";
import { cn } from "@/lib/utils";

export function WelcomeHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let previous = window.scrollY;

    function onScroll() {
      const current = window.scrollY;
      setScrolled(current > 16);
      setHidden(current > 180 && current > previous + 4);
      if (current < previous - 4) setHidden(false);
      previous = current;
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 flex justify-center border-b border-white/10 bg-[#0d0d0d]/70 backdrop-blur-xl transition-all duration-300",
        scrolled ? "h-14" : "h-[72px]",
        hidden ? "-translate-y-full" : "translate-y-0",
      )}
    >
      <div className="flex h-full w-[min(1180px,calc(100%-32px))] items-center">
        <a
          href="#top"
          aria-label="NNACT home"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#ffd400] focus-visible:ring-offset-4 focus-visible:ring-offset-[#0d0d0d]"
        >
          <Image
            src={SITE_CONFIG.logoPath}
            alt="NNACT"
            width={44}
            height={44}
            priority
            className="h-8 w-8 rounded-lg object-contain brightness-0 invert transition-all duration-300 sm:h-11 sm:w-11"
          />
        </a>
      </div>
    </header>
  );
}
