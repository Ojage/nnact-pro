"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import type { ActivityDTO, CustomerDTO } from "@ofp/shared";

type SortField = "name" | "createdAt" | "lastActivity";
type SortDir = "asc" | "desc";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [activities, setActivities] = useState<ActivityDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [cr, ar] = await Promise.all([
          api.customers().catch(() => [] as CustomerDTO[]),
          api.activities().catch(() => [] as ActivityDTO[]),
        ]);
        if (!cancelled) {
          setCustomers(cr);
          setActivities(ar);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Last activity per customer ──
  const lastActivityMap = useMemo(() => {
    const map = new Map<string, ActivityDTO>();
    for (const a of activities) {
      if (!a.customerId) continue;
      const existing = map.get(a.customerId);
      if (!existing || new Date(a.createdAt) > new Date(existing.createdAt)) {
        map.set(a.customerId, a);
      }
    }
    return map;
  }, [activities]);

  const lastActivityDate = (customerId: string): Date | null => {
    const a = lastActivityMap.get(customerId);
    return a ? new Date(a.createdAt) : null;
  };

  // ── Filter + sort ──
  const filteredSorted = useMemo(() => {
    let list = [...customers];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.includes(q),
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "createdAt":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "lastActivity": {
          const da = lastActivityDate(a.id)?.getTime() ?? 0;
          const db = lastActivityDate(b.id)?.getTime() ?? 0;
          cmp = da - db;
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [customers, search, sortField, sortDir, lastActivityMap]);

  // ── Sort header helper ──
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortHeader = ({
    field,
    label,
    className,
  }: {
    field: SortField;
    label: string;
    className?: string;
  }) => {
    const active = sortField === field;
    return (
      <TableHead
        className={`cursor-pointer select-none hover:text-fg transition-colors ${className ?? ""}`}
        onClick={() => handleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className="text-fg-dim text-[10px] w-3 text-center">
            {active ? (sortDir === "asc" ? "↑" : "↓") : " "}
          </span>
        </span>
      </TableHead>
    );
  };

  // ── Loading ──
  if (loading) {
    return (
      <div>
        <div className="flex items-end justify-between mb-8">
          <div>
            <Skeleton className="h-8 w-40 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-10 w-80 rounded-lg mb-4" />
        {/* Desktop skeleton */}
        <div className="hidden md:block rounded-xl border border-border overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-none border-b border-border last:border-b-0" />
          ))}
        </div>
        {/* Mobile skeleton */}
        <div className="md:hidden flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ── No results state ──
  const noResults =
    customers.length > 0 && search.trim() && filteredSorted.length === 0;

  return (
    <div>
      <PageHeader
        title="Customers"
        description={
          customers.length > 0
            ? `${filteredSorted.length} of ${customers.length} total`
            : undefined
        }
      />

      {/* ── Error ── */}
      {error && (
        <Card className="mb-6 border-red/30 bg-red/5">
          <p className="text-red text-sm">API unreachable ({error}).</p>
        </Card>
      )}

      {/* ── Search bar ── */}
      {customers.length > 0 && (
        <div className="mb-4">
          <Input
            type="search"
            placeholder="Search customers by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </div>
      )}

      {/* ── Empty state ── */}
      {customers.length === 0 && !error ? (
        <Card>
          <EmptyState
            title="No customers yet"
            description="Add a customer via POST /api/customers to get started"
          />
        </Card>
      ) : (
        <>
          {/* ═══ Desktop table ═══ */}
          <Card className="p-0 overflow-hidden hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader field="name" label="Name" />
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <SortHeader field="lastActivity" label="Last activity" />
                  <SortHeader field="createdAt" label="Added" />
                  <TableHead className="text-right">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {noResults ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10">
                      <p className="text-sm text-fg-muted">
                        No customers match &ldquo;{search}&rdquo;
                      </p>
                      <button
                        onClick={() => setSearch("")}
                        className="text-xs text-fg-link hover:text-fg mt-1 cursor-pointer bg-transparent border-none"
                      >
                        Clear search
                      </button>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSorted.map((c) => {
                    const last = lastActivityMap.get(c.id);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium text-fg">
                          {c.name}
                        </TableCell>
                        <TableCell className="text-fg-muted">
                          {c.email ?? "—"}
                        </TableCell>
                        <TableCell className="text-fg-muted">
                          {c.phone ?? "—"}
                        </TableCell>
                        <TableCell className="text-fg-muted">
                          {last ? (
                            <div>
                              <p className="text-xs text-fg leading-snug line-clamp-1">
                                {last.summary}
                              </p>
                              <p className="text-[10px] text-fg-dim mt-0.5">
                                {formatRelativeTime(last.createdAt)}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-fg-dim">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-fg-muted text-xs">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/customers/${c.id}`}
                            className="text-xs text-fg-link hover:text-fg transition-colors"
                          >
                            View →
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>

          {/* ═══ Mobile cards ═══ */}
          <div className="md:hidden flex flex-col gap-3">
            {noResults ? (
              <Card>
                <div className="text-center py-10">
                  <p className="text-sm text-fg-muted">
                    No customers match &ldquo;{search}&rdquo;
                  </p>
                  <button
                    onClick={() => setSearch("")}
                    className="text-xs text-fg-link hover:text-fg mt-1 cursor-pointer bg-transparent border-none"
                  >
                    Clear search
                  </button>
                </div>
              </Card>
            ) : (
              filteredSorted.map((c) => {
                const last = lastActivityMap.get(c.id);
                return (
                  <Link
                    key={c.id}
                    href={`/customers/${c.id}`}
                    className="block no-underline hover:no-underline"
                  >
                    <Card className="p-4 hover:bg-surface-400 transition-colors cursor-pointer">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold text-fg">{c.name}</p>
                          {(c.email || c.phone) && (
                            <p className="text-xs text-fg-muted mt-0.5">
                              {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                            </p>
                          )}
                        </div>
                        <span className="text-fg-dim text-sm shrink-0 ml-2">→</span>
                      </div>
                      <div className="flex items-center gap-4 pt-2 border-t border-border">
                        {last ? (
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-fg-muted">Last activity</p>
                            <p className="text-xs text-fg leading-snug line-clamp-1 mt-0.5">
                              {last.summary}
                            </p>
                            <p className="text-[10px] text-fg-dim mt-0.5">
                              {formatRelativeTime(last.createdAt)}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-fg-dim flex-1">No activity</p>
                        )}
                        <p className="text-xs text-fg-dim text-right shrink-0">
                          Added {new Date(c.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </Card>
                  </Link>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
