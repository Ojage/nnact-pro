"use client";

import { useState } from "react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { useContentItemsQuery } from "@/lib/redux/api";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination } from "@/components/pagination";
import { formatRelativeTime } from "@/lib/utils";

const STATUS_FILTERS = [
  { value: "all", label: "All statuses", color: "" },
  { value: "DRAFT", label: "Draft", color: "bg-fg-dim/10 text-fg-dim" },
  { value: "IN_REVIEW", label: "In Review", color: "bg-amber-500/10 text-amber-500" },
  { value: "APPROVED", label: "Approved", color: "bg-blue-500/10 text-blue-500" },
  { value: "SCHEDULED", label: "Scheduled", color: "bg-purple-500/10 text-purple-500" },
  { value: "PUBLISHING", label: "Publishing", color: "bg-cyan-500/10 text-cyan-500" },
  { value: "PUBLISHED", label: "Published", color: "bg-green/10 text-green" },
  { value: "ARCHIVED", label: "Archived", color: "bg-fg-dim/10 text-fg-dim" },
  { value: "REJECTED", label: "Rejected", color: "bg-red/10 text-red" },
];

const TYPE_LABELS: Record<string, string> = {
  ARTICLE: "Article",
  MAINTENANCE_TIP: "Maintenance Tip",
  FIELD_STORY: "Field Story",
  PROJECT_SHOWCASE: "Project Showcase",
  ANNOUNCEMENT: "Announcement",
  CAMPAIGN: "Campaign",
  VIDEO: "Video",
  SOCIAL_POST: "Social Post",
};

export default function ContentPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const take = 50;

  const { data, isLoading, isError } = useContentItemsQuery({
    skip: 0,
    take,
    status: statusFilter === "all" ? undefined : statusFilter,
    search: search || undefined,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / take);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Studio"
        description="Create, approve, and publish content across all your marketing channels"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          {total} {total === 1 ? "item" : "items"}
        </p>
        <Link href="/content/new">
          <Button>＋ New Content</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Search title or slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
      ) : isError ? (
        <Card className="border-red/30 bg-red/5"><CardContent className="p-4"><p className="text-sm text-red">Failed to load content</p></CardContent></Card>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><p className="text-fg-muted">No content yet. Create your first piece to get started.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Visibility</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const color = STATUS_FILTERS.find((s) => s.value === item.status)?.color ?? "";
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium text-fg">
                          <Link href={`/content/${item.id}`} className="hover:underline">{item.title}</Link>
                        </TableCell>
                        <TableCell className="text-fg-muted">{TYPE_LABELS[item.type] ?? item.type}</TableCell>
                        <TableCell>
                          <Badge className={`${color} border-transparent`}>{STATUS_FILTERS.find((s) => s.value === item.status)?.label ?? item.status}</Badge>
                        </TableCell>
                        <TableCell className="text-fg-muted text-xs">{item.visibility}</TableCell>
                        <TableCell className="text-fg-muted text-sm">{formatRelativeTime(item.updatedAt)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <Pagination skip={page * take} take={take} total={total} onSkipChange={(newSkip) => setPage(Math.floor(newSkip / take))} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
