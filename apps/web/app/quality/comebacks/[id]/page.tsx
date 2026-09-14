"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatMoney } from "@nnact/shared";
import {
  COMEBACK_STATUS_LABEL,
  COMEBACK_SEVERITY_LABEL,
  COMEBACK_FAULT_RELATIONSHIP_LABEL,
  COMEBACK_RESPONSIBILITY_LABEL,
  COMEBACK_ROOT_CAUSE_LABEL,
  COMEBACK_PREVENTABILITY_LABEL,
  COMEBACK_BILLING_DECISION_LABEL,
  COMEBACK_WARRANTY_STATUS_LABEL,
  COMEBACK_COST_CLASS_LABEL,
  COMEBACK_COST_KIND_LABEL,
  COMEBACK_EVIDENCE_KIND_LABEL,
  COMEBACK_COMMUNICATION_KIND_LABEL,
  COMEBACK_ACTION_STATUS_LABEL,
  COMEBACK_MONITORING_OUTCOME_LABEL,
} from "@nnact/shared";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useComebackQuery, useComebackTransitionMutation } from "@/lib/redux/api";
import { ComebackStatusBadge, ComebackSeverityBadge, ComebackActionStatusBadge } from "@/components/comeback-badge";
import { explainRtkError } from "@/lib/redux/api";
import { formatDistanceToNow } from "date-fns";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-200 p-4">
      <p className="text-xs text-fg-muted">{label}</p>
      <div className="mt-2 text-sm font-semibold text-fg">{children ?? <span className="text-fg-dim">—</span>}</div>
    </div>
  );
}

function labelOrDash(val: string | null | undefined, map: Record<string, string>) {
  if (!val) return <span className="text-fg-dim">—</span>;
  return map[val] ?? val;
}

export default function ComebackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: c, isLoading, error } = useComebackQuery(id, { skip: !id });
  const [transition, { isLoading: transiting }] = useComebackTransitionMutation();
  const [closeReason, setCloseReason] = useState("");
  const [errorToast, setErrorToast] = useState<string | null>(null);

  async function doTransition(action: string, body?: Record<string, unknown>) {
    setErrorToast(null);
    try {
      await transition({ id, action, body }).unwrap();
    } catch (err) {
      setErrorToast(explainRtkError(err));
    }
  }

  if (isLoading) {
    return (
      <div>
        <Skeleton className="mb-2 h-8 w-64" />
        <Skeleton className="mb-8 h-4 w-96" />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_.85fr]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !c) {
    return (
      <div className="py-20 text-center">
        <p className="text-fg-muted">{error ? explainRtkError(error) : "Case not found."}</p>
      </div>
    );
  }

  const isOpen = !["CLOSED", "NOT_A_COMEBACK"].includes(c.status);

  return (
    <div>
      <PageHeader
        title={c.caseNumber}
        description={
          <span className="inline-flex items-center gap-2">
            <ComebackStatusBadge status={c.status} />
            <ComebackSeverityBadge severity={c.severity} />
            {c.repeatNumber > 1 && <Badge variant="destructive">Repeat #{c.repeatNumber}</Badge>}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {isOpen && c.status === "REPORTED" && (
              <Button size="sm" onClick={() => doTransition("triage")} disabled={transiting}>
                Triage
              </Button>
            )}
            {isOpen && c.status === "MONITORING" && (
              <Button size="sm" onClick={() => doTransition("close", { reason: closeReason || null })} disabled={transiting}>
                Close
              </Button>
            )}
            {!["CLOSED", "NOT_A_COMEBACK"].includes(c.status) && c.status !== "DISPUTED" && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  const reason = window.prompt("Reason for marking as NOT_A_COMEBACK:");
                  if (reason) doTransition("not-a-comeback", { reason });
                }}
                disabled={transiting}
              >
                Not a comeback
              </Button>
            )}
          </div>
        }
      />

      {errorToast && (
        <div className="mb-4 rounded-xl border border-red/30 bg-red/5 p-3 text-sm text-red">{errorToast}</div>
      )}

      {c.status === "MONITORING" && (
        <div className="mb-4 flex items-center gap-2">
          <Input
            placeholder="Close reason (optional)"
            value={closeReason}
            onChange={(e) => setCloseReason(e.target.value)}
            className="max-w-sm"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Case details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Info label="Customer">{c.customerName ?? "Unknown"}</Info>
              <Info label="Equipment">{c.equipmentLabel ?? "—"}</Info>
              <Info label="Original job">{c.originalJobNumber ?? "None"}</Info>
              <Info label="Reported">{c.reportedAt ? new Date(c.reportedAt).toLocaleDateString() : "—"}</Info>
              <Info label="Intake reason">{labelOrDash(c.intakeReason, COMEBACK_STATUS_LABEL)}</Info>
              <Info label="Fault relationship">{labelOrDash(c.faultRelationship, COMEBACK_FAULT_RELATIONSHIP_LABEL)}</Info>
              <Info label="Root cause">{labelOrDash(c.rootCause, COMEBACK_ROOT_CAUSE_LABEL)}</Info>
              <Info label="Responsibility">{labelOrDash(c.responsibility, COMEBACK_RESPONSIBILITY_LABEL)}</Info>
              <Info label="Preventability">{labelOrDash(c.preventability, COMEBACK_PREVENTABILITY_LABEL)}</Info>
              <Info label="Billing">{labelOrDash(c.billingDecision, COMEBACK_BILLING_DECISION_LABEL)}</Info>
              <Info label="Charge">{c.chargeAmountCents > 0 ? formatMoney(c.chargeAmountCents) : "No charge"}</Info>
              <Info label="Internal cost">{c.internalCostCents > 0 ? formatMoney(c.internalCostCents) : "None logged"}</Info>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Complaint</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-fg-muted">Summary</p>
                <p className="mt-1 text-sm text-fg">{c.complaintSummary}</p>
              </div>
              {c.complaintDetails && (
                <div>
                  <p className="text-xs text-fg-muted">Details</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{c.complaintDetails}</p>
                </div>
              )}
              {c.resolutionSummary && (
                <div className="mt-4 rounded-xl bg-green/5 border border-green/20 p-4">
                  <p className="text-xs text-fg-muted">Resolution</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{c.resolutionSummary}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Costs</CardTitle></CardHeader>
            <CardContent>
              {c.costs.length === 0 ? (
                <p className="text-xs text-fg-dim">No costs logged.</p>
              ) : (
                <div className="space-y-2">
                  {c.costs.map((cost) => (
                    <div key={cost.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-200 p-3 text-sm">
                      <div>
                        <span className="font-medium text-fg">{cost.description}</span>
                        <span className="ml-2 text-xs text-fg-muted">
                          {COMEBACK_COST_KIND_LABEL[cost.kind]} · {COMEBACK_COST_CLASS_LABEL[cost.costClass]}
                        </span>
                      </div>
                      <span className="shrink-0 font-semibold text-fg">{formatMoney(cost.amountCents)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Status history</CardTitle></CardHeader>
            <CardContent className="relative space-y-4 border-l-2 border-border/50 pl-6">
              {c.statusHistory.map((h, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-[29px] top-1.5 size-3 rounded-full border-2 border-card bg-primary" />
                  <div>
                    <p className="text-sm font-medium text-fg">
                      {h.fromStatus ? COMEBACK_STATUS_LABEL[h.fromStatus] : null}
                      {h.fromStatus ? " → " : ""}
                      {COMEBACK_STATUS_LABEL[h.toStatus]}
                    </p>
                    {h.reason && <p className="mt-0.5 text-xs text-fg-muted">{h.reason}</p>}
                    <p className="mt-0.5 text-[11px] text-fg-dim">
                      {h.changedBy ? `${h.changedBy} · ` : ""}
                      {formatDistanceToNow(new Date(h.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
              {c.statusHistory.length === 0 && <p className="text-xs text-fg-dim">No history.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Corrective actions</CardTitle></CardHeader>
            <CardContent>
              {c.correctiveActions.length === 0 ? (
                <p className="text-xs text-fg-dim">None.</p>
              ) : (
                <div className="space-y-3">
                  {c.correctiveActions.map((a) => (
                    <div key={a.id} className="rounded-xl bg-surface-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-fg">{a.description}</p>
                        <ComebackActionStatusBadge status={a.status} />
                      </div>
                      <p className="mt-1 text-xs text-fg-muted">
                        {a.kind}
                        {a.dueAt ? ` · due ${new Date(a.dueAt).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Evidence</CardTitle></CardHeader>
            <CardContent>
              {c.evidence.length === 0 ? (
                <p className="text-xs text-fg-dim">None.</p>
              ) : (
                <div className="space-y-2">
                  {c.evidence.map((e) => (
                    <div key={e.id} className="rounded-xl bg-surface-200 p-3">
                      <p className="text-xs font-medium text-fg-muted">{COMEBACK_EVIDENCE_KIND_LABEL[e.kind]}</p>
                      {e.note && <p className="mt-1 text-sm text-fg">{e.note}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Communications</CardTitle></CardHeader>
            <CardContent>
              {c.communications.length === 0 ? (
                <p className="text-xs text-fg-dim">None.</p>
              ) : (
                <div className="space-y-2">
                  {c.communications.map((comm) => (
                    <div key={comm.id} className="rounded-xl bg-surface-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-fg-muted">{COMEBACK_COMMUNICATION_KIND_LABEL[comm.kind]}</p>
                        <span className="text-[11px] text-fg-dim">{formatDistanceToNow(new Date(comm.happenedAt), { addSuffix: true })}</span>
                      </div>
                      <p className="mt-1 text-sm text-fg">{comm.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {c.followUps.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Follow-ups</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {c.followUps.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-200 p-3">
                      <div>
                        <p className="text-sm text-fg">
                          {new Date(f.scheduledAt).toLocaleDateString()}
                          {f.note ? ` — ${f.note}` : ""}
                        </p>
                        <p className="text-xs text-fg-muted">{COMEBACK_MONITORING_OUTCOME_LABEL[f.outcome]}</p>
                      </div>
                      {f.checkedAt && <Badge variant="completed">Checked</Badge>}
                      {f.outcome === "PENDING" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => doTransition("follow-up", { outcome: "NO_RELAPSE", note: null })}
                          disabled={transiting}
                        >
                          Mark resolved
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {c.warranty && (
            <Card>
              <CardHeader><CardTitle>Warranty</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Info label="Status">{labelOrDash(c.warranty.status, COMEBACK_WARRANTY_STATUS_LABEL)}</Info>
                <Info label="Workmanship ends">{c.warranty.workmanshipEndsAt ? new Date(c.warranty.workmanshipEndsAt).toLocaleDateString() : "—"}</Info>
                <Info label="Parts ends">{c.warranty.partsEndsAt ? new Date(c.warranty.partsEndsAt).toLocaleDateString() : "—"}</Info>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}