"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  ListPlus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type {
  ComponentKind,
  EquipmentComponentDTO,
  EquipmentSystemDTO,
  KnowledgeTemplateSection,
} from "@nnact/shared";
import { Badge } from "@/components/ui/badge";
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
import { FormSelect } from "@/components/ui/form-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LimitedTextarea } from "@/components/ui/limited-textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KnowledgeComposer } from "@/components/repair-brain/knowledge-composer";
import {
  useCreateWorkspaceComponentMutation,
  useCreateWorkspaceConnectorMutation,
  useCreateWorkspaceMeasurementPointMutation,
  useCreateWorkspaceSubsystemMutation,
  useCreateWorkspaceSystemMutation,
  useDeleteWorkspaceComponentMutation,
  useDeleteWorkspaceSubsystemMutation,
  useDeleteWorkspaceSystemMutation,
  usePutTemplateSectionsMutation,
  useWorkspaceTaxonomyQuery,
} from "@/lib/redux/api";

const COMPONENT_KINDS: ComponentKind[] = [
  "generic",
  "actuator",
  "sensor",
  "pcb",
  "connector",
  "wiring",
  "harness",
  "valve",
  "motor",
  "compressor",
  "pump",
  "heater",
  "fan",
  "belt",
  "seal",
  "filter",
];

export function ModelWorkspace({ categoryId }: { categoryId: string }) {
  const taxonomyQuery = useWorkspaceTaxonomyQuery(categoryId);
  const taxonomy = taxonomyQuery.data;
  const systems = taxonomy?.systems ?? [];

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {taxonomyQuery.isLoading ? (
            <Skeleton className="h-6 w-48" />
          ) : (
            <h2 className="text-lg font-semibold text-fg">{taxonomy?.category?.name ?? "Category"}</h2>
          )}
          <p className="text-sm text-fg-muted">
            Model Workspace · {taxonomyQuery.isLoading ? "loading…" : `${systems.length} system${systems.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <TemplateEditor categoryId={categoryId} sections={taxonomy?.template ?? []} />
      </div>

      <Tabs defaultValue="topology">
        <TabsList>
          <TabsTrigger value="topology">Topology</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
        </TabsList>

        <TabsContent value="topology" className="space-y-4">
          <div className="flex justify-end">
            <AddSystemDialog categoryId={categoryId} />
          </div>

          {taxonomyQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : taxonomyQuery.isError ? (
            <div className="flex items-start gap-2 rounded-lg border border-red/30 bg-red/5 p-4 text-sm text-red" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              Couldn't load the workspace taxonomy.
            </div>
          ) : systems.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <ListPlus className="size-6 text-fg-dim" aria-hidden />
                <p className="font-medium text-fg">This category has no systems yet</p>
                <p className="max-w-sm text-sm text-fg-muted">
                  Add an engineering system (e.g. circulation or heating) to begin mapping the topology.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {systems.map((system) => (
                <SystemBlock
                  key={system.id}
                  system={system}
                  open={expanded[system.id] ?? false}
                  onToggle={() => setExpanded((prev) => ({ ...prev, [system.id]: !prev[system.id] }))}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="knowledge">
          <KnowledgeComposer categoryId={categoryId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SystemBlock({
  system,
  open,
  onToggle,
}: {
  system: EquipmentSystemDTO & {
    subsystems: Array<{ id: string; orgId: string; systemId: string; name: string; slug: string; reference?: string | null; description?: string | null; ordinal: number } & { components: EquipmentComponentDTO[] }>;
  };
  open: boolean;
  onToggle: () => void;
}) {
  const [deleteSystem] = useDeleteWorkspaceSystemMutation();
  const subsystems = system.subsystems ?? [];
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleteError(null);
    try {
      await deleteSystem(system.id).unwrap();
      setConfirmDelete(false);
    } catch {
      setDeleteError("Failed to delete system");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="flex min-w-0 items-center gap-2 text-left"
          >
            {open ? (
              <ChevronDown className="size-4 shrink-0 text-fg-dim" aria-hidden />
            ) : (
              <ChevronRight className="size-4 shrink-0 text-fg-dim" aria-hidden />
            )}
            <CardTitle className="truncate text-base">{system.name}</CardTitle>
            <span className="font-normal text-fg-muted">({subsystems.length})</span>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${system.name}`}>
              <Trash2 className="size-3.5 text-fg-dim" aria-hidden />
            </Button>
            <AddSubsystemDialog systemId={system.id} />
          </div>
        </div>
        {system.description || system.reference ? (
          <p className="truncate text-xs text-fg-muted">{system.description ?? system.reference}</p>
        ) : null}
      </CardHeader>

      {open && (
        <CardContent className="space-y-3">
          {subsystems.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm text-fg-muted">
              No subsystems yet.
            </p>
          ) : (
            subsystems.map((subsystem) => (
              <div key={subsystem.id} className="rounded-lg border border-border bg-surface-200/60 p-3">
                <SubsystemRow
                  subsystem={subsystem}
                  open={expanded[subsystem.id] ?? false}
                  onToggle={() =>
                    setExpanded((prev) => ({ ...prev, [subsystem.id]: !prev[subsystem.id] }))
                  }
                />
              </div>
            ))
          )}
        </CardContent>
      )}

      <Dialog open={confirmDelete} onOpenChange={() => setConfirmDelete(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete system</DialogTitle>
            <DialogDescription>
              Delete “{system.name}” and everything nested under it? This can't be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="flex items-start gap-2 rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {deleteError}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SubsystemRow({
  subsystem,
  open,
  onToggle,
}: {
  subsystem: {
    id: string;
    orgId: string;
    systemId: string;
    name: string;
    slug: string;
    reference?: string | null;
    description?: string | null;
    ordinal: number;
    components: EquipmentComponentDTO[];
  };
  open: boolean;
  onToggle: () => void;
}) {
  const [deleteSubsystem] = useDeleteWorkspaceSubsystemMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const components = subsystem.components ?? [];

  const handleDelete = async () => {
    setDeleteError(null);
    try {
      await deleteSubsystem(subsystem.id).unwrap();
      setConfirmDelete(false);
    } catch {
      setDeleteError("Failed to delete subsystem");
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onToggle} className="flex min-w-0 items-center gap-2 text-left">
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-fg-dim" aria-hidden />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-fg-dim" aria-hidden />
          )}
          <span className="truncate text-sm font-medium text-fg">{subsystem.name}</span>
          <span className="font-normal text-fg-muted">({components.length})</span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${subsystem.name}`}>
            <Trash2 className="size-3.5 text-fg-dim" aria-hidden />
          </Button>
          <AddComponentDialog subsystemId={subsystem.id} />
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          {components.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-2 text-xs text-fg-muted">
              No components yet.
            </p>
          ) : (
            components.map((component) => <ComponentRow key={component.id} component={component} />)
          )}
        </div>
      )}

      <Dialog open={confirmDelete} onOpenChange={() => setConfirmDelete(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete subsystem</DialogTitle>
            <DialogDescription>
              Delete “{subsystem.name}” and everything nested under it? This can't be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="flex items-start gap-2 rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {deleteError}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ComponentRow({ component }: { component: EquipmentComponentDTO }) {
  const [deleteComponent] = useDeleteWorkspaceComponentMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleteError(null);
    try {
      await deleteComponent(component.id).unwrap();
      setConfirmDelete(false);
    } catch {
      setDeleteError("Failed to delete component");
    }
  };

  return (
    <div className="rounded-md border border-border bg-surface-200/40 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-fg">{component.name}</span>
          <Badge variant="outline" className="capitalize">
            {component.kind}
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AddConnectorDialog componentId={component.id} />
          <AddMeasurementPointDialog componentId={component.id} />
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${component.name}`}>
            <Trash2 className="size-3.5 text-fg-dim" aria-hidden />
          </Button>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={() => setConfirmDelete(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete component</DialogTitle>
            <DialogDescription>Delete “{component.name}”? This can't be undone.</DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="flex items-start gap-2 rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {deleteError}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Template editor (configures the category's navigation sections) ──

function TemplateEditor({ categoryId, sections }: { categoryId: string; sections: KnowledgeTemplateSection[] }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Array<KnowledgeTemplateSection & { sectionKey: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [putTemplate, { isLoading }] = usePutTemplateSectionsMutation();
  const closeTimer = useRef<number | undefined>(undefined);

  function openEditor() {
    setItems(
      (sections ?? []).map((s) => ({
        key: s.key,
        sectionKey: s.key,
        label: s.label,
        group: s.group ?? "",
        kind: s.kind ?? "articles",
        ordinal: s.ordinal,
      })),
    );
    setError(null);
    setSuccess(false);
    setOpen(true);
  }

  function update(index: number, patch: Partial<KnowledgeTemplateSection & { sectionKey: string }>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function add() {
    setItems((prev) => [
      ...prev,
      {
        key: `section-${Date.now()}`,
        sectionKey: `section-${Date.now()}`,
        label: "",
        group: "",
        kind: "articles",
        ordinal: prev.length,
      },
    ]);
  }

  function remove(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    const cleaned = items
      .filter((s) => s.sectionKey.trim() && s.label.trim())
      .map((s, i) => {
        const group = s.group ?? "";
        return {
          sectionKey: s.sectionKey.trim(),
          label: s.label.trim(),
          group: group.trim() ? group.trim() : undefined,
          kind: s.kind || "articles",
          ordinal: i,
        };
      });
    if (cleaned.length === 0) {
      setError("Add at least one section with a key and label.");
      return;
    }
    try {
      await putTemplate({ id: categoryId, sections: cleaned }).unwrap();
      setSuccess(true);
      closeTimer.current = window.setTimeout(() => setOpen(false), 1200);
    } catch {
      setError("Failed to save template sections");
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={openEditor}>
        <Pencil className="size-3.5" aria-hidden />
        Edit template
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Template sections</DialogTitle>
            <DialogDescription>
              Define the config-driven navigation sections that structure this category's knowledge.
              Each section has a stable key, a label, an optional group, a kind, and an ordering.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-3 text-sm text-fg-muted">
                No sections. Add one to start building the template.
              </p>
            ) : (
              items.map((item, index) => (
                <div key={index} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Key</Label>
                      <Input
                        value={item.sectionKey}
                        onChange={(e) => update(index, { sectionKey: e.target.value, key: e.target.value })}
                        placeholder="e.g. drainage"
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Label</Label>
                      <Input
                        value={item.label}
                        onChange={(e) => update(index, { label: e.target.value })}
                        placeholder="e.g. Drainage"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr,auto,auto]">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Group</Label>
                      <Input
                        value={item.group ?? ""}
                        onChange={(e) => update(index, { group: e.target.value })}
                        placeholder="e.g. Machine (optional)"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Kind</Label>
                      <FormSelect
                        value={item.kind}
                        onChange={(v) => update(index, { kind: v })}
                        options={[
                          { value: "content", label: "Content" },
                          { value: "system", label: "System" },
                          { value: "components", label: "Components" },
                          { value: "error-codes", label: "Error codes" },
                          { value: "sequences", label: "Sequences" },
                          { value: "service-mode", label: "Service mode" },
                          { value: "articles", label: "Articles" },
                          { value: "repair-cases", label: "Repair cases" },
                        ]}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Order</Label>
                      <Input
                        type="number"
                        min={0}
                        value={item.ordinal}
                        onChange={(e) => update(index, { ordinal: Number(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" size="sm" variant="ghost" onClick={() => remove(index)}>
                      <Trash2 className="size-3.5 text-fg-dim" aria-hidden />
                      Remove
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <Button type="button" variant="secondary" onClick={add} className="w-full">
            <Plus className="size-3.5" aria-hidden />
            Add section
          </Button>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 rounded-lg border border-chart-2/30 bg-chart-2/10 p-3 text-sm text-chart-2" role="status">
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
              Template saved.
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" onClick={() => void handleSave()} loading={isLoading}>
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Generic small create dialog helpers ──

function useDialogState() {
  const [open, setOpen] = useState(false);
  return { open, setOpen };
}

function AddSystemDialog({ categoryId }: { categoryId: string }) {
  const { open, setOpen } = useDialogState();
  const [createSystem, { isLoading }] = useCreateWorkspaceSystemMutation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  function reset() {
    setName("");
    setDescription("");
    setError(null);
    setSuccess(false);
    window.clearTimeout(closeTimer.current);
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSuccess(false);
    try {
      await createSystem({
        categoryId,
        body: {
          name: name.trim(),
          description: description.trim() || undefined,
          reference: null,
          ordinal: 0,
        },
      }).unwrap();
      setSuccess(true);
      closeTimer.current = window.setTimeout(() => {
        reset();
        setOpen(false);
      }, 1400);
    } catch {
      setError("Failed to create system");
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-3.5" aria-hidden />
        Add system
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New system</DialogTitle>
            <DialogDescription>
              Add an engineering system (e.g. circulation, heating) to this category.
            </DialogDescription>
          </DialogHeader>
          <CreateForm
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            namePlaceholder="e.g. Water circulation"
            submitLabel="Create system"
            error={error}
            success={success}
            successText="System created."
            loading={isLoading}
            onCancel={() => setOpen(false)}
            onSubmit={(e) => void handleSubmit(e)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddSubsystemDialog({ systemId }: { systemId: string }) {
  const { open, setOpen } = useDialogState();
  const [createSubsystem, { isLoading }] = useCreateWorkspaceSubsystemMutation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  function reset() {
    setName("");
    setDescription("");
    setError(null);
    setSuccess(false);
    window.clearTimeout(closeTimer.current);
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSuccess(false);
    try {
      await createSubsystem({
        systemId,
        body: {
          name: name.trim(),
          description: description.trim() || undefined,
          reference: null,
          ordinal: 0,
        },
      }).unwrap();
      setSuccess(true);
      closeTimer.current = window.setTimeout(() => {
        reset();
        setOpen(false);
      }, 1400);
    } catch {
      setError("Failed to create subsystem");
    }
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New subsystem</DialogTitle>
            <DialogDescription>Add a subsystem under this system.</DialogDescription>
          </DialogHeader>
          <CreateForm
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            namePlaceholder="e.g. Drain pump assembly"
            submitLabel="Create subsystem"
            error={error}
            success={success}
            successText="Subsystem created."
            loading={isLoading}
            onCancel={() => setOpen(false)}
            onSubmit={(e) => void handleSubmit(e)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddComponentDialog({ subsystemId }: { subsystemId: string }) {
  const { open, setOpen } = useDialogState();
  const [createComponent, { isLoading }] = useCreateWorkspaceComponentMutation();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ComponentKind>("generic");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  function reset() {
    setName("");
    setKind("generic");
    setDescription("");
    setError(null);
    setSuccess(false);
    window.clearTimeout(closeTimer.current);
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSuccess(false);
    try {
      await createComponent({
        subsystemId,
        body: {
          name: name.trim(),
          kind,
          description: description.trim() || undefined,
          reference: null,
          manufacturerPartNumber: null,
          ordinal: 0,
        },
      }).unwrap();
      setSuccess(true);
      closeTimer.current = window.setTimeout(() => {
        reset();
        setOpen(false);
      }, 1400);
    } catch {
      setError("Failed to create component");
    }
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New component</DialogTitle>
            <DialogDescription>Add a physical component under this subsystem.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Name <span className="text-red">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Drain pump motor"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Kind</Label>
              <FormSelect
                value={kind}
                onChange={(v) => setKind(v as ComponentKind)}
                options={COMPONENT_KINDS.map((k) => ({ value: k, label: k }))}
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
                placeholder="What is this component and its function?"
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
                Component created.
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" loading={isLoading} disabled={!name.trim()}>
                Create component
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddConnectorDialog({ componentId }: { componentId: string }) {
  const { open, setOpen } = useDialogState();
  const [createConnector, { isLoading }] = useCreateWorkspaceConnectorMutation();
  const [label, setLabel] = useState("");
  const [board, setBoard] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!label.trim()) return;
    setError(null);
    setSuccess(false);
    try {
      await createConnector({
        componentId,
        body: { label: label.trim(), board: board.trim() || undefined, description: null, ordinal: 0 },
      }).unwrap();
      setSuccess(true);
      closeTimer.current = window.setTimeout(() => {
        setLabel("");
        setBoard("");
        setError(null);
        setSuccess(false);
        window.clearTimeout(closeTimer.current);
        setOpen(false);
      }, 1400);
    } catch {
      setError("Failed to create connector");
    }
  };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title="Add connector">
        <Plus className="size-3.5" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New connector</DialogTitle>
            <DialogDescription>Add an electrical connector to this component.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Label <span className="text-red">*</span>
              </Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. CN1" maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Board <span className="font-normal normal-case text-fg-dim">(optional)</span>
              </Label>
              <Input value={board} onChange={(e) => setBoard(e.target.value)} placeholder="e.g. Main PCB" maxLength={100} />
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
                Connector added.
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" loading={isLoading} disabled={!label.trim()}>
                Add connector
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddMeasurementPointDialog({ componentId }: { componentId: string }) {
  const { open, setOpen } = useDialogState();
  const [createPoint, { isLoading }] = useCreateWorkspaceMeasurementPointMutation();
  const [name, setName] = useState("");
  const [parameter, setParameter] = useState("");
  const [unit, setUnit] = useState("");
  const [expectedMin, setExpectedMin] = useState("");
  const [expectedMax, setExpectedMax] = useState("");
  const [expectedExact, setExpectedExact] = useState("");
  const [conditions, setConditions] = useState("");
  const [instrument, setInstrument] = useState("");
  const [safetyNotes, setSafetyNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  function parseOptionalNumber(v: string): number | null {
    if (v.trim() === "") return null;
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }

  function reset() {
    setName("");
    setParameter("");
    setUnit("");
    setExpectedMin("");
    setExpectedMax("");
    setExpectedExact("");
    setConditions("");
    setInstrument("");
    setSafetyNotes("");
    setError(null);
    setSuccess(false);
    window.clearTimeout(closeTimer.current);
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !parameter.trim()) return;
    setError(null);
    setSuccess(false);
    try {
      await createPoint({
        body: {
          componentId,
          name: name.trim(),
          parameter: parameter.trim(),
          unit: unit.trim() || undefined,
          expectedMin: parseOptionalNumber(expectedMin),
          expectedMax: parseOptionalNumber(expectedMax),
          expectedExact: parseOptionalNumber(expectedExact),
          measurementConditions: conditions.trim() || undefined,
          instrumentRequired: instrument.trim() || undefined,
          safetyNotes: safetyNotes.trim() || undefined,
          reference: null,
        },
      }).unwrap();
      setSuccess(true);
      closeTimer.current = window.setTimeout(() => {
        reset();
        setOpen(false);
      }, 1400);
    } catch {
      setError("Failed to create measurement point");
    }
  };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title="Add measurement point">
        <Pencil className="size-3.5" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New measurement point</DialogTitle>
            <DialogDescription>
              Document a measurable parameter for a diagnostic procedure.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3" noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Name <span className="text-red">*</span>
                </Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pump voltage" maxLength={100} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Parameter <span className="text-red">*</span>
                </Label>
                <Input value={parameter} onChange={(e) => setParameter(e.target.value)} placeholder="e.g. Voltage AC" maxLength={100} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <FieldNumber label="Expected min" value={expectedMin} onChange={setExpectedMin} />
              <FieldNumber label="Expected max" value={expectedMax} onChange={setExpectedMax} />
              <div className="space-y-1">
                <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Unit</Label>
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. V" maxLength={20} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Expected exact <span className="font-normal normal-case text-fg-dim">(optional)</span>
              </Label>
              <Input value={expectedExact} onChange={(e) => setExpectedExact(e.target.value)} placeholder="Single expected value" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Conditions <span className="font-normal normal-case text-fg-dim">(optional)</span>
              </Label>
              <Input value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="e.g. Machine idle, door closed" maxLength={200} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Instrument <span className="font-normal normal-case text-fg-dim">(optional)</span>
                </Label>
                <Input value={instrument} onChange={(e) => setInstrument(e.target.value)} placeholder="e.g. Multimeter" maxLength={100} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Safety notes <span className="font-normal normal-case text-fg-dim">(optional)</span>
                </Label>
                <Input value={safetyNotes} onChange={(e) => setSafetyNotes(e.target.value)} placeholder="e.g. Isolate before probing" maxLength={200} />
              </div>
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
                Measurement point created.
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" loading={isLoading} disabled={!name.trim() || !parameter.trim()}>
                Create point
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FieldNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(e.target.value)} step="any" />
    </div>
  );
}

function CreateForm({
  name,
  setName,
  description,
  setDescription,
  namePlaceholder,
  submitLabel,
  error,
  success,
  successText,
  loading,
  onCancel,
  onSubmit,
}: {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  namePlaceholder: string;
  submitLabel: string;
  error: string | null;
  success: boolean;
  successText: string;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Name <span className="text-red">*</span>
        </Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={namePlaceholder} maxLength={100} />
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
          placeholder="Purpose of this node in the topology"
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
          {successText}
        </div>
      )}

      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" loading={loading} disabled={!name.trim()}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}