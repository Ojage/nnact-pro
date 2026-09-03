"use client";

import { useRef, useState } from "react";
import { AlertCircle, Check, FileText, ListOrdered, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LimitedTextarea } from "@/components/ui/limited-textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateWorkspaceArticleMutation,
  useCreateWorkspaceErrorCodeMutation,
  useCreateWorkspaceSequenceMutation,
  useDeleteWorkspaceArticleMutation,
  useDeleteWorkspaceErrorCodeMutation,
  useDeleteWorkspaceSequenceMutation,
  useWorkspaceArticlesQuery,
  useWorkspaceErrorCodesQuery,
  useWorkspaceSequencesQuery,
} from "@/lib/redux/api";

export function KnowledgeComposer({ categoryId }: { categoryId: string }) {
  const params = { categoryId };
  const articlesQuery = useWorkspaceArticlesQuery(params);
  const errorCodesQuery = useWorkspaceErrorCodesQuery(params);
  const sequencesQuery = useWorkspaceSequencesQuery(params);

  return (
    <div className="space-y-4">
      <ArticleComposer categoryId={categoryId} articles={articlesQuery.data ?? []} loading={articlesQuery.isLoading} />
      <ErrorCodeComposer categoryId={categoryId} codes={errorCodesQuery.data ?? []} loading={errorCodesQuery.isLoading} />
      <SequenceComposer categoryId={categoryId} sequences={sequencesQuery.data ?? []} loading={sequencesQuery.isLoading} />
    </div>
  );
}

function FieldBlock({
  label,
  required,
  optional,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {label}
        {required ? <span className="text-red"> *</span> : null}
        {!required && optional ? <span className="font-normal normal-case text-fg-dim"> (optional)</span> : null}
      </Label>
      {children}
    </div>
  );
}

// ── Knowledge article composer ──

function ArticleComposer({
  categoryId,
  articles,
  loading,
}: {
  categoryId: string;
  articles: Array<{ id: string; title: string; summary?: string | null; body: string; kind: string }>;
  loading: boolean;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [createArticle, { isLoading }] = useCreateWorkspaceArticleMutation();
  const [deleteArticle, { isLoading: deleting }] = useDeleteWorkspaceArticleMutation();
  const successTimer = useRef<number | undefined>(undefined);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setError(null);
    setSuccess(false);
    try {
      await createArticle({
        body: {
          categoryId,
          title: title.trim(),
          summary: summary.trim() || undefined,
          body: body.trim(),
          kind: "guide",
          tags: [],
        },
      }).unwrap();
      setTitle("");
      setSummary("");
      setBody("");
      setSuccess(true);
      successTimer.current = window.setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError("Failed to save article");
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await deleteArticle(id).unwrap();
    } catch {
      setError("Failed to delete article");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4 text-primary" aria-hidden />
          Knowledge article
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldBlock label="Title" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Diagnosing E21" maxLength={200} />
            </FieldBlock>
            <FieldBlock label="Summary" optional>
              <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line summary" maxLength={300} />
            </FieldBlock>
          </div>
          <FieldBlock label="Body" required>
            <LimitedTextarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={8000} placeholder="Write the article content here…" className="min-h-32" />
          </FieldBlock>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 rounded-lg border border-chart-2/30 bg-chart-2/10 p-3 text-sm text-chart-2" role="status">
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
              Article saved.
            </div>
          )}

          <Button type="submit" loading={isLoading} disabled={!title.trim() || !body.trim()}>
            <Plus className="size-3.5" aria-hidden />
            Save article
          </Button>
        </form>

        <div className="border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">Saved articles</p>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : articles.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm text-fg-muted">
              No articles authored yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {articles.map((article) => (
                <li key={article.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">{article.title}</p>
                    {article.summary && <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{article.summary}</p>}
                    <span className="mt-1 inline-block rounded bg-surface-300 px-1.5 py-0.5 text-[11px] capitalize text-fg-dim">{article.kind}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={deleting}
                    onClick={() => void handleDelete(article.id)}
                    aria-label={`Delete ${article.title}`}
                  >
                    <Trash2 className="size-3.5 text-fg-dim" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Error code composer ──

function ErrorCodeComposer({
  categoryId,
  codes,
  loading,
}: {
  categoryId: string;
  codes: Array<{ id: string; code: string; meaning?: string | null; description?: string | null; severity?: string | null }>;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [meaning, setMeaning] = useState("");
  const [description, setDescription] = useState("");
  const [likelyCauses, setLikelyCauses] = useState("");
  const [correctiveActions, setCorrectiveActions] = useState("");
  const [severity, setSeverity] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createCode, { isLoading }] = useCreateWorkspaceErrorCodeMutation();
  const [deleteCode] = useDeleteWorkspaceErrorCodeMutation();

  function splitList(raw: string): string[] {
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  function reset() {
    setCode("");
    setMeaning("");
    setDescription("");
    setLikelyCauses("");
    setCorrectiveActions("");
    setSeverity("");
    setTags("");
    setError(null);
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    setError(null);
    try {
      await createCode({
        body: {
          categoryId,
          code: code.trim(),
          meaning: meaning.trim() || undefined,
          description: description.trim() || undefined,
          likelyCauses: splitList(likelyCauses),
          correctiveActions: splitList(correctiveActions),
          severity: severity.trim() || undefined,
          tags: splitList(tags),
          preconditions: [],
        },
      }).unwrap();
      reset();
      setOpen(false);
    } catch {
      setError("Failed to save error code");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCode(id).unwrap();
    } catch {
      setError("Failed to delete error code");
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <TriangleAlert className="size-4 text-primary" aria-hidden />
          Error codes
        </CardTitle>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" aria-hidden />
          Add code
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-fg-muted">
          {error && (
            <span className="w-full text-red" role="alert">
              {error}
            </span>
          )}
        </div>
        {loading ? (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : codes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-sm text-fg-muted">
            No error codes defined for this category yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {codes.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-surface-300 px-1.5 py-0.5 font-mono text-xs font-medium text-fg">{c.code}</span>
                    {c.severity && <span className="text-xs capitalize text-fg-dim">{c.severity}</span>}
                  </div>
                  {c.meaning && <p className="mt-1 truncate text-sm text-fg">{c.meaning}</p>}
                  {c.description && <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{c.description}</p>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => void handleDelete(c.id)} aria-label={`Delete ${c.code}`}>
                  <Trash2 className="size-3.5 text-fg-dim" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New error code</DialogTitle>
            <DialogDescription>Document an error code, its meaning, causes, and corrective actions.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3" noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldBlock label="Code" required>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. E21" className="font-mono" maxLength={40} />
              </FieldBlock>
              <FieldBlock label="Severity" optional>
                <Input value={severity} onChange={(e) => setSeverity(e.target.value)} placeholder="e.g. high" maxLength={40} />
              </FieldBlock>
            </div>
            <FieldBlock label="Meaning" optional>
              <Input value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="What does this code indicate?" maxLength={300} />
            </FieldBlock>
            <FieldBlock label="Description" optional>
              <LimitedTextarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} placeholder="More detail on the fault" />
            </FieldBlock>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldBlock label="Likely causes" optional>
                <LimitedTextarea value={likelyCauses} onChange={(e) => setLikelyCauses(e.target.value)} rows={3} maxLength={2000} placeholder="One cause per line" />
              </FieldBlock>
              <FieldBlock label="Corrective actions" optional>
                <LimitedTextarea value={correctiveActions} onChange={(e) => setCorrectiveActions(e.target.value)} rows={3} maxLength={2000} placeholder="One action per line" />
              </FieldBlock>
            </div>
            <FieldBlock label="Tags" optional>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="space, comma or newline separated" maxLength={300} />
            </FieldBlock>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red" role="alert">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" loading={isLoading} disabled={!code.trim()}>
                Save code
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Operating sequence composer ──

function SequenceComposer({
  categoryId,
  sequences,
  loading,
}: {
  categoryId: string;
  sequences: Array<{ id: string; name: string; phase?: string | null; steps: Array<{ sequence: number; label: string; detail?: string; duration?: string }> }>;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phase, setPhase] = useState("");
  const [steps, setSteps] = useState<Array<{ label: string; detail: string }>>([{ label: "", detail: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [createSequence, { isLoading }] = useCreateWorkspaceSequenceMutation();
  const [deleteSequence] = useDeleteWorkspaceSequenceMutation();

  function updateStep(index: number, patch: Partial<{ label: string; detail: string }>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStep() {
    setSteps((prev) => [...prev, { label: "", detail: "" }]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function reset() {
    setName("");
    setPhase("");
    setSteps([{ label: "", detail: "" }]);
    setError(null);
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned = steps.filter((s) => s.label.trim());
    if (!name.trim() || cleaned.length === 0) {
      setError("Give the sequence a name and at least one step with a label.");
      return;
    }
    setError(null);
    try {
      await createSequence({
        body: {
          categoryId,
          name: name.trim(),
          phase: phase.trim() || undefined,
          description: undefined,
          steps: cleaned.map((s, i) => ({ sequence: i, label: s.label.trim(), detail: s.detail.trim() || undefined })),
          ordinal: 0,
        },
      }).unwrap();
      reset();
      setOpen(false);
    } catch {
      setError("Failed to save sequence");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSequence(id).unwrap();
    } catch {
      setError("Failed to delete sequence");
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListOrdered className="size-4 text-primary" aria-hidden />
          Operating sequences
        </CardTitle>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" aria-hidden />
          Add sequence
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : sequences.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-sm text-fg-muted">
            No operating sequences defined yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {sequences.map((seq) => (
              <li key={seq.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-fg">{seq.name}</span>
                    {seq.phase && <span className="text-xs capitalize text-fg-dim">{seq.phase}</span>}
                    <span className="text-xs text-fg-muted">({seq.steps.length} step{seq.steps.length === 1 ? "" : "s"})</span>
                  </div>
                  {seq.steps.length > 0 && (
                    <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-fg-muted">
                      {seq.steps.slice(0, 3).map((step) => (
                        <li key={step.sequence}>{step.label}</li>
                      ))}
                      {seq.steps.length > 3 && <li>…and {seq.steps.length - 3} more</li>}
                    </ol>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => void handleDelete(seq.id)} aria-label={`Delete ${seq.name}`}>
                  <Trash2 className="size-3.5 text-fg-dim" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New operating sequence</DialogTitle>
            <DialogDescription>Define the order of steps in an operating cycle.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3" noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldBlock label="Name" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wash cycle" maxLength={200} />
              </FieldBlock>
              <FieldBlock label="Phase" optional>
                <Input value={phase} onChange={(e) => setPhase(e.target.value)} placeholder="e.g. Fill" maxLength={100} />
              </FieldBlock>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Steps</Label>
              {steps.map((step, index) => (
                <div key={index} className="flex items-start gap-2 rounded-lg border border-border p-2">
                  <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-300 text-xs font-medium text-fg">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1 grid gap-2 sm:grid-cols-[1fr,auto]">
                    <Input value={step.label} onChange={(e) => updateStep(index, { label: e.target.value })} placeholder="Step label" maxLength={200} />
                    <Input value={step.detail} onChange={(e) => updateStep(index, { detail: e.target.value })} placeholder="Detail (optional)" maxLength={300} />
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeStep(index)} disabled={steps.length === 1} aria-label="Remove step">
                    <Trash2 className="size-3.5 text-fg-dim" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>

            <Button type="button" variant="secondary" onClick={addStep} className="w-full">
              <Plus className="size-3.5" aria-hidden />
              Add step
            </Button>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red" role="alert">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" loading={isLoading} disabled={!name.trim()}>
                Save sequence
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}