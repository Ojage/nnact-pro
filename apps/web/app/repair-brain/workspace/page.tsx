"use client";

import { useRef, useState } from "react";
import { AlertCircle, Boxes, Check, Layers, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ModelWorkspace } from "@/components/repair-brain/model-workspace";
import { Button } from "@/components/ui/button";
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
  useCreateWorkspaceCategoryMutation,
  useWorkspaceCategoriesQuery,
} from "@/lib/redux/api";

export default function ModelWorkspacePage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const categoriesQuery = useWorkspaceCategoriesQuery();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const [createCategory, { isLoading }] = useCreateWorkspaceCategoryMutation();

  function resetCreate() {
    setName("");
    setDescription("");
    setError(null);
    setSuccess(false);
    window.clearTimeout(closeTimer.current);
  }

  function closeCreate() {
    resetCreate();
    setCreateOpen(false);
  }

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSuccess(false);
    try {
      const created = await createCategory({
        name: name.trim(),
        description: description.trim() || undefined,
      }).unwrap();
      setSelectedId(created.id);
      setSuccess(true);
      closeTimer.current = window.setTimeout(closeCreate, 1400);
    } catch {
      setError("Failed to create category");
    }
  };

  const categories = categoriesQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title="Model Workspace"
        description="Map equipment categories to a normalized engineering topology and author knowledge."
      />

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        {/* ── Category panel ── */}
        <aside className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Layers className="size-4 text-fg-muted" aria-hidden />
              Categories
              {categories.length > 0 && (
                <span className="font-normal text-fg-muted">({categories.length})</span>
              )}
            </div>
            <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" aria-hidden />
              New
            </Button>
          </div>

          <div className="space-y-1.5">
            {categoriesQuery.isLoading ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : categoriesQuery.isError ? (
              <p className="rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red" role="alert">
                Couldn't load categories.
              </p>
            ) : categories.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-fg-muted">
                No categories yet. Create one to start modeling an equipment family.
              </p>
            ) : (
              categories.map((c) => {
                const active = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`flex w-full flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border bg-surface-200 hover:border-fg-dim hover:bg-surface-300"
                    }`}
                  >
                    <span className="flex w-full items-center justify-between gap-2 text-sm font-medium text-fg">
                      <span className="truncate">{c.name}</span>
                      {active && <Check className="size-3.5 shrink-0 text-primary" aria-hidden />}
                    </span>
                    <span className="w-full truncate text-xs text-fg-muted">
                      {c.subcategory || c.productFamily || c.description || `${c.template.sections.length} section template`}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ── Right: workspace / knowledge ── */}
        <section className="min-w-0">
          {selectedId ? (
            <ModelWorkspace categoryId={selectedId} />
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface-200/40 p-8 text-center">
              <Boxes className="size-8 text-fg-dim" aria-hidden />
              <p className="font-medium text-fg">Select a category to open its workspace</p>
              <p className="max-w-sm text-sm text-fg-muted">
                Pick a category on the left to view and edit its engineering topology, or create a new one
                to get started.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ── Create category dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New equipment category</DialogTitle>
            <DialogDescription>
              Define an equipment family, e.g. washing machines or refrigerators. You can add its
              topology and knowledge template afterward.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(event) => void handleCreate(event)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Name <span className="text-red">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Washing Machine"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Description <span className="font-normal normal-case text-fg-dim">(optional)</span>
              </Label>
              <LimitedTextarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="What kinds of equipment belong here?"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red" role="alert">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-start gap-2 rounded-lg border border-chart-2/30 bg-chart-2/10 p-3 text-sm text-chart-2" role="status">
                <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                Category created.
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={closeCreate} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" loading={isLoading} disabled={!name.trim()}>
                Create category
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}