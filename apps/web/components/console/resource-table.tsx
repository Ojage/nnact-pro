"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, ChevronDown, Filter, MoreVertical, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pagination } from "@/components/pagination";
import { cn } from "@/lib/utils";
import { iconButton } from "./styles";

export type SortDir = "asc" | "desc";

export type Column<T> = {
  id: string;
  header: ReactNode;
  /** Plain-text header for announcements when `header` is not a string. */
  headerText?: string;
  cell: (row: T) => ReactNode;
  /** Value to sort on; columns without it are not sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right";
  className?: string;
  headerClassName?: string;
  /** Hide below this breakpoint (keeps phone tables short). */
  hideBelow?: "sm" | "md" | "lg";
};

export type Facet<T> = {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  value: (row: T) => string | null | undefined;
};

export type RowMenuItem =
  | { label: string; icon?: LucideIcon; onSelect: () => void; danger?: boolean; disabled?: boolean }
  | "separator";

const HIDE: Record<NonNullable<Column<unknown>["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

function compareValues(a: unknown, b: unknown): number {
  const emptyA = a === null || a === undefined || a === "";
  const emptyB = b === null || b === undefined || b === "";
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function matchesQuery(text: string, query: string): boolean {
  if (!query) return true;
  const haystack = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => haystack.includes(part));
}

export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={label} className={iconButton}>
          <MoreVertical className="size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {items.map((item, index) =>
          item === "separator" ? (
            <DropdownMenuSeparator key={`sep-${index}`} />
          ) : (
            <DropdownMenuItem
              key={item.label}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={item.danger ? "text-[var(--console-danger-fg)]" : undefined}
            >
              {item.icon ? <item.icon /> : null}
              {item.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Console resource table: a filter bar (free text + facet chips), sortable
 * headers (aria-sort on the active column only), optional row selection with
 * a bulk-action bar, a ⋮ menu per row, and client-side paging.
 */
export function ResourceTable<T>({
  caption,
  rows,
  columns,
  getRowId,
  searchText,
  filterPlaceholder = "Filter",
  facets = [],
  defaultSort,
  pageSize = 50,
  rowMenu,
  rowLabel,
  selectable,
  bulkActions,
  empty,
  noMatch,
  minWidth = "48rem",
  toolbarEnd,
  initialQuery = "",
  initialFacets,
  onFilteredChange,
  dense,
  facetValues,
  onFacetValuesChange,
}: {
  /** Accessible name of the table (also the region label). */
  caption: string;
  rows: readonly T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  searchText?: (row: T) => string;
  filterPlaceholder?: string;
  facets?: Facet<T>[];
  defaultSort?: { id: string; dir: SortDir };
  pageSize?: number;
  rowMenu?: (row: T) => RowMenuItem[];
  /** Short name of a row for menu labels, e.g. the job title. */
  rowLabel?: (row: T) => string;
  selectable?: boolean;
  bulkActions?: (selected: T[], clear: () => void) => ReactNode;
  /** Shown when there are no rows at all. */
  empty?: ReactNode;
  /** Shown when filters hide every row. */
  noMatch?: ReactNode;
  minWidth?: string;
  toolbarEnd?: ReactNode;
  initialQuery?: string;
  initialFacets?: Record<string, string[]>;
  onFilteredChange?: (rows: T[]) => void;
  dense?: boolean;
  /** Controlled facet selection (optional). */
  facetValues?: Record<string, string[]>;
  onFacetValuesChange?: (values: Record<string, string[]>) => void;
}) {
  const uid = useId();
  const [query, setQuery] = useState(initialQuery);
  const [ownChosen, setOwnChosen] = useState<Record<string, string[]>>(initialFacets ?? {});
  const chosen = facetValues ?? ownChosen;
  const setChosen = (update: Record<string, string[]> | ((current: Record<string, string[]>) => Record<string, string[]>)) => {
    const next = typeof update === "function" ? update(chosen) : update;
    if (onFacetValuesChange) onFacetValuesChange(next);
    else setOwnChosen(next);
  };
  const [sort, setSort] = useState<{ id: string; dir: SortDir } | null>(defaultSort ?? null);
  const [skip, setSkip] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => setSkip(0), [query, chosen]);

  // Callers usually pass inline columns/facets; read them through a ref so
  // the filtered list only changes when the data or the filters change.
  const latest = useRef({ searchText, facets, columns });
  latest.current = { searchText, facets, columns };
  const filtered = useMemo(() => {
    const { searchText, facets, columns } = latest.current;
    const list = rows.filter((row) => {
      if (searchText && !matchesQuery(searchText(row), query.trim())) return false;
      for (const facet of facets) {
        const values = chosen[facet.id];
        if (values?.length && !values.includes(facet.value(row) ?? "")) return false;
      }
      return true;
    });
    const column = sort ? columns.find((col) => col.id === sort.id) : undefined;
    if (sort && column?.sortValue) {
      const read = column.sortValue;
      const keyed = list.map((row) => [read(row), row] as const);
      keyed.sort((a, b) => (sort.dir === "asc" ? 1 : -1) * compareValues(a[0], b[0]));
      return keyed.map(([, row]) => row);
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, chosen, sort]);

  const reported = useRef<readonly T[] | null>(null);
  useEffect(() => {
    const previous = reported.current;
    const same = previous !== null && previous.length === filtered.length && previous.every((row, index) => row === filtered[index]);
    if (same) return;
    reported.current = filtered;
    onFilteredChange?.(filtered);
  }, [filtered, onFilteredChange]);

  const page = useMemo(() => filtered.slice(skip, skip + pageSize), [filtered, skip, pageSize]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selectedRows = useMemo(() => rows.filter((row) => selected.has(getRowId(row))), [rows, selected]);
  const clearSelection = () => setSelected(new Set());

  const onSort = (column: Column<T>) => {
    const next: { id: string; dir: SortDir } =
      sort?.id === column.id ? { id: column.id, dir: sort.dir === "asc" ? "desc" : "asc" } : { id: column.id, dir: "asc" };
    setSort(next);
    const name = column.headerText ?? (typeof column.header === "string" ? column.header : column.id);
    setAnnouncement(`Sorted by ${name}, ${next.dir === "asc" ? "ascending" : "descending"}`);
  };

  const toggleFacet = (facetId: string, value: string) =>
    setChosen((current) => {
      const values = new Set(current[facetId] ?? []);
      if (values.has(value)) values.delete(value);
      else values.add(value);
      return { ...current, [facetId]: [...values] };
    });

  const activeChips = facets.flatMap((facet) =>
    (chosen[facet.id] ?? []).map((value) => ({
      facet,
      value,
      label: facet.options.find((option) => option.value === value)?.label ?? value,
    })),
  );
  const filtering = query.trim() !== "" || activeChips.length > 0;
  const clearAll = () => {
    setQuery("");
    setChosen({});
  };

  const pageIds = page.map(getRowId);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));
  const colCount = columns.length + (selectable ? 1 : 0) + (rowMenu ? 1 : 0);
  const rowHeight = dense ? "h-11" : "h-12";

  return (
    <section aria-labelledby={`${uid}-caption`} className="min-w-0 overflow-hidden rounded-[8px] border border-[var(--shell-border)]">
      {selectable && bulkActions && selectedRows.length > 0 ? (
        <div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-[var(--shell-border)] bg-[var(--shell-tint)] px-4 py-1.5 text-sm">
          <span className="font-medium text-fg">{selectedRows.length} selected</span>
          <span className="mx-1 h-5 w-px bg-[var(--shell-border)]" aria-hidden="true" />
          {bulkActions(selectedRows, clearSelection)}
          <button type="button" onClick={clearSelection} className="ml-auto text-sm font-medium text-[var(--shell-accent-text)] hover:underline">
            Clear selection
          </button>
        </div>
      ) : null}
      {searchText || facets.length || toolbarEnd ? (
        <div className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--shell-border)] px-4 py-1">
          <Filter className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
          {searchText ? (
            <>
              <label htmlFor={`${uid}-filter`} className="shrink-0 text-sm font-medium text-fg">
                Filter
              </label>
              <input
                id={`${uid}-filter`}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={filterPlaceholder}
                className="h-9 min-w-0 flex-[1_1_12rem] bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
              />
            </>
          ) : (
            <span className="flex-1" />
          )}
          {facets.map((facet) => {
            const count = chosen[facet.id]?.length ?? 0;
            return (
              <DropdownMenu key={facet.id}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]",
                      count
                        ? "border-[var(--shell-accent-bar)] bg-[var(--shell-tint)] text-[var(--shell-accent-text)]"
                        : "border-[var(--shell-border)] text-fg hover:bg-[var(--shell-hover)]",
                    )}
                  >
                    {facet.label}
                    {count ? <span className="tabular-nums">({count})</span> : null}
                    <ChevronDown className="size-3.5" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>{facet.label}</DropdownMenuLabel>
                  {facet.options.map((option) => (
                    <DropdownMenuCheckboxItem
                      key={option.value}
                      checked={chosen[facet.id]?.includes(option.value) ?? false}
                      onCheckedChange={() => toggleFacet(facet.id, option.value)}
                      onSelect={(event) => event.preventDefault()}
                    >
                      {option.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
          {toolbarEnd}
          <span className="shrink-0 text-xs text-fg-muted" aria-live="polite">
            {filtering ? `${filtered.length} of ${rows.length}` : `${rows.length} ${rows.length === 1 ? "row" : "rows"}`}
          </span>
        </div>
      ) : null}
      {activeChips.length || query.trim() ? (
        <ul className="flex flex-wrap items-center gap-1.5 border-b border-[var(--shell-border)] px-4 py-2" role="list" aria-label="Active filters">
          {query.trim() ? (
            <li>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="inline-flex h-7 items-center gap-1 rounded-full bg-[var(--shell-canvas)] pl-2.5 pr-1.5 text-xs text-fg hover:bg-[var(--shell-hover)]"
                aria-label={`Remove filter: text ${query.trim()}`}
              >
                “{query.trim()}”
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ) : null}
          {activeChips.map((chip) => (
            <li key={`${chip.facet.id}-${chip.value}`}>
              <button
                type="button"
                onClick={() => toggleFacet(chip.facet.id, chip.value)}
                className="inline-flex h-7 items-center gap-1 rounded-full bg-[var(--shell-canvas)] pl-2.5 pr-1.5 text-xs text-fg hover:bg-[var(--shell-hover)]"
                aria-label={`Remove filter: ${chip.facet.label} ${chip.label}`}
              >
                <span className="text-fg-muted">{chip.facet.label}:</span> {chip.label}
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={clearAll} className="h-7 px-2 text-xs font-medium text-[var(--shell-accent-text)] hover:underline">
              Clear all
            </button>
          </li>
        </ul>
      ) : null}
      {rows.length === 0 && empty ? (
        <div className="p-4">{empty}</div>
      ) : (
        <div
          className="console-scroll relative overflow-x-auto"
          role="region"
          aria-labelledby={`${uid}-caption`}
          tabIndex={0}
        >
          <table className="w-full border-collapse text-sm" style={{ minWidth }}>
            <caption id={`${uid}-caption`} className="sr-only">
              {caption}
            </caption>
            <thead className="bg-[var(--shell-canvas)]">
              <tr className="border-b border-[var(--shell-border)]">
                {selectable ? (
                  <th scope="col" className="w-10 pl-4 pr-0">
                    <input
                      type="checkbox"
                      aria-label="Select all rows on this page"
                      checked={allOnPage}
                      ref={(element) => {
                        if (element) element.indeterminate = someOnPage && !allOnPage;
                      }}
                      onChange={() =>
                        setSelected((current) => {
                          const next = new Set(current);
                          for (const id of pageIds) {
                            if (allOnPage) next.delete(id);
                            else next.add(id);
                          }
                          return next;
                        })
                      }
                      className="size-4 accent-[var(--shell-accent-bar)]"
                    />
                  </th>
                ) : null}
                {columns.map((column) => {
                  const active = sort?.id === column.id;
                  return (
                    <th
                      key={column.id}
                      scope="col"
                      aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                      className={cn(
                        "h-10 whitespace-nowrap px-4 text-xs font-medium text-fg-muted",
                        column.align === "right" ? "text-right" : "text-left",
                        column.hideBelow && HIDE[column.hideBelow],
                        column.headerClassName,
                      )}
                    >
                      {column.sortValue ? (
                        <button
                          type="button"
                          onClick={() => onSort(column)}
                          className={cn(
                            "inline-flex min-h-6 items-center gap-1 rounded-sm text-xs font-medium hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]",
                            active ? "text-fg" : "text-fg-muted",
                          )}
                        >
                          {column.header}
                          {active ? (
                            sort!.dir === "asc" ? (
                              <ArrowUp className="size-3.5" aria-hidden="true" />
                            ) : (
                              <ArrowDown className="size-3.5" aria-hidden="true" />
                            )
                          ) : null}
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
                {rowMenu ? (
                  <th scope="col" className="w-12 px-2">
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {page.map((row) => {
                const id = getRowId(row);
                const isSelected = selected.has(id);
                const name = rowLabel?.(row) ?? id;
                return (
                  <tr
                    key={id}
                    className={cn(
                      rowHeight,
                      "border-b border-[var(--shell-border)] last:border-b-0",
                      isSelected ? "bg-[var(--shell-tint)]" : "hover:bg-[var(--shell-canvas)]",
                    )}
                  >
                    {selectable ? (
                      <td className="w-10 pl-4 pr-0">
                        <input
                          type="checkbox"
                          aria-label={`Select ${name}`}
                          checked={isSelected}
                          onChange={() =>
                            setSelected((current) => {
                              const next = new Set(current);
                              if (next.has(id)) next.delete(id);
                              else next.add(id);
                              return next;
                            })
                          }
                          className="size-4 accent-[var(--shell-accent-bar)]"
                        />
                      </td>
                    ) : null}
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          "px-4 py-2",
                          column.align === "right" ? "text-right tabular-nums" : "text-left",
                          column.hideBelow && HIDE[column.hideBelow],
                          column.className,
                        )}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                    {rowMenu ? (
                      <td className="px-2 text-right">
                        <RowMenu label={`Actions for ${name}`} items={rowMenu(row)} />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {page.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-10 text-center text-sm text-fg-muted">
                    {noMatch ?? (
                      <>
                        No rows match these filters.{" "}
                        <button type="button" onClick={clearAll} className="font-medium text-[var(--shell-accent-text)] hover:underline">
                          Clear filters
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {filtered.length > pageSize ? (
        <div className="border-t border-[var(--shell-border)] px-4 pb-2">
          <Pagination skip={skip} take={pageSize} total={filtered.length} onSkipChange={setSkip} />
        </div>
      ) : null}
    </section>
  );
}
