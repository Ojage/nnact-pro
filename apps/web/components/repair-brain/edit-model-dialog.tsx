"use client";

import { useRef, useState } from "react";
import { AlertCircle, Check, Pencil } from "lucide-react";
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
import { usePatchRepairBrainModelMutation } from "@/lib/redux/api";
import type { EquipmentModel } from "@/lib/repair-brain-api";

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

export function EditModelButton({ model }: { model: EquipmentModel }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" />
        Edit model
      </Button>
      <EditModelDialog model={model} open={open} onOpenChange={setOpen} />
    </>
  );
}

function EditModelDialog({
  model,
  open,
  onOpenChange,
}: {
  model: EquipmentModel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [modelName, setModelName] = useState(model.modelName ?? "");
  const [category, setCategory] = useState<string>(model.category ?? "other");
  const [subcategory, setSubcategory] = useState(model.subcategory ?? "");
  const [brand, setBrand] = useState(model.brand ?? "");
  const [notes, setNotes] = useState(model.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  const [patchModel, { isLoading }] = usePatchRepairBrainModelMutation();

  function reset() {
    setModelName(model.modelName ?? "");
    setCategory(model.category ?? "other");
    setSubcategory(model.subcategory ?? "");
    setBrand(model.brand ?? "");
    setNotes(model.notes ?? "");
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
    setError(null);
    setSuccess(false);
    try {
      await patchModel({
        id: model.id,
        body: {
          modelName: modelName.trim() || undefined,
          category,
          subcategory: subcategory.trim() || undefined,
          brand: brand.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      }).unwrap();
      setSuccess(true);
      closeTimer.current = window.setTimeout(close, 1600);
    } catch {
      setError("Failed to save model.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={open ? reset : onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Edit {model.manufacturer} {model.modelNumber}
          </DialogTitle>
          <DialogDescription>Update identity fields. Manufacturer and model number stay fixed.</DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Model name</Label>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Brand</Label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Samsung" maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Subcategory</Label>
              <Input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} placeholder="e.g. Front load" maxLength={100} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Notes</Label>
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
              Model updated.
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" loading={isLoading}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
