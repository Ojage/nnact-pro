"use client";

import { useState, useMemo } from "react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { formatMoney } from "@nnact/shared";
import { useAdvanceTransitionMutation, useCashAdvancesQuery, useCreateCashAdvanceMutation, usePatchCashAdvanceMutation, useSettleAdvanceMutation } from "@/lib/redux/api";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { FinanceStatusBadge } from "@/components/finance-badge";

export default function AdvancesPage() {
  const { data: advances = [], isLoading, isError } = useCashAdvancesQuery();
  const [createAdvance, { isLoading: creating }] = useCreateCashAdvanceMutation();
  const [patchAdvance] = usePatchCashAdvanceMutation();
  const [transition, { isLoading: transitioning }] = useAdvanceTransitionMutation();
  const [settle, { isLoading: settling }] = useSettleAdvanceMutation();

  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [fAmount, setFAmount] = useState("");
  const [fReason, setFReason] = useState("");
  const [fDue, setFDue] = useState("");

  const [settleOpen, setSettleOpen] = useState<string | null>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleNote, setSettleNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const sorted = useMemo(() => [...advances].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [advances]);
  const outstanding = advances.reduce((a, x) => a + x.outstandingCents, 0);

  const createOne = async () => {
    setCreateError(null);
    const amt = Math.round(Number(fAmount) * 100);
    if (!Number.isFinite(amt) || amt <= 0) { setCreateError("Enter a valid amount."); return; }
    try {
      await createAdvance({
        amountCents: amt,
        ...(fReason.trim() ? { reason: fReason.trim() } : {}),
        ...(fDue ? { settlementDueAt: new Date(fDue).toISOString() } : {}),
      }).unwrap();
      setShowCreate(false);
      setFAmount(""); setFReason(""); setFDue("");
    } catch (e) {
      const err = e as { data?: { error?: string } };
      setCreateError(err?.data?.error ?? "Could not request advance.");
    }
  };

  const doSettle = async () => {
    if (!settleOpen) return;
    setActionError(null);
    const amt = Math.round(Number(settleAmount) * 100);
    if (!Number.isFinite(amt) || amt < 0) { setActionError("Enter a valid settled amount."); return; }
    try {
      await settle({ id: settleOpen, settledCents: amt, description: settleNote.trim() || null }).unwrap();
      setSettleOpen(null); setSettleAmount(""); setSettleNote("");
    } catch (e) {
      const err = e as { data?: { error?: string } };
      setActionError(err?.data?.error ?? "Could not settle advance.");
    }
  };

  if (isLoading) {
    return <div><Skeleton className="h-8 w-40 mb-2" /><Skeleton className="h-4 w-56 mb-6" /><Skeleton className="h-12 rounded-lg mb-3" /><div className="rounded-xl border border-border overflow-hidden">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-none" />)}</div></div>;
  }

  return (
    <div>
      <PageHeader
        title="Cash advances"
        description={advances.length > 0 ? `${sorted.length} total · ${formatMoney(outstanding)} outstanding` : undefined}
        actions={<Button onClick={() => setShowCreate(true)} size="sm">⊕ Request Advance</Button>}
      />
      {isError && <Card className="mb-6 border-red/30 bg-red/5"><p className="text-red text-sm">We couldn't load advances. Check your connection and try again.</p></Card>}

      {actionError && settleOpen && <Card className="mb-4 p-3 border-red/30 bg-red/5"><p className="text-red text-xs">{actionError}</p></Card>}

      {showCreate && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <form onSubmit={(e) => { e.preventDefault(); createOne(); }} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-fg">Request Cash Advance</h3>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-fg-muted hover:text-fg" onClick={() => setShowCreate(false)}>✕</Button>
                </div>
                {createError && <p className="text-red text-xs mb-3 p-2 rounded bg-red/5">{createError}</p>}
                <div className="space-y-4">
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Amount *</Label>
                    <Input type="number" min="0" step="0.01" value={fAmount} onChange={(e) => setFAmount(e.target.value)} placeholder="0.00" autoFocus />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Reason</Label>
                    <Textarea rows={2} value={fReason} onChange={(e) => setFReason(e.target.value)} placeholder="What's the advance for?" />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Settlement due date</Label>
                    <Input type="date" value={fDue} onChange={(e) => setFDue(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <Button type="submit" loading={creating}>Submit request</Button>
                  <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          </div>
        </>
      )}

      {settleOpen && (() => {
        const a = advances.find((x) => x.id === settleOpen);
        if (!a) return null;
        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setSettleOpen(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <Card className="w-full max-w-sm">
                <form onSubmit={(e) => { e.preventDefault(); doSettle(); }} className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-fg">Settle {a.number}</h3>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-fg-muted hover:text-fg" onClick={() => setSettleOpen(null)}>✕</Button>
                  </div>
                  {actionError && <p className="text-red text-xs mb-3 p-2 rounded bg-red/5">{actionError}</p>}
                  <p className="text-xs text-fg-dim mb-3">Outstanding: <span className="font-medium text-fg">{formatMoney(a.outstandingCents)}</span></p>
                  <div className="space-y-3">
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Amount settled *</Label>
                      <Input type="number" min="0" step="0.01" value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} placeholder="0.00" autoFocus />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Note (optional)</Label>
                      <Textarea rows={2} value={settleNote} onChange={(e) => setSettleNote(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-6">
                    <Button type="submit" loading={settling}>Record settlement</Button>
                    <Button type="button" variant="secondary" onClick={() => setSettleOpen(null)}>Cancel</Button>
                  </div>
                </form>
              </Card>
            </div>
          </>
        );
      })()}

      {advances.length === 0 && !isError ? (
        <Card><EmptyState title="No advances yet" description="Request an advance before spending on a job, then settle it against receipts." /></Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs font-medium">{a.number}</TableCell>
                  <TableCell className="text-fg-muted">{a.employeeName ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-fg">{formatMoney(a.amountCents)}</TableCell>
                  <TableCell className={`text-right font-mono tabular-nums ${a.outstandingCents > 0 && a.status === "OVERDUE" ? "text-destructive" : "text-fg"}`}>{formatMoney(a.outstandingCents)}</TableCell>
                  <TableCell className="text-fg-muted text-sm">{a.settlementDueAt ? a.settlementDueAt.slice(0, 10) : "—"}</TableCell>
                  <TableCell><FinanceStatusBadge status={a.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1 flex-wrap">
                      {a.status === "REQUESTED" && <Button size="sm" variant="secondary" loading={transitioning} onClick={async () => { try { await transition({ id: a.id, action: "approve" }).unwrap(); } catch { /* ignore */ } }}>Approve</Button>}
                      {a.status === "APPROVED" && <Button size="sm" variant="secondary" loading={transitioning} onClick={async () => { try { await transition({ id: a.id, action: "disburse" }).unwrap(); } catch { /* ignore */ } }}>Disburse</Button>}
                      {a.status === "REQUESTED" && <Button size="sm" variant="ghost" loading={transitioning} onClick={async () => { try { await transition({ id: a.id, action: "cancel" }).unwrap(); } catch { /* ignore */ } }}>Cancel</Button>}
                      {(a.status === "DISBURSED" || a.status === "PARTIALLY_SETTLED" || a.status === "OVERDUE") && (
                        <Button size="sm" loading={settling} onClick={() => { setSettleOpen(a.id); setSettleAmount(""); setSettleNote(""); setActionError(null); }}>Settle</Button>
                      )}
                      {a.status === "REQUESTED" && (
                        <Button size="sm" variant="ghost" onClick={async () => { try { await patchAdvance({ id: a.id, data: { amountCents: Math.round(Number(prompt("New amount:") || 0) * 100) } }).unwrap(); } catch { /* ignore */ } }}>✎</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}