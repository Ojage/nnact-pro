"use client";

import Link from "next/link";
import { AlertTriangle, Flame, ListChecks, Package, TrendingUp } from "lucide-react";
import { useRepairBrainTrendingQuery } from "@/lib/redux/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TrendItem = { id: string; score: number; title: string; equipmentModelId?: string | null };

function ChipList({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: TrendItem[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {icon}
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 6).map((item) =>
          item.equipmentModelId ? (
            <Link
              key={item.id}
              href={`/repair-brain/models/${item.equipmentModelId}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-200 px-2.5 py-1 text-xs transition-colors hover:border-fg-dim hover:bg-surface-300"
            >
              {item.title}
            </Link>
          ) : (
            <span key={item.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-200 px-2.5 py-1 text-xs">
              {item.title}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

export function TrendingPanel() {
  const { data, isLoading } = useRepairBrainTrendingQuery();

  if (isLoading || !data) return null;
  const hasAny =
    data.hotQueries.length > 0 ||
    data.helpfulFaults.length > 0 ||
    data.helpfulProcedures.length > 0 ||
    data.helpfulParts.length > 0;
  if (!hasAny) return null;

  return (
    <Card data-tour="rb-trending">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Flame className="size-4 text-chart-6" aria-hidden />
          Trending in your knowledge base
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.hotQueries.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              <TrendingUp className="size-3.5 text-chart-3" aria-hidden />
              Hot searches
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.hotQueries.map((q) => (
                <span key={q.query} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-200 px-2.5 py-1 text-xs">
                  {q.query}
                  <span className="font-semibold tabular-nums text-fg-muted">{q.count}×</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <ChipList
          icon={<AlertTriangle className="size-3.5 text-chart-6" aria-hidden />}
          title="Most helpful faults"
          items={data.helpfulFaults}
        />
        <ChipList
          icon={<ListChecks className="size-3.5 text-chart-4" aria-hidden />}
          title="Most helpful procedures"
          items={data.helpfulProcedures}
        />
        <ChipList
          icon={<Package className="size-3.5 text-chart-2" aria-hidden />}
          title="Most helpful parts"
          items={data.helpfulParts}
        />
      </CardContent>
    </Card>
  );
}
