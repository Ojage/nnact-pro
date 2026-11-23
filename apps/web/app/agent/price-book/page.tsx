"use client";

import { useState } from "react";
import { DEFAULT_CURRENCY, formatMoney } from "@nnact/shared";
import {
  useAddPriceBookCategoryMutation,
  useAddPriceBookItemMutation,
  useAddPriceBookObservationMutation,
  useAddPriceBookRateMutation,
  useConfirmPriceObservationMutation,
  useImportHistoricalPricesMutation,
  usePriceBookCategoriesQuery,
  usePriceBookItemsQuery,
  usePriceBookObservationsQuery,
  usePriceBookRatesQuery,
} from "@/lib/redux/api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FormSelect } from "@/components/ui/form-select";
import { EmptyState } from "@/components/empty-state";

export default function AgentPriceBookPage() {
  const { data: categories = [] } = usePriceBookCategoriesQuery();
  const { data: items = [] } = usePriceBookItemsQuery();
  const { data: observations = [] } = usePriceBookObservationsQuery();
  const { data: rates = [] } = usePriceBookRatesQuery();
  const [addCategory] = useAddPriceBookCategoryMutation();
  const [addItem] = useAddPriceBookItemMutation();
  const [addObservation] = useAddPriceBookObservationMutation();
  const [addRate] = useAddPriceBookRateMutation();
  const [confirmObservation] = useConfirmPriceObservationMutation();
  const [importHistorical, { data: report, isLoading: importing }] = useImportHistoricalPricesMutation();

  const [categoryName, setCategoryName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemCategory, setItemCategory] = useState("");
  const [observationItem, setObservationItem] = useState("");
  const [observationAmount, setObservationAmount] = useState("");
  const [shopName, setShopName] = useState("");
  const [rateKind, setRateKind] = useState("labor");
  const [rateKey, setRateKey] = useState("");
  const [rateAmount, setRateAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed");
    }
  };

  const pending = observations.filter((observation) => observation.status === "pending");

  return (
    <div>
      <PageHeader
        title="Quoting price book"
        description="Observed prices, freshness rules and owner-set rates used only for internal quote drafts."
      />
      {error && <p className="mb-4 text-sm text-red">{error}</p>}
      {message && <p className="mb-4 text-sm text-chart-2">{message}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Categories and items</CardTitle>
            <CardDescription>Freshness is set per category; imported prices are capped and never fresh.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="New category" />
              <Button
                onClick={() => void run(async () => {
                  if (!categoryName.trim()) return;
                  await addCategory({ name: categoryName.trim(), freshnessDays: 30 }).unwrap();
                  setCategoryName("");
                }, "Category added")}
              >
                Add
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
              <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Item name" />
              <FormSelect
                value={itemCategory}
                onChange={setItemCategory}
                options={[{ value: "", label: "Select category" }, ...categories.map((category) => ({ value: category.id, label: category.name }))]}
              />
              <Button
                onClick={() => void run(async () => {
                  if (!itemName.trim() || !itemCategory) return;
                  await addItem({ categoryId: itemCategory, canonicalName: itemName.trim(), unit: "piece", aliases: { en: [], fr: [] } }).unwrap();
                  setItemName("");
                }, "Item added")}
              >
                Add
              </Button>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {items.length ? items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
                  <span className="truncate text-fg">{item.canonicalName}</span>
                  <span className="shrink-0 text-xs text-fg-muted">
                    {item.range?.lowCents === null || item.range === null
                      ? "No trusted price"
                      : `${formatMoney(item.range.lowCents, DEFAULT_CURRENCY)} – ${formatMoney(item.range.highCents ?? item.range.lowCents, DEFAULT_CURRENCY)}`}
                  </span>
                </div>
              )) : <EmptyState title="No items yet" description="Add a category, then add observed items." />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Record an observed price</CardTitle>
            <CardDescription>Confirmed observations feed ranges; zero prices are ignored, never guessed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="obs-item">Item</Label>
              <FormSelect
                value={observationItem}
                onChange={setObservationItem}
                options={[{ value: "", label: "Select item" }, ...items.map((item) => ({ value: item.id, label: item.canonicalName }))]}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="obs-amount">Unit price (XAF)</Label>
                <Input id="obs-amount" type="number" min={0} value={observationAmount} onChange={(e) => setObservationAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="obs-shop">Shop</Label>
                <Input id="obs-shop" value={shopName} onChange={(e) => setShopName(e.target.value)} />
              </div>
            </div>
            <Button
              onClick={() => void run(async () => {
                if (!observationItem || Number(observationAmount) <= 0) return;
                await addObservation({
                  itemId: observationItem,
                  amountCents: Math.round(Number(observationAmount) * 100),
                  shopName: shopName || null,
                  status: "confirmed",
                }).unwrap();
                setObservationAmount("");
              }, "Observation saved")}
            >
              Save observation
            </Button>

            <div className="border-t border-border pt-3">
              <p className="text-sm font-medium text-fg">Pending receipt transcription</p>
              {pending.length ? (
                <div className="mt-2 space-y-2">
                  {pending.map((observation) => (
                    <div key={observation.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-xs">
                      <span className="truncate text-fg-muted">{observation.receiptMediaRef ? "Receipt import" : observation.id}</span>
                      <Button variant="secondary" size="sm" onClick={() => void run(() => confirmObservation(observation.id).unwrap(), "Observation confirmed")}>
                        Confirm
                      </Button>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-1 text-xs text-fg-muted">Nothing pending.</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Owner-set rates</CardTitle>
            <CardDescription>Labor, transport and diagnostic fees. Missing rates force manual pricing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-[120px_1fr_120px_auto]">
              <FormSelect
                value={rateKind}
                onChange={setRateKind}
                options={[
                  { value: "labor", label: "Labor" },
                  { value: "transport", label: "Transport" },
                  { value: "diagnostic", label: "Diagnostic" },
                ]}
              />
              <Input value={rateKey} onChange={(e) => setRateKey(e.target.value)} placeholder="Key (e.g. standard visit)" />
              <Input type="number" min={0} value={rateAmount} onChange={(e) => setRateAmount(e.target.value)} placeholder="XAF" />
              <Button
                onClick={() => void run(async () => {
                  if (!rateKey.trim() || Number(rateAmount) <= 0) return;
                  await addRate({ kind: rateKind, key: rateKey.trim(), amountCents: Math.round(Number(rateAmount) * 100) }).unwrap();
                  setRateKey("");
                  setRateAmount("");
                }, "Rate added")}
              >
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {rates.length ? rates.map((rate) => (
                <div key={rate.id} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                  <span className="text-fg">{rate.kind}: {rate.key}</span>
                  <span className="text-xs text-fg-muted">{formatMoney(rate.amountCents, DEFAULT_CURRENCY)}</span>
                </div>
              )) : <EmptyState title="No rates yet" description="Set at least a labor and diagnostic rate." />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historical import</CardTitle>
            <CardDescription>Dry-run first. Imported rows are capped at 35% confidence and never fresh.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void importHistorical({ dryRun: true })} loading={importing}>
                Dry run
              </Button>
              <Button onClick={() => void run(() => importHistorical({ dryRun: false }).unwrap(), "Historical prices imported")} loading={importing}>
                Import
              </Button>
            </div>
            {report && (
              <div className="space-y-2 text-xs text-fg-muted">
                <p>Scanned {report.scanned} · mapped {report.mapped} · unmapped {report.unmapped} ({report.unmappedShare}%)</p>
                <p>Coverage {report.coverageShare}% · zero/missing prices {report.zeroOrMissingPrice} · inserted {report.inserted}</p>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {report.samples.map((sample) => (
                    <p key={`${sample.sourceTable}-${sample.sourceId}`} className="truncate">
                      {sample.description} → {sample.suggestedName}
                    </p>
                  ))}
                </div>
                <Badge variant="secondary">Historical confidence cap: 35%</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
