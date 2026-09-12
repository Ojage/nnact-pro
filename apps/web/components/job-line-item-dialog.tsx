"use client";

import { useEffect, useState } from "react";
import type { CurrencyCode } from "@nnact/shared";
import { CURRENCY_CATALOG, formatMoney } from "@nnact/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface JobLineItemDraft {
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
}

interface JobLineItemDialogProps {
  open: boolean;
  mode: "add" | "edit";
  initial?: JobLineItemDraft | null;
  submitting?: boolean;
  error?: string | null;
  currency?: CurrencyCode;
  defaultDescription?: string;
  onClose: () => void;
  onSubmit: (draft: JobLineItemDraft) => void;
}

const inputStep = (currency: CurrencyCode | undefined) =>
  CURRENCY_CATALOG[currency ?? "XAF"].minorUnits === 0 ? "1" : "0.01";

export function JobLineItemDialog({
  open,
  mode,
  initial,
  submitting = false,
  error = null,
  currency,
  defaultDescription,
  onClose,
  onSubmit,
}: JobLineItemDialogProps) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");

  useEffect(() => {
    if (!open) return;
    setDescription(initial?.description ?? "");
    setQuantity(String(initial?.quantity ?? 1));
    setPrice(initial ? (initial.unitPrice / 100).toFixed(2) : "");
    setCost(initial ? (initial.unitCost / 100).toFixed(2) : "");
  }, [open, initial, defaultDescription]);

  const step = inputStep(currency);
  const qty = Math.max(0, Math.floor(Number(quantity)));
  const priceCents = Math.max(0, Math.round((Number.parseFloat(price) || 0) * 100));
  const costCents = Math.max(0, Math.round((Number.parseFloat(cost) || 0) * 100));
  const subtotal = qty * priceCents;
  const lineCost = qty * costCents;
  const valid = description.trim().length > 0 && priceCents > 0 && qty >= 1;

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onSubmit({
      description: description.trim(),
      quantity: qty,
      unitPrice: priceCents,
      unitCost: costCents,
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <form onSubmit={submit} className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-fg">
                {mode === "edit" ? "Edit line item" : "Add line item"}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-fg-muted hover:text-fg"
                onClick={onClose}
                aria-label="Close line item dialog"
              >
                ✕
              </Button>
            </div>

            {error && (
              <p className="text-red text-xs mb-3 p-2 rounded bg-red/5">{error}</p>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="line-description" className="block text-xs font-semibold text-fg-muted mb-1.5">
                  Description *
                </label>
                <Input
                  id="line-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  autoFocus
                  placeholder={mode === "add" ? "e.g. Compressor replacement" : undefined}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="line-quantity" className="block text-xs font-semibold text-fg-muted mb-1.5">
                    Quantity *
                  </label>
                  <Input
                    id="line-quantity"
                    type="number"
                    min={1}
                    step={1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="line-price" className="block text-xs font-semibold text-fg-muted mb-1.5">
                    Unit price ({CURRENCY_CATALOG[currency ?? "XAF"].symbol}) *
                  </label>
                  <Input
                    id="line-price"
                    type="number"
                    min="0"
                    step={step}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="line-cost" className="block text-xs font-semibold text-fg-muted mb-1.5">
                  Your cost / unit (optional, for profit view)
                </label>
                <Input
                  id="line-cost"
                  type="number"
                  min="0"
                  step={step}
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
              <div className="space-y-1 rounded-lg bg-surface-200 p-3 text-xs">
                <p className="flex items-center justify-between">
                  <span className="text-fg-muted">Subtotal (billed)</span>
                  <span className="font-semibold text-fg">{formatMoney(subtotal, currency)}</span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-fg-muted">Your cost</span>
                  <span className="text-fg">{formatMoney(lineCost, currency)}</span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-fg-muted">Profit</span>
                  <span className={`font-semibold ${subtotal - lineCost >= 0 ? "text-green" : "text-red"}`}>
                    {formatMoney(subtotal - lineCost, currency)}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button type="submit" loading={submitting} disabled={!valid}>
                {mode === "edit" ? "Save changes" : "Add line"}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}