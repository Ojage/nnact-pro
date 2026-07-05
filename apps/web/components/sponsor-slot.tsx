import Link from "next/link";
import { Card } from "@/components/ui/card";

export interface SponsorSlotProps {
  sponsorName?: string;
  message?: string;
  href?: string;
  surface?: "dashboard" | "mobile" | "customer_portal" | "vendor_guide";
}

export function SponsorSlot({
  sponsorName = "Metro Supply Co.",
  message = "Same-day parts pickup for service businesses.",
  href = "/settings",
  surface = "dashboard",
}: SponsorSlotProps) {
  return (
    <Card className="mb-6 border-yellow/30 bg-yellow/5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-yellow/30 bg-yellow/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-yellow">
              Sponsored
            </span>
            <span className="text-xs text-fg-dim">{surface.replace("_", " ")} placement · no tracking</span>
          </div>
          <p className="text-sm font-semibold text-fg">{sponsorName}</p>
          <p className="mt-1 text-sm text-fg-muted">{message}</p>
        </div>
        <Link
          href={href}
          className="inline-flex h-9 items-center justify-center rounded-full border border-yellow/30 px-3 text-xs font-bold text-yellow no-underline hover:bg-yellow/10 hover:no-underline"
        >
          Manage sponsor slot
        </Link>
      </div>
    </Card>
  );
}
