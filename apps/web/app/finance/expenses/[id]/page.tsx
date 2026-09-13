"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { formatMoney } from "@nnact/shared";
import type { ExpenseDTO } from "@nnact/shared";
import { useRouter } from "next/navigation";
import {
  useExpenseQuery,
  useExpenseTransitionMutation,
  useDeleteExpenseMutation,
  useUploadExpenseReceiptMutation,
  useDeleteExpenseReceiptsMutation,
} from "@/lib/redux/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { FinanceStatusBadge } from "@/components/finance-badge";

export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: expense, isLoading, isError } = useExpenseQuery(id);
  const [transition, { isLoading: transitionLoading }] = useExpenseTransitionMutation();
  const [remove, { isLoading: removing }] = useDeleteExpenseMutation();
  const [uploadReceipt, { isLoading: uploading }] = useUploadExpenseReceiptMutation();
  const [deleteReceipts, { isLoading: deletingReceipts }] = useDeleteExpenseReceiptsMutation();

  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="max-w-2xl">
        <Skeleton className="h-8 w-56 mb-2" />
        <Skeleton className="h-4 w-40 mb-6" />
        <Skeleton className="h-52 rounded-xl" />
      </div>
    );
  }

  if (isError || !expense) {
    return <Card className="p-6 border-red/30 bg-red/5"><p className="text-red text-sm">We couldn't load this expense.</p></Card>;
  }

  const doTransition = async (action: "submit" | "review" | "approve" | "reject" | "pay" | "void", body?: Record<string, unknown>) => {
    setActionError(null);
    try {
      await transition({ id, action, body }).unwrap();
    } catch (e) {
      const err = e as { data?: { error?: string } };
      setActionError(err?.data?.error ?? `Could not ${action} expense.`);
    }
  };

  const f = expense;
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-fg">{f.number}</h1>
          <FinanceStatusBadge status={f.status} />
        </div>
        <p className="text-sm text-fg-dim mt-1">{f.title}</p>
      </div>

      {actionError && <Card className="mb-4 p-3 border-red/30 bg-red/5"><p className="text-red text-xs">{actionError}</p></Card>}

      <Card className="p-5 space-y-3">
        <div className="flex justify-between"><span className="text-sm text-fg-muted">Amount</span><span className="font-semibold tabular-nums text-fg">{formatMoney(f.amountCents)}</span></div>
        {f.momoFeeCents > 0 && <div className="flex justify-between"><span className="text-sm text-fg-muted">Mobile-money fee</span><span className="tabular-nums text-fg">{formatMoney(f.momoFeeCents)}</span></div>}
        <div className="flex justify-between"><span className="text-sm text-fg-muted">Payment method</span><span className="text-fg">{f.paymentMethod.replaceAll("_", " ")}</span></div>
        <div className="flex justify-between"><span className="text-sm text-fg-muted">Employee</span><span className="text-fg">{f.employeeName ?? "—"}</span></div>
        <div className="flex justify-between"><span className="text-sm text-fg-muted">Category</span><span className="text-fg">{f.categoryName ?? "—"}</span></div>
        {f.costCenterName && <div className="flex justify-between"><span className="text-sm text-fg-muted">Cost center</span><span className="text-fg">{f.costCenterName}</span></div>}
        {f.jobId && <div className="flex justify-between"><span className="text-sm text-fg-muted">Job</span><span className="text-fg font-mono text-xs">{f.jobNumber ?? f.jobId}</span></div>}
        {f.description && <div className="flex justify-between gap-4"><span className="text-sm text-fg-muted shrink-0">Notes</span><span className="text-sm text-fg text-right">{f.description}</span></div>}
        {f.rejectionReason && <div className="text-sm text-red bg-red/5 rounded p-2"><span className="font-semibold">Rejected:</span> {f.rejectionReason}</div>}
        {f.voidReason && <div className="text-sm text-red bg-red/5 rounded p-2"><span className="font-semibold">Voided:</span> {f.voidReason}</div>}
        {f.budgetWarning && f.budgetWarning.level !== "ok" && (
          <div className={`text-sm rounded p-2 ${f.budgetWarning.level === "critical" ? "bg-destructive/10 text-destructive" : "bg-chart-3/10 text-chart-3"}`}>
            Budget warning at creation: {formatMoney(f.amountCents)} pushed {f.budgetWarning.usedPercent != null ? Math.round(f.budgetWarning.usedPercent) : "—"}% of its line.
          </div>
        )}
      </Card>

      {/* Receipts */}
      <Card className="p-5 mt-4">
        <h3 className="text-sm font-semibold text-fg mb-3">Receipts ({f.receiptUrls.length})</h3>
        {f.receiptUrls.length === 0 ? (
          <p className="text-sm text-fg-dim mb-3">No receipts yet.</p>
        ) : (
          <ul className="space-y-1 mb-3">
            {f.receiptUrls.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer" className="text-xs text-fg-link hover:text-fg break-all">{url.split("/").pop()}</a>
              </li>
            ))}
          </ul>
        )}
        {f.receiptUrls.length > 0 && (
          <Button variant="secondary" size="sm" loading={deletingReceipts} onClick={async () => {
            try { await deleteReceipts(id).unwrap(); } catch { /* ignore */ }
          }}>Remove all receipts</Button>
        )}
        <div className="flex gap-2 mt-3">
          <Input
            type="file"
            accept="image/*,application/pdf"
            disabled={uploading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try { await uploadReceipt({ id, file }).unwrap(); } catch { /* ignore */ }
              e.target.value = "";
            }}
          />
        </div>
      </Card>

      {/* Actions */}
      <Card className="p-5 mt-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {f.status === "DRAFT" && (
            <>
              <Button size="sm" loading={transitionLoading} onClick={() => doTransition("submit")}>Submit for approval</Button>
              <Button size="sm" variant="secondary" loading={removing} onClick={async () => { try { await remove(id).unwrap(); router.push("/finance/expenses"); } catch { /* ignore */ } }}>Delete draft</Button>
            </>
          )}
          {f.status === "SUBMITTED" && <Button size="sm" loading={transitionLoading} onClick={() => doTransition("review")}>Start review</Button>}
          {(f.status === "SUBMITTED" || f.status === "UNDER_REVIEW") && (
            <>
              <Button size="sm" variant="secondary" loading={transitionLoading} onClick={() => doTransition("reject", { reason: reason || undefined })}>Reject</Button>
            </>
          )}
          {f.status === "SUBMITTED" && <Button size="sm" variant="secondary" loading={transitionLoading} onClick={() => doTransition("approve")}>Approve</Button>}
          {f.status === "UNDER_REVIEW" && <Button size="sm" loading={transitionLoading} onClick={() => doTransition("approve")}>Approve</Button>}
          {f.status === "APPROVED" && <Button size="sm" loading={transitionLoading} onClick={() => doTransition("pay")}>Mark paid</Button>}
          {(f.status === "APPROVED" || f.status === "SUBMITTED" || f.status === "UNDER_REVIEW") && (
            <Button size="sm" variant="secondary" loading={transitionLoading} onClick={() => doTransition("void", { reason: reason || undefined })}>Void</Button>
          )}
        </div>
        <div>
          <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Reason (for reject / void)</Label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional explanation" />
        </div>
      </Card>
    </div>
  );
}