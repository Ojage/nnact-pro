"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@nnact/shared";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { useComebacksQuery } from "@/lib/redux/api";
import { ComebackSeverityBadge, ComebackStatusBadge } from "@/components/comeback-badge";
import { formatDistanceToNow } from "date-fns";

export default function ComebacksPage() {
  const [search, setSearch] = useState("");
  const { data: comebacks = [], isLoading } = useComebacksQuery({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return comebacks;
    return comebacks.filter(
      (c) =>
        c.caseNumber.toLowerCase().includes(q) ||
        (c.customerName ?? "").toLowerCase().includes(q) ||
        (c.equipmentLabel ?? "").toLowerCase().includes(q) ||
        c.complaintSummary.toLowerCase().includes(q) ||
        (c.originalJobNumber ?? "").toLowerCase().includes(q),
    );
  }, [comebacks, search]);

  const open = comebacks.filter((c) => c.status !== "CLOSED" && c.status !== "NOT_A_COMEBACK").length;

  return (
    <div>
      <PageHeader
        title="Comebacks"
        description={`${open} open case${open === 1 ? "" : "s"} · ${comebacks.length} total`}
        actions={
          <Link href="/quality/comebacks/new">
            <Button>New comeback</Button>
          </Link>
        }
      />

      <div className="relative my-4">
        <Input
          placeholder="Search case number, customer, equipment, complaint…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={comebacks.length === 0 ? "No comebacks yet" : "No matches"}
          description={
            comebacks.length === 0
              ? "Cases opened when a job returns for the same issue are tracked here."
              : "Try a different search."
          }
          actions={
            <Link href="/quality/comebacks/new">
              <Button variant="outline">Start a comeback</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Link key={c.id} href={`/quality/comebacks/${c.id}`}>
              <Card className="h-full transition-colors hover:border-border/70">
                <CardContent className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-fg-muted">{c.caseNumber}</span>
                    <div className="flex items-center gap-1.5">
                      <ComebackStatusBadge status={c.status} />
                      <ComebackSeverityBadge severity={c.severity} />
                    </div>
                  </div>
                  <p className="line-clamp-2 text-sm font-semibold text-fg">{c.complaintSummary}</p>
                  <p className="text-xs text-fg-muted">
                    {c.customerName ?? "Unknown customer"}
                    {c.equipmentLabel ? ` · ${c.equipmentLabel}` : ""}
                  </p>
                  <div className="mt-auto flex items-center justify-between text-xs text-fg-dim">
                    <span>
                      {c.repeatNumber > 1
                        ? `Repeat #${c.repeatNumber}`
                        : c.originalJobNumber
                          ? `Job ${c.originalJobNumber}`
                          : "No original job"}
                    </span>
                    <span>{formatDistanceToNow(new Date(c.reportedAt), { addSuffix: true })}</span>
                  </div>
                  {c.internalCostCents > 0 && (
                    <p className="text-xs font-medium text-fg-muted">
                      Internal cost {formatMoney(c.internalCostCents)}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}