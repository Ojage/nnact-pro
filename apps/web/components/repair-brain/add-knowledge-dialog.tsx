"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  FileText,
  ListChecks,
  Package,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormSelect } from "@/components/ui/form-select";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LimitedTextarea } from "@/components/ui/limited-textarea";
import {
  useCreateKnownFaultMutation,
  useCreateModelPartMutation,
  useCreateRepairProcedureMutation,
  useCreateTestPointMutation,
} from "@/lib/redux/api";

type Kind = "fault" | "procedure" | "part" | "testpoint";

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "fault", label: "Known fault" },
  { value: "procedure", label: "Repair procedure" },
  { value: "part", label: "Part / component" },
  { value: "testpoint", label: "Test point" },
];

export function AddKnowledgeButton({ equipmentModelId }: { equipmentModelId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Add knowledge
      </Button>
      <AddKnowledgeDialog equipmentModelId={equipmentModelId} open={open} onOpenChange={setOpen} />
    </>
  );
}

function AddKnowledgeDialog({
  equipmentModelId,
  open,
  onOpenChange,
}: {
  equipmentModelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [kind, setKind] = useState<Kind>("fault");
  const [title, setTitle] = useState("");
  const [faultCode, setFaultCode] = useState("");
  const [description, setDescription] = useState("");
  const [oem, setOem] = useState("");
  const [expected, setExpected] = useState("");
  const [unit, setUnit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [similar, setSimilar] = useState<Array<{ title: string }>>([]);
  const closeTimer = useRef<number | undefined>(undefined);

  const [createFault, { isLoading: savingFault }] = useCreateKnownFaultMutation();
  const [createProcedure, { isLoading: savingProcedure }] = useCreateRepairProcedureMutation();
  const [createPart, { isLoading: savingPart }] = useCreateModelPartMutation();
  const [createTestPoint, { isLoading: savingTestPoint }] = useCreateTestPointMutation();

  const saving = savingFault || savingProcedure || savingPart || savingTestPoint;
  const requiresTitle = kind === "fault" || kind === "procedure" || kind === "part";

  function reset() {
    setTitle("");
    setFaultCode("");
    setDescription("");
    setOem("");
    setExpected("");
    setUnit("");
    setError(null);
    setSuccess(false);
    setSimilar([]);
    window.clearTimeout(closeTimer.current);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (requiresTitle && !title.trim()) return;
    setError(null);
    setSuccess(false);
    try {
      if (kind === "fault") {
        const result = await createFault({
          equipmentModelId,
          title: title.trim(),
          faultCode: faultCode.trim() || undefined,
          description: description.trim() || undefined,
          probableCauses: [],
        }).unwrap();
        setSimilar((result.similarExisting as Array<{ title: string }>) ?? []);
      } else if (kind === "procedure") {
        await createProcedure({
          equipmentModelId,
          title: title.trim(),
          description: description.trim() || undefined,
          steps: [],
          requiredTools: [],
        }).unwrap();
      } else if (kind === "part") {
        await createPart({
          equipmentModelId,
          partName: title.trim(),
          oemPartNumber: oem.trim() || undefined,
          specifications: {},
        }).unwrap();
      } else {
        await createTestPoint({
          equipmentModelId,
          component: title.trim(),
          description: description.trim() || undefined,
          expectedMin: expected.trim() || undefined,
          expectedMax: expected.trim() || undefined,
          unit: unit.trim() || undefined,
        }).unwrap();
      }
      setSuccess(true);
      closeTimer.current = window.setTimeout(close, 1600);
    } catch {
      setError("Failed to save. The server may have rejected a required value.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add knowledge to this model</DialogTitle>
          <DialogDescription>
            Add a fault, repair procedure, part, or test point. It appears on the model profile immediately.
          </DialogDescription>
        </DialogHeader>

        {kind === "fault" && (
          <div className="rounded-lg border border-blue/20 bg-blue/5 p-3 text-xs text-fg-muted">
            Faults catalog failure modes. After adding, link a repair procedure or test point so technicians can
            verify and resolve it.
          </div>
        )}

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Type</Label>
            <FormSelect
              value={kind}
              onChange={(v) => setKind(v as Kind)}
              options={KIND_OPTIONS}
            />
          </div>

          {kind !== "testpoint" && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  {kind === "part" ? "Part name" : "Title"} <span className="text-red">*</span>
                </Label>
                {kind === "fault" && (
                  <InfoTip label="About fault titles">
                    e.g. “E21 drains slowly on mid-speed spin” or “Compressor runs but never starts”.
                  </InfoTip>
                )}
              </div>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "part" ? "e.g. Drain pump motor" : "Short descriptive title"} maxLength={200} />
            </div>
          )}

          {kind === "testpoint" && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Component / label</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mains input, pin 1" maxLength={200} />
            </div>
          )}

          {kind === "fault" && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Fault code <span className="font-normal normal-case text-fg-dim">(optional)</span>
              </Label>
              <Input value={faultCode} onChange={(e) => setFaultCode(e.target.value)} placeholder="e.g. E21" maxLength={40} className="font-mono" />
            </div>
          )}

          {kind === "part" && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                OEM part number <span className="font-normal normal-case text-fg-dim">(optional)</span>
              </Label>
              <Input value={oem} onChange={(e) => setOem(e.target.value)} placeholder="e.g. DC97-16782A" maxLength={80} className="font-mono" />
            </div>
          )}

          {(kind === "fault" || kind === "procedure") && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                {kind === "procedure" ? "Steps / description" : "Description"}{" "}
                <span className="font-normal normal-case text-fg-dim">(optional)</span>
              </Label>
              <LimitedTextarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder={kind === "procedure" ? "Describe the fix. Detailed step editing can be added later." : "Symptoms, conditions, or context."}
              />
            </div>
          )}

          {kind === "testpoint" && (
            <>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Description (optional)</Label>
                <LimitedTextarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} placeholder="What to measure and how." />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Expected value</Label>
                  <Input value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="e.g. 12 – 14" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Unit</Label>
                  <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. V DC" />
                </div>
              </div>
            </>
          )}

          {similar.length > 0 && (
            <div className="rounded-lg border border-yellow/30 bg-yellow/5 p-3 text-sm">
              <Badge variant="secondary">Similar existing faults</Badge>
              <ul className="mt-2 space-y-1 text-fg-muted">
                {similar.map((s) => (
                  <li key={s.title} className="flex items-start gap-1.5">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>{s.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 rounded-lg border border-chart-2/30 bg-chart-2/10 p-3 text-sm text-chart-2" role="status">
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
              Saved. The profile will refresh automatically.
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={requiresTitle && !title.trim()}>
              <Icon kind={kind} className="size-3.5" />
              Add {KIND_OPTIONS.find((k) => k.value === kind)?.label.toLowerCase()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Icon({ kind, className }: { kind: Kind; className?: string }) {
  if (kind === "procedure") return <ListChecks className={className} aria-hidden />;
  if (kind === "part") return <Package className={className} aria-hidden />;
  if (kind === "testpoint") return <FileText className={className} aria-hidden />;
  return <TriangleAlert className={className} aria-hidden />;
}
