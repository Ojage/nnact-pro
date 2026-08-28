"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatMoney } from "@nnact/shared";
import { api, type BusinessSettingsDTO, type EstimateOption } from "@/lib/api";
import {
  useAddEstimateOptionLineMutation,
  useCopyApprovedEstimateToJobMutation,
  useDeleteEstimateOptionLineMutation,
  useEstimateQuery,
  useMarkEstimateSentMutation,
  useOrgQuery,
  usePatchEstimateOptionLineMutation,
  useSetEstimateOptionDiscountMutation,
} from "@/lib/redux/api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSendDialog } from "@/components/message-send-dialog";
import { emitWalkthroughDone } from "@/lib/walkthroughs/events";
import { ADVANCE_TAG } from "@nnact/shared";

export default function EstimateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: estimate, isLoading: loading, refetch } = useEstimateQuery(id, { skip: !id });
  const { data: org } = useOrgQuery();

  const [activeId, setActiveId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");

  const [markEstimateSent, markSentState] = useMarkEstimateSentMutation();
  const [copyApproved, copyState] = useCopyApprovedEstimateToJobMutation();
  const [addLine, addState] = useAddEstimateOptionLineMutation();
  const busy = markSentState.isLoading || copyState.isLoading || addState.isLoading;

  const discounts = org?.businessSettings?.taxes?.discounts ?? [];
  const discountsEnabled = org?.businessSettings?.taxes?.discountsEnabled ?? true;

  useEffect(() => {
    if (!activeId && estimate?.options[0]?.id) setActiveId(estimate.options[0].id);
  }, [activeId, estimate]);

  const active = estimate?.options.find((option) => option.id === activeId) ?? estimate?.options[0];
  const editable = estimate?.status === "draft" || estimate?.status === "sent";

  async function downloadPdf() {
    setDownloadingPdf(true);
    setError(null);
    try {
      const { blob, filename } = await api.estimatePdf(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to download the PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }

  if (loading) return <div className="grid gap-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-96 rounded-xl" /></div>;
  if (!estimate) return <Card><div className="grid justify-items-center gap-3 py-10"><p className="text-sm text-red">{error ?? "Estimate not found"}</p><Button onClick={() => void refetch()}>Retry</Button></div></Card>;

  return (
    <div>
      <PageHeader
        title={estimate.number}
        description={`${estimate.status} · ${estimate.options.length} options`}
        actions={<div className="flex flex-wrap gap-2">
          <Link href={`/estimates/${id}/preview`}><Button size="sm" variant="secondary">Preview</Button></Link>
          <Button size="sm" variant="secondary" loading={downloadingPdf} onClick={() => void downloadPdf()}>Download PDF</Button>
          <Button size="sm" variant="secondary" onClick={() => setEmailOpen(true)}>Email estimate</Button>
          {estimate.status === "draft" ? <Button size="sm" variant="secondary" loading={markSentState.isLoading} data-tour="estimates-send" onClick={() => {
            void markEstimateSent(id)
              .unwrap()
              .then(() => emitWalkthroughDone(ADVANCE_TAG.estimateSent))
              .catch(() => setError("The estimate could not be marked sent"));
          }}>Mark sent</Button> : null}
          {estimate.status === "approved" ? <Button size="sm" loading={copyState.isLoading} disabled={Boolean(estimate.copiedToJobAt)} onClick={() => {
            void copyApproved(id)
              .unwrap()
              .catch(() => setError("The estimate could not be copied to the job"));
          }}>{estimate.copiedToJobAt ? "Copied to job" : "Copy approved work to job"}</Button> : null}
        </div>}
      />
      {error ? <Card className="mb-4 border-red/30 bg-red/5"><p className="text-sm text-red">{error}</p></Card> : null}
      {estimate.deposit && estimate.deposit.requiredCents > 0 ? (
        <Card className={`mb-4 ${estimate.deposit.collected ? "border-green/40 bg-green/10" : "border-yellow/40 bg-yellow/10"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-fg">Deposit required</p>
              <p className="mt-1 text-xs text-fg-muted">
                {formatMoney(estimate.deposit.requiredCents)} required · {formatMoney(estimate.deposit.collectedCents)} collected · {formatMoney(estimate.deposit.remainingCents)} remaining
              </p>
            </div>
            {estimate.deposit.invoice ? (
              <Link href={`/invoices/${estimate.deposit.invoice.id}`}>
                <Button size="sm" variant="secondary">
                  {estimate.deposit.invoice.status === "paid" ? "Deposit paid" : "Open deposit invoice"}
                </Button>
              </Link>
            ) : null}
          </div>
        </Card>
      ) : null}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3" role="tablist" aria-label="Estimate options">
        {estimate.options.map((option) => (
          <Button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active?.id === option.id}
            variant="ghost"
            onClick={() => setActiveId(option.id)}
            className={`h-auto rounded-xl border p-4 text-left ${
              active?.id === option.id ? "border-accent bg-accent/10 hover:bg-accent/10" : "border-border bg-surface-100"
            }`}
          >
            <span className="block text-sm font-semibold text-fg">{option.label}</span>
            <span className="mt-1 block text-lg font-black text-fg">{formatMoney(option.total)}</span>
          </Button>
        ))}
      </div>
      {active ? <OptionEditor estimateId={id} option={active} editable={editable} discounts={discounts} discountsEnabled={discountsEnabled} onError={setError} /> : <Card><p className="py-10 text-center text-sm text-fg-muted">This estimate has no options.</p></Card>}
      {active && editable ? (
        <Card className="mt-4">
          <form className="grid gap-3 sm:grid-cols-[1fr_90px_130px_auto] sm:items-end" onSubmit={(event) => {
            event.preventDefault();
            const unitPrice = Math.round(Number(price) * 100);
            void addLine({ estimateId: id, optionId: active.id, body: { description, quantity: Number(quantity), unitPrice } })
              .unwrap()
              .then(() => { setDescription(""); setQuantity("1"); setPrice(""); })
              .catch(() => setError("The line item could not be added"));
          }}>
            <label className="text-xs text-fg-muted">Service or material<Input required value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            <label className="text-xs text-fg-muted">Quantity<Input required min="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
            <label className="text-xs text-fg-muted">Unit price<Input required min="0" step="0.01" type="number" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
            <Button type="submit" loading={addState.isLoading}>Add line</Button>
          </form>
        </Card>
      ) : null}
      <MessageSendDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        kind="estimate"
        documentId={id}
        title={`Email estimate ${estimate.number}`}
        description="Sends the customer this estimate using your message template settings."
      />
    </div>
  );
}

function OptionEditor({ estimateId, option, editable, discounts, discountsEnabled, onError }: {
  estimateId: string;
  option: EstimateOption;
  editable: boolean;
  discounts: BusinessSettingsDTO["taxes"]["discounts"];
  discountsEnabled: boolean;
  onError: (message: string | null) => void;
}) {
  const [setDiscount, discountState] = useSetEstimateOptionDiscountMutation();
  const [patchLine, patchState] = usePatchEstimateOptionLineMutation();
  const [deleteLine, deleteState] = useDeleteEstimateOptionLineMutation();
  const busy = discountState.isLoading || patchState.isLoading || deleteState.isLoading;

  function fail(cause: unknown) {
    onError(cause instanceof Error ? cause.message : "The option could not be updated");
  }

  const pricing = option.pricing;
  return <Card>
    <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-fg">{option.label}</h2><strong>{formatMoney(option.total)}</strong></div>
    {option.lineItems.length === 0 ? <p className="py-8 text-center text-sm text-fg-muted">No services or materials in this option.</p> : <div className="grid gap-2">{option.lineItems.map((line) => (
      <div key={line.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-surface-200 p-3">
        <div><p className="text-sm text-fg">{line.description}</p><p className="text-xs text-fg-muted">{line.quantity} × {formatMoney(line.unitPrice)} = {formatMoney(line.quantity * line.unitPrice)}</p></div>
        {editable ? <div className="flex gap-2">
          <Button size="sm" variant="secondary" loading={busy} onClick={() => {
            const description = window.prompt("Service or material", line.description)?.trim();
            if (!description) return;
            const quantity = Number(window.prompt("Quantity", String(line.quantity)));
            const unitPrice = Math.round(Number(window.prompt("Unit price in dollars", String(line.unitPrice / 100))) * 100);
            if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isInteger(unitPrice) || unitPrice < 0) return;
            void patchLine({ estimateId, optionId: option.id, lineId: line.id, body: { description, quantity, unitPrice } }).unwrap().catch(fail);
          }}>Edit</Button>
          <Button size="sm" variant="danger" loading={busy} onClick={() => {
            void deleteLine({ estimateId, optionId: option.id, lineId: line.id }).unwrap().catch(fail);
          }}>Remove</Button>
        </div> : null}
      </div>
    ))}</div>}
    {(pricing || (editable && discountsEnabled && discounts.length > 0)) && (
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {editable && discountsEnabled && discounts.length > 0 ? (
          <div className="grid gap-1.5">
            <Label className="text-sm text-fg-muted">
              Discount
              <InfoTip label="About discounts" side="top">Applies a saved discount profile to this option. Discounts are subtracted before tax.</InfoTip>
            </Label>
            <FormSelect
              value={pricing?.discountId ?? ""}
              onChange={(value) => { void setDiscount({ estimateId, optionId: option.id, discountId: value || null }).unwrap().catch(fail); }}
              allowEmpty
              placeholder="No discount"
              emptyLabel="No discount"
              options={discounts.map((discount) => ({
                value: discount.id,
                label: `${discount.name} · ${discount.type === "fixed" ? formatMoney(discount.value) : `${discount.value / 100}%`}`,
              }))}
            />
          </div>
        ) : null}
        {pricing ? (
          <div className="space-y-1 rounded-lg bg-surface-200 p-3 text-xs text-fg-muted sm:col-start-2">
            <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatMoney(pricing.subtotal)}</span></div>
            {pricing.discount > 0 && <div className="flex justify-between"><span>{pricing.discountLabel || "Discount"}</span><span className="tabular-nums">-{formatMoney(pricing.discount)}</span></div>}
            {pricing.tax > 0 && <div className="flex justify-between"><span>{pricing.taxLabel || "Tax"}</span><span className="tabular-nums">{formatMoney(pricing.tax)}</span></div>}
            <div className="flex justify-between font-semibold text-fg"><span>Total</span><span className="tabular-nums">{formatMoney(pricing.total)}</span></div>
          </div>
        ) : null}
      </div>
    )}
  </Card>;
}