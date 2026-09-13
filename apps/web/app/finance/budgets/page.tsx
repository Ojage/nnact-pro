"use client";

import { useState, useMemo } from "react";
import { formatMoney } from "@nnact/shared";
import { useBudgetsQuery, useCostCentersQuery, useCreateBudgetMutation, useExpenseCategoriesQuery, usePatchBudgetMutation, useDeleteBudgetMutation } from "@/lib/redux/api";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/ui/form-select";
import { EmptyState } from "@/components/empty-state";
import { BudgetLevelBadge } from "@/components/finance-badge";

const monthAgo = new Date();
monthAgo.setMonth(monthAgo.getMonth() - 1);
const thisMonth = () => new Date().toISOString().slice(0, 7);

type LineRow = { category: string; planned: string };
const blankLine = (): LineRow => ({ category: "", planned: "" });

export default function BudgetsPage() {
  const { data: budgets = [], isLoading, isError } = useBudgetsQuery();
  const { data: categories = [] } = useExpenseCategoriesQuery();
  const { data: costCenters = [] } = useCostCentersQuery();
  const [createBudget, { isLoading: creating }] = useCreateBudgetMutation();
  const [patchBudget] = usePatchBudgetMutation();
  const [deleteBudget] = useDeleteBudgetMutation();

  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [fPeriod, setFPeriod] = useState(thisMonth());
  const [fLabel, setFLabel] = useState("");
  const [fCostCenter, setFCostCenter] = useState("");
  const [lines, setLines] = useState<LineRow[]>([blankLine()]);

  const sorted = useMemo(() => [...budgets].sort((a, b) => b.period.localeCompare(a.period)), [budgets]);

  const createOne = async () => {
    setCreateError(null);
    const goodLines = lines
      .map((l) => ({ categoryId: l.category || null, plannedCents: Math.round((Number(l.planned) || 0) * 100) }))
      .filter((l) => l.plannedCents > 0);
    if (!fPeriod.trim() || goodLines.length === 0) { setCreateError("Period and at least one planned line are required."); return; }
    try {
      await createBudget({
        period: fPeriod.trim(),
        ...(fLabel.trim() ? { label: fLabel.trim() } : {}),
        ...(fCostCenter ? { costCenterId: fCostCenter } : {}),
        lines: goodLines,
      }).unwrap();
      setShowCreate(false);
      setFLabel(""); setFCostCenter(""); setLines([blankLine()]);
    } catch (e) {
      const err = e as { data?: { error?: string } };
      setCreateError(err?.data?.error ?? "Could not create budget.");
    }
  };

  if (isLoading) {
    return <div><Skeleton className="h-8 w-40 mb-2" /><Skeleton className="h-4 w-56 mb-6" /><Skeleton className="h-64 rounded-xl" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Budgets"
        description={budgets.length > 0 ? `${sorted.length} budgets · monthly planning vs actuals` : undefined}
        actions={<Button onClick={() => setShowCreate(true)} size="sm">⊕ Create Budget</Button>}
      />
      {isError && <Card className="mb-6 border-red/30 bg-red/5"><p className="text-red text-sm">We couldn't load budgets. Check your connection and try again.</p></Card>}

      {showCreate && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <form onSubmit={(e) => { e.preventDefault(); createOne(); }} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-fg">Create Budget</h3>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-fg-muted hover:text-fg" onClick={() => setShowCreate(false)}>✕</Button>
                </div>
                {createError && <p className="text-red text-xs mb-3 p-2 rounded bg-red/5">{createError}</p>}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Period (YYYY-MM) *</Label>
                      <Input type="month" value={fPeriod} onChange={(e) => setFPeriod(e.target.value)} />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Cost center</Label>
                      <FormSelect value={fCostCenter} onChange={setFCostCenter} allowEmpty emptyLabel="Whole company" options={costCenters.map((c) => ({ value: c.id, label: c.name }))} />
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Label (optional)</Label>
                    <Input value={fLabel} onChange={(e) => setFLabel(e.target.value)} placeholder="e.g. Q3 operations" />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Planned lines *</Label>
                    <div className="space-y-2">
                      {lines.map((l, i) => (
                        <div key={i} className="flex gap-2">
                          <FormSelect
                            className="flex-1"
                            value={l.category}
                            onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, category: v } : x)))}
                            allowEmpty
                            emptyLabel="Category (uncategorized allowed)"
                            options={categories.map((c) => ({ value: c.id, label: c.name }))}
                          />
                          <Input
                            className="w-32"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Plan €"
                            value={l.planned}
                            onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, planned: e.target.value } : x)))}
                          />
                          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-fg-muted hover:text-red shrink-0" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</Button>
                        </div>
                      ))}
                    </div>
                    <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => setLines([...lines, blankLine()])}>+ Add line</Button>
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <Button type="submit" loading={creating}>Save Budget</Button>
                  <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          </div>
        </>
      )}

      {budgets.length === 0 && !isError ? (
        <Card><EmptyState title="No budgets yet" description="Plan a monthly spend target per expense category and watch actuals against it." /></Card>
      ) : (
        <div className="space-y-4">
          {sorted.map((b) => (
            <Card key={b.id} className="p-5">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-fg">
                    {b.period}
                    {b.label ? ` · ${b.label}` : ""}
                    {b.costCenterName ? <span className="text-fg-dim font-normal"> · {b.costCenterName}</span> : null}
                  </h3>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums text-fg">{formatMoney(b.totalPlannedCents)}</div>
                    <div className="text-xs text-fg-dim tabular-nums">{formatMoney(b.totalActualCents)} actual · {Math.round(b.totalUsedPercent)}% used</div>
                  </div>
                  <BudgetLevelBadge level={b.lines.every((l) => l.level === "ok") ? "ok" : b.lines.some((l) => l.level === "critical") ? "critical" : "warning"} />
                  <Button variant="ghost" size="sm" className="text-fg-muted hover:text-red"
                    onClick={async () => { if (confirm(`Delete budget for ${b.period}?`)) { try { await deleteBudget(b.id).unwrap(); } catch { /* ignore */ } } }}>
                    ✕
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {b.lines.map((l) => (
                  <div key={l.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-fg">{l.categoryName ?? "Uncategorized"}</span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums text-fg-muted">
                          {formatMoney(l.actualCents)} <span className="text-fg-dim">/ {formatMoney(l.plannedCents)}</span>
                        </span>
                        {l.level === "critical" ? <span className="text-destructive text-xs font-semibold">{Math.round(l.usedPercent)}%</span>
                          : l.level === "warning" ? <span className="text-chart-3 text-xs font-semibold">{Math.round(l.usedPercent)}%</span>
                          : <span className="text-fg-dim text-xs">{Math.round(l.usedPercent)}%</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${l.level === "critical" ? "bg-destructive" : l.level === "warning" ? "bg-chart-3" : "bg-chart-2"}`} style={{ width: `${Math.min(100, l.usedPercent)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}