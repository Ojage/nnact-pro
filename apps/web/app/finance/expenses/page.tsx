"use client";

import { useEffect, useState, useMemo } from "react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { formatMoney, FINANCE_PAYMENT_METHODS } from "@nnact/shared";
import type { ExpenseDTO } from "@nnact/shared";
import {
  useCreateExpenseMutation,
  useExpenseTransitionMutation,
  useExpenseCategoriesQuery,
  useCostCentersQuery,
  useExpensesQuery,
  useJobsQuery,
} from "@/lib/redux/api";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { FinanceStatusBadge } from "@/components/finance-badge";

export default function ExpensesPage() {
  const { data: expenses = [], isLoading, isError } = useExpensesQuery();
  const { data: categories = [] } = useExpenseCategoriesQuery();
  const { data: costCenters = [] } = useCostCentersQuery();
  const { data: jobs = [] } = useJobsQuery();
  const [createExpense, { isLoading: createSubmitting }] = useCreateExpenseMutation();
  const [transition] = useExpenseTransitionMutation();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [fTitle, setFTitle] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fFee, setFFee] = useState("");
  const [fMethod, setFMethod] = useState("CASH");
  const [fCategory, setFCategory] = useState("");
  const [fCostCenter, setFCostCenter] = useState("");
  const [fJob, setFJob] = useState("");
  const [fSubmit, setFSubmit] = useState(true);

  useEffect(() => { setSearch(""); }, [statusFilter]);

  const handleCreate = async () => {
    setCreateError(null);
    if (!fTitle.trim() || !Number(fAmount) || Number(fAmount) < 0) {
      setCreateError("Title and a valid amount are required.");
      return;
    }
    try {
      await createExpense({
        title: fTitle.trim(),
        amountCents: Math.round(Number(fAmount) * 100),
        ...(Number(fFee) > 0 ? { momoFeeCents: Math.round(Number(fFee) * 100) } : {}),
        paymentMethod: fMethod,
        submitImmediately: fSubmit,
        ...(fCategory ? { categoryId: fCategory } : {}),
        ...(fCostCenter ? { costCenterId: fCostCenter } : {}),
        ...(fJob ? { jobId: fJob } : {}),
      }).unwrap();
      setShowCreate(false);
      setFTitle(""); setFAmount(""); setFFee(""); setFMethod("CASH"); setFCategory(""); setFCostCenter(""); setFJob("");
    } catch (e) {
      const err = e as { data?: { error?: string } };
      setCreateError(err?.data?.error ?? "Could not create expense.");
    }
  };

  const filtered = useMemo(() => {
    let list = expenses;
    if (statusFilter !== "all") list = list.filter((e) => e.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.number.toLowerCase().includes(q) ||
          (e.employeeName?.toLowerCase().includes(q) ?? false) ||
          (e.categoryName?.toLowerCase().includes(q) ?? false),
      );
    }
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [expenses, search, statusFilter]);

  const pending = expenses.filter((e) => ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(e.status)).length;

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-8 w-40 mb-2" />
        <Skeleton className="h-4 w-56 mb-6" />
        <Skeleton className="h-12 rounded-lg mb-3" />
        <div className="rounded-xl border border-border overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-none" />)}
        </div>
      </div>
    );
  }

  return (
    <div data-tour="finance-expenses">
      <PageHeader
        title="Expenses"
        description={expenses.length > 0 ? `${filtered.length} of ${expenses.length} · ${pending} awaiting action` : undefined}
        actions={<Button onClick={() => setShowCreate(true)} size="sm">⊕ Record Expense</Button>}
      />

      {isError && (
        <Card className="mb-6 border-red/30 bg-red/5">
          <p className="text-red text-sm">We couldn't load expenses. Check your connection and try again.</p>
        </Card>
      )}

      {/* Create modal */}
      {showCreate && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-lg">
              <form
                onSubmit={(e) => { e.preventDefault(); handleCreate(); }}
                className="p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-fg">Record Expense</h3>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-fg-muted hover:text-fg" onClick={() => setShowCreate(false)}>✕</Button>
                </div>

                {createError && <p className="text-red text-xs mb-3 p-2 rounded bg-red/5">{createError}</p>}

                <div className="space-y-4">
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Title *</Label>
                    <Input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="e.g. Fuel for job 102" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Amount (you'll be paid back) *</Label>
                      <Input type="number" min="0" step="0.01" value={fAmount} onChange={(e) => setFAmount(e.target.value)} placeholder="0.00" />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Mobile-money fee</Label>
                      <Input type="number" min="0" step="0.01" value={fFee} onChange={(e) => setFFee(e.target.value)} placeholder="0.00" />
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Payment method</Label>
                    <FormSelect value={fMethod} onChange={setFMethod} options={FINANCE_PAYMENT_METHODS.map((m) => ({ value: m, label: m.replaceAll("_", " ") }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Category</Label>
                      <FormSelect value={fCategory} onChange={setFCategory} allowEmpty emptyLabel="None" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Cost center</Label>
                      <FormSelect value={fCostCenter} onChange={setFCostCenter} allowEmpty emptyLabel="None" options={costCenters.map((c) => ({ value: c.id, label: `${c.name} (${c.code ?? "—"})` }))} />
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Job (optional)</Label>
                    <FormSelect value={fJob} onChange={setFJob} allowEmpty emptyLabel="No job" options={jobs.slice(0, 300).map((j) => ({ value: j.id, label: `${j.title} · ${formatMoney(j.total ?? 0)}` }))} />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-fg">
                    <input type="checkbox" checked={fSubmit} onChange={(e) => setFSubmit(e.target.checked)} className="accent-primary" />
                    Submit for approval immediately
                  </label>
                </div>

                <div className="flex gap-2 mt-6">
                  <Button type="submit" loading={createSubmitting}>Save Expense</Button>
                  <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          </div>
        </>
      )}

      {expenses.length > 0 && (
        <div className="mb-4 flex flex-col sm:flex-row gap-3">
          <Input type="search" placeholder="Search title, number, employee, category..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
          <FormSelect
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            className="sm:w-48"
            options={[
              { value: "all", label: "All statuses" },
              ...(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "PAID", "VOIDED"] as const).map((s) => ({ value: s, label: s.replaceAll("_", " ") })),
            ]}
          />
        </div>
      )}

      {expenses.length === 0 && !isError ? (
        <Card><EmptyState title="No expenses yet" description="Record the first expense — it goes to your manager for approval." /></Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-sm text-fg-muted">No expenses match your filters</TableCell></TableRow>
              ) : (
                filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      <Link href={`/finance/expenses/${e.id}`} className="hover:text-fg-link">{e.number}</Link>
                    </TableCell>
                    <TableCell className="text-fg">{e.title}</TableCell>
                    <TableCell className="text-fg-muted">{e.employeeName ?? "—"}</TableCell>
                    <TableCell className="text-fg-muted">{e.categoryName ?? "—"}</TableCell>
                    <TableCell><FinanceStatusBadge status={e.status} /></TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-fg">{formatMoney(e.amountCents)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}