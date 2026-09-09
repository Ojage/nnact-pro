"use client";

import { useState, useMemo } from "react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { useNewsletterSubscribersQuery, useUpdateNewsletterSubscriberMutation } from "@/lib/redux/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/pagination";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRelativeTime } from "@/lib/utils";

const STATUSES = ["subscribed", "unsubscribed", "bounced"] as const;
const STATUS_LABELS: Record<string, string> = {
  subscribed: "Subscribed",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
};
const STATUS_COLORS: Record<string, string> = {
  subscribed: "bg-green/10 text-green",
  unsubscribed: "bg-fg-dim/10 text-fg-dim",
  bounced: "bg-red/10 text-red",
};

export default function NewsletterPage() {
  const { data: response, isLoading, isError } = useNewsletterSubscribersQuery({
    skip: 0,
    take: 50,
  });
  const [updateSubscriber, { isLoading: updating }] = useUpdateNewsletterSubscriberMutation();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const take = 50;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<string>("");

  const subscribers = response?.subscribers ?? [];
  const total = response?.total ?? 0;
  const totalPages = Math.ceil(total / take);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await updateSubscriber({ id, data: { status: newStatus as "subscribed" | "unsubscribed" | "bounced" } });
      setEditingId(null);
    } catch (err) {
      console.error("Failed to update subscriber:", err);
    }
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);
    window.open(`/api/v1/newsletter/export?${params.toString()}`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Newsletter Subscribers" description="Manage newsletter subscribers and export lists" />
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <PageHeader title="Newsletter Subscribers" description="Manage newsletter subscribers and export lists" />
        <Card className="border-red/30 bg-red/5"><CardContent className="p-4"><p className="text-sm text-red">Failed to load subscribers</p></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
<PageHeader
        title="Newsletter Subscribers"
        description="Manage newsletter subscribers, filter by status, and export lists for marketing campaigns"
      />

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-fg">Filters</h3>
            <p className="text-xs text-fg-muted">Filter and search subscribers</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="relative max-w-xs">
              <Input
                placeholder="Search email or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-fg-dim">🔍</span>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="subscribed">Subscribed</SelectItem>
                <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                <SelectItem value="bounced">Bounced</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="secondary" onClick={handleExport}>Export CSV</Button>
          </div>
        </CardHeader>
        <CardContent>
          {subscribers.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-fg-muted">
                {search || statusFilter !== "all" ? "Try adjusting your filters" : "No one has subscribed yet"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Channels</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="w-32">Status</TableHead>
                      <TableHead>Subscribed</TableHead>
                      <TableHead className="w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscribers.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell className="font-medium text-fg">{sub.email}</TableCell>
                        <TableCell>{sub.name ?? "—"}</TableCell>
                        <TableCell className="text-fg-muted">{sub.phone ?? "—"}</TableCell>
                        <TableCell>
                          <span className="inline-flex gap-1 text-xs">
                            {Array.isArray(sub.channels) ? sub.channels.map((c) => (
                              <span key={c} className="rounded-full bg-surface-300 px-1.5 py-0.5">{c}</span>
                            )) : String(sub.channels).split(",").map((c) => (
                              <span key={c} className="rounded-full bg-surface-300 px-1.5 py-0.5">{c}</span>
                            ))}
                          </span>
                        </TableCell>
                        <TableCell className="text-fg-muted text-xs capitalize">{sub.source}</TableCell>
                        <TableCell>
                          {editingId === sub.id ? (
                            <Select value={editStatus} onValueChange={setEditStatus}>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder={STATUS_LABELS[sub.status]} />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUSES.map((s) => (
                                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[sub.status] || ""}`}>
                              {STATUS_LABELS[sub.status] || sub.status}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-fg-muted text-sm">{formatRelativeTime(sub.createdAt)}</TableCell>
                        <TableCell>
                          {editingId === sub.id ? (
                            <div className="flex gap-1">
                              <Button size="sm" variant="secondary" onClick={() => handleStatusChange(sub.id, editStatus)} disabled={updating}>
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => { setEditingId(sub.id); setEditStatus(sub.status); }}>
                              Edit
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <Pagination
                  skip={page * take}
                  take={take}
                  total={total}
                  onSkipChange={(newSkip) => setPage(Math.floor(newSkip / take))}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}