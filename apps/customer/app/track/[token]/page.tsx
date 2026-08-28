"use client";

import { useEffect, useState } from "react";
import { NNACT_COMPANY } from "@nnact/shared";
import { api, type PublicRequestStatusDTO } from "@/lib/api";
import { CustomerFooter, CustomerHeader } from "@/components/customer-chrome";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const [status, setStatus] = useState<PublicRequestStatusDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { token } = await params;
        const res = await api.requestStatus(token);
        setStatus(res);
      } catch (err) {
        setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Unable to load request status.");
      } finally {
        setLoading(false);
      }
    })();
  }, [params]);

  const statusLabel = status?.status
    ? status.status.replace("_", " ")
    : "";
  const statusColor: Record<string, string> = {
    lead: "border-t-purple bg-purple/10 text-purple",
    scheduled: "border-t-blue bg-blue/10 text-blue",
    in_progress: "border-t-yellow bg-yellow/10 text-yellow",
    completed: "border-t-green bg-green/10 text-green",
    canceled: "border-t-red bg-red/10 text-red",
  };
  const colorClass = statusColor[status?.status ?? ""] ?? "border-t-gray bg-gray/10 text-gray";

  return (
    <div className="min-h-screen bg-surface-100 text-fg">
      <CustomerHeader compact />

      <main className="mx-auto w-[min(720px,calc(100%-32px))] py-10">
        <div className="mb-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-accent">Track request</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Request status</h1>
        </div>

        {loading ? (
          <Card>
            <CardContent className="p-10 text-center">
              <p className="text-sm text-fg-muted">Loading request status…</p>
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="border-red/30 bg-red/5">
            <CardContent className="p-6 text-center text-red">
              <p className="text-sm">{error}</p>
              <Link href="/book" className="mt-4 inline-block text-fg-link hover:underline">
                Submit a new request
              </Link>
            </CardContent>
          </Card>
        ) : status ? (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className={`rounded-lg border-l-4 ${colorClass} p-4`}>
                <p className="text-xs font-semibold uppercase tracking-wide">Status</p>
                <p className="mt-1 text-xl font-black">{statusLabel}</p>
              </div>

              <dl className="space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
                  <dt className="text-fg-dim">Service</dt>
                  <dd className="font-medium">{status.title}</dd>
                </div>
                <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
                  <dt className="text-fg-dim">Customer</dt>
                  <dd>{status.customerName}</dd>
                </div>
                {status.serviceCategory && (
                  <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
                    <dt className="text-fg-dim">Category</dt>
                    <dd>{status.serviceCategory}</dd>
                  </div>
                )}
                {status.serviceAddress && (
                  <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
                    <dt className="text-fg-dim">Address</dt>
                    <dd>{status.serviceAddress}</dd>
                  </div>
                )}
                {status.preferredDate && (
                  <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
                    <dt className="text-fg-dim">Preferred date</dt>
                    <dd>{status.preferredDate}</dd>
                  </div>
                )}
                {status.preferredTime && (
                  <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
                    <dt className="text-fg-dim">Preferred time</dt>
                    <dd>{status.preferredTime}</dd>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
                  <dt className="text-fg-dim">Submitted</dt>
                  <dd>{new Date(status.createdAt).toLocaleString()}</dd>
                </div>
                {status.scheduledAt && (
                  <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
                    <dt className="text-fg-dim">Scheduled for</dt>
                    <dd>{new Date(status.scheduledAt).toLocaleString()}</dd>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
                  <dt className="text-fg-dim">Reference</dt>
                  <dd className="font-mono break-all">{status.requestId}</dd>
                </div>
              </dl>

              <div className="pt-4 border-t border-border flex gap-3">
                <Link href="/book" className="flex-1">
                  <Button variant="secondary">New request</Button>
                </Link>
                <Link href="/" className="flex-1">
                  <Button variant="secondary">Back to home</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </main>

      <CustomerFooter />
    </div>
  );
}