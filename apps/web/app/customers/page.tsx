"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useActivitiesQuery, useCreateCustomerMutation, useCustomersQuery } from "@/lib/redux/api";
import { formatRelativeTime } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/pagination";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import type { ActivityDTO, CustomerDTO } from "@nnact/shared";
import { ADVANCE_TAG } from "@nnact/shared";
import { emitWalkthroughDone } from "@/lib/walkthroughs/events";

type SortField = "name" | "createdAt" | "lastActivity";
type SortDir = "asc" | "desc";

export default function CustomersPage() {
  const { data: customers = [], isLoading, isError, error: queryError } = useCustomersQuery();
  const { data: activities = [] } = useActivitiesQuery();
  const [createCustomer, { isLoading: creating }] = useCreateCustomerMutation();
  const [skip, setSkip] = useState(0);
  const take = 50;

  // ── Create-customer dialog ──
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Reset pagination when search changes
  useEffect(() => { setSkip(0); }, [search]);

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

  const paginated = useMemo(() => filteredSorted.slice(skip, skip + take), [filteredSorted, skip, take]);

  // ── Sort header helper ──
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  // ── Create customer handler ──
  const handleCreateCustomer = async () => {
    if (!createName.trim()) return;
    setCreateErr(null);
    try {
      await createCustomer({
        name: createName.trim(),
        email: createEmail.trim() || undefined,
        phone: createPhone.trim() || undefined,
        notes: createNotes.trim() || undefined,
      }).unwrap();
      emitWalkthroughDone(ADVANCE_TAG.customerCreated);
      setShowCreate(false);
      setCreateName("");
      setCreateEmail("");
      setCreatePhone("");
      setCreateNotes("");
    } catch {
      setCreateErr("Failed to create customer");
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
  if (isLoading) {
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
        actions={
          <Button size="sm" data-tour="customers-add" onClick={() => setShowCreate(true)}>
            + New Customer
          </Button>
        }
      />

      {/* ── Quick stats ── */}
      {customers.length > 0 && (
        <div className="flex items-center gap-6 mb-4 text-xs">
          <div>
            <span className="text-fg-dim">Total</span>
            <span className="ml-1.5 font-semibold text-fg">{customers.length}</span>
          </div>
          <div>
            <span className="text-fg-dim">With activity</span>
            <span className="ml-1.5 font-semibold text-fg">
              {lastActivityMap.size}
            </span>
          </div>
          <div>
            <span className="text-fg-dim">New (30d)</span>
            <span className="ml-1.5 font-semibold text-fg">
              {customers.filter(
                (c) => new Date(c.createdAt).getTime() > Date.now() - 30 * 86400000
              ).length}
            </span>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {isError && (
        <Card className="mb-6 border-red/30 bg-red/5">
          <p className="text-red text-sm">API unreachable ({queryError ? String(queryError) : "unknown error"}).</p>
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
      {customers.length === 0 && !isError ? (
        <Card>
          <EmptyState
            title="No customers yet"
            description="Add your first customer to get started"
          />
          <div className="flex justify-center pb-6">
            <Button size="sm" data-tour="customers-add" onClick={() => setShowCreate(true)}>
              + New Customer
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* ═══ Desktop table ═══ */}
          <Card className="p-0 overflow-hidden hidden md:block" data-tour="customers-list">
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
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="mt-1 h-auto p-0 text-xs"
                        onClick={() => setSearch("")}
                      >
                        Clear search
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((c) => {
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
                            data-tour="customers-link"
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
<div className="md:hidden flex flex-col gap-3" data-tour="customers-list">
            {noResults ? (
              <Card>
                <div className="text-center py-10">
                  <p className="text-sm text-fg-muted">
                    No customers match &ldquo;{search}&rdquo;
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="mt-1 h-auto p-0 text-xs"
                    onClick={() => setSearch("")}
                  >
                    Clear search
                  </Button>
                </div>
              </Card>
            ) : (
              paginated.map((c) => {
                const last = lastActivityMap.get(c.id);
                return (
                  <Link
                    key={c.id}
                    href={`/customers/${c.id}`}
                    data-tour="customers-link"
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

      {/* ── Create customer dialog ── */}
      <Dialog
        open={showCreate}
        data-tour="customer-create-dialog"
        onOpenChange={(open) => {
          if (!open) {
            setCreateName("");
            setCreateEmail("");
            setCreatePhone("");
            setCreateNotes("");
            setCreateErr(null);
          }
          setShowCreate(open);
        }}
      >
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateCustomer();
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-fg-muted">Name *</label>
              <input
                data-tour="customer-create-name"
                className="h-10 px-3 rounded-lg border border-border bg-surface-300 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Jane Smith"
                autoFocus
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-fg-muted">Email</label>
              <input
                className="h-10 px-3 rounded-lg border border-border bg-surface-300 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-fg-muted">Phone</label>
              <input
                className="h-10 px-3 rounded-lg border border-border bg-surface-300 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                type="tel"
                value={createPhone}
                onChange={(e) => setCreatePhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                Notes
                <InfoTip label="About customer notes">Visible only to your team — customers never see these notes.</InfoTip>
              </label>
              <textarea
                className="min-h-[80px] px-3 py-2 rounded-lg border border-border bg-surface-300 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
                placeholder="Optional notes..."
              />
            </div>
            {createErr && (
              <p className="text-xs text-red">{createErr}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" disabled={creating} onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" data-tour="customer-create-submit" loading={creating} disabled={!createName.trim()}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Pagination skip={skip} take={take} total={filteredSorted.length} onSkipChange={setSkip} />
    </div>
  );
}
