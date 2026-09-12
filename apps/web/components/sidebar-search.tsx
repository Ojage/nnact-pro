"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { useSessionUser } from "@/lib/use-session-user";
import { searchFeatureCommands } from "@/lib/feature-search";
import type { FeatureCommand } from "@/lib/feature-search";
import type { NavRole } from "@/lib/nav";

interface DropdownRect {
  top: number;
  left: number;
  width: number;
}

export function SidebarSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useSessionUser();
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [rect, setRect] = useState<DropdownRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => searchFeatureCommands(query, user?.role as NavRole | undefined),
    [query, user?.role],
  );

  useEffect(() => setQuery(""), [pathname]);

  useEffect(() => {
    if (!query.trim()) {
      setRect(null);
      return;
    }
    const input = inputRef.current;
    if (!input) return;
    const r = input.getBoundingClientRect();
    setRect({ top: r.bottom + 6, left: r.left, width: r.width });
  }, [query]);

  useEffect(() => {
    if (!query.trim()) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (inputRef.current && !inputRef.current.contains(el) && !document.getElementById("sidebar-search-results")?.contains(el)) {
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [query]);

  const open = Boolean(query.trim() && rect);

  const go = (command: FeatureCommand) => {
    setQuery("");
    setRect(null);
    router.push(command.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => (i < results.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => (i > 0 ? i - 1 : results.length - 1));
    } else if (e.key === "Enter" && results[highlightIdx]) {
      e.preventDefault();
      go(results[highlightIdx]);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  };

  return (
    <div className="px-3 pb-2 pt-1">
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-fg-dim" aria-hidden="true">
          ⌕
        </span>
        <Input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="sidebar-search-results"
          placeholder="Search features…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlightIdx(0);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => query.trim() && setHighlightIdx(0)}
          className="h-9 rounded-lg border-border bg-surface-300/50 pl-7 pr-3 text-sm text-fg placeholder:text-fg-dim focus-visible:ring-accent"
        />
      </div>

      {open && rect && (
        <div
          id="sidebar-search-results"
          role="listbox"
          className="fixed z-50 overflow-hidden rounded-xl border border-border bg-surface-50 shadow-2xl"
          style={{ top: rect.top, left: rect.left, width: rect.width }}
        >
          <div className="max-h-96 overflow-y-auto p-1">
            {results.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-fg-dim">
                No features match &ldquo;{query}&rdquo;
              </p>
            )}
            {results.map((command, index) => (
              <button
                key={command.id}
                type="button"
                role="option"
                aria-selected={index === highlightIdx}
                onClick={() => go(command)}
                onMouseEnter={() => setHighlightIdx(index)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors cursor-pointer border-none ${
                  index === highlightIdx ? "bg-accent/10 text-fg" : "text-fg-muted hover:bg-surface-300"
                }`}
              >
                <span className="w-4 shrink-0 text-center text-sm" aria-hidden="true">
                  {command.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{command.title}</span>
                  {command.description && (
                    <span className="block truncate text-[11px] text-fg-dim">{command.description}</span>
                  )}
                </span>
                <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-fg-dim">
                  {command.group}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}