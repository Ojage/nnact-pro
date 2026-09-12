"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLazyGlobalSearchQuery } from "@/lib/redux/api";
import type { CoreSearchResults } from "@/lib/redux/api";

type Results = CoreSearchResults;

interface SearchRow {
  id: string;
  label: string;
  sub?: string;
  badge?: string;
  icon: string;
  href: string;
}

interface SectionDef {
  key: string;
  label: string;
  icon: string;
  rows: SearchRow[];
}

const RECENT_KEY = "nnact:topsearch:recent";
const MAX_RECENT = 6;

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function writeRecents(entries: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(entries.slice(0, MAX_RECENT)));
  } catch {
    /* ignore quota / privacy mode */
  }
}

function MatchedText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-[3px] bg-accent/25 px-0.5 text-inherit">{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  );
}

function badgeClass(badge?: string) {
  if (!badge) return "";
  const tone = badge.includes("paid") || badge.includes("complete") || badge.includes("success")
    ? "text-emerald-600 dark:text-emerald-400"
    : badge.includes("overdue") || badge.includes("failed") || badge.includes("urgent")
      ? "text-rose-500"
      : "text-fg-dim";
  return tone;
}

export function GlobalSearch({ variant = "bar", className }: { variant?: "bar" | "floating"; className?: string }) {
  const router = useRouter();
  const [trigger, { isFetching }] = useLazyGlobalSearchQuery();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [searchError, setSearchError] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const latestQueryRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setRecents(readRecents());
  }, []);

  const trimmed = query.trim();

  // Debounced global search against the API.
  useEffect(() => {
    if (trimmed.length < 2) {
      setLoading(false);
      setResults(null);
      setSearchError(false);
      return;
    }
    setLoading(true);
    setSearchError(false);
    setHighlightIdx(0);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      latestQueryRef.current = trimmed;
      const requested = trimmed;
      trigger(requested)
        .unwrap()
        .then((data) => {
          if (latestQueryRef.current === requested) {
            setResults(data);
            setLoading(false);
          }
        })
        .catch(() => {
          if (latestQueryRef.current === requested) {
            setResults(null);
            setSearchError(true);
            setLoading(false);
          }
        });
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [trimmed, trigger]);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Build grouped, navigable rows from the API payload.
  const sections = useMemo<SectionDef[]>(() => {
    if (!results) return [];
    const live = results as Results;
    const groups: SectionDef[] = [];

    const push = (key: string, label: string, icon: string, rows: SearchRow[]) => {
      if (rows.length > 0) groups.push({ key, label, icon, rows });
    };

    push(
      "jobs",
      "Jobs",
      "⊞",
      live.jobs.map((j) => ({ id: j.id, label: j.title, badge: j.status, icon: "⊞", href: `/jobs/${j.id}` })),
    );
    push(
      "customers",
      "Customers",
      "⊕",
      live.customers.map((c) => ({
        id: c.id,
        label: c.name,
        sub: c.email || c.phone || undefined,
        icon: "⊕",
        href: `/customers/${c.id}`,
      })),
    );
    push(
      "team",
      "Team",
      "♟",
      live.team.map((t) => ({
        id: t.id,
        label: t.name,
        sub: t.email,
        badge: t.role,
        icon: "♟",
        href: "/settings",
      })),
    );
    push(
      "invoices",
      "Invoices",
      "◎",
      live.invoices.map((inv) => ({
        id: inv.id,
        label: inv.number,
        badge: inv.status,
        icon: "◎",
        href: `/invoices/${inv.id}`,
      })),
    );
    push(
      "estimates",
      "Estimates",
      "◷",
      live.estimates.map((est) => ({
        id: est.id,
        label: est.number,
        badge: est.status,
        icon: "◷",
        href: `/estimates/${est.id}`,
      })),
    );
    push(
      "appointments",
      "Appointments",
      "◐",
      live.appointments.map((a) => ({
        id: a.id,
        label: a.jobTitle,
        sub: formatStartsAt(a.startsAt),
        icon: "◐",
        href: `/jobs/${a.jobId}`,
      })),
    );
    push(
      "equipment",
      "Equipment",
      "▦",
      live.equipment.map((e) => ({
        id: e.id,
        label: e.label,
        sub: e.serialNumber ?? undefined,
        icon: "▦",
        href: `/equipment/${e.id}`,
      })),
    );
    push(
      "servicePlans",
      "Service Plans",
      "◌",
      live.servicePlans.map((p) => ({ id: p.id, label: p.name, icon: "◌", href: "/service-plans" })),
    );

    const brain = live.repairBrain;
    let brainIcon = "◉";
    const brainRows: SearchRow[] = [];
    for (const m of brain.models) {
      brainRows.push({
        id: m.id,
        label: `${m.manufacturer} ${m.modelNumber}`,
        sub: m.modelName ?? undefined,
        icon: "▦",
        href: `/repair-brain/models/${m.id}`,
      });
    }
    for (const f of brain.faults) {
      brainRows.push({
        id: f.id,
        label: f.faultCode ? `${f.faultCode} · ${f.title}` : f.title,
        icon: "◉",
        href: f.equipmentModelId ? `/repair-brain/models/${f.equipmentModelId}` : "/repair-brain",
      });
    }
    for (const p of brain.procedures) {
      brainRows.push({
        id: p.id,
        label: p.title,
        icon: "☰",
        href: p.equipmentModelId ? `/repair-brain/models/${p.equipmentModelId}` : "/repair-brain",
      });
    }
    for (const pt of brain.parts) {
      brainRows.push({
        id: pt.id,
        label: pt.partName,
        icon: "▩",
        href: pt.equipmentModelId ? `/repair-brain/models/${pt.equipmentModelId}` : "/repair-brain",
      });
    }
    for (const d of brain.documents) {
      brainRows.push({
        id: d.id,
        label: d.title,
        icon: "▤",
        href: d.equipmentModelId ? `/repair-brain/models/${d.equipmentModelId}` : "/repair-brain",
      });
    }
    for (const h of brain.repairHistory) {
      brainRows.push({
        id: h.id,
        label: h.conclusion || "Past repair",
        icon: "↺",
        href: "/repair-brain",
      });
    }
    if (brainRows.length > 0) push("repairBrain", "Knowledge", brainIcon, brainRows);

    return groups;
  }, [results]);

  const allRows = useMemo(() => sections.flatMap((s) => s.rows), [sections]);

  const open = focused && (Boolean(trimmed) || recents.length > 0);
  const showEmpty = focused && trimmed.length >= 2 && !loading && !isFetching && results != null && allRows.length === 0;
  const showLoading = focused && loading;
  const showHint = focused && trimmed.length >= 1 && trimmed.length < 2;

  const go = (href: string) => {
    setFocused(false);
    router.push(href);
  };

  const remember = (queryText: string) => {
    const next = [queryText, ...recents.filter((r) => r !== queryText)].slice(0, MAX_RECENT);
    setRecents(next);
    writeRecents(next);
  };

  const onSelect = (row: SearchRow) => {
    remember(query.trim());
    go(row.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => (allRows.length ? (i < allRows.length - 1 ? i + 1 : 0) : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => (allRows.length ? (i > 0 ? i - 1 : allRows.length - 1) : 0));
    } else if (e.key === "Enter") {
      const row = allRows[highlightIdx];
      if (row) {
        e.preventDefault();
        onSelect(row);
      } else if (trimmed.length >= 2) {
        remember(trimmed);
      }
    } else if (e.key === "Escape") {
      setFocused(false);
      setQuery("");
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "relative transition-all duration-150",
        variant === "bar" ? (focused ? "w-[30rem] max-w-[52vw]" : "w-72") : "w-[min(17rem,46vw)]",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-10 items-center gap-2 rounded-xl border px-3 transition-colors",
          focused ? "border-accent bg-surface-50 ring-2 ring-accent/20" : "border-border bg-surface-300/40",
        )}
      >
        <span className="shrink-0 text-sm text-fg-dim" aria-hidden="true">
          ⌕
        </span>
        <Input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-label="Search everything"
          placeholder={variant === "floating" ? "Search…" : "Search everything…"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlightIdx(0);
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          className="h-9 flex-1 border-none bg-transparent px-0 text-sm text-fg placeholder:text-fg-dim focus-visible:ring-0"
        />
        <kbd className="hidden shrink-0 rounded-md border border-border bg-surface-50 px-1.5 py-0.5 text-[10px] font-medium text-fg-dim md:inline-block">
          ⌘K
        </kbd>
      </div>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-[min(640px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface-50 shadow-2xl"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="max-h-[28rem] overflow-y-auto p-1.5">
            {!trimmed && recents.length > 0 && (
              <div className="px-3 py-2">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-fg-dim">Recent</p>
                <div className="flex flex-wrap gap-1.5">
                  {recents.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setQuery(r);
                        inputRef.current?.focus();
                      }}
                      className="cursor-pointer rounded-full border border-border bg-surface-300/40 px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showHint && <p className="px-3 py-4 text-center text-xs text-fg-dim">Keep typing — at least 2 characters…</p>}

            {showLoading && (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-fg-muted">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                Searching…
              </div>
            )}

            {showEmpty && (
              <p className="px-3 py-8 text-center text-sm text-fg-dim">
                No results for &ldquo;{query}&rdquo; across customers, jobs, team, billing, equipment or knowledge.
              </p>
            )}

            {searchError && (
              <p className="px-3 py-8 text-center text-sm text-fg-dim">Search is temporarily unavailable. Try again in a moment.</p>
            )}

            {!showLoading && !showEmpty && trimmed && results && (
              <div className="space-y-1">
                {sections.map((section) => (
                  <div key={section.key} className="pb-1">
                    <p className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-border bg-surface-50 px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-fg-dim">
                      <span>{section.icon}</span>
                      {section.label}
                      <span className="ml-auto rounded-md bg-surface-300/60 px-1.5 py-px text-[9px] font-semibold text-fg-muted">
                        {section.rows.length}
                      </span>
                    </p>
                    {section.rows.map((row, localIdx) => {
                      const globalIdx = allRows.indexOf(row);
                      const selected = globalIdx === highlightIdx;
                      return (
                        <a
                          key={`${section.key}-${row.id}`}
                          href={row.href}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                            e.preventDefault();
                            onSelect(row);
                          }}
                          onMouseEnter={() => setHighlightIdx(globalIdx)}
                          className={cn(
                            "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 no-underline transition-colors",
                            selected ? "bg-accent/10 text-fg" : "text-fg-muted hover:bg-surface-300",
                          )}
                        >
                          <span className="w-4 shrink-0 text-center text-sm text-fg-dim" aria-hidden="true">
                            {row.icon}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn("block truncate text-sm", selected ? "text-fg" : "text-fg")}>
                              <MatchedText text={row.label} query={trimmed} />
                            </span>
                            {row.sub && (
                              <span className="block truncate text-[11px] text-fg-dim">
                                <MatchedText text={row.sub} query={trimmed} />
                              </span>
                            )}
                          </span>
                          {row.badge && (
                            <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", badgeClass(row.badge))}>
                              {row.badge}
                            </span>
                          )}
                        </a>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {!trimmed && (
              <p className="border-t border-border px-3 py-2 text-[10px] text-fg-dim">
                Search customers, jobs, contacts, team, invoices, estimates, appointments, equipment, service plans and
                the Repair Brain knowledge base.
              </p>
            )}
          </div>

          {trimmed && (
            <div className="flex items-center gap-3 border-t border-border bg-surface-100/60 px-3 py-1.5 text-[10px] text-fg-dim">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>esc close</span>
              <span className="ml-auto">ctrl/⌘ + click opens in a new tab</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatStartsAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}