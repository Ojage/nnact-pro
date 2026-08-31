"use client";

import { useRef, useState } from "react";
import { AlertCircle, Check, Plus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LimitedTextarea } from "@/components/ui/limited-textarea";
import { useCreateRepairBrainModelMutation } from "@/lib/redux/api";

const CATEGORIES = [
  "washing_machine",
  "dryer",
  "dishwasher",
  "refrigerator",
  "freezer",
  "range",
  "oven",
  "cooktop",
  "microwave",
  "washer_dryer_combo",
  "hvac",
  "other",
];

export function CreateModelButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Add model
      </Button>
      <CreateModelDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function CreateModelDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [manufacturer, setManufacturer] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [modelName, setModelName] = useState("");
  const [category, setCategory] = useState<string>("washing_machine");
  const [subcategory, setSubcategory] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  const [createModel, { isLoading }] = useCreateRepairBrainModelMutation();

  function reset() {
    setManufacturer("");
    setModelNumber("");
    setModelName("");
    setCategory("washing_machine");
    setSubcategory("");
    setNotes("");
    setError(null);
    setSuccess(false);
    window.clearTimeout(closeTimer.current);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manufacturer.trim() || !modelNumber.trim()) return;
    setError(null);
    setSuccess(false);
    try {
      await createModel({
        manufacturer: manufacturer.trim(),
        modelNumber: modelNumber.trim(),
        modelName: modelName.trim() || undefined,
        category,
        subcategory: subcategory.trim() || undefined,
        notes: notes.trim() || undefined,
        specifications: {},
      }).unwrap();
      setSuccess(true);
      closeTimer.current = window.setTimeout(close, 1600);
    } catch {
      setError("Failed to create model. It may already exist.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add equipment model</DialogTitle>
          <DialogDescription>
            Catalogue a new product identity. You can add faults, procedures, and parts from its profile afterward.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Manufacturer <span className="text-red">*</span>
              </Label>
              <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="e.g. Samsung" maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Model number <span className="text-red">*</span>
              </Label>
              <Input value={modelNumber} onChange={(e) => setModelNumber(e.target.value)} placeholder="e.g. WW90T754ABX" maxLength={100} className="font-mono" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Model name <span className="font-normal normal-case text-fg-dim">(optional)</span>
              </Label>
              <Input value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="e.g. AddWash 9kg" maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Category</Label>
              <FormSelect
                value={category}
                onChange={setCategory}
                options={CATEGORIES.map((c) => ({ value: c, label: c.replaceAll("_", " ") }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Subcategory <span className="font-normal normal-case text-fg-dim">(optional)</span>
            </Label>
            <Input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} placeholder="e.g. Front load" maxLength={100} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Notes <span className="font-normal normal-case text-fg-dim">(optional)</span>
            </Label>
            <LimitedTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} placeholder="Specs, quirks, or context." />
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
              Model created.
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" loading={isLoading} disabled={!manufacturer.trim() || !modelNumber.trim()}>
              Create model
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
