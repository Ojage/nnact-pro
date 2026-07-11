import { readSponsorConfig } from "@/lib/sponsor-config";

export function SponsorSlot() {
  const sponsor = readSponsorConfig();
  if (!sponsor) return null;

  return (
    <aside
      aria-label={`Sponsor: ${sponsor.name}`}
      className="mb-6 rounded-xl border border-border bg-surface-100 px-4 py-3"
      data-testid="sponsor-slot"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-surface-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-fg-dim">
              Sponsor
            </span>
            <span className="text-sm font-semibold text-fg">{sponsor.name}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-fg-muted">{sponsor.message}</p>
        </div>
        <a
          href={sponsor.url}
          target="_blank"
          rel="sponsored noopener noreferrer"
          referrerPolicy="no-referrer"
          className="shrink-0 rounded-lg border border-border bg-surface-200 px-3 py-2 text-center text-xs font-semibold text-fg-link no-underline hover:bg-surface-300"
        >
          Visit sponsor
        </a>
      </div>
    </aside>
  );
}
