"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  GROWTH_OPEN_LIFECYCLES,
  GROWTH_PROSPECT_LIFECYCLE,
  GROWTH_PROSPECT_SOURCE,
  type GrowthProspectLifecycle,
  type GrowthProspectSource,
} from "@nnact/shared";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { useGrowthProspectsQuery } from "@/lib/redux/api";
import { formatDistanceToNow } from "date-fns";

const LIFECYCLE_LABELS: Record<GrowthProspectLifecycle, string> = {
  NEW: "New",
  RESEARCHING: "Researching",
  VERIFIED: "Verified",
  CONTACTED: "Contacted",
  ENGAGED: "Engaged",
  MEETING_BOOKED: "Meeting booked",
  QUOTED: "Quoted",
  WON: "Won",
  LOST: "Lost",
  DO_NOT_CONTACT: "Do not contact",
};

const SOURCE_LABELS: Record<GrowthProspectSource, string> = {
  WEBSITE: "Website",
  REFERRAL: "Referral",
  EXISTING_CUSTOMER: "Existing customer",
  EVENTS: "Events",
  DIRECTORY: "Directory",
  COLD_RESEARCH: "Cold research",
  IMPORT: "Import",
  OTHER: "Other",
};

function LifecyclePill({ lifecycle }: { lifecycle: GrowthProspectLifecycle }) {
  const open = GROWTH_OPEN_LIFECYCLES.includes(lifecycle);
  const won = lifecycle === "WON";
  const lost = lifecycle === "LOST" || lifecycle === "DO_NOT_CONTACT";
  const tone = won
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : lost
      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
      : open
        ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
        : "bg-muted text-fg-muted";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {LIFECYCLE_LABELS[lifecycle]}
    </span>
  );
}

export default function GrowthProspectsPage() {
  const [search, setSearch] = useState("");
  const [lifecycle, setLifecycle] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const { data: prospects = [], isLoading } = useGrowthProspectsQuery({
    q: search.trim() || undefined,
    lifecycle: lifecycle === "all" ? undefined : (lifecycle as GrowthProspectLifecycle),
    source: source === "all" ? undefined : (source as GrowthProspectSource),
  });

  const stats = useMemo(() => {
    const open = prospects.filter((p) => GROWTH_OPEN_LIFECYCLES.includes(p.lifecycle)).length;
    const won = prospects.filter((p) => p.lifecycle === "WON").length;
    return { open, won, total: prospects.length };
  }, [prospects]);

  return (
    <div>
      <PageHeader
        title="Prospects"
        description={`${stats.open} open · ${stats.won} won · ${stats.total} in view`}
        actions={
          <Link href="/growth/new">
            <Button>Add prospect</Button>
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          placeholder="Search company, domain, notes or contact…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={lifecycle} onValueChange={setLifecycle}>
          <SelectTrigger>
            <SelectValue placeholder="Lifecycle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lifecycles</SelectItem>
            {GROWTH_PROSPECT_LIFECYCLE.map((value) => (
              <SelectItem key={value} value={value}>
                {LIFECYCLE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger>
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {GROWTH_PROSPECT_SOURCE.map((value) => (
              <SelectItem key={value} value={value}>
                {SOURCE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : prospects.length === 0 ? (
        <EmptyState
          title={search || lifecycle !== "all" || source !== "all" ? "No matches" : "No prospects yet"}
          description={
            search || lifecycle !== "all" || source !== "all"
              ? "Try a different search or filter."
              : "Add a company you have researched, together with where each contact detail came from."
          }
          actions={
            <Link href="/growth/new">
              <Button variant="outline">Add a prospect</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {prospects.map((p) => (
            <Link key={p.id} href={`/growth/${p.id}`}>
              <Card className="h-full transition-colors hover:border-border/70">
                <CardContent className="flex h-full flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-semibold text-fg">{p.companyName}</p>
                    <LifecyclePill lifecycle={p.lifecycle} />
                  </div>
                  {p.websiteDomain ? (
                    <p className="text-xs text-fg-muted">{p.websiteDomain}</p>
                  ) : null}
                  {p.equipmentNeeds ? (
                    <p className="line-clamp-2 text-xs text-fg-muted">{p.equipmentNeeds}</p>
                  ) : null}
                  <p className="text-xs text-fg-dim">
                    {[p.city, p.industry].filter(Boolean).join(" · ") || SOURCE_LABELS[p.source]}
                  </p>
                  <div className="mt-auto flex items-center justify-between text-xs text-fg-dim">
                    <span>{SOURCE_LABELS[p.source]}</span>
                    <span>{formatDistanceToNow(new Date(p.updatedAt), { addSuffix: true })}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
