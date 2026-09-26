"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useGrowthProspectSearchQuery,
  useGrowthSectorsQuery,
  useImportGrowthProspectsCsvMutation,
  useRejectGrowthProspectMutation,
  useRunGrowthDiscoveryMutation,
  explainRtkError,
} from "@/lib/redux/api";

export default function ProspectSearchPage() {
  const [city, setCity] = useState("Douala");
  const [sectorSlug, setSectorSlug] = useState("hotels");
  const [q, setQ] = useState("");
  const [minFit, setMinFit] = useState("");
  const [csv, setCsv] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: sectors = [] } = useGrowthSectorsQuery();
  const { data: rows = [], isLoading, refetch } = useGrowthProspectSearchQuery({
    city: city.trim() || undefined,
    sectorSlug: sectorSlug.trim() || undefined,
    q: q.trim() || undefined,
    minFitScore: minFit ? Number(minFit) : undefined,
    excludeRejected: true,
    limit: 100,
  });

  const [runDiscovery, { isLoading: discovering }] = useRunGrowthDiscoveryMutation();
  const [importCsv, { isLoading: importing }] = useImportGrowthProspectsCsvMutation();
  const [reject] = useRejectGrowthProspectMutation();

  async function onRescore() {
    try {
      const result = await runDiscovery({
        sectorSlug: sectorSlug.trim() || "general",
        city: city.trim() || undefined,
      }).unwrap();
      toast.success(result.message);
      refetch();
    } catch (error) {
      toast.error(explainRtkError(error, "Discovery run failed"));
    }
  }

  async function onImport() {
    if (!csv.trim()) {
      toast.error("Paste CSV first");
      return;
    }
    try {
      const result = await importCsv({ csv }).unwrap();
      toast.success(`${result.created} created, ${result.skipped} skipped`);
      refetch();
    } catch (error) {
      toast.error(explainRtkError(error, "Import failed"));
    }
  }

  async function onReject(id: string) {
    if (!rejectReason.trim()) {
      toast.error("Give a reason so the system learns the fit");
      return;
    }
    try {
      await reject({ id, reason: rejectReason.trim() }).unwrap();
      toast.success("Prospect rejected");
      setRejectId(null);
      setRejectReason("");
      refetch();
    } catch (error) {
      toast.error(explainRtkError(error, "Could not reject"));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prospect search"
        description="Filter by sector and location, inspect fit evidence, import CSV, or rescore existing records. No contact details are invented."
      />

      <Card>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Sector</Label>
            <Input value={sectorSlug} onChange={(e) => setSectorSlug(e.target.value)} list="sector-slugs" />
            <datalist id="sector-slugs">
              {sectors.map((s) => (
                <option key={s.id} value={s.slug ?? s.name} />
              ))}
            </datalist>
          </div>
          <div>
            <Label>City</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Douala" />
          </div>
          <div>
            <Label>Search</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company or equipment need" />
          </div>
          <div>
            <Label>Min fit score</Label>
            <Input value={minFit} onChange={(e) => setMinFit(e.target.value)} type="number" min={0} max={100} />
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-2 items-end">
            <Button onClick={() => refetch()} variant="outline">
              Refresh
            </Button>
            <Button onClick={onRescore} disabled={discovering}>
              Rescore matching prospects
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-4">
          <Label>CSV import (company, city, email optional, sector, equipment)</Label>
          <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={4} className="font-mono text-xs" />
          <Button onClick={onImport} disabled={importing}>
            Import CSV
          </Button>
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-fg-muted">Loading…</p> : null}
      <div className="space-y-3">
        {rows.map((p) => (
          <Card key={p.id}>
            <CardContent className="space-y-2 pt-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{p.companyName}</p>
                <span className="text-fg-muted">
                  Fit {p.fitScore ?? "—"} · {p.city ?? "—"} · {p.sectorSlug ?? "—"}
                </span>
              </div>
              {p.fitSummary ? <p>{p.fitSummary}</p> : null}
              {Array.isArray(p.fitEvidence) && p.fitEvidence.length ? (
                <ul className="list-disc pl-5 text-fg-muted">
                  {(p.fitEvidence as { type?: string; detail?: string }[]).slice(0, 6).map((ev, i) => (
                    <li key={i}>
                      {ev.type ?? "note"}: {ev.detail ?? JSON.stringify(ev)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs text-fg-muted">
                Source {p.source} · email verification {p.emailVerificationStatus ?? "—"}
              </p>
              {rejectId === p.id ? (
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Why is this a bad fit?"
                    className="max-w-md"
                  />
                  <Button size="sm" variant="destructive" onClick={() => onReject(p.id)}>
                    Confirm reject
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRejectId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setRejectId(p.id)}>
                  Reject bad fit
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        {!isLoading && rows.length === 0 ? (
          <p className="text-sm text-fg-muted">No prospects match. Import CSV or add prospects manually.</p>
        ) : null}
      </div>
    </div>
  );
}
