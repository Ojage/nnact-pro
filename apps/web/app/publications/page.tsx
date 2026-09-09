"use client";

import { useState } from "react";
import { useContentPublicationsQuery, useRetryPublicationMutation } from "@/lib/redux/api";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination } from "@/components/pagination";
import { formatRelativeTime } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-fg-dim/10 text-fg-dim",
  READY: "bg-blue-500/10 text-blue-500",
  SCHEDULED: "bg-purple-500/10 text-purple-500",
  QUEUED: "bg-cyan-500/10 text-cyan-500",
  PUBLISHING: "bg-amber-500/10 text-amber-500",
  PUBLISHED: "bg-green/10 text-green",
  FAILED: "bg-red/10 text-red",
  CANCELLED: "bg-fg-dim/10 text-fg-dim",
};

const CHANNEL_LABELS: Record<string, string> = {
  WEBSITE: "Website",
  LINKEDIN: "LinkedIn",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
};

export default function PublicationsPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const take = 50;

  const { data, isLoading, isError } = useContentPublicationsQuery({
    skip: 0,
    take,
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const [retry, { isLoading: retrying }] = useRetryPublicationMutation();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / take);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Publications"
        description="Monitor content distribution across every connected channel"
      />

      <Card>
        <CardContent className="p-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="PUBLISHED">Published</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="SCHEDULED">Scheduled</SelectItem>
              <SelectItem value="QUEUED">Queued</SelectItem>
              <SelectItem value="PUBLISHING">Publishing</SelectItem>
              <SelectItem value="READY">Ready</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
      ) : isError ? (
        <Card className="border-red/30 bg-red/5"><CardContent className="p-4"><p className="text-sm text-red">Failed to load publications</p></CardContent></Card>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><p className="text-fg-muted">No publications yet.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead className="w-28">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((pub) => (
                    <TableRow key={pub.id}>
                      <TableCell className="font-medium text-fg">{CHANNEL_LABELS[pub.channel] ?? pub.channel}</TableCell>
                      <TableCell className="text-fg-muted text-sm">{pub.contentId.slice(0, 8)}</TableCell>
                      <TableCell>
                        <Badge className={`${STATUS_COLORS[pub.status] ?? ""} border-transparent`}>{pub.status}</Badge>
                      </TableCell>
                      <TableCell className="text-fg-muted text-sm">{pub.scheduledAt ? formatRelativeTime(pub.scheduledAt) : "—"}</TableCell>
                      <TableCell className="text-fg-muted text-sm">{pub.attemptCount}</TableCell>
                      <TableCell className="text-fg-muted text-sm max-w-xs truncate">{pub.lastErrorMessage ?? "—"}</TableCell>
                      <TableCell>
                        {pub.status === "FAILED" && (
                          <Button size="sm" variant="secondary" loading={retrying} onClick={async () => retry(pub.id).unwrap()}>Retry</Button>
                        )}
                        {pub.externalUrl && (
                          <a href={pub.externalUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Open</a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
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
