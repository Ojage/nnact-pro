"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatMoney } from "@nnact/shared";
import { useSupplierBillQuery, useBillTransitionMutation, useDeleteSupplierBillMutation, useAddBillPaymentMutation, useDeleteBillPaymentMutation } from "@/lib/redux/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/form-select";
import { FinanceStatusBadge } from "@/components/finance-badge";

export default function BillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: bill, isLoading, isError } = useSupplierBillQuery(id);
  const [transition, { isLoading: transitioning }] = useBillTransitionMutation();
  const [remove] = useDeleteSupplierBillMutation();
  const [addPayment, { isLoading: paying }] = useAddBillPaymentMutation();
  const [deletePayment] = useDeleteBillPaymentMutation();

  const [reason, setReason] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("BANK_TRANSFER");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (isLoading) return <div className="max-w-2xl"><Skeleton className="h-8 w-56 mb-2" /><Skeleton className="h-4 w-40 mb-6" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (isError || !bill) return <Card className="p-6 border-red/30 bg-red/5"><p className="text-red text-sm">We couldn't load this bill.</p></Card>;

  const b = bill;

  const doPay = async () => {
    setErrorMsg(null);
    const amt = Math.round(Number(payAmount) * 100);
    if (!Number.isFinite(amt) || amt <= 0) { setErrorMsg("Enter a valid payment amount."); return; }
    try {
      await addPayment({ id, amountCents: amt, method: payMethod as never }).unwrap();
      setPayAmount("");
    } catch (e) {
      const err = e as { data?: { error?: string } };
      setErrorMsg(err?.data?.error ?? "Payment failed.");
    }
  };

  const doTransition = async (action: "approve" | "dispute" | "void") => {
    setErrorMsg(null);
    try {
      await transition({ id, action, body: { reason: reason || undefined } }).unwrap();
      setReason("");
    } catch (e) {
      const err = e as { data?: { error?: string } };
      setErrorMsg(err?.data?.error ?? `Could not ${action} bill.`);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-fg">{b.number}</h1>
        <FinanceStatusBadge status={b.status} />
        {b.duplicate && <span className="text-xs text-chart-3 bg-chart-3/10 rounded px-2 py-0.5">possible duplicate</span>}
      </div>

      {errorMsg && <Card className="mb-4 p-3 border-red/30 bg-red/5"><p className="text-red text-xs">{errorMsg}</p></Card>}

      <Card className="p-5 space-y-3">
        <div className="flex justify-between"><span className="text-sm text-fg-muted">Supplier</span><span className="font-medium text-fg">{b.supplierName}{b.supplierReference ? ` · ${b.supplierReference}` : ""}</span></div>
        <div className="flex justify-between"><span className="text-sm text-fg-muted">Issue date</span><span className="text-fg">{b.issueDate.slice(0, 10)}</span></div>
        <div className="flex justify-between"><span className="text-sm text-fg-muted">Due date</span><span className="text-fg">{b.dueDate ? b.dueDate.slice(0, 10) : "—"}</span></div>
        {b.categoryName && <div className="flex justify-between"><span className="text-sm text-fg-muted">Category</span><span className="text-fg">{b.categoryName}</span></div>}
        {b.costCenterName && <div className="flex justify-between"><span className="text-sm text-fg-muted">Cost center</span><span className="text-fg">{b.costCenterName}</span></div>}
        {b.jobId && <div className="flex justify-between"><span className="text-sm text-fg-muted">Job</span><span className="text-fg font-mono text-xs">{b.jobNumber ?? b.jobId}</span></div>}
        {b.voidReason && <div className="text-sm text-red bg-red/5 rounded p-2"><span className="font-semibold">Voided:</span> {b.voidReason}</div>}

        <div className="border-t border-border pt-3 space-y-2">
          {b.lines.map((l) => (
            <div key={l.id} className="flex justify-between text-sm">
              <span className="text-fg">{l.description} × {l.quantity}</span>
              <span className="tabular-nums text-fg-muted">{formatMoney(l.amountCents)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm"><span className="text-fg-muted">Subtotal</span><span className="tabular-nums text-fg">{formatMoney(b.subTotalCents)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-fg-muted">Tax</span><span className="tabular-nums text-fg">{formatMoney(b.taxCents)}</span></div>
          <div className="flex justify-between font-semibold"><span className="text-fg">Total</span><span className="tabular-nums text-fg">{formatMoney(b.totalCents)}</span></div>
          <div className="flex justify-between"><span className="text-fg">Paid</span><span className="tabular-nums text-chart-2">{formatMoney(b.paidCents)}</span></div>
          <div className="flex justify-between"><span className="text-fg">Balance</span><span className={`tabular-nums ${b.balanceCents > 0 && b.status === "OVERDUE" ? "text-destructive" : "text-fg"} font-semibold`}>{formatMoney(b.balanceCents)}</span></div>
        </div>
      </Card>

      {/* Payments */}
      <Card className="p-5 mt-4">
        <h3 className="text-sm font-semibold text-fg mb-3">Payments ({b.payments.length})</h3>
        {b.payments.length === 0 ? (
          <p className="text-sm text-fg-dim mb-3">No payments yet.</p>
        ) : (
          <ul className="space-y-2 mb-4">
            {b.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-fg-muted">{p.paidAt.slice(0, 10)} · {p.method.replaceAll("_", " ")}{p.reference ? ` · ${p.reference}` : ""}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums text-fg font-medium">{formatMoney(p.amountCents)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-fg-muted hover:text-red"
                    onClick={async () => { try { await deletePayment({ id, paymentId: p.id }).unwrap(); } catch { /* ignore */ } }}
                  >✕</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {b.balanceCents > 0 && (b.status === "APPROVED" || b.status === "PARTIALLY_PAID" || b.status === "OVERDUE" || b.status === "RECEIVED" || b.status === "DRAFT") && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Payment amount</Label>
                <Input type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Method</Label>
                <FormSelect value={payMethod} onChange={setPayMethod} options={["CASH", "MTN_MOBILE_MONEY", "ORANGE_MONEY", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"].map((m) => ({ value: m, label: m.replaceAll("_", " ") }))} />
              </div>
            </div>
            <Button size="sm" loading={paying} onClick={doPay}>Record payment</Button>
          </div>
        )}
      </Card>

      {/* Transitions */}
      {(b.status === "DRAFT" || b.status === "RECEIVED" || b.status === "APPROVED" || b.status === "PARTIALLY_PAID" || b.status === "OVERDUE" || b.status === "DISPUTED") && (
        <Card className="p-5 mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {(b.status === "DRAFT" || b.status === "RECEIVED") && <Button size="sm" loading={transitioning} onClick={() => doTransition("approve")}>Approve</Button>}
            {(b.status === "DRAFT" || b.status === "RECEIVED" || b.status === "APPROVED" || b.status === "PARTIALLY_PAID") && <Button size="sm" variant="secondary" loading={transitioning} onClick={() => doTransition("dispute")}>Dispute</Button>}
            <Button size="sm" variant="secondary" loading={transitioning} onClick={() => doTransition("void")}>Void</Button>
            {(b.status === "DRAFT" || b.status === "RECEIVED") && (
              <Button size="sm" variant="secondary" onClick={async () => { try { await remove(id).unwrap(); router.push("/finance/bills"); } catch { /* ignore */ } }}>Delete</Button>
            )}
          </div>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (for dispute / void)" />
        </Card>
      )}
    </div>
  );
}