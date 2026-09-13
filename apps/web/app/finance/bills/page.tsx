"use client";

import { useState, useMemo } from "react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { formatMoney, BILL_STATUS } from "@nnact/shared";
import {
  useAddBillPaymentMutation,
  useBillTransitionMutation,
  useCostCentersQuery,
  useCreateSupplierBillMutation,
  useExpenseCategoriesQuery,
  useJobsQuery,
  useSupplierBillsQuery,
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

type LineRow = { description: string; qty: string; price: string };

const blankLine = (): LineRow => ({ description: "", qty: "1", price: "" });

export default function BillsPage() {
  const { data: bills = [], isLoading, isError } = useSupplierBillsQuery();
  const { data: categories = [] } = useExpenseCategoriesQuery();
  const { data: costCenters = [] } = useCostCentersQuery();
  const { data: jobs = [] } = useJobsQuery();
  const [createBill, { isLoading: createSubmitting }] = useCreateSupplierBillMutation();
  const [addPayment] = useAddBillPaymentMutation();
  const [transition] = useBillTransitionMutation();

  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [fSupplier, setFSupplier] = useState("");
  const [fReference, setFReference] = useState("");
  const [fIssueDate, setFIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [fDueDate, setFDueDate] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fCostCenter, setFCostCenter] = useState("");
  const [fJob, setFJob] = useState("");
  const [lines, setLines] = useState<LineRow[]>([blankLine()]);

  // pay inline states
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("BANK_TRANSFER");
  const [payError, setPayError] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreateError(null);
    const goodLines = lines
      .map((l) => ({ description: l.description.trim(), quantity: Math.max(0, Number(l.qty) || 0), unitPriceCents: Math.round((Number(l.price) || 0) * 100) }))
      .filter((l) => l.description && l.quantity > 0 && l.unitPriceCents >= 0);
    if (!fSupplier.trim() || goodLines.length === 0) {
      setCreateError("Supplier name and at least one complete line are required.");
      return;
    }
    try {
      const res = await createBill({
        supplierName: fSupplier.trim(),
        ...(fReference ? { supplierReference: fReference.trim() } : {}),
        ...(fCategory ? { categoryId: fCategory } : {}),
        ...(fCostCenter ? { costCenterId: fCostCenter } : {}),
        ...(fJob ? { jobId: fJob } : {}),
        issueDate: new Date(fIssueDate).toISOString(),
        ...(fDueDate ? { dueDate: new Date(fDueDate).toISOString() } : {}),
        lines: goodLines,
      }).unwrap();
      if (res.duplicate) setCreateError("Heads up: a bill with the same supplier and reference already exists. The bill was still created.");
      else setCreateError(null);
      setShowCreate(false);
      setFSupplier(""); setFReference(""); setFDueDate(""); setFCategory(""); setFCostCenter(""); setFJob("");
      setLines([blankLine()]);
    } catch (e) {
      const err = e as { data?: { error?: string } };
      setCreateError(err?.data?.error ?? "Could not create bill.");
    }
  };

  const sorted = useMemo(() => [...bills].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [bills]);
  const payable = bills.reduce((a: number, b) => a + b.balanceCents, 0);

  const doPay = async (billId: string) => {
    setPayError(null);
    const amt = Math.round(Number(payAmount) * 100);
    if (!Number.isFinite(amt) || amt <= 0) { setPayError("Enter a valid payment amount."); return; }
    try {
      await addPayment({ id: billId, amountCents: amt, method: payMethod as never }).unwrap();
      setPayOpen(null); setPayAmount("");
    } catch (e) {
      const err = e as { data?: { error?: string } };
      setPayError(err?.data?.error ?? "Payment failed.");
    }
  };

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-4 w-56 mb-6" />
        <Skeleton className="h-12 rounded-lg mb-3" />
        <div className="rounded-xl border border-border overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-none" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Supplier bills"
        description={bills.length > 0 ? `${sorted.length} total · ${formatMoney(payable)} outstanding` : undefined}
        actions={<Button onClick={() => setShowCreate(true)} size="sm">⊕ Record Bill</Button>}
      />

      {isError && <Card className="mb-6 border-red/30 bg-red/5"><p className="text-red text-sm">We couldn't load bills. Check your connection and try again.</p></Card>}

      {showCreate && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-fg">Record Supplier Bill</h3>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-fg-muted hover:text-fg" onClick={() => setShowCreate(false)}>✕</Button>
                </div>
                {createError && <p className="text-red text-xs mb-3 p-2 rounded bg-red/5">{createError}</p>}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Supplier *</Label>
                      <Input value={fSupplier} onChange={(e) => setFSupplier(e.target.value)} placeholder="e.g. TotalCam Fuel" />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Supplier reference</Label>
                      <Input value={fReference} onChange={(e) => setFReference(e.target.value)} placeholder="Invoice no. on the paper" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Issue date *</Label>
                      <Input type="date" value={fIssueDate} onChange={(e) => setFIssueDate(e.target.value)} />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Due date</Label>
                      <Input type="date" value={fDueDate} onChange={(e) => setFDueDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Category</Label>
                      <FormSelect value={fCategory} onChange={setFCategory} allowEmpty emptyLabel="None" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Cost center</Label>
                      <FormSelect value={fCostCenter} onChange={setFCostCenter} allowEmpty emptyLabel="None" options={costCenters.map((c) => ({ value: c.id, label: c.name }))} />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Job</Label>
                      <FormSelect value={fJob} onChange={setFJob} allowEmpty emptyLabel="None" options={jobs.slice(0, 300).map((j) => ({ value: j.id, label: j.title }))} />
                    </div>
                  </div>

                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Lines *</Label>
                    <div className="space-y-2">
                      {lines.map((l, i) => (
                        <div key={i} className="flex gap-2">
                          <Input
                            className="flex-1"
                            placeholder="Description (e.g. 50L Diesel)"
                            value={l.description}
                            onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                          />
                          <Input
                            className="w-20"
                            type="number"
                            min="0"
                            placeholder="Qty"
                            value={l.qty}
                            onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
                          />
                          <Input
                            className="w-28"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Unit €"
                            value={l.price}
                            onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-fg-muted hover:text-red shrink-0"
                            disabled={lines.length === 1}
                            onClick={() => setLines(lines.filter((_, j) => j !== i))}
                          >✕</Button>
                        </div>
                      ))}
                    </div>
                    <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => setLines([...lines, blankLine()])}>+ Add line</Button>
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <Button type="submit" loading={createSubmitting}>Save Bill</Button>
                  <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          </div>
        </>
      )}

      {bills.length === 0 && !isError ? (
        <Card><EmptyState title="No supplier bills yet" description="Record bills you receive, then track partial payments as you clear them." /></Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs font-medium">
                    <Link href={`/finance/bills/${b.id}`} className="hover:text-fg-link">{b.number}</Link>
                  </TableCell>
                  <TableCell className="text-fg">
                    {b.supplierName}
                    {b.supplierReference && <span className="text-fg-dim text-xs block">{b.supplierReference}</span>}
                  </TableCell>
                  <TableCell className="text-fg-muted text-sm">{b.dueDate ? b.dueDate.slice(0, 10) : "—"}</TableCell>
                  <TableCell><FinanceStatusBadge status={b.status} /></TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-fg">{formatMoney(b.totalCents)}</TableCell>
                  <TableCell className={`text-right font-mono tabular-nums ${b.balanceCents > 0 && b.status === "OVERDUE" ? "text-destructive" : "text-fg"}`}>{formatMoney(b.balanceCents)}</TableCell>
                  <TableCell className="text-right">
                    {b.balanceCents > 0 && (b.status === "APPROVED" || b.status === "PARTIALLY_PAID" || b.status === "OVERDUE" || b.status === "RECEIVED" || b.status === "DRAFT") ? (
                      <Button size="sm" variant="secondary" onClick={() => { setPayOpen(b.id); setPayAmount(""); setPayError(null); }}>Pay</Button>
                    ) : (
                      <span className="text-fg-dim text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {payOpen && (() => {
        const bill = bills.find((b) => b.id === payOpen);
        if (!bill) return null;
        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setPayOpen(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <Card className="w-full max-w-sm">
                <form onSubmit={(e) => { e.preventDefault(); doPay(bill.id); }} className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-fg">Pay {bill.number}</h3>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-fg-muted hover:text-fg" onClick={() => setPayOpen(null)}>✕</Button>
                  </div>
                  {payError && <p className="text-red text-xs mb-3 p-2 rounded bg-red/5">{payError}</p>}
                  <p className="text-xs text-fg-dim mb-3">Balance due: <span className="font-medium text-fg">{formatMoney(bill.balanceCents)}</span></p>
                  <div className="space-y-3">
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Amount *</Label>
                      <Input type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" autoFocus />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Method</Label>
                      <FormSelect
                        value={payMethod}
                        onChange={setPayMethod}
                        options={["CASH", "MTN_MOBILE_MONEY", "ORANGE_MONEY", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"].map((m) => ({ value: m, label: m.replaceAll("_", " ") }))}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-6">
                    <Button type="submit">Record payment</Button>
                    <Button type="button" variant="secondary" onClick={() => setPayOpen(null)}>Cancel</Button>
                  </div>
                </form>
              </Card>
            </div>
          </>
        );
      })()}
    </div>
  );
}