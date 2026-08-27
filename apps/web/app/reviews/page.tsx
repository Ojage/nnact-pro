"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { JobDTO, CustomerDTO } from "@nnact/shared";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState } from "@/components/empty-state";

interface Review {
  id: string;
  orgId: string;
  jobId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
}

interface ReviewList {
  reviews: Review[];
  average: number;
  count: number;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`text-sm ${i <= rating ? "text-yellow" : "text-surface-500"}`}>
          ★
        </span>
      ))}
    </span>
  );
}

type SortField = "rating" | "date";

export default function ReviewsPage() {
  const [data, setData] = useState<ReviewList | null>(null);
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortField>("date");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [rev, jb, cust] = await Promise.all([
          api.reviews().catch(() => ({ reviews: [], average: 0, count: 0 } as ReviewList)),
          api.jobs().catch(() => [] as JobDTO[]),
          api.customers().catch(() => [] as CustomerDTO[]),
        ]);
        if (!cancelled) {
          setData(rev);
          setJobs(jb);
          setCustomers(cust);
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

  const jobMap = useMemo(() => {
    const m = new Map<string, JobDTO>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  const customerMap = useMemo(() => {
    const m = new Map<string, CustomerDTO>();
    for (const c of customers) m.set(c.id, c);
    return m;
  }, [customers]);

  const handleSort = (field: SortField) => {
    if (sort === field) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(field); setDir("desc"); }
  };

  const filteredSorted = useMemo(() => {
    if (!data) return [];
    let list = [...data.reviews];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => {
        const job = jobMap.get(r.jobId);
        const cust = job ? customerMap.get(job.customerId) : null;
        return (
          (r.comment?.toLowerCase().includes(q) ?? false) ||
          (job?.title?.toLowerCase().includes(q) ?? false) ||
          (cust?.name?.toLowerCase().includes(q) ?? false)
        );
      });
    }

    list.sort((a, b) => {
      const m = dir === "asc" ? 1 : -1;
      if (sort === "rating") return m * (b.rating - a.rating); // higher first by default
      return m * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });

    return list;
  }, [data, search, sort, dir, jobMap, customerMap]);

  if (loading) {
    return (
      <div>
        <div className="flex items-end justify-between mb-8">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="flex items-center gap-4 mb-4">
          <Skeleton className="h-16 w-32 rounded-xl" />
          <Skeleton className="h-10 w-80 rounded-lg" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Reviews"
        description={data ? `${data.count} review${data.count !== 1 ? "s" : ""} · ${data.average.toFixed(1)} avg` : ""}
      />

      {error && (
        <Card className="mb-6 border-red/30 bg-red/5">
          <p className="text-red text-sm">API unreachable ({error}).</p>
        </Card>
      )}

      {data && data.reviews.length === 0 && !error ? (
        <Card>
          <EmptyState
            title="No reviews yet"
            description="Reviews appear here after customers rate completed jobs."
          />
        </Card>
      ) : data ? (
        <>
          {/* Rating summary + search */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="text-3xl font-bold text-fg tabular-nums">
                  {data.average.toFixed(1)}
                </div>
                <div className="flex flex-col gap-0.5">
                  <Stars rating={Math.round(data.average)} />
                  <span className="text-xs text-fg-muted">{data.count} reviews</span>
                </div>
              </CardContent>
            </Card>
            <div className="flex-1 flex items-center gap-3">
              <Input
                type="search"
                placeholder="Search by comment, job, or customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm flex-1"
              />
              <ToggleGroup
                type="single"
                value={sort}
                onValueChange={(value) => value && handleSort(value as "date" | "rating")}
                className="w-fit overflow-hidden rounded-lg border border-border bg-surface-300"
              >
                <ToggleGroupItem value="date" className="rounded-none px-3 py-1.5 text-xs data-[state=on]:bg-accent data-[state=on]:text-white">
                  Date {sort === "date" ? (dir === "asc" ? "↑" : "↓") : ""}
                </ToggleGroupItem>
                <ToggleGroupItem value="rating" className="rounded-none px-3 py-1.5 text-xs data-[state=on]:bg-accent data-[state=on]:text-white">
                  Rating {sort === "rating" ? (dir === "asc" ? "↑" : "↓") : ""}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {/* Reviews list */}
          {filteredSorted.length === 0 ? (
            <Card>
              <div className="text-center py-10">
                <p className="text-sm text-fg-muted">No reviews match your search</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredSorted.map((r) => {
                const job = jobMap.get(r.jobId);
                const cust = job ? customerMap.get(job.customerId) : null;
                return (
                  <Card key={r.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <Stars rating={r.rating} />
                        <span className="text-[11px] text-fg-dim shrink-0">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {r.comment && (
                        <p className="text-sm text-fg leading-relaxed line-clamp-3 mb-3">
                          &ldquo;{r.comment}&rdquo;
                        </p>
                      )}
                      <div className="flex items-center gap-2 pt-2 border-t border-border">
                        {job && (
                          <Link
                            href={`/jobs/${r.jobId}`}
                            className="text-xs text-fg-link hover:text-fg transition-colors no-underline truncate"
                          >
                            {job.title}
                          </Link>
                        )}
                        {cust && (
                          <>
                            <span className="text-fg-dim text-xs">·</span>
                            <Link
                              href={`/customers/${cust.id}`}
                              className="text-xs text-fg-muted hover:text-fg transition-colors no-underline truncate"
                            >
                              {cust.name}
                            </Link>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
