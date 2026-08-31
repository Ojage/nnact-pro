"use client";

import { useRef, useState } from "react";
import { AlertCircle, Check, FileDown, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LimitedTextarea } from "@/components/ui/limited-textarea";
import { useImportRepairBrainMutation } from "@/lib/redux/api";

const SAMPLE = `{
  "models": [
    { "manufacturer": "Samsung", "modelNumber": "WW90T754ABX", "category": "washing_machine" }
  ],
  "faults": [
    { "equipmentModelId": "<model-id>", "title": "Drain pump failure", "probableCauses": ["Blocked filter"] }
  ],
  "parts": [
    { "equipmentModelId": "<model-id>", "partName": "Drain pump", "oemPartNumber": "DC97-12345A" }
  ]
}`;

export function ImportKnowledgeButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <UploadCloud className="size-3.5" />
        Import knowledge
      </Button>
      <ImportKnowledgeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function ImportKnowledgeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ models: number; faults: number; parts: number } | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const [importData, { isLoading }] = useImportRepairBrainMutation();

  function reset() {
    setJson("");
    setError(null);
    setResult(null);
    window.clearTimeout(closeTimer.current);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setResult(null);

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(json);
    } catch {
      setError("Invalid JSON. Check the syntax and try again.");
      return;
    }

    if (!payload || Array.isArray(payload) || typeof payload !== "object") {
      setError("Payload must be an object with models/faults/parts arrays.");
      return;
    }

    try {
      const res = await importData({
        models: (payload.models as Record<string, unknown>[]) ?? [],
        faults: (payload.faults as Record<string, unknown>[]) ?? [],
        parts: (payload.parts as Record<string, unknown>[]) ?? [],
      }).unwrap();
      setResult(res.counts);
      closeTimer.current = window.setTimeout(close, 2000);
    } catch {
      setError("Import failed. Check that referenced model IDs exist.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import knowledge</DialogTitle>
          <DialogDescription>
            Bulk add models, known faults, and parts by pasting JSON. Existing models matched by manufacturer + model number.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <LimitedTextarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              rows={10}
              maxLength={50000}
              placeholder={SAMPLE}
              className="font-mono text-xs"
            />
            <p className="text-xs text-fg-muted">
              Reference valid <code className="rounded bg-surface-200 px-1">equipmentModelId</code> values in faults/parts.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </div>
          )}

          {result && (
            <div className="flex items-start gap-2 rounded-lg border border-chart-2/30 bg-chart-2/10 p-3 text-sm text-chart-2" role="status">
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
              Imported {result.models} models, {result.faults} faults, {result.parts} parts.
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" loading={isLoading} disabled={!json.trim()}>
              <FileDown className="size-3.5" />
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
