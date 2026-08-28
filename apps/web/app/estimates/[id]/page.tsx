"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { useParams } from "next/navigation";
import { formatMoney } from "@nnact/shared";
import { ADVANCE_TAG } from "@nnact/shared";
import { api, type BusinessSettingsDTO, type EstimateOption, type EstimateOptionLineItem } from "@/lib/api";
import {
  useAddEstimateOptionLineMutation,
  useApproveEstimateOptionMutation,
  useCopyApprovedEstimateToJobMutation,
  useCustomersQuery,
  useDeclineEstimateMutation,
  useDeleteEstimateOptionLineMutation,
  useEstimateQuery,
  useJobsQuery,
  useMarkEstimateSentMutation,
  useOrgQuery,
  usePatchEstimateOptionLineMutation,
  useRenameEstimateOptionMutation,
  useSetEstimateOptionDiscountMutation,
} from "@/lib/redux/api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { EstimateStatusBadge } from "@/components/status-badge";
import { MessageSendDialog } from "@/components/message-send-dialog";
import { emitWalkthroughDone } from "@/lib/walkthroughs/events";

type ConfirmAction = "sent" | "decline" | "approve" | null;
type LineModal = { mode: "add" } | { mode: "edit"; lineId: string } | null;

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

export default function EstimateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: estimate, isLoading, isError, refetch } = useEstimateQuery(id, { skip: !id });
  const { data: jobs = [] } = useJobsQuery();
  const { data: customers = [] } = useCustomersQuery();
  const { data: org } = useOrgQuery();

  const [activeId, setActiveId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [approveSignature, setApproveSignature] = useState("");
  const [lineModal, setLineModal] = useState<LineModal>(null);
  const [lineDescription, setLineDescription] = useState("");
  const [lineQuantity, setLineQuantity] = useState("1");
  const [linePrice, setLinePrice] = useState("");
  const [lineError, setLineError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameLabel, setRenameLabel] = useState("");

  const [markEstimateSent, markSentState] = useMarkEstimateSentMutation();
  const [copyApproved, copyState] = useCopyApprovedEstimateToJobMutation();
  const [approveOption, approveState] = useApproveEstimateOptionMutation();
  const [declineEstimate, declineState] = useDeclineEstimateMutation();
  const [addLine, addLineState] = useAddEstimateOptionLineMutation();
  const [patchLine, patchLineState] = usePatchEstimateOptionLineMutation();
  const [renameOption, renameState] = useRenameEstimateOptionMutation();

  const discounts = org?.businessSettings?.taxes?.discounts ?? [];
  const discountsEnabled = org?.businessSettings?.taxes?.discountsEnabled ?? true;
  const signatureRequired = org?.businessSettings?.estimate?.signatureRequired ?? false;

  const job = useMemo(() => (estimate ? jobs.find((row) => row.id === estimate.jobId) : null), [estimate, jobs]);
  const customer = useMemo(
    () => (job ? customers.find((row) => row.id === job.customerId) : null),
    [job, customers],
  );

  useEffect(() => {
    if (!activeId && estimate?.options[0]?.id) setActiveId(estimate.options[0].id);
  }, [activeId, estimate]);

  useEffect(() => {
    if (!confirmAction && !lineModal && !emailOpen && !renameOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setConfirmAction(null);
        setLineModal(null);
        setEmailOpen(false);
        setRenameOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [confirmAction, lineModal, emailOpen, renameOpen]);

  const active = estimate?.options.find((option) => option.id === activeId) ?? estimate?.options[0];
  const editable = estimate?.status === "draft" || estimate?.status === "sent";
  const canApprove = estimate?.status === "sent" && active;
  const canDecline = estimate?.status === "draft" || estimate?.status === "sent";

  async function downloadPdf() {
    setDownloadingPdf(true);
    setActionError(null);
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
      setActionError(cause instanceof Error ? cause.message : "Unable to download the PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleMarkSent() {
    setActionError(null);
    try {
      await markEstimateSent(id).unwrap();
      setConfirmAction(null);
      emitWalkthroughDone(ADVANCE_TAG.estimateSent);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The estimate could not be marked sent");
    }
  }

  async function handleDecline() {
    setActionError(null);
    try {
      await declineEstimate(id).unwrap();
      setConfirmAction(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The estimate could not be declined");
    }
  }

  async function handleApprove() {
    if (!active) return;
    if (signatureRequired && !approveSignature.trim()) {
      setActionError("Customer signature name is required before approval.");
      return;
    }
    setActionError(null);
    try {
      await approveOption({
        id,
        body: {
          optionId: active.id,
          ...(approveSignature.trim() ? { signatureName: approveSignature.trim() } : {}),
        },
      }).unwrap();
      setConfirmAction(null);
      setApproveSignature("");
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The estimate could not be approved");
    }
  }

  function openAddLine() {
    setLineDescription("");
    setLineQuantity("1");
    setLinePrice("");
    setLineError(null);
    setLineModal({ mode: "add" });
  }

  function openEditLine(line: EstimateOptionLineItem) {
    setLineDescription(line.description);
    setLineQuantity(String(line.quantity));
    setLinePrice((line.unitPrice / 100).toFixed(2));
    setLineError(null);
    setLineModal({ mode: "edit", lineId: line.id });
  }

  if (!estimate && isLoading) {
    return (
      <div>
        <Skeleton className="mb-2 h-8 w-48" />
        <Skeleton className="mb-8 h-4 w-72" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_.85fr]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !estimate) {
    return (
      <div>
        <PageHeader title="Estimate not found" description={`No estimate with id ${id}.`} />
        <Card>
          <CardContent className="py-8">
            <EmptyState
              title="No estimate data"
              description={actionError ?? "Verify the estimate ID or check your API connection."}
              actions={<Button onClick={() => void refetch()}>Retry</Button>}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const confirmBusy =
    confirmAction === "sent"
      ? markSentState.isLoading
      : confirmAction === "decline"
        ? declineState.isLoading
        : confirmAction === "approve"
          ? approveState.isLoading
          : false;

  return (
    <div>
      {confirmAction ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmAction(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>
                  {confirmAction === "sent"
                    ? "Mark estimate as sent?"
                    : confirmAction === "decline"
                      ? "Decline this estimate?"
                      : "Approve this option?"}
                </CardTitle>
                <CardDescription>
                  {confirmAction === "sent"
                    ? `This moves ${estimate.number} to sent so the customer can review and approve an option.`
                    : confirmAction === "decline"
                      ? "The customer will no longer be able to approve this estimate."
                      : `Approve the "${active?.label ?? "selected"}" option${signatureRequired ? " with a recorded signature" : ""}.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {confirmAction === "approve" && signatureRequired ? (
                  <div className="grid gap-1.5">
                    <Label className="text-sm text-fg-muted">
                      Customer signature name
                      <InfoTip label="About signature" side="top">
                        Required by your estimate settings. Record who approved this option on behalf of the customer.
                      </InfoTip>
                    </Label>
                    <Input
                      value={approveSignature}
                      onChange={(event) => setApproveSignature(event.target.value)}
                      placeholder="Customer name"
                      autoFocus
                    />
                  </div>
                ) : null}
                {actionError && confirmAction ? (
                  <p className="rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red">{actionError}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={confirmAction === "decline" ? "danger" : "default"}
                    loading={confirmBusy}
                    onClick={() => {
                      if (confirmAction === "sent") void handleMarkSent();
                      else if (confirmAction === "decline") void handleDecline();
                      else void handleApprove();
                    }}
                  >
                    {confirmAction === "sent"
                      ? "Yes, mark sent"
                      : confirmAction === "decline"
                        ? "Yes, decline"
                        : "Approve option"}
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmAction(null)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      {lineModal && active ? (
        <LineItemDialog
          mode={lineModal.mode}
          lineDescription={lineDescription}
          lineQuantity={lineQuantity}
          linePrice={linePrice}
          lineError={lineError}
          submitting={lineModal.mode === "edit" ? patchLineState.isLoading : addLineState.isLoading}
          onDescriptionChange={setLineDescription}
          onQuantityChange={setLineQuantity}
          onPriceChange={setLinePrice}
          onClose={() => setLineModal(null)}
          onSubmit={async () => {
            const description = lineDescription.trim();
            const quantity = Math.floor(Number(lineQuantity));
            const unitPrice = Math.round(parseFloat(linePrice || "0") * 100);
            if (!description) {
              setLineError("Description is required.");
              return;
            }
            if (!Number.isInteger(quantity) || quantity < 1) {
              setLineError("Quantity must be a whole number of at least 1.");
              return;
            }
            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
              setLineError("Unit price must be zero or more.");
              return;
            }
            setLineError(null);
            try {
              if (lineModal.mode === "edit") {
                await patchLine({
                  estimateId: id,
                  optionId: active.id,
                  lineId: lineModal.lineId,
                  body: { description, quantity, unitPrice },
                }).unwrap();
              } else {
                await addLine({
                  estimateId: id,
                  optionId: active.id,
                  body: { description, quantity, unitPrice },
                }).unwrap();
              }
              setLineModal(null);
            } catch (cause) {
              setLineError(cause instanceof Error ? cause.message : "Could not save the line item");
            }
          }}
        />
      ) : null}

      {renameOpen && active ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setRenameOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-sm">
              <CardHeader>
                <CardTitle>Rename option</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input value={renameLabel} onChange={(event) => setRenameLabel(event.target.value)} autoFocus />
                <div className="flex gap-2">
                  <Button
                    loading={renameState.isLoading}
                    disabled={!renameLabel.trim()}
                    onClick={() => {
                      void renameOption({ estimateId: id, optionId: active.id, label: renameLabel.trim() })
                        .unwrap()
                        .then(() => setRenameOpen(false))
                        .catch((cause) =>
                          setActionError(cause instanceof Error ? cause.message : "Could not rename option"),
                        );
                    }}
                  >
                    Save
                  </Button>
                  <Button variant="secondary" onClick={() => setRenameOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      <PageHeader
        title={estimate.number}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <EstimateStatusBadge status={estimate.status} />
            <span className="text-fg-dim">·</span>
            <span>{estimate.options.length} option{estimate.options.length === 1 ? "" : "s"}</span>
            {job ? (
              <>
                <span className="text-fg-dim">·</span>
                <Link href={`/jobs/${job.id}`} className="text-fg-link hover:text-fg">
                  {job.title}
                </Link>
              </>
            ) : null}
            {customer ? (
              <>
                <span className="text-fg-dim">·</span>
                <Link href={`/customers/${customer.id}`} className="text-fg-muted hover:text-fg">
                  {customer.name}
                </Link>
              </>
            ) : null}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/estimates/${id}/preview`}>
              <Button size="sm" variant="secondary">
                Preview
              </Button>
            </Link>
            <Button size="sm" variant="secondary" loading={downloadingPdf} onClick={() => void downloadPdf()}>
              Download PDF
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEmailOpen(true)}>
              Email estimate
            </Button>
            {estimate.status === "draft" ? (
              <Button size="sm" data-tour="estimates-send" onClick={() => setConfirmAction("sent")}>
                Mark sent
              </Button>
            ) : null}
            {canApprove ? (
              <Button size="sm" onClick={() => setConfirmAction("approve")}>
                Approve option
              </Button>
            ) : null}
            {canDecline ? (
              <Button size="sm" variant="danger" onClick={() => setConfirmAction("decline")}>
                Decline
              </Button>
            ) : null}
            {estimate.status === "approved" ? (
              <Button
                size="sm"
                loading={copyState.isLoading}
                disabled={Boolean(estimate.copiedToJobAt)}
                onClick={() => {
                  void copyApproved(id)
                    .unwrap()
                    .catch((cause) =>
                      setActionError(cause instanceof Error ? cause.message : "Could not copy to job"),
                    );
                }}
              >
                {estimate.copiedToJobAt ? "Copied to job" : "Copy approved work to job"}
              </Button>
            ) : null}
            {job ? (
              <Link href={`/jobs/${job.id}`}>
                <Button size="sm" variant="ghost">
                  View job
                </Button>
              </Link>
            ) : null}
          </div>
        }
      />

      {actionError && !confirmAction ? (
        <Card className="mb-6 border-red/30 bg-red/5">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <p className="text-sm text-red">{actionError}</p>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setActionError(null)} aria-label="Dismiss">
              ✕
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {estimate.deposit && estimate.deposit.requiredCents > 0 ? (
        <Card className={`mb-6 ${estimate.deposit.collected ? "border-green/40 bg-green/5" : "border-yellow/40 bg-yellow/5"}`}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm font-semibold text-fg">Deposit required</p>
              <p className="mt-1 text-xs text-fg-muted">
                {formatMoney(estimate.deposit.requiredCents)} required · {formatMoney(estimate.deposit.collectedCents)} collected ·{" "}
                {formatMoney(estimate.deposit.remainingCents)} remaining
              </p>
            </div>
            {estimate.deposit.invoice ? (
              <Link href={`/invoices/${estimate.deposit.invoice.id}`}>
                <Button size="sm" variant="secondary">
                  {estimate.deposit.invoice.status === "paid" ? "Deposit paid" : "Open deposit invoice"}
                </Button>
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-1.5">
                Pricing options
                <InfoTip label="About pricing options" side="right">
                  Good / Better / Best style choices for the customer. Only one option can be approved; line items live inside each option.
                </InfoTip>
              </CardTitle>
              <CardDescription>Select an option to edit line items, discounts, and totals.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="tablist" aria-label="Estimate options">
                {estimate.options.map((option) => {
                  const selected = active?.id === option.id;
                  const isApproved = estimate.selectedOptionId === option.id && estimate.status === "approved";
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveId(option.id)}
                      className={`rounded-xl border p-4 text-left transition-colors ${
                        selected ? "border-accent bg-accent/10" : "border-border bg-surface-100 hover:bg-surface-200"
                      } ${isApproved ? "ring-2 ring-green/40" : ""}`}
                    >
                      <span className="block text-sm font-semibold text-fg">{option.label}</span>
                      <span className="mt-1 block text-lg font-black tabular-nums text-fg">{formatMoney(option.total)}</span>
                      {isApproved ? (
                        <span className="mt-2 inline-block rounded-full bg-green/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green">
                          Approved
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {active ? (
            <OptionPanel
              estimateId={id}
              option={active}
              editable={editable}
              discounts={discounts}
              discountsEnabled={discountsEnabled}
              onError={setActionError}
              onAddLine={openAddLine}
              onEditLine={openEditLine}
              confirmingDeleteId={confirmingDeleteId}
              setConfirmingDeleteId={setConfirmingDeleteId}
              onRename={() => {
                setRenameLabel(active.label);
                setRenameOpen(true);
              }}
            />
          ) : (
            <Card>
              <CardContent className="py-10">
                <EmptyState title="No options" description="This estimate has no pricing options." />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-1.5">
                Estimate details
                <InfoTip label="About estimate details" side="right">
                  Lifecycle dates and approval metadata for this customer proposal.
                </InfoTip>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailRow label="Status" value={<EstimateStatusBadge status={estimate.status} />} />
              <DetailRow label="Total" value={formatMoney(estimate.total)} strong />
              <DetailRow label="Created" value={formatDate(estimate.createdAt)} />
              <DetailRow label="Expires" value={formatDate(estimate.expiresAt)} />
              {estimate.sentAt ? <DetailRow label="Sent" value={formatDateTime(estimate.sentAt)} /> : null}
              {estimate.acceptedAt ? (
                <DetailRow
                  label="Approved"
                  value={`${formatDateTime(estimate.acceptedAt)}${estimate.acceptedByName ? ` · ${estimate.acceptedByName}` : ""}`}
                />
              ) : null}
              {estimate.declinedAt ? <DetailRow label="Declined" value={formatDateTime(estimate.declinedAt)} /> : null}
              {estimate.copiedToJobAt ? <DetailRow label="Copied to job" value={formatDateTime(estimate.copiedToJobAt)} /> : null}
              {estimate.signatureName ? <DetailRow label="Signature" value={estimate.signatureName} /> : null}
            </CardContent>
          </Card>

          {(job || customer) && (
            <Card>
              <CardHeader>
                <CardTitle>Related</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {job ? (
                  <div>
                    <p className="mb-1 text-xs text-fg-muted">Job</p>
                    <Link href={`/jobs/${job.id}`} className="text-sm font-medium text-fg-link hover:text-fg">
                      {job.title}
                    </Link>
                    {job.description ? <p className="mt-1 text-xs text-fg-dim line-clamp-3">{job.description}</p> : null}
                  </div>
                ) : null}
                {customer ? (
                  <div className={job ? "border-t border-border pt-4" : undefined}>
                    <p className="mb-1 text-xs text-fg-muted">Customer</p>
                    <Link href={`/customers/${customer.id}`} className="text-sm font-medium text-fg-link hover:text-fg">
                      {customer.name}
                    </Link>
                    {customer.email ? <p className="mt-1 text-xs text-fg-dim">{customer.email}</p> : null}
                    {customer.phone ? <p className="text-xs text-fg-dim">{customer.phone}</p> : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-1.5">
                Customer delivery
                <InfoTip label="About customer delivery" side="right">
                  Preview the branded document, download the stored PDF, or email the customer with the PDF attached.
                </InfoTip>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Link href={`/estimates/${id}/preview`}>
                <Button size="sm" variant="secondary">
                  Open preview
                </Button>
              </Link>
              <Button size="sm" variant="secondary" loading={downloadingPdf} onClick={() => void downloadPdf()}>
                Download PDF
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEmailOpen(true)}>
                Send email
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

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

function DetailRow({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-fg-muted">{label}</span>
      <span className={`text-sm tabular-nums text-fg ${strong ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}

function LineItemDialog({
  mode,
  lineDescription,
  lineQuantity,
  linePrice,
  lineError,
  submitting,
  onDescriptionChange,
  onQuantityChange,
  onPriceChange,
  onClose,
  onSubmit,
}: {
  mode: "add" | "edit";
  lineDescription: string;
  lineQuantity: string;
  linePrice: string;
  lineError: string | null;
  submitting: boolean;
  onDescriptionChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{mode === "edit" ? "Edit line item" : "Add line item"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmit();
              }}
            >
              {lineError ? <p className="rounded-lg border border-red/30 bg-red/5 p-2 text-xs text-red">{lineError}</p> : null}
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-fg-muted">Description *</Label>
                <Input value={lineDescription} onChange={(event) => onDescriptionChange(event.target.value)} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-fg-muted">Quantity *</Label>
                  <Input type="number" min={1} step={1} value={lineQuantity} onChange={(event) => onQuantityChange(event.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-fg-muted">Unit price ($) *</Label>
                  <Input type="number" min={0} step="0.01" value={linePrice} onChange={(event) => onPriceChange(event.target.value)} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" loading={submitting} disabled={!lineDescription.trim() || !linePrice}>
                  {mode === "edit" ? "Save changes" : "Add line"}
                </Button>
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function OptionPanel({
  estimateId,
  option,
  editable,
  discounts,
  discountsEnabled,
  onError,
  onAddLine,
  onEditLine,
  confirmingDeleteId,
  setConfirmingDeleteId,
  onRename,
}: {
  estimateId: string;
  option: EstimateOption;
  editable: boolean;
  discounts: BusinessSettingsDTO["taxes"]["discounts"];
  discountsEnabled: boolean;
  onError: (message: string | null) => void;
  onAddLine: () => void;
  onEditLine: (line: EstimateOptionLineItem) => void;
  confirmingDeleteId: string | null;
  setConfirmingDeleteId: (id: string | null) => void;
  onRename: () => void;
}) {
  const [setDiscount, discountState] = useSetEstimateOptionDiscountMutation();
  const [deleteLine, deleteState] = useDeleteEstimateOptionLineMutation();
  const busy = discountState.isLoading || deleteState.isLoading;
  const pricing = option.pricing;

  function fail(cause: unknown) {
    onError(cause instanceof Error ? cause.message : "The option could not be updated");
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{option.label}</CardTitle>
          <CardDescription>
            {option.lineItems.length} line item{option.lineItems.length === 1 ? "" : "s"}
            {editable ? " · Editable while draft or sent" : " · Frozen after approval"}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-black tabular-nums text-fg">{formatMoney(option.total)}</span>
          {editable ? (
            <Button size="sm" variant="ghost" onClick={onRename}>
              Rename
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {option.lineItems.length === 0 ? (
          <EmptyState
            title="No line items yet"
            description={editable ? "Add services and materials for this option." : "This option has no line items."}
            actions={
              editable ? (
                <Button size="sm" variant="secondary" onClick={onAddLine}>
                  Add line item
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-2">
            {option.lineItems.map((line) => (
              <div key={line.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-200 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">{line.description}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {line.quantity} × {formatMoney(line.unitPrice)} = {formatMoney(line.quantity * line.unitPrice)}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-fg">{formatMoney(line.quantity * line.unitPrice)}</span>
                {editable ? (
                  <div className="flex shrink-0 gap-2">
                    {confirmingDeleteId === line.id ? (
                      <>
                        <Button size="sm" variant="danger" loading={busy} onClick={() => void deleteLine({ estimateId, optionId: option.id, lineId: line.id }).unwrap().then(() => setConfirmingDeleteId(null)).catch(fail)}>
                          Confirm
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setConfirmingDeleteId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => onEditLine(line)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmingDeleteId(line.id)}>
                          Remove
                        </Button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
            {editable ? (
              <Button size="sm" variant="secondary" className="mt-2" onClick={onAddLine}>
                Add line item
              </Button>
            ) : null}
          </div>
        )}

        {(pricing || (editable && discountsEnabled && discounts.length > 0)) && (
          <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
            {editable && discountsEnabled && discounts.length > 0 ? (
              <div className="grid gap-1.5">
                <Label className="text-sm text-fg-muted">
                  Discount
                  <InfoTip label="About discounts" side="top">
                    Applies a saved discount profile to this option. Discounts are subtracted before tax.
                  </InfoTip>
                </Label>
                <FormSelect
                  value={pricing?.discountId ?? ""}
                  onChange={(value) => {
                    void setDiscount({ estimateId, optionId: option.id, discountId: value || null }).unwrap().catch(fail);
                  }}
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
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMoney(pricing.subtotal)}</span>
                </div>
                {pricing.discount > 0 ? (
                  <div className="flex justify-between">
                    <span>{pricing.discountLabel || "Discount"}</span>
                    <span className="tabular-nums">-{formatMoney(pricing.discount)}</span>
                  </div>
                ) : null}
                {pricing.tax > 0 ? (
                  <div className="flex justify-between">
                    <span>{pricing.taxLabel || "Tax"}</span>
                    <span className="tabular-nums">{formatMoney(pricing.tax)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between font-semibold text-fg">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(pricing.total)}</span>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
