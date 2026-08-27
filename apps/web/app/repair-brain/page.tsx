"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { repairBrainApi, type RepairBrainSearchResults } from "@/lib/repair-brain-api";
import { useSessionUser } from "@/lib/use-session-user";
import { emitWalkthroughDone } from "@/lib/walkthroughs/events";
import { ADVANCE_TAG, KNOWLEDGE_PROPOSAL_TYPE } from "@nnact/shared";

const EMPTY: RepairBrainSearchResults = {
  models: [],
  faults: [],
  parts: [],
  procedures: [],
  documents: [],
  repairHistory: [],
};

const PROPOSAL_TYPE_LABELS: Record<string, string> = {
  fault: "Known fault",
  symptom: "Symptom observation",
  diagnostic_procedure: "Diagnostic procedure",
  repair_procedure: "Repair procedure",
  part: "Part / replacement component",
  measurement: "Field measurement",
  test_point: "Test point",
  document: "Reference document",
};

interface ProposalRow {
  id: string;
  title: string;
  proposalType: string;
  status: string;
  createdAt: string;
}

export default function RepairBrainPage() {
  const session = useSessionUser();
  const canReview = session.user?.role === "owner" || session.user?.role === "dispatcher";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RepairBrainSearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // ── Contribute knowledge ──
  const [contributeOpen, setContributeOpen] = useState(false);
  const [proposalType, setProposalType] = useState<string>("fault");
  const [proposalTitle, setProposalTitle] = useState("");
  const [proposalNotes, setProposalNotes] = useState("");
  const [proposalSubmitting, setProposalSubmitting] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);

  // ── Pending knowledge review ──
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [verifyId, setVerifyId] = useState<string | null>(null);

  const loadProposals = useCallback(async () => {
    if (!canReview) return;
    setProposalsLoading(true);
    try {
      const rows = (await repairBrainApi.listProposals("proposed")) as unknown as ProposalRow[];
      setProposals(rows);
    } catch {
      setProposals([]);
    } finally {
      setProposalsLoading(false);
    }
  }, [canReview]);

  useEffect(() => {
    void loadProposals();
  }, [loadProposals]);

  const handleContribute = async () => {
    if (!proposalTitle.trim()) return;
    setProposalSubmitting(true);
    setProposalError(null);
    try {
      await repairBrainApi.createProposal({
        proposalType,
        title: proposalTitle.trim(),
        payload: proposalNotes.trim() ? { notes: proposalNotes.trim() } : {},
      });
      setProposalTitle("");
      setProposalNotes("");
      setContributeOpen(false);
      emitWalkthroughDone(ADVANCE_TAG.knowledgeContributed);
    } catch (e) {
      setProposalError(String(e));
    } finally {
      setProposalSubmitting(false);
    }
  };

  const handleVerify = async (id: string) => {
    setVerifyId(id);
    try {
      await repairBrainApi.verifyProposal(id);
      await loadProposals();
      emitWalkthroughDone(ADVANCE_TAG.knowledgeReviewed);
    } catch {
      // keep the row listed
    } finally {
      setVerifyId(null);
    }
  };

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
              data-tour="rb-search"
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
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Quick access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Link href="/repair-brain/models">
                  <Button variant="secondary" size="sm" data-tour="rb-models">
                    Browse all equipment models
                  </Button>
                </Link>
                <Link href="/jobs">
                  <Button variant="secondary" size="sm" data-tour="rb-diagnose">
                    Open a job to diagnose
                  </Button>
                </Link>
                <Button variant="secondary" size="sm" data-tour="rb-contribute" onClick={() => setContributeOpen((v) => !v)}>
                  {contributeOpen ? "Close composer" : "Contribute knowledge"}
                </Button>
              </div>

              {contributeOpen && (
                <div className="mt-4 rounded-lg border border-border bg-surface-200 p-4">
                  <p className="text-sm font-semibold text-fg mb-1">Contribute knowledge</p>
                  <p className="text-xs text-fg-muted mb-3">
                    Propose knowledge from a field repair. A reviewer will verify it before it becomes part of the Repair Brain.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                    <label className="grid gap-1 text-xs text-fg-muted">
                      Type
                      <select
                        value={proposalType}
                        onChange={(e) => setProposalType(e.target.value)}
                        className="h-10 rounded-lg border border-border bg-surface-200 px-3 text-sm text-fg"
                      >
                        {KNOWLEDGE_PROPOSAL_TYPE.map((t) => (
                          <option key={t} value={t}>
                            {PROPOSAL_TYPE_LABELS[t] ?? t}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs text-fg-muted">
                      Title
                      <Input
                        value={proposalTitle}
                        onChange={(e) => setProposalTitle(e.target.value)}
                        placeholder="e.g. E21 drains slowly on mid-speed spin"
                      />
                    </label>
                  </div>
                  <label className="mt-3 grid gap-1 text-xs text-fg-muted">
                    Notes (optional)
                    <Input
                      value={proposalNotes}
                      onChange={(e) => setProposalNotes(e.target.value)}
                      placeholder="Symptoms observed, steps tried, resolution…"
                    />
                  </label>
                  {proposalError && <p className="mt-2 text-xs text-red">{proposalError}</p>}
                  <Button
                    size="sm"
                    className="mt-3"
                    disabled={proposalSubmitting || !proposalTitle.trim()}
                    onClick={() => void handleContribute()}
                  >
                    {proposalSubmitting ? "Submitting…" : "Submit proposal"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {canReview && (
            <Card data-tour="rb-review">
              <CardHeader>
                <CardTitle>
                  Pending knowledge <span className="text-fg-muted font-normal">({proposals.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2" data-tour="rb-proposals">
                {proposalsLoading ? <p className="text-sm text-fg-muted">Loading…</p> : null}
                {!proposalsLoading && proposals.length === 0 ? (
                  <p className="text-sm text-fg-muted">No proposals waiting for review.</p>
                ) : null}
                {proposals.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-fg">{p.title}</div>
                      <div className="text-xs text-fg-muted capitalize">{PROPOSAL_TYPE_LABELS[p.proposalType] ?? p.proposalType}</div>
                    </div>
                    <Button size="sm" variant="secondary" disabled={verifyId === p.id} onClick={() => void handleVerify(p.id)}>
                      {verifyId === p.id ? "Verifying…" : "Verify"}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
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
