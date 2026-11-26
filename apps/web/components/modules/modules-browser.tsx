"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowRight,
  ArrowUpDown,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock,
  Command,
  Copy,
  CreditCard,
  Database,
  ExternalLink,
  FileText,
  Home,
  Image as ImageIcon,
  Landmark,
  LayoutGrid,
  List,
  Mail,
  Megaphone,
  Newspaper,
  Plug,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PrefetchLink } from "@/components/prefetch-link";
import { ConsoleHeader, ConsolePage, ToolbarButton } from "@/components/console/page";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  highlightRanges,
  MODULE_SECTIONS,
  modulesForRole,
  relatedModules,
  searchModules,
  sectionCounts,
  type ModuleEntry,
  type ModuleFilter,
  type ModuleIconName,
  type ModuleSort,
} from "@/lib/modules";
import type { NavRole } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useSessionUser } from "@/lib/use-session-user";

const ICONS: Record<ModuleIconName, LucideIcon> = {
  activity: Activity,
  agents: Bot,
  billing: CreditCard,
  book: FileText,
  calendar: Clock,
  chart: TrendingUp,
  check: CheckCircle2,
  clipboard: ClipboardList,
  command: Command,
  "credit-card": CreditCard,
  database: Database,
  file: FileText,
  finance: Landmark,
  grid: LayoutGrid,
  help: CircleHelp,
  home: Home,
  image: ImageIcon,
  mail: Mail,
  megaphone: Megaphone,
  news: Newspaper,
  plug: Plug,
  search: Search,
  settings: Settings2,
  shield: ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  tools: Wrench,
  trend: TrendingUp,
  users: Users,
  wallet: Wallet,
  wrench: Wrench,
};

const ROLE_LABELS: Record<NavRole, string> = {
  owner: "Owner",
  dispatcher: "Dispatcher",
  secretary: "Secretary",
  technician: "Technician",
};

type ModuleLayout = "grid" | "list";

interface BrowserState {
  query: string;
  sections: string[];
  filter: ModuleFilter;
  sort: ModuleSort;
  layout: ModuleLayout;
}

function parseFilter(value: string | null): ModuleFilter {
  return value === "favorites" || value === "recent" ? value : "all";
}

function parseSort(value: string | null): ModuleSort {
  return value === "name" || value === "section" ? value : "relevance";
}

function parseLayout(value: string | null): ModuleLayout {
  return value === "list" ? "list" : "grid";
}

function readStored(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function sameState(a: BrowserState, b: BrowserState): boolean {
  return (
    a.query === b.query &&
    a.filter === b.filter &&
    a.sort === b.sort &&
    a.layout === b.layout &&
    a.sections.length === b.sections.length &&
    a.sections.every((section, index) => section === b.sections[index])
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = highlightRanges(text, query);
  if (!ranges.length) return <>{text}</>;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) nodes.push(text.slice(cursor, range.start));
    nodes.push(
      <mark key={`${range.start}-${index}`} className="rounded-sm bg-[var(--shell-tint)] px-0.5 text-fg">
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}

function ModuleCard({
  entry,
  index,
  active,
  selected,
  layout,
  query,
  favorite,
  onFocus,
  onSelect,
  onToggleFavorite,
  onOpen,
}: {
  entry: ModuleEntry;
  index: number;
  active: boolean;
  selected: boolean;
  layout: ModuleLayout;
  query: string;
  favorite: boolean;
  onFocus: () => void;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onOpen: () => void;
}) {
  const Icon = ICONS[entry.icon];

  return (
    <div
      data-index={index}
      className={cn(
        "group relative min-w-0 rounded-[8px] border bg-[var(--shell-panel)] transition-[border-color,box-shadow,transform] duration-150",
        selected
          ? "border-[var(--shell-focus)] ring-1 ring-[var(--shell-focus)]"
          : "border-[var(--shell-border)] hover:-translate-y-0.5 hover:border-fg-muted/40 hover:shadow-[0_10px_28px_rgba(0,0,0,0.08)]",
        active && !selected && "shadow-[0_8px_24px_rgba(0,0,0,0.06)]",
        layout === "list" && "col-span-full",
      )}
    >
      <PrefetchLink
        href={entry.href}
        onClick={() => {
          onSelect();
          onOpen();
        }}
        onFocus={onFocus}
        onMouseEnter={onFocus}
        aria-current={selected ? "true" : undefined}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-[8px] p-4 pr-12 no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-[var(--shell-border)] bg-[var(--shell-canvas)] text-[var(--shell-accent-text)]">
          <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">
            <Highlight text={entry.label} query={query} />
          </span>
          <span className="mt-1 block text-xs text-[var(--shell-accent-text)]">{entry.section}</span>
          <span
            className={cn(
              "mt-2 text-sm leading-snug text-fg-muted",
              layout === "grid" ? "line-clamp-2" : "line-clamp-1",
            )}
          >
            <Highlight text={entry.description} query={query} />
          </span>
        </span>
      </PrefetchLink>
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-label={favorite ? `Remove ${entry.label} from favorites` : `Add ${entry.label} to favorites`}
        aria-pressed={favorite}
        className="absolute right-2 top-2 grid size-9 place-items-center rounded-full text-fg-muted hover:bg-[var(--shell-tint)] hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]"
      >
        <Star className={cn("size-4", favorite && "fill-[var(--shell-focus)] text-[var(--shell-focus)]")} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ModulesBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading } = useSessionUser();
  const searchRef = useRef<HTMLInputElement>(null);

  const initialState = useMemo<BrowserState>(
    () => ({
      query: searchParams.get("q") ?? "",
      sections: searchParams.getAll("section"),
      filter: parseFilter(searchParams.get("view")),
      sort: parseSort(searchParams.get("sort")),
      layout: parseLayout(searchParams.get("layout")),
    }),
    [searchParams],
  );
  const [state, setState] = useState<BrowserState>(initialState);
  const [selectedHref, setSelectedHref] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [copiedHref, setCopiedHref] = useState<string | null>(null);
  const storageReady = useRef(false);

  const patch = useCallback((next: Partial<BrowserState>) => {
    setState((current) => ({ ...current, ...next }));
  }, []);

  useEffect(() => {
    setState((current) => (sameState(current, initialState) ? current : initialState));
  }, [initialState]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (state.query.trim()) params.set("q", state.query.trim());
    state.sections.forEach((section) => params.append("section", section));
    if (state.filter !== "all") params.set("view", state.filter);
    if (state.sort !== "relevance") params.set("sort", state.sort);
    if (state.layout !== "grid") params.set("layout", state.layout);

    const nextQuery = params.toString();
    if (nextQuery === searchParams.toString()) return;
    window.history.replaceState(null, "", nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [pathname, searchParams, state]);

  useEffect(() => {
    setFavorites(readStored("nnact.modules.favorites"));
    setRecent(readStored("nnact.modules.recent"));
    storageReady.current = true;
  }, []);

  useEffect(() => {
    if (storageReady.current) window.localStorage.setItem("nnact.modules.favorites", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (storageReady.current) window.localStorage.setItem("nnact.modules.recent", JSON.stringify(recent));
  }, [recent]);

  useEffect(() => {
    setActiveIndex(0);
  }, [state.query, state.filter, state.sort, state.sections.join("\u0000")]);

  const deferredQuery = useDeferredValue(state.query);
  const visibleModules = useMemo(() => (user ? modulesForRole(user.role) : []), [user]);
  const counts = useMemo(() => sectionCounts(visibleModules), [visibleModules]);
  const results = useMemo(
    () =>
      searchModules(visibleModules, {
        query: deferredQuery,
        sections: state.sections,
        filter: state.filter,
        sort: state.sort,
        favorites,
        recent,
      }),
    [deferredQuery, favorites, recent, state.filter, state.sections, state.sort, visibleModules],
  );

  const selected =
    results.find((result) => result.entry.href === selectedHref)?.entry ?? results[0]?.entry ?? null;
  const related = selected ? relatedModules(visibleModules, selected) : [];
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const remember = useCallback((href: string) => {
    setRecent((current) => [href, ...current.filter((item) => item !== href)].slice(0, 12));
  }, []);

  const toggleFavorite = useCallback((href: string) => {
    setFavorites((current) => (current.includes(href) ? current.filter((item) => item !== href) : [...current, href]));
  }, []);

  const toggleSection = useCallback(
    (section: string, checked: boolean) => {
      patch({
        sections: checked
          ? [...state.sections, section].sort((a, b) => a.localeCompare(b))
          : state.sections.filter((item) => item !== section),
      });
    },
    [patch, state.sections],
  );

  const clearFilters = useCallback(() => {
    setState(initialState);
    patch({ query: "", sections: [], filter: "all", sort: "relevance" });
  }, [initialState, patch]);

  const openActive = useCallback(
    (index: number) => {
      const entry = results[index]?.entry;
      if (!entry) return;
      remember(entry.href);
      router.push(entry.href);
    },
    [remember, results, router],
  );

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;

      if (event.key === "/" && !editing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && target === searchRef.current) {
        if (state.query) patch({ query: "" });
        else target?.blur();
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [patch, state.query]);

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      openActive(activeIndex);
    }
  }

  async function copyLink(entry: ModuleEntry) {
    await navigator.clipboard.writeText(`${window.location.origin}${entry.href}`);
    setCopiedHref(entry.href);
    window.setTimeout(() => setCopiedHref((current) => (current === entry.href ? null : current)), 1600);
  }

  if (loading) {
    return (
      <ConsolePage>
        <ConsoleHeader
          title="All modules"
          breadcrumb={[{ label: "Home", href: "/" }, { label: "All modules" }]}
          description="Search every module available to your role."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-[8px]" />
          ))}
        </div>
      </ConsolePage>
    );
  }

  if (!user) {
    return (
      <ConsolePage>
        <ConsoleHeader
          title="All modules"
          breadcrumb={[{ label: "Home", href: "/" }, { label: "All modules" }]}
        />
        <EmptyState
          title="We couldn't load your modules"
          description="Refresh the page to restore your session, then try again."
          actions={<ToolbarButton onClick={() => router.refresh()}>Try again</ToolbarButton>}
        />
      </ConsolePage>
    );
  }

  return (
    <ConsolePage>
      <ConsoleHeader
        title="All modules"
        breadcrumb={[{ label: "Home", href: "/" }, { label: "All modules" }]}
        meta={`${visibleModules.length} modules available to ${ROLE_LABELS[user.role as NavRole] ?? "your role"}`}
        description="Find a module by name, category, or the work you need to do. Filter the catalog, pin favorites, and open a module directly."
      />

      <section className="min-w-0 space-y-3" aria-label="Module catalog">
        <div className="relative max-w-3xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
          <Input
            ref={searchRef}
            type="search"
            value={state.query}
            onChange={(event) => patch({ query: event.target.value })}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search modules by name, category, or task"
            aria-label="Search modules"
            aria-describedby="modules-search-help"
            className="h-12 rounded-[10px] pl-11 pr-24 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          />
          {state.query ? (
            <button
              type="button"
              onClick={() => patch({ query: "" })}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-fg-muted hover:bg-[var(--shell-tint)] hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-[5px] border border-[var(--shell-border)] bg-[var(--shell-canvas)] px-2 py-1 font-mono text-xs text-fg-muted">
              /
            </kbd>
          )}
          <p id="modules-search-help" className="sr-only">
            Press slash to focus search. Use arrow keys and Enter to open a result.
          </p>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex items-center rounded-[6px] border border-[var(--shell-border)] bg-[var(--shell-panel)] p-0.5" role="group" aria-label="Saved views">
            {(["all", "favorites", "recent"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => patch({ filter })}
                aria-pressed={state.filter === filter}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-[4px] px-3 text-sm font-medium capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]",
                  state.filter === filter
                    ? "bg-[var(--shell-tint)] text-fg"
                    : "text-fg-muted hover:bg-[var(--shell-hover)] hover:text-fg",
                )}
              >
                {filter === "favorites" ? <Star className="size-4" aria-hidden="true" /> : null}
                {filter === "recent" ? <Clock className="size-4" aria-hidden="true" /> : null}
                {filter}
              </button>
            ))}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ToolbarButton icon={SlidersHorizontal} aria-label="Filter by category">
                Category{state.sections.length ? ` (${state.sections.length})` : ""}
              </ToolbarButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Filter by category</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {MODULE_SECTIONS.map((section) => (
                <DropdownMenuCheckboxItem
                  key={section}
                  checked={state.sections.includes(section)}
                  onCheckedChange={(checked) => toggleSection(section, checked === true)}
                  onSelect={(event) => event.preventDefault()}
                >
                  <span className="flex w-full items-center justify-between gap-3">
                    <span>{section}</span>
                    <span className="text-xs text-fg-muted">{counts[section] ?? 0}</span>
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
              {state.sections.length ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => patch({ sections: [] })}>Clear categories</DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ToolbarButton icon={ArrowUpDown} aria-label="Sort modules">
                Sort: {state.sort === "relevance" ? "Relevance" : state.sort === "name" ? "Name" : "Category"}
              </ToolbarButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={state.sort} onValueChange={(value) => patch({ sort: parseSort(value) })}>
                <DropdownMenuRadioItem value="relevance">Relevance</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="name">Name A–Z</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="section">Category</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto flex items-center gap-1" role="group" aria-label="Result layout">
            <button
              type="button"
              onClick={() => patch({ layout: "grid" })}
              aria-label="Grid view"
              aria-pressed={state.layout === "grid"}
              className={cn(
                "grid size-9 place-items-center rounded-[6px] border border-[var(--shell-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]",
                state.layout === "grid" ? "bg-[var(--shell-tint)] text-fg" : "bg-[var(--shell-panel)] text-fg-muted hover:text-fg",
              )}
            >
              <LayoutGrid className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => patch({ layout: "list" })}
              aria-label="List view"
              aria-pressed={state.layout === "list"}
              className={cn(
                "grid size-9 place-items-center rounded-[6px] border border-[var(--shell-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]",
                state.layout === "list" ? "bg-[var(--shell-tint)] text-fg" : "bg-[var(--shell-panel)] text-fg-muted hover:text-fg",
              )}
            >
              <List className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {state.query || state.sections.length || state.filter !== "all" ? (
          <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
            <span className="text-xs text-fg-muted">Filters:</span>
            {state.query ? (
              <button type="button" onClick={() => patch({ query: "" })} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--shell-border)] bg-[var(--shell-panel)] px-3 text-xs text-fg hover:bg-[var(--shell-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]">
                “{state.query}” <X className="size-3" aria-hidden="true" />
              </button>
            ) : null}
            {state.sections.map((section) => (
              <button key={section} type="button" onClick={() => toggleSection(section, false)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--shell-border)] bg-[var(--shell-panel)] px-3 text-xs text-fg hover:bg-[var(--shell-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]">
                {section} <X className="size-3" aria-hidden="true" />
              </button>
            ))}
            {state.filter !== "all" ? (
              <button type="button" onClick={() => patch({ filter: "all" })} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--shell-border)] bg-[var(--shell-panel)] px-3 text-xs text-fg capitalize hover:bg-[var(--shell-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]">
                {state.filter} <X className="size-3" aria-hidden="true" />
              </button>
            ) : null}
            <button type="button" onClick={clearFilters} className="text-xs font-medium text-[var(--shell-accent-text)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]">
              Clear all
            </button>
          </div>
        ) : null}

        <p className="text-sm text-fg-muted" aria-live="polite">
          {results.length} {results.length === 1 ? "module" : "modules"}
          {state.query ? ` matching “${state.query}”` : ""}
        </p>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {results.length ? (
              <div className={cn("grid min-w-0 gap-3", state.layout === "grid" ? "grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3" : "grid-cols-1")}>
                {results.map((result, index) => (
                  <ModuleCard
                    key={result.entry.href}
                    entry={result.entry}
                    index={index}
                    active={activeIndex === index}
                    selected={selected?.href === result.entry.href}
                    layout={state.layout}
                    query={deferredQuery}
                    favorite={favoriteSet.has(result.entry.href)}
                    onFocus={() => {
                      setActiveIndex(index);
                      setSelectedHref(result.entry.href);
                    }}
                    onSelect={() => setSelectedHref(result.entry.href)}
                    onToggleFavorite={() => toggleFavorite(result.entry.href)}
                    onOpen={() => remember(result.entry.href)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No modules found"
                description="Try a different phrase, remove a filter, or clear your saved views."
                actions={<ToolbarButton onClick={clearFilters}>Clear filters</ToolbarButton>}
              />
            )}
          </div>

          <aside
            className="min-w-0 self-start rounded-[8px] border border-[var(--shell-border)] bg-[var(--shell-panel)] p-4 lg:sticky lg:top-4"
            aria-label="Module details"
          >
            {selected ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-start gap-3">
                    {(() => {
                      const Icon = ICONS[selected.icon];
                      return (
                        <span className="grid size-12 shrink-0 place-items-center rounded-[12px] border border-[var(--shell-border)] bg-[var(--shell-canvas)] text-[var(--shell-accent-text)]">
                          <Icon className="size-6" strokeWidth={1.8} aria-hidden="true" />
                        </span>
                      );
                    })()}
                    <div className="min-w-0">
                      <p className="text-xs text-[var(--shell-accent-text)]">{selected.section}</p>
                      <h2 className="break-words text-base font-medium text-fg">{selected.label}</h2>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-fg-muted">{selected.description}</p>
                </div>

                <div className="rounded-[8px] border border-[var(--shell-border)] bg-[var(--shell-canvas)] px-3 py-2">
                  <p className="text-xs text-fg-muted">Path</p>
                  <p className="truncate font-mono text-xs text-fg">{selected.href}</p>
                </div>

                <div>
                  <p className="text-xs font-medium text-fg-muted">Available to</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.roles.map((role) => (
                      <span key={role} className="rounded-full border border-[var(--shell-border)] px-2 py-1 text-xs text-fg-muted">
                        {ROLE_LABELS[role]}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <PrefetchLink href={selected.href} onClick={() => remember(selected.href)}>
                      Open module <ArrowRight className="size-4" aria-hidden="true" />
                    </PrefetchLink>
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void copyLink(selected)}>
                    {copiedHref === selected.href ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                    {copiedHref === selected.href ? "Copied" : "Copy link"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleFavorite(selected.href)}
                    aria-pressed={favoriteSet.has(selected.href)}
                  >
                    <Star className={cn("size-4", favoriteSet.has(selected.href) && "fill-[var(--shell-focus)] text-[var(--shell-focus)]")} aria-hidden="true" />
                    {favoriteSet.has(selected.href) ? "Pinned" : "Pin"}
                  </Button>
                </div>

                {related.length ? (
                  <div className="border-t border-[var(--shell-border)] pt-3">
                    <p className="text-xs font-medium text-fg-muted">More in {selected.section}</p>
                    <ul className="mt-2 space-y-1" role="list">
                      {related.map((entry) => (
                        <li key={entry.href}>
                          <PrefetchLink
                            href={entry.href}
                            onClick={() => remember(entry.href)}
                            className="flex items-center justify-between gap-2 rounded-[6px] px-2 py-1.5 text-sm text-[var(--shell-accent-text)] hover:bg-[var(--shell-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]"
                          >
                            <span className="truncate">{entry.label}</span>
                            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                          </PrefetchLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <PrefetchLink
                  href={selected.href}
                  onClick={() => remember(selected.href)}
                  className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]"
                >
                  <ExternalLink className="size-3" aria-hidden="true" /> Go to module
                </PrefetchLink>
              </div>
            ) : (
              <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
                <span className="grid size-11 place-items-center rounded-full bg-[var(--shell-canvas)] text-fg-muted">
                  <LayoutGrid className="size-5" aria-hidden="true" />
                </span>
                <p className="text-sm font-medium text-fg">Module details</p>
                <p className="max-w-[240px] text-xs text-fg-muted">
                  Select a module to see its description, access level, and related modules.
                </p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </ConsolePage>
  );
}
