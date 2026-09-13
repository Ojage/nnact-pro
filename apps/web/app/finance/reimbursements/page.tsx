"use client";

import { useState, useMemo } from "react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { formatMoney } from "@nnact/shared";
import { useCreateReimbursementMutation, useReimbursementTransitionMutation, useReimbursementsQuery, useUploadReimbursementReceiptMutation } from "@/lib/redux/api";
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

export default function ReimbursementsPage() {
  const { data: reimbursements = [], isLoading, isError } = useReimbursementsQuery();
  const [create, { isLoading: creating }] = useCreateReimbursementMutation();
  const [transition, { isLoading: transitioning }] = useReimbursementTransitionMutation();
  const [uploadReceipt] = useUploadReimbursementReceiptMutation();

  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [fTitle, setFTitle] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fDesc, setFDesc] = useState("");

  const sorted = useMemo(() => [...reimbursements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [reimbursements]);
  const pending = reimbursements.filter((r) => r.status === "SUBMITTED").length;

  const createOne = async () => {
    setCreateError(null);
    const amt = Math.round(Number(fAmount) * 100);
    if (!fTitle.trim() || !Number.isFinite(amt) || amt <= 0) { setCreateError("Title and a valid amount are required."); return; }
    try {
      await create({
        title: fTitle.trim(),
        amountCents: amt,
        ...(fDesc.trim() ? { description: fDesc.trim() } : {}),
      }).unwrap();
      setShowCreate(false);
      setFTitle(""); setFAmount(""); setFDesc("");
    } catch (e) {
      const err = e as { data?: { error?: string } };
      setCreateError(err?.data?.error ?? "Could not create reimbursement.");
    }
  };

  if (isLoading) {
    return <div><Skeleton className="h-8 w-40 mb-2" /><Skeleton className="h-4 w-48 mb-6" /><Skeleton className="h-12 rounded-lg mb-3" /><div className="rounded-xl border border-border overflow-hidden">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-none" />)}</div></div>;
  }

  return (
    <div>
      <PageHeader
        title="Reimbursements"
        description={reimbursements.length > 0 ? `${sorted.length} total · ${pending} pending approval` : undefined}
        actions={<Button onClick={() => setShowCreate(true)} size="sm">⊕ Claim Reimbursement</Button>}
      />
      {isError && <Card className="mb-6 border-red/30 bg-red/5"><p className="text-red text-sm">We couldn't load reimbursements. Check your connection and try again.</p></Card>}

      {showCreate && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <form onSubmit={(e) => { e.preventDefault(); createOne(); }} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-fg">Claim Reimbursement</h3>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-fg-muted hover:text-fg" onClick={() => setShowCreate(false)}>✕</Button>
                </div>
                {createError && <p className="text-red text-xs mb-3 p-2 rounded bg-red/5">{createError}</p>}
                <div className="space-y-4">
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Title *</Label>
                    <Input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="e.g. Uber receipts to depot" autoFocus />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Amount *</Label>
                    <Input type="number" min="0" step="0.01" value={fAmount} onChange={(e) => setFAmount(e.target.value)} placeholder="0.00" />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Description</Label>
                    <Textarea rows={2} value={fDesc} onChange={(e) => setFDesc(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <Button type="submit" loading={creating}>Submit claim</Button>
                  <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          </div>
        </>
      )}

      {reimbursements.length === 0 && !isError ? (
        <Card><EmptyState title="No reimbursements yet" description="Claim money back for out-of-pocket job expenses." /></Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-fg">{r.number}</span>
                    <FinanceStatusBadge status={r.status} />
                  </div>
                  <p className="text-sm font-medium text-fg mt-1">{r.title}</p>
                  <p className="text-xs text-fg-dim">{r.employeeName ?? "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-semibold tabular-nums text-fg">{formatMoney(r.amountCents)}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {r.status === "SUBMITTED" && (
                  <>
                    <Button size="sm" variant="secondary" loading={transitioning} onClick={async () => { try { await transition({ id: r.id, action: "approve" }).unwrap(); } catch { /* ignore */ } }}>Approve</Button>
                    <Button size="sm" variant="ghost" loading={transitioning} onClick={async () => { try { await transition({ id: r.id, action: "reject", body: { reason: "Not approved" } }).unwrap(); } catch { /* ignore */ } }}>Reject</Button>
                  </>
                )}
                {r.status === "APPROVED" && <Button size="sm" loading={transitioning} onClick={async () => { try { await transition({ id: r.id, action: "pay" }).unwrap(); } catch { /* ignore */ } }}>Mark paid</Button>}
                <label className="text-xs text-fg-link cursor-pointer hover:text-fg inline-flex items-center gap-1">
                  {r.receiptUrls.length > 0 && <span className="text-fg-dim">({r.receiptUrls.length})</span>}
                  + receipt
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,application/pdf"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try { await uploadReceipt({ id: r.id, file }).unwrap(); } catch { /* ignore */ }
                      e.target.value = "";
                    }}
                  />
                </label>
                {r.receiptUrls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs text-fg-link hover:text-fg">receipt</a>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}