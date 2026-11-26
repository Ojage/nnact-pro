"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, GitBranch, Plus, Search, X } from "lucide-react";
import {
  OPEN_BRANCH_SELECTOR_EVENT,
  setActiveBranchInUrl,
  useWorkingScope,
} from "@/lib/branches";
import { cn } from "@/lib/utils";

export function BranchSelectorDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const { org, branch, branches, isLoading } = useWorkingScope();

  useEffect(() => {
    const open = () => {
      setQuery("");
      const dialog = ref.current;
      if (!dialog || dialog.open) return;
      dialog.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener(OPEN_BRANCH_SELECTOR_EVENT, open);
    return () => window.removeEventListener(OPEN_BRANCH_SELECTOR_EVENT, open);
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? branches.filter((item) => item.name.toLowerCase().includes(needle)) : branches;
  }, [branches, query]);

  return (
    <dialog
      ref={ref}
      aria-label="Change branch"
      className="branch-dialog m-auto max-h-[min(36rem,calc(100dvh-2rem))] w-[min(32rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-[12px] border border-[var(--shell-border)] bg-[var(--shell-panel)] p-0 text-fg shadow-2xl"
      onClose={() => setQuery("")}
      onClick={(event) => {
        if (event.target === event.currentTarget) ref.current?.close();
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--shell-border)] p-5">
        <div className="min-w-0">
          <h2 className="text-lg font-medium tracking-[-0.01em]">Change branch</h2>
          <p className="mt-1 truncate text-sm text-fg-muted" title={org?.name}>
            {org ? `${org.shortName} · ${org.name}` : "Loading organization…"}
          </p>
        </div>
        <button
          type="button"
          autoFocus
          onClick={() => ref.current?.close()}
          aria-label="Close branch selector"
          className="grid size-9 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-[var(--shell-hover)] hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="p-5">
        <label htmlFor="branch-search" className="mb-2 block text-xs font-medium text-fg-muted">
          Search branches
        </label>
        <div className="flex h-11 items-center gap-2 rounded-[8px] border border-[var(--shell-border)] bg-[var(--shell-canvas)] px-3">
          <Search className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            id="branch-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-muted"
          />
        </div>
        <ul aria-label="Available branches" role="list" className="mt-4 max-h-64 space-y-1 overflow-y-auto">
          {visible.map((item) => {
            const active = item.id === branch?.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => {
                    setActiveBranchInUrl(item.id);
                    ref.current?.close();
                  }}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-[8px] px-3 text-left text-sm transition-colors",
                    "hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--shell-focus)]",
                    active ? "bg-[var(--shell-tint)] text-[var(--shell-accent-text)]" : "text-fg",
                  )}
                >
                  <span className="grid size-5 shrink-0 place-items-center">
                    {active ? <Check className="size-4" aria-hidden="true" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.name}</span>
                    {item.isDefault ? <span className="block text-xs text-fg-muted">Default branch</span> : null}
                  </span>
                  {active ? <span className="shrink-0 text-[11px] text-fg-muted">Current</span> : null}
                </button>
              </li>
            );
          })}
          {!isLoading && visible.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-fg-muted">No branches match “{query}”.</li>
          ) : null}
          {isLoading ? <li className="px-3 py-6 text-center text-sm text-fg-muted">Loading branches…</li> : null}
        </ul>
        <button
          type="button"
          disabled
          className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-[8px] border border-dashed border-[var(--shell-border)] px-3 text-sm text-fg-muted opacity-70"
        >
          <Plus className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 text-left">Add branch</span>
          <span className="text-[11px]">Coming soon</span>
        </button>
      </div>
    </dialog>
  );
}
