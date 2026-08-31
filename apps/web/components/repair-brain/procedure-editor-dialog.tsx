"use client";

import { useRef, useState } from "react";
import { AlertCircle, Check, ListChecks, Plus, Trash2 } from "lucide-react";
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
import { NumberInput } from "@/components/ui/number-input";
import { FormSelect } from "@/components/ui/form-select";
import {
  useCreateRepairProcedureMutation,
  usePatchRepairProcedureMutation,
} from "@/lib/redux/api";
import type { RepairProcedure } from "@/lib/repair-brain-api";

interface StepDraft {
  sequence: number;
  instruction: string;
  warning: string;
  tool: string;
  verification: string;
}

const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "expert"].map((s) => ({
  value: s,
  label: s.replaceAll("_", " "),
}));

const EMPTY_STEP = (sequence: number): StepDraft => ({
  sequence,
  instruction: "",
  warning: "",
  tool: "",
  verification: "",
});

export function EditProcedureButton({ procedure }: { procedure: RepairProcedure }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <ListChecks className="size-3.5" />
        Edit
      </Button>
      <ProcedureEditorDialog procedure={procedure} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function AddProcedureButton({ equipmentModelId }: { equipmentModelId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Add procedure
      </Button>
      <ProcedureEditorDialog equipmentModelId={equipmentModelId} open={open} onOpenChange={setOpen} />
    </>
  );
}

function ProcedureEditorDialog({
  procedure,
  equipmentModelId,
  open,
  onOpenChange,
}: {
  procedure?: RepairProcedure;
  equipmentModelId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState(procedure?.title ?? "");
  const [description, setDescription] = useState(procedure?.description ?? "");
  const [duration, setDuration] = useState<number | null>(procedure?.expectedDurationMinutes ?? null);
  const [skillLevel, setSkillLevel] = useState(procedure?.skillLevel ?? "intermediate");
  const [requiredTools, setRequiredTools] = useState<string[]>(
    procedure?.requiredTools ?? [],
  );
  const [toolDraft, setToolDraft] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>(() => {
    if (procedure?.steps?.length) {
      return procedure.steps.map((s) => ({
        sequence: s.sequence,
        instruction: s.instruction,
        warning: s.warning ?? "",
        tool: s.tool ?? "",
        verification: s.verification ?? "",
      }));
    }
    return [EMPTY_STEP(1)];
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  const [createProcedure, { isLoading: creating }] = useCreateRepairProcedureMutation();
  const [patchProcedure, { isLoading: patching }] = usePatchRepairProcedureMutation();
  const saving = creating || patching;

  function reset() {
    const base = procedure;
    setTitle(base?.title ?? "");
    setDescription(base?.description ?? "");
    setDuration(base?.expectedDurationMinutes ?? null);
    setSkillLevel(base?.skillLevel ?? "intermediate");
    setRequiredTools(base?.requiredTools ?? []);
    setSteps(base?.steps?.length ? base.steps.map((s) => ({ sequence: s.sequence, instruction: s.instruction, warning: s.warning ?? "", tool: s.tool ?? "", verification: s.verification ?? "" })) : [EMPTY_STEP(1)]);
    setError(null);
    setSuccess(false);
    window.clearTimeout(closeTimer.current);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStep() {
    setSteps((prev) => [...prev, EMPTY_STEP(prev.length + 1)]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, sequence: i + 1 })));
  }

  function addTool() {
    const trimmed = toolDraft.trim();
    if (!trimmed) return;
    setRequiredTools((prev) => [...prev, trimmed]);
    setToolDraft("");
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setError(null);
    setSuccess(false);

    const cleanSteps = steps
      .filter((s) => s.instruction.trim())
      .map((s, i) => ({
        sequence: i + 1,
        instruction: s.instruction.trim(),
        warning: s.warning.trim() || undefined,
        tool: s.tool.trim() || undefined,
        verification: s.verification.trim() || undefined,
      }));

    const body = {
      title: title.trim(),
      description: description.trim() || undefined,
      expectedDurationMinutes: duration ?? undefined,
      skillLevel: skillLevel || undefined,
      requiredTools,
      steps: cleanSteps,
      requiredParts: [],
      safetyWarnings: [],
      prerequisites: [],
      verificationSteps: [],
    };

    try {
      if (procedure) {
        await patchProcedure({ id: procedure.id, body }).unwrap();
      } else if (equipmentModelId) {
        await createProcedure({ ...body, equipmentModelId }).unwrap();
      }
      setSuccess(true);
      closeTimer.current = window.setTimeout(close, 1600);
    } catch {
      setError("Failed to save procedure.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{procedure ? "Edit repair procedure" : "Add repair procedure"}</DialogTitle>
          <DialogDescription>
            Step-by-step fix with required tools and verification. Steps re-sequence automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Title <span className="text-red">*</span>
            </Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Replace drain pump and filter" maxLength={200} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Description</Label>
            <LimitedTextarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} placeholder="What this procedure achieves." />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Expected duration (min)</Label>
              <NumberInput value={duration ?? 0} onChange={(v) => setDuration(v)} min={0} max={1000} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Skill level</Label>
              <FormSelect value={skillLevel} onChange={setSkillLevel} options={SKILL_LEVELS} />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Required tools</Label>
            <div className="flex flex-wrap gap-1.5">
              {requiredTools.map((tool) => (
                <span key={tool} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-200 py-0.5 pl-2 pr-1 text-xs">
                  {tool}
                  <button
                    type="button"
                    aria-label={`Remove ${tool}`}
                    onClick={() => setRequiredTools((prev) => prev.filter((t) => t !== tool))}
                    className="rounded p-0.5 text-fg-dim hover:bg-surface-300 hover:text-fg"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </span>
              ))}
              <div className="flex gap-2">
                <Input value={toolDraft} onChange={(e) => setToolDraft(e.target.value)} placeholder="e.g. Multimeter" className="h-8 w-44 text-sm" />
                <Button type="button" variant="secondary" size="sm" onClick={addTool} disabled={!toolDraft.trim()}>
                  Add
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Steps</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addStep}>
                <Plus className="size-3.5" /> Add step
              </Button>
            </div>

            {steps.map((step, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Step {i + 1}</span>
                  <button type="button" aria-label="Remove step" onClick={() => removeStep(i)} className="rounded p-1 text-fg-dim hover:bg-surface-300 hover:text-red">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <div className="space-y-2">
                  <Input value={step.instruction} onChange={(e) => updateStep(i, { instruction: e.target.value })} placeholder="Instruction — what to do" maxLength={500} />
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input value={step.tool} onChange={(e) => updateStep(i, { tool: e.target.value })} placeholder="Tool (optional)" maxLength={100} />
                    <Input value={step.warning} onChange={(e) => updateStep(i, { warning: e.target.value })} placeholder="Warning (optional)" maxLength={200} />
                    <Input value={step.verification} onChange={(e) => updateStep(i, { verification: e.target.value })} placeholder="How to verify (optional)" maxLength={200} />
                  </div>
                </div>
              </div>
            ))}
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
              Procedure saved.
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!title.trim()}>
              {procedure ? "Save changes" : "Create procedure"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
