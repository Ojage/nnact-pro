"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useLogJobPurchaseMutation } from "@/lib/redux/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PurchaseLine {
  name: string;
  quantity: number;
  amount: string;
}

export function JobPurchaseLog({ jobId }: { jobId: string }) {
  const [logPurchase, { isLoading }] = useLogJobPurchaseMutation();
  const [shopName, setShopName] = useState("");
  const [area, setArea] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [lines, setLines] = useState<PurchaseLine[]>([{ name: "", quantity: 1, amount: "" }]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (index: number, patch: Partial<PurchaseLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const submit = async () => {
    setError(null);
    setMessage(null);
    const cleaned = lines
      .filter((line) => line.name.trim() && Number(line.amount) > 0)
      .map((line) => ({
        name: line.name.trim(),
        quantity: line.quantity,
        amountCents: Math.round(Number(line.amount) * 100),
      }));
    if (!cleaned.length && !receipt) {
      setError("Add at least one priced line or a receipt photo.");
      return;
    }
    const form = new FormData();
    form.set("jobId", jobId);
    form.set("shopName", shopName);
    form.set("area", area);
    form.set("lines", JSON.stringify(cleaned));
    if (receipt) form.set("receipt", receipt);
    try {
      const result = await logPurchase(form).unwrap();
      setLines([{ name: "", quantity: 1, amount: "" }]);
      setReceipt(null);
      setMessage(
        result.extracted
          ? `Saved ${result.observationIds.length} observation(s); ${result.extracted.lines} transcribed from receipt.`
          : `Saved ${result.observationIds.length} observation(s).`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this purchase");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Purchase log</CardTitle>
        <CardDescription>
          Record part prices for the quoting agent. Receipt photos are staff-only; unclear prices stay pending review.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="purchase-shop">Shop</Label>
            <Input id="purchase-shop" value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Supplier name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="purchase-area">Area</Label>
            <Input id="purchase-area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Town or district" />
          </div>
        </div>

        <div className="space-y-2">
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-[1fr_70px_110px_auto] gap-2">
              <Input
                value={line.name}
                onChange={(e) => update(index, { name: e.target.value })}
                placeholder="Part or material"
                aria-label={`Line ${index + 1} name`}
              />
              <Input
                type="number"
                min={1}
                value={line.quantity}
                onChange={(e) => update(index, { quantity: Number(e.target.value) })}
                aria-label={`Line ${index + 1} quantity`}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={line.amount}
                onChange={(e) => update(index, { amount: e.target.value })}
                placeholder="Unit price"
                aria-label={`Line ${index + 1} unit price`}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                aria-label={`Remove line ${index + 1}`}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={() => setLines((prev) => [...prev, { name: "", quantity: 1, amount: "" }])}>
            <Plus aria-hidden /> Add line
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="purchase-receipt">Receipt photo (optional)</Label>
          <Input
            id="purchase-receipt"
            type="file"
            accept="image/*"
            onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
          />
        </div>

        {error && <p className="text-sm text-red">{error}</p>}
        {message && <p className="text-sm text-chart-2">{message}</p>}

        <Button onClick={() => void submit()} loading={isLoading}>
          Save purchase prices
        </Button>
      </CardContent>
    </Card>
  );
}
