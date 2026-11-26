"use client";

import { useEffect, useState } from "react";

export function OpenStatus() {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    function update() {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Africa/Lagos",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date());

      const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
      const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
      const isOpen = weekday !== "Sun" && hour >= 8 && hour < 18;
      setStatus(isOpen ? "Open now · Buea" : "Closed now · Buea");
    }

    update();
    const interval = window.setInterval(update, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white backdrop-blur-md">
      <span aria-hidden="true" className="size-2 rounded-full bg-[#ffd400]" />
      {status ?? "Checking local hours"}
    </span>
  );
}
