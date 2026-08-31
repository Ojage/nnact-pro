"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  BookOpenCheck,
  Boxes,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  History,
  ListChecks,
  Package,
  Search,
  Sparkles,
  TriangleAlert,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { OrganizationHealthCard } from "@/components/repair-brain/organization-health-card";
import { TrendingPanel } from "@/components/repair-brain/trending-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/form-select";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LimitedTextarea } from "@/components/ui/limited-textarea";
import {
  useCreateProposalMutation,
  useLazyRepairBrainSearchQuery,
  useLazyRepairBrainSemanticSearchQuery,
  useRepairBrainProposalsQuery,
  useRepairBrainSuggestionsQuery,
  useVerifyProposalMutation,
  type ProposalRow,
} from "@/lib/redux/api";
import type { RepairBrainSearchResults } from "@/lib/repair-brain-api";
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

const POPULAR_QUERIES = [
  "Samsung WW90",
  "E21 error",
  "drain pump",
  "compressor overheating",
  "dryer not heating",
];

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

const CATEGORY_META: Array<{ key: keyof RepairBrainSearchResults; label: string; icon: LucideIcon }> = [
  { key: "models", label: "Models", icon: Boxes },
  { key: "faults", label: "Known faults", icon: TriangleAlert },
  { key: "parts", label: "Parts", icon: Package },
  { key: "procedures", label: "Procedures", icon: ListChecks },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "repairHistory", label: "Past repairs", icon: History },
];

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

function isRecent(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000;
}

export default function RepairBrainPage() {
  const session = useSessionUser();
  const canReview = session.user?.role === "owner" || session.user?.role === "dispatcher";
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [mode, setMode] = useState<"keyword" | "semantic">("keyword");

  const [triggerSearch, searchQuery] = useLazyRepairBrainSearchQuery();
  const [triggerSemantic, semanticQuery] = useLazyRepairBrainSemanticSearchQuery();
  const results = searchQuery.data ?? EMPTY;
  const searching = searchQuery.isFetching || semanticQuery.isFetching;

  // ── Autocomplete ──
  const [autoOpen, setAutoOpen] = useState(false);
  const autoQuery = useRepairBrainSuggestionsQuery(
    { q: query, kind: "all" },
    { skip: query.trim().length < 2 },
  );
  const suggestions = autoQuery.data ?? [];

  // ── Contribute knowledge ──
  const [contributeOpen, setContributeOpen] = useState(false);
  const [proposalType, setProposalType] = useState<string>("fault");
  const [proposalTitle, setProposalTitle] = useState("");
  const [proposalNotes, setProposalNotes] = useState("");
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposalSuccess, setProposalSuccess] = useState(false);
  const [createProposal, { isLoading: proposalSubmitting }] = useCreateProposalMutation();
  const successTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(successTimer.current), []);

  // ── Pending knowledge review ──
  const proposalsQuery = useRepairBrainProposalsQuery("proposed", { skip: !canReview });
  const proposals = (proposalsQuery.data ?? []) as unknown as ProposalRow[];
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const [verifyProposal] = useVerifyProposalMutation();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!proposalTitle.trim()) return;
    setProposalError(null);
    setProposalSuccess(false);
    window.clearTimeout(successTimer.current);
    try {
      await createProposal({
        proposalType,
        title: proposalTitle.trim(),
        payload: proposalNotes.trim() ? { notes: proposalNotes.trim() } : {},
      }).unwrap();
      setProposalTitle("");
      setProposalNotes("");
      setProposalSuccess(true);
      emitWalkthroughDone(ADVANCE_TAG.knowledgeContributed);
      successTimer.current = window.setTimeout(() => setProposalSuccess(false), 5000);
    } catch {
      setProposalError("Failed to submit proposal");
    }
  };

  const handleVerify = async (id: string) => {
    setVerifyId(id);
    try {
      await verifyProposal(id).unwrap();
      emitWalkthroughDone(ADVANCE_TAG.knowledgeReviewed);
    } catch {
      // keep the row listed
    } finally {
      setVerifyId(null);
    }
  };

  const search = () => {
    if (query.trim().length < 2) return;
    setSearched(true);
    setAutoOpen(false);
    if (mode === "semantic") void triggerSemantic(query.trim());
    else void triggerSearch(query.trim());
  };

  const runQuery = (next: string) => {
    setQuery(next);
    setAutoOpen(false);
    setSearched(true);
    if (mode === "semantic") void triggerSemantic(next);
    else void triggerSearch(next);
  };

  const clearSearch = () => {
    setQuery("");
    setSearched(false);
  };

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

      {/* ── Search ── */}
      <Card className="mb-6" data-tour="rb-search">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-dim"
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setAutoOpen(true);
                  if (!e.target.value) setSearched(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") search();
                  if (e.key === "Escape") setAutoOpen(false);
                }}
                onBlur={() => setTimeout(() => setAutoOpen(false), 150)}
                placeholder="Search models, fault codes, parts, procedures…"
                className="pl-9 pr-9"
                aria-label="Search Repair Brain"
              />
              {query && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-dim transition-colors hover:bg-surface-300 hover:text-fg"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
              {autoOpen && query.trim().length >= 2 && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-surface-200 shadow-lg">
                  {suggestions.slice(0, 8).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setQuery(s);
                        runQuery(s);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-surface-300"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={search} loading={searching} disabled={query.trim().length < 2}>
              <Search aria-hidden />
              Search
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-border bg-surface-200 p-0.5 text-xs" role="group" aria-label="Search mode">
              <button
                type="button"
                onClick={() => setMode("keyword")}
                className={`rounded-md px-2.5 py-1 transition-colors ${mode === "keyword" ? "bg-surface-300 font-semibold text-fg" : "text-fg-muted"}`}
              >
                Keyword
              </button>
              <button
                type="button"
                onClick={() => setMode("semantic")}
                className={`rounded-md px-2.5 py-1 transition-colors ${mode === "semantic" ? "bg-surface-300 font-semibold text-fg" : "text-fg-muted"}`}
              >
                Semantic
              </button>
            </div>
            <span className="text-xs text-fg-dim">Semantic search finds related faults &amp; procedures even when wording differs.</span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Popular</span>
            {POPULAR_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => runQuery(q)}
                className="rounded-full border border-border bg-surface-200 px-3 py-1 text-xs text-fg-muted transition-colors hover:border-fg-dim hover:text-fg"
              >
                {q}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Results summary / status ── */}
      {searched && !(mode === "semantic" ? semanticQuery.isError : searchQuery.isError) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-fg-muted">
            {searching
              ? "Searching the knowledge base…"
              : mode === "semantic"
                ? `${semanticQuery.data?.hits.length ?? 0} semantic hit${(semanticQuery.data?.hits.length ?? 0) === 1 ? "" : "s"} for “${query.trim()}”`
                : `${total} result${total === 1 ? "" : "s"} for “${query.trim()}”`}
          </p>
          {!searching && mode !== "semantic" && total > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_META.filter((c) => results[c.key].length > 0).map((c) => (
                <Badge key={c.key} variant="secondary">
                  {c.label} · {results[c.key].length}
                </Badge>
              ))}
            </div>
          )}
          {!searching && mode === "semantic" && semanticQuery.data && semanticQuery.data.hits.length > 0 && (
            <Badge variant="secondary">
              {semanticQuery.data.hits.filter((h) => h.kind === "fault").length} faults ·{" "}
              {semanticQuery.data.hits.filter((h) => h.kind === "procedure").length} procedures ·{" "}
              {semanticQuery.data.hits.filter((h) => h.kind === "part").length} parts
            </Badge>
          )}
        </div>
      )}

      {searched && (mode === "semantic" ? semanticQuery.isError : searchQuery.isError) && (
        <div
          className="mb-4 flex flex-col gap-3 rounded-lg border border-red/30 bg-red/5 p-4 text-sm text-red sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <span className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>Couldn't reach the Repair Brain. Check your connection and try again.</span>
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={clearSearch}>
              Clear
            </Button>
            <Button size="sm" onClick={search} loading={searching}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {searched && !searching && mode === "semantic" && semanticQuery.data && semanticQuery.data.hits.length === 0 && (
        <Card className="mb-4">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Search className="size-6 text-fg-dim" aria-hidden />
            <p className="font-medium">No semantic matches for “{query.trim()}”</p>
            <p className="max-w-sm text-sm text-fg-muted">
              Try switching to Keyword search, or broaden your wording to describe the fault or symptom.
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setMode("keyword")}>
                Switch to Keyword
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSearch}>
                Back to start
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {searched && mode !== "semantic" && !searchQuery.isError && !searching && total === 0 && (
        <Card className="mb-4">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Search className="size-6 text-fg-dim" aria-hidden />
            <p className="font-medium">No results for “{query.trim()}”</p>
            <p className="max-w-sm text-sm text-fg-muted">
              Try a broader term — a model number, error code, or part name — or browse the equipment catalog.
            </p>
            <div className="mt-2 flex gap-2">
              <Link href="/repair-brain/models">
                <Button size="sm" variant="secondary">
                  Browse models
                </Button>
              </Link>
              <Button size="sm" variant="ghost" onClick={clearSearch}>
                Back to start
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Semantic results ── */}
      {searched && mode === "semantic" && !semanticQuery.isError && semanticQuery.data && semanticQuery.data.hits.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <ResultSection
            title="Semantic matches"
            count={semanticQuery.data.hits.length}
            icon={Sparkles}
          >
            {semanticQuery.data.hits.map((h) => (
              <Link
                key={`${h.kind}-${h.id}`}
                href={h.equipmentModelId ? `/repair-brain/models/${h.equipmentModelId}` : "/repair-brain/models"}
                className="group flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:border-fg-dim hover:bg-surface-300"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-medium">{h.title}</span>
                    <Badge variant="secondary">{h.kind}</Badge>
                    <span className="text-[11px] tabular-nums text-fg-dim">{Math.round(h.score * 100)}%</span>
                  </span>
                  {h.snippet && <span className="mt-1 block text-xs text-fg-muted">{h.snippet}</span>}
                </span>
                <ChevronRight
                  className="mt-1 size-4 shrink-0 text-fg-dim transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            ))}
          </ResultSection>
        </div>
      )}

      {/* ── Results ── */}
      {searched && mode !== "semantic" && !searchQuery.isError && (
        <div className="grid gap-4 md:grid-cols-2">
          <ResultSection title="Models" count={results.models.length} icon={Boxes}>
            {results.models.map((m) => (
              <Link
                key={m.id}
                href={`/repair-brain/models/${m.id}`}
                className="group flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:border-fg-dim hover:bg-surface-300"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {m.manufacturer} {m.modelNumber}
                  </span>
                  {m.modelName && <span className="block truncate text-sm text-fg-muted">{m.modelName}</span>}
                  <span className="mt-0.5 block text-xs text-fg-dim">{m.category}</span>
                </span>
                <ChevronRight
                  className="mt-1 size-4 shrink-0 text-fg-dim transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            ))}
          </ResultSection>

          <ResultSection title="Known Faults" count={results.faults.length} icon={TriangleAlert}>
            {results.faults.map((f) => (
              <Link
                key={f.id}
                href={`/repair-brain/models/${f.equipmentModelId}`}
                className="group flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:border-fg-dim hover:bg-surface-300"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-medium">{f.title}</span>
                    {f.faultCode && (
                      <span className="rounded bg-surface-300 px-1.5 py-0.5 font-mono text-[11px] font-medium text-fg">
                        {f.faultCode}
                      </span>
                    )}
                  </span>
                  {f.snippet && <span className="mt-1 block text-xs text-fg-muted">{f.snippet}</span>}
                  <span className="mt-0.5 block text-xs text-fg-dim">View model profile</span>
                </span>
                <ChevronRight
                  className="mt-1 size-4 shrink-0 text-fg-dim transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            ))}
          </ResultSection>

          <ResultSection title="Parts" count={results.parts.length} icon={Package}>
            {results.parts.map((p) => (
              <Link
                key={p.id}
                href={`/repair-brain/models/${p.equipmentModelId}`}
                className="group flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:border-fg-dim hover:bg-surface-300"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.partName}</span>
                  {p.oemPartNumber && (
                    <span className="mt-0.5 block font-mono text-xs text-fg-dim">OEM {p.oemPartNumber}</span>
                  )}
                </span>
                <ChevronRight
                  className="mt-1 size-4 shrink-0 text-fg-dim transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            ))}
          </ResultSection>

          <ResultSection title="Procedures" count={results.procedures.length} icon={ListChecks}>
            {results.procedures.map((p) => (
              <Link
                key={p.id}
                href={p.equipmentModelId ? `/repair-brain/models/${p.equipmentModelId}` : "/diagnostic-library"}
                className="group flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:border-fg-dim hover:bg-surface-300"
              >
                <span className="min-w-0">
                  <span className="truncate font-medium">{p.title}</span>
                  {p.snippet && <span className="mt-1 block text-xs text-fg-muted">{p.snippet}</span>}
                </span>
                <Badge variant="outline" className="shrink-0 capitalize">
                  {p.type}
                </Badge>
              </Link>
            ))}
          </ResultSection>

          <ResultSection title="Documents" count={results.documents.length} icon={FileText}>
            {results.documents.map((d) => (
              <Link
                key={d.id}
                href={d.equipmentModelId ? `/repair-brain/models/${d.equipmentModelId}` : "/repair-brain"}
                className="group flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:border-fg-dim hover:bg-surface-300"
              >
                <span className="min-w-0">
                  <span className="truncate font-medium">{d.title}</span>
                  {d.snippet && <span className="mt-1 block text-xs text-fg-muted">{d.snippet}</span>}
                </span>
                <Badge variant="outline" className="shrink-0 capitalize">
                  {d.documentType.replaceAll("_", " ")}
                </Badge>
              </Link>
            ))}
          </ResultSection>

          <ResultSection title="Previous Repairs" count={results.repairHistory.length} icon={History}>
            {results.repairHistory.map((r) => (
              <Link
                key={r.id}
                href={r.equipmentModelId ? `/repair-brain/models/${r.equipmentModelId}` : "/repair-brain"}
                className="group flex items-start justify-between gap-3 rounded-md border border-border p-3 transition-colors hover:border-fg-dim hover:bg-surface-300"
              >
                <div className="min-w-0 flex-1">
                  <Badge variant="secondary" className="shrink-0 capitalize">
                    {r.outcome.replaceAll("_", " ")}
                  </Badge>
                  {r.snippet && <span className="mt-1 block text-xs text-fg-muted">{r.snippet}</span>}
                  {r.conclusion && <span className="mt-1 block text-sm text-fg-muted">{r.conclusion}</span>}
                </div>
                <ChevronRight
                  className="mt-1 size-4 shrink-0 text-fg-dim transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            ))}
          </ResultSection>
        </div>
      )}

      {/* ── Landing: get started + review + contribute ── */}
      {!searched && (
        <div className="space-y-4">
          <OrganizationHealthCard />
          <TrendingPanel />

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" aria-hidden />
                  Get started
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <QuickLink
                  href="/repair-brain/models"
                  icon={Boxes}
                  title="Browse equipment models"
                  description="Explore NNACT's supported appliance catalog"
                  dataTour="rb-models"
                />
                <QuickLink
                  href="/jobs"
                  icon={Wrench}
                  title="Open a job to diagnose"
                  description="Pull up a work order and run a diagnosis"
                  dataTour="rb-diagnose"
                />
                <button
                  type="button"
                  data-tour="rb-contribute"
                  onClick={() => setContributeOpen((v) => !v)}
                  className={`group flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    contributeOpen
                      ? "border-primary bg-primary/10"
                      : "border-primary/40 bg-primary/5 hover:border-primary hover:bg-primary/10"
                  }`}
                >
                  <Sparkles
                    className={`mt-0.5 size-4 shrink-0 ${contributeOpen ? "text-primary" : "text-primary/70"}`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                      {contributeOpen ? "Close composer" : "Contribute knowledge"}
                      <ChevronRight
                        className={`size-4 shrink-0 text-fg-dim transition-transform ${
                          contributeOpen ? "rotate-90" : "group-hover:translate-x-0.5"
                        }`}
                        aria-hidden
                      />
                    </span>
                    <span className="mt-0.5 block text-xs text-fg-muted">
                      {contributeOpen ? "Hide the proposal form" : "Share a field repair tip for review"}
                    </span>
                  </span>
                </button>
              </CardContent>
            </Card>

            {canReview && (
              <Card data-tour="rb-review">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpenCheck className="size-4 text-primary" aria-hidden />
                    Pending review
                    {proposals.length > 0 && <Badge variant="secondary">{proposals.length}</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2" data-tour="rb-proposals">
                  {proposalsQuery.isFetching ? (
                    <p className="text-sm text-fg-muted">Loading proposals…</p>
                  ) : proposals.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-fg-muted">
                      <CheckCircle2 className="size-4 shrink-0 text-chart-2" aria-hidden />
                      No proposals waiting for review.
                    </div>
                  ) : (
                    proposals.map((p) => (
                      <div key={p.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate text-sm font-medium text-fg">{p.title}</span>
                              {isRecent(p.createdAt) && <Badge variant="sent">New</Badge>}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                              <Badge variant="outline" className="capitalize">
                                {PROPOSAL_TYPE_LABELS[p.proposalType] ?? p.proposalType}
                              </Badge>
                              <span className="flex items-center gap-1">
                                <Clock3 className="size-3" aria-hidden />
                                {timeAgo(p.createdAt)}
                              </span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={verifyId === p.id}
                            onClick={() => void handleVerify(p.id)}
                          >
                            Verify
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {contributeOpen && (
            <Card data-tour="rb-contribute-form">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <Brain className="size-4 text-primary" aria-hidden />
                  Contribute knowledge
                  <span className="text-xs font-normal text-fg-dim">Proposal</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
                  <p className="text-sm leading-relaxed text-fg-muted">
                    Share what you learned from a field repair. A reviewer verifies each proposal before it
                    becomes part of the Repair Brain.
                  </p>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="proposal-type" className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                          Type
                        </Label>
                        <InfoTip label="About type" side="top">
                          Categorizes what you learned so reviewers and future searches can find it. A procedure is a
                          step-by-step fix; a measurement is a real-world reading from the field.
                        </InfoTip>
                      </div>
                      <FormSelect
                        id="proposal-type"
                        value={proposalType}
                        onChange={setProposalType}
                        options={KNOWLEDGE_PROPOSAL_TYPE.map((t) => ({ value: t, label: PROPOSAL_TYPE_LABELS[t] ?? t }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="proposal-title" className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                        Title <span className="text-red">*</span>
                      </Label>
                      <Input
                        id="proposal-title"
                        value={proposalTitle}
                        onChange={(e) => setProposalTitle(e.target.value)}
                        placeholder="e.g. E21 drains slowly on mid-speed spin"
                        maxLength={200}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-4">
                      <Label htmlFor="proposal-notes" className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                        Notes <span className="font-normal normal-case text-fg-dim">(optional)</span>
                      </Label>
                      <span className="text-xs text-fg-dim">Symptoms observed, steps tried, resolution</span>
                    </div>
                    <LimitedTextarea
                      id="proposal-notes"
                      value={proposalNotes}
                      onChange={(e) => setProposalNotes(e.target.value)}
                      rows={4}
                      maxLength={500}
                      className="min-h-24"
                      placeholder="What did you observe, what did you try, and what resolved it?"
                    />
                  </div>

                  {proposalError && (
                    <div className="flex items-start gap-2 rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red" role="alert">
                      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {proposalError}
                    </div>
                  )}

                  {proposalSuccess && (
                    <div className="flex items-start gap-2 rounded-lg border border-chart-2/30 bg-chart-2/10 p-3 text-sm text-chart-2" role="status">
                      <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                      Proposal submitted for review. It will show in the pending list once a reviewer picks it up.
                    </div>
                  )}

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-fg-dim">
                      Submissions are attributed to you and require reviewer approval before going live.
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={() => setContributeOpen(false)}>
                        Close
                      </Button>
                      <Button type="submit" loading={proposalSubmitting} disabled={!proposalTitle.trim()}>
                        Submit proposal
                      </Button>
                    </div>
                  </div>
                </form>
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
  icon,
  children,
}: {
  title: string;
  count: number;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  const Icon = icon;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-primary" aria-hidden />
          {title} <span className="font-normal text-fg-muted">({count})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function QuickLink({
  href,
  icon,
  title,
  description,
  dataTour,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  dataTour?: string;
}) {
  const Icon = icon;
  return (
    <Link
      href={href}
      data-tour={dataTour}
      className="group flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:border-fg-dim hover:bg-surface-200"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2 text-sm font-medium text-fg">
          {title}
          <ChevronRight className="size-4 shrink-0 text-fg-dim transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
        <span className="mt-0.5 block text-xs text-fg-muted">{description}</span>
      </span>
    </Link>
  );
}