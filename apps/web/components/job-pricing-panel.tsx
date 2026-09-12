"use client";

import { useEffect, useMemo, useState } from "react";
import type { CurrencyCode, JobDTO } from "@nnact/shared";
import { CURRENCY_CATALOG, formatMoney, isCurrencyCode } from "@nnact/shared";
import { api } from "@/lib/api";
import {
  useAddJobLineItemMutation,
  useCreateInvoiceMutation,
  useDeleteJobLineItemMutation,
  useInvoiceQuery,
  useInvoicesQuery,
  useJobLineItemsQuery,
  useOrgQuery,
  usePatchJobMutation,
  useRecordPaymentMutation,
  useUpdateJobLineItemMutation,
} from "@/lib/redux/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/form-select";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { JobLineItemDialog, type JobLineItemDraft } from "@/components/job-line-item-dialog";

interface JobPricingPanelProps {
  job: JobDTO;
}

type LineModal = { mode: "add"; description?: string } | { mode: "edit"; lineId: string; draft: JobLineItemDraft } | null;

const moneyStep = (currency: CurrencyCode) =>
  CURRENCY_CATALOG[currency].minorUnits === 0 ? "1" : "0.01";

export function JobPricingPanel({ job }: JobPricingPanelProps) {
  const { data: org } = useOrgQuery();
  const currency: CurrencyCode = isCurrencyCode(org?.businessSettings?.currency)
    ? org!.businessSettings!.currency
    : "XAF";
  const step = moneyStep(currency);
  const minorUnits = CURRENCY_CATALOG[currency].minorUnits;

  const { data: lineItems = [] } = useJobLineItemsQuery(job.id);
  const { data: invoices = [] } = useInvoicesQuery();
  const activeInvoice = invoices.find((inv) => inv.jobId === job.id && inv.status !== "void");
  const { data: invoice } = useInvoiceQuery(activeInvoice?.id ?? "", { skip: !activeInvoice?.id });

  const [addLine, addState] = useAddJobLineItemMutation();
  const [updateLine, updateState] = useUpdateJobLineItemMutation();
  const [deleteLine, deleteState] = useDeleteJobLineItemMutation();
  const [patchJob] = usePatchJobMutation();
  const [createInvoice, createState] = useCreateInvoiceMutation();
  const [recordPayment, payState] = useRecordPaymentMutation();

  const [lineModal, setLineModal] = useState<LineModal>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const laborCents = job.laborCostCents ?? 0;
  const [laborInput, setLaborInput] = useState(String(laborCents / 100));
  useEffect(() => {
    setLaborInput(String((job.laborCostCents ?? 0) / 100));
  }, [job.laborCostCents]);

  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("manual");
  const [payError, setPayError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // ── Money math (all stored as integer cents) ──
  const subtotal = lineItems.reduce((sum, l) => sum + Math.round(l.quantity * l.unitPrice), 0);
  const materialsCost = lineItems.reduce((sum, l) => sum + Math.round(l.quantity * (l.unitCost ?? 0)), 0);
  const cost = materialsCost + laborCents;
  const margin = subtotal - cost;

  const totalPaid = invoice ? invoice.payments.reduce((sum, p) => sum + p.amount, 0) : 0;
  const remaining = invoice ? invoice.total - totalPaid : 0;

  const paymentSettings = org?.businessSettings?.payments;
  const allowPartialPayments = paymentSettings?.allowPartialPayments !== false;
  const acceptedMethods = useMemo(() => {
    const methods: { value: string; label: string }[] = [{ value: "manual", label: "Manual" }];
    if (paymentSettings?.allowManualCash !== false) methods.push({ value: "cash", label: "Cash" });
    if (paymentSettings?.allowManualCheck !== false) methods.push({ value: "check", label: "Check" });
    if (paymentSettings?.allowManualCard !== false) methods.push({ value: "card", label: "Card" });
    return methods;
  }, [paymentSettings]);

  const lineSubmitting = addState.isLoading || updateState.isLoading;

  async function handleLineSubmit(draft: JobLineItemDraft) {
    setError(null);
    try {
      if (lineModal?.mode === "edit") {
        await updateLine({ id: lineModal.lineId, body: draft }).unwrap();
      } else {
        await addLine({ jobId: job.id, body: draft }).unwrap();
      }
      setLineModal(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function handleDeleteLine(lineId: string) {
    setError(null);
    try {
      await deleteLine({ id: lineId, jobId: job.id }).unwrap();
      setConfirmingDeleteId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function persistLabor() {
    const cents = Math.round((Number.parseFloat(laborInput) || 0) * 100);
    if (cents >= 0 && cents !== laborCents) {
      patchJob({ id: job.id, data: { laborCostCents: cents } });
    }
  }

  async function handleCreateInvoice() {
    if (subtotal <= 0) {
      setError("Add at least one billable line item before creating an invoice.");
      return;
    }
    setError(null);
    try {
      await createInvoice({ jobId: job.id }).unwrap();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function downloadPdf() {
    if (!invoice) return;
    setError(null);
    setDownloadingPdf(true);
    try {
      const { blob, filename } = await api.invoicePdf(invoice.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to download the PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }

  function openPayment() {
    setPayAmount(String(Math.max(0, remaining / 100)));
    setPayMethod("manual");
    setPayError(null);
    setPayOpen(true);
  }

  async function handlePaySubmit() {
    if (!invoice) return;
    const cents = Math.round((Number.parseFloat(payAmount) || 0) * 100);
    if (!(cents > 0)) {
      setPayError("Enter an amount greater than 0.");
      return;
    }
    if (cents > remaining) {
      setPayError(`Amount cannot exceed the remaining balance of ${formatMoney(remaining, currency)}.`);
      return;
    }
    setPayError(null);
    try {
      await recordPayment({ id: invoice.id, amount: cents, method: payMethod }).unwrap();
      setPayOpen(false);
    } catch (caught) {
      setPayError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function markFullyPaid() {
    if (!invoice || remaining <= 0) return;
    setError(null);
    try {
      await recordPayment({ id: invoice.id, amount: remaining, method: "manual" }).unwrap();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-1.5">
            Pricing &amp; payment
            <InfoTip label="About pricing & payment" side="right">
              Parts and labor roll into the job total, then become the invoice. Record the advance the customer paid here — the remaining balance is calculated for you.
            </InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div role="alert" className="mb-4 rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red">
              {error}
            </div>
          )}

          {lineItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-sm text-fg-muted">Nothing priced yet — the bill starts at 0.</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={() => setLineModal({ mode: "add" })}>
                  Add line item
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setLineModal({ mode: "add", description: `Service — ${job.title}` })}
                >
                  Quick price
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  Billable items ({lineItems.length})
                </p>
                <Button size="sm" variant="secondary" onClick={() => setLineModal({ mode: "add" })}>
                  Add line item
                </Button>
              </div>
              <div className="space-y-2">
                {lineItems.map((item) => (
                  <div key={item.id} className="rounded-lg bg-surface-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-fg">{item.description}</p>
                        <p className="mt-0.5 text-xs text-fg-dim">
                          {item.quantity} × {formatMoney(item.unitPrice, currency)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-fg">
                        {formatMoney(Math.round(item.quantity * item.unitPrice), currency)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-end gap-2">
                      {confirmingDeleteId === item.id ? (
                        <>
                          <span className="text-xs text-fg-dim">Remove?</span>
                          <Button
                            size="sm"
                            variant="destructive"
                            loading={deleteState.isLoading}
                            onClick={() => handleDeleteLine(item.id)}
                          >
                            Remove
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setConfirmingDeleteId(null)}>
                            Keep
                          </Button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="text-xs font-semibold text-fg-link hover:underline"
                            onClick={() =>
                              setLineModal({
                                mode: "edit",
                                lineId: item.id,
                                draft: {
                                  description: item.description,
                                  quantity: item.quantity,
                                  unitPrice: item.unitPrice,
                                  unitCost: item.unitCost ?? 0,
                                },
                              })
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-xs font-semibold text-red hover:underline"
                            onClick={() => setConfirmingDeleteId(item.id)}
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="job-labor-cost" className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Labor cost (not billed)
                <InfoTip label="About labor cost" side="right">
                  The technician&apos;s time for the whole job. Kept separate so it never inflates what the customer pays — it only shows your profit margin.
                </InfoTip>
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-sm text-fg-dim">{CURRENCY_CATALOG[currency].symbol}</span>
                <Input
                  id="job-labor-cost"
                  type="number"
                  min="0"
                  step={step}
                  value={laborInput}
                  onChange={(e) => setLaborInput(e.target.value)}
                  onBlur={persistLabor}
                  inputMode="decimal"
                />
              </div>
            </div>

            <div className="space-y-1 rounded-lg border border-accent/20 bg-accent/5 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-fg-muted">Job total (billed)</span>
                <span className="font-bold text-fg">{formatMoney(subtotal, currency)}</span>
              </div>
              {invoice ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-fg-muted">Invoice total (after tax &amp; discounts)</span>
                    <span className="font-bold text-fg">{formatMoney(invoice.total, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-fg-muted">Paid (advance + payments)</span>
                    <span className="font-semibold text-green">{formatMoney(totalPaid, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border/60 pt-1">
                    <span className="text-fg-muted">Balance left</span>
                    <span className={`font-bold ${remaining > 0 ? "text-yellow" : "text-green"}`}>
                      {remaining > 0 ? `${formatMoney(remaining, currency)}` : formatMoney(0, currency)}
                      {remaining < 0 ? ` (overpaid ${formatMoney(-remaining, currency)})` : remaining === 0 ? " — paid in full" : ""}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-fg-muted">
                    Margin
                    <InfoTip label="About margin" side="right">
                      Job total minus your materials and labor. Shows where you stand before invoicing.
                    </InfoTip>
                  </span>
                  <span className={`font-semibold ${margin >= 0 ? "text-green" : "text-red"}`}>
                    {formatMoney(margin, currency)}
                  </span>
                </div>
              )}
              {(materialsCost > 0 || laborCents > 0) && !invoice && (
                <p className="text-xs text-fg-dim">
                  Materials {formatMoney(materialsCost, currency)} · Labor {formatMoney(laborCents, currency)} ·{" "}
                  {margin >= 0 ? "Profit" : "Loss"} {formatMoney(margin, currency)}
                </p>
              )}
            </div>

            {!invoice ? (
              <Button
                className="w-full"
                onClick={handleCreateInvoice}
                loading={createState.isLoading}
                disabled={subtotal <= 0}
              >
                {subtotal <= 0 ? "Add a priced item to create the invoice" : "Create invoice"}
              </Button>
            ) : (
              <div className="space-y-2">
                <Link href={`/invoices/${invoice.id}`} className="block">
                  <div className="flex items-center justify-between rounded-lg border border-border bg-surface-200 px-3 py-2">
                    <span className="text-sm font-semibold text-fg-link">Invoice {invoice.number}</span>
                    <InvoiceStatusBadge status={invoice.status} />
                  </div>
                </Link>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={openPayment} loading={payState.isLoading}>
                    {remaining > 0 ? "Record advance / payment" : "Payments"}
                  </Button>
                  {remaining > 0 && (
                    <Button variant="secondary" onClick={markFullyPaid} loading={payState.isLoading}>
                      Mark fully paid
                    </Button>
                  )}
                  <Button variant="secondary" onClick={downloadPdf} loading={downloadingPdf}>
                    Download PDF
                  </Button>
                  <Button asChild>
                    <Link href={`/invoices/${invoice.id}`}>Open invoice</Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <JobLineItemDialog
        open={lineModal !== null}
        mode={lineModal?.mode === "edit" ? "edit" : "add"}
        initial={lineModal?.mode === "edit" ? lineModal.draft : null}
        defaultDescription={lineModal?.mode === "add" ? lineModal.description : undefined}
        submitting={lineSubmitting}
        error={error}
        currency={currency}
        onClose={() => setLineModal(null)}
        onSubmit={handleLineSubmit}
      />

      {payOpen && invoice && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setPayOpen(false)} />
      )}
      {payOpen && invoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handlePaySubmit();
              }}
              className="p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-fg">Record payment</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-fg-muted hover:text-fg"
                  onClick={() => setPayOpen(false)}
                  aria-label="Close payment dialog"
                >
                  ✕
                </Button>
              </div>

              {payError && (
                <p className="text-red text-xs mb-3 p-2 rounded bg-red/5" role="alert">
                  {payError}
                </p>
              )}

              <p className="mb-4 text-xs text-fg-muted">
                {invoice.number} · {formatMoney(invoice.total, currency)} total ·{" "}
                {formatMoney(remaining, currency)} remaining
              </p>

              <div className="space-y-4">
                <div>
                  <label htmlFor="pay-amount" className="block text-xs font-semibold text-fg-muted mb-1.5">
                    Amount ({CURRENCY_CATALOG[currency].symbol}) *
                  </label>
                  <Input
                    id="pay-amount"
                    type="number"
                    min="0"
                    step={step}
                    max={allowPartialPayments ? remaining / 100 : undefined}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    disabled={!allowPartialPayments}
                    inputMode="decimal"
                    autoFocus
                  />
                  {!allowPartialPayments && (
                    <p className="mt-1 text-xs text-fg-muted">
                      Partial payments are disabled — the full balance will be recorded.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="pay-method" className="block text-xs font-semibold text-fg-muted mb-1.5">
                    Method
                  </label>
                  <FormSelect
                    id="pay-method"
                    value={payMethod}
                    onChange={setPayMethod}
                    options={acceptedMethods}
                    ariaLabel="Payment method"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <Button type="submit" loading={payState.isLoading} disabled={!payAmount}>
                  Record payment
                </Button>
                <Button type="button" variant="secondary" onClick={() => setPayOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}