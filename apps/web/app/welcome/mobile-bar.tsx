"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookVisitButton } from "./booking-dialog";
import { cn } from "@/lib/utils";

export function WelcomeMobileBar() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let previous = window.scrollY;

    function onScroll() {
      const current = window.scrollY;
      setHidden(current > 240 && current > previous + 4);
      if (current < previous - 4) setHidden(false);
      previous = current;
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/90 px-4 py-3 backdrop-blur-xl transition-transform duration-300 dark:border-white/10 dark:bg-[#111]/90 md:hidden",
        hidden ? "translate-y-full" : "translate-y-0",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <Link href="#services" className="text-sm font-bold text-[#141414] no-underline dark:text-white">
          See services
        </Link>
        <BookVisitButton className="px-5 py-2.5" />
      </div>
    </div>
  );
}
