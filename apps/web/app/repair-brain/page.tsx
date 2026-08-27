"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { repairBrainApi, type RepairBrainSearchResults } from "@/lib/repair-brain-api";

const EMPTY: RepairBrainSearchResults = {
  models: [],
  faults: [],
  parts: [],
  procedures: [],
  documents: [],
  repairHistory: [],
};

export default function RepairBrainPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RepairBrainSearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async () => {
    if (query.trim().length < 2) return;
    setLoading(true);
    try {
      const data = await repairBrainApi.search(query.trim());
      setResults(data);
      setSearched(true);
    } catch {
      setResults(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const total =
    results.models.length +
    results.faults.length +
    results.parts.length +
    results.procedures.length +
    results.documents.length +
    results.repairHistory.length;

  return (
    <div>
      <PageHeader
        title="Repair Brain"
        description="Search NNACT's institutional repair knowledge — models, faults, parts, procedures, and field history."
      />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <Input
              placeholder="Samsung WW90, E21, drain pump, DC31-00181A, compressor overheating…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              className="flex-1"
            />
            <Button onClick={search} disabled={loading || query.trim().length < 2}>
              {loading ? "Searching…" : "Search"}
            </Button>
          </div>
          {searched && (
            <p className="mt-2 text-sm text-fg-muted">{total} results across all categories</p>
          )}
        </CardContent>
      </Card>

      {searched && (
        <div className="grid gap-4 md:grid-cols-2">
          <ResultSection title="Models" count={results.models.length}>
            {results.models.map((m) => (
              <Link
                key={m.id}
                href={`/repair-brain/models/${m.id}`}
                className="block rounded-md border border-border p-3 hover:bg-surface-300"
              >
                <div className="font-medium">
                  {m.manufacturer} {m.modelNumber}
                </div>
                {m.modelName && <div className="text-sm text-fg-muted">{m.modelName}</div>}
                <div className="text-xs text-fg-muted mt-1">{m.category}</div>
              </Link>
            ))}
          </ResultSection>

          <ResultSection title="Known Faults" count={results.faults.length}>
            {results.faults.map((f) => (
              <Link
                key={f.id}
                href={`/repair-brain/models/${f.equipmentModelId}`}
                className="block rounded-md border border-border p-3 hover:bg-surface-300"
              >
                <div className="font-medium">{f.title}</div>
                {f.faultCode && <div className="text-sm text-fg-muted">Code: {f.faultCode}</div>}
              </Link>
            ))}
          </ResultSection>

          <ResultSection title="Parts" count={results.parts.length}>
            {results.parts.map((p) => (
              <Link
                key={p.id}
                href={`/repair-brain/models/${p.equipmentModelId}`}
                className="block rounded-md border border-border p-3 hover:bg-surface-300"
              >
                <div className="font-medium">{p.partName}</div>
                {p.oemPartNumber && (
                  <div className="text-sm text-fg-muted">OEM: {p.oemPartNumber}</div>
                )}
              </Link>
            ))}
          </ResultSection>

          <ResultSection title="Procedures" count={results.procedures.length}>
            {results.procedures.map((p) => (
              <div key={p.id} className="rounded-md border border-border p-3">
                <div className="font-medium">{p.title}</div>
                <div className="text-xs text-fg-muted mt-1 capitalize">{p.type}</div>
              </div>
            ))}
          </ResultSection>

          <ResultSection title="Documents" count={results.documents.length}>
            {results.documents.map((d) => (
              <div key={d.id} className="rounded-md border border-border p-3">
                <div className="font-medium">{d.title}</div>
                <div className="text-xs text-fg-muted mt-1">{d.documentType.replaceAll("_", " ")}</div>
              </div>
            ))}
          </ResultSection>

          <ResultSection title="Previous Repairs" count={results.repairHistory.length}>
            {results.repairHistory.map((r) => (
              <div key={r.id} className="rounded-md border border-border p-3">
                <div className="font-medium capitalize">{r.outcome.replaceAll("_", " ")}</div>
                {r.conclusion && <div className="text-sm text-fg-muted">{r.conclusion}</div>}
              </div>
            ))}
          </ResultSection>
        </div>
      )}

      {!searched && (
        <Card>
          <CardHeader>
            <CardTitle>Quick access</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/repair-brain/models">
              <Button variant="secondary" size="sm">
                Browse all equipment models
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ResultSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {title} <span className="text-fg-muted font-normal">({count})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}
