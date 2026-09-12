"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormSelect } from "@/components/ui/form-select";
import { InfoTip } from "@/components/ui/info-tip";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import {
  formatMoney,
  type ServiceAgreementDTO,
  type ServiceAgreementAssetDTO,
  type ServiceVisitDTO,
} from "@nnact/shared";

const visitStatusColors: Record<string, string> = {
  scheduled: "bg-surface-500/60 text-fg-dim",
  confirmed: "bg-blue/10 text-blue",
  in_progress: "bg-amber/10 text-amber",
  completed: "bg-green/10 text-green",
  rescheduled: "bg-orange/10 text-orange",
  canceled: "bg-red/10 text-red",
  missed: "bg-red/10 text-red",
};

const agreementStatusColors: Record<string, string> = {
  active: "bg-green/10 text-green",
  draft: "bg-surface-500/60 text-fg-dim",
  pending_approval: "bg-amber/10 text-amber",
  suspended: "bg-orange/10 text-orange",
  expired: "bg-orange/10 text-orange",
  canceled: "bg-red/10 text-red",
  renewed: "bg-blue/10 text-blue",
};

type Tab = "overview" | "assets" | "visits";

type EquipmentRow = {
  id: string;
  customerId: string;
  type: string;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
};

export default function AgreementDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [agreement, setAgreement] = useState<ServiceAgreementDTO | null>(null);
  const [assets, setAssets] = useState<ServiceAgreementAssetDTO[]>([]);
  const [visits, setVisits] = useState<ServiceVisitDTO[]>([]);
  const [customerEquipment, setCustomerEquipment] = useState<EquipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);

  // asset add form
  const [addAssetEquipmentId, setAddAssetEquipmentId] = useState("");
  const [addAssetNotes, setAddAssetNotes] = useState("");

  async function load(visitsOnly = false) {
    if (!visitsOnly) setLoading(true);
    setError(null);
    try {
      const [agreementRow, assetRows, visitRows] = await Promise.all([
        api.getServiceAgreement(id),
        api.agreementAssets(id),
        api.agreementVisits(id),
      ]);
      setAgreement(agreementRow);
      setAssets(assetRows);
      setVisits(visitRows);
      if (agreementRow.customerId) {
        setCustomerEquipment(await api.equipment({ customerId: agreementRow.customerId }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load agreement");
    } finally {
      if (!visitsOnly) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  const snapshot = agreement?.planSnapshot;
  const benefits = snapshot?.benefits ?? [];

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(next: string) {
    await run(() => api.updateServiceAgreement(id, { status: next }));
  }

  async function addAsset() {
    if (!addAssetEquipmentId) {
      setError("Select a piece of equipment.");
      return;
    }
    await run(async () => {
      await api.addAgreementAsset(id, { equipmentId: addAssetEquipmentId, notes: addAssetNotes.trim() || null });
      setAddAssetEquipmentId("");
      setAddAssetNotes("");
    });
  }

  function actionForVisit(v: ServiceVisitDTO) {
    const isOpen = ["scheduled", "confirmed", "rescheduled", "in_progress"].includes(v.status);
    const isLive = ["scheduled", "confirmed", "in_progress"].includes(v.status);
    return {
      canStart: isLive && v.status !== "in_progress",
      canComplete: v.status === "in_progress",
      canCancel: isOpen && v.status !== "canceled",
    };
  }

  async function startVisit(v: ServiceVisitDTO) {
    await run(() => api.updateServiceVisit(v.id, { status: "in_progress" }));
  }

  async function cancelVisit(v: ServiceVisitDTO) {
    if (!window.confirm(`Cancel visit ${v.visitNumber}?`)) return;
    await run(() => api.updateServiceVisit(v.id, { status: "canceled" }));
  }

  const stats = useMemo(() => {
    if (!agreement) return { due: 0, done: 0 };
    const due = visits.filter((v) => ["scheduled", "confirmed"].includes(v.status)).length;
    const done = visits.filter((v) => v.status === "completed").length;
    return { due, done };
  }, [agreement, visits]);

  if (loading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error && !agreement) {
    return (
      <Card className="border-red/30 bg-red/5">
        <p className="text-sm font-medium text-red">Unable to load agreement</p>
        <p className="mt-1 text-xs text-fg-muted">{error}</p>
      </Card>
    );
  }

  if (!agreement) return null;

  const liveStatus = ["active", "pending_approval"].includes(agreement.status);

  return (
    <div>
      <PageHeader
        title={agreement.agreementNumber}
        description={
          <span>
            <Link href={`/customers/${agreement.customerId}`} className="text-accent hover:underline">
              {agreement.customerName ?? "Customer"}
            </Link>
            {" · "}
            {agreement.planName}
            {agreement.locationName ? ` · ${agreement.locationName}` : ""}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {agreement.status === "active" && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => changeStatus("suspended")}>
                Suspend
              </Button>
            )}
            {agreement.status !== "active" && agreement.status !== "canceled" && agreement.status !== "expired" && (
              <Button size="sm" disabled={busy} onClick={() => changeStatus("active")}>
                Activate
              </Button>
            )}
            {liveStatus && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => changeStatus("canceled")}>
                Cancel
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => router.push("/agreements")}>
              All agreements
            </Button>
          </div>
        }
      />

      {error && (
        <Card className="mb-5 border-red/30 bg-red/5">
          <p className="text-sm font-medium text-red">{error}</p>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-surface-200 p-3">
          <p className="text-xs uppercase tracking-wide text-fg-dim">Status</p>
          <p className={`mt-1 text-sm font-semibold capitalize ${agreementStatusColors[agreement.status]}`}>
            {agreement.status.replace(/_/g, " ")}
          </p>
        </div>
        <div className="rounded-lg bg-surface-200 p-3">
          <p className="text-xs uppercase tracking-wide text-fg-dim">Payment</p>
          <p className="mt-1 text-sm font-semibold capitalize text-fg">{agreement.paymentStatus}</p>
        </div>
        <div className="rounded-lg bg-surface-200 p-3">
          <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-fg-dim">
            Visits
            <InfoTip label="Completed / included">Completed service visits out of those included in the term.</InfoTip>
          </p>
          <p className="mt-1 text-sm font-semibold text-fg">
            {agreement.visitsCompleted} / {agreement.visitsIncluded}
          </p>
        </div>
        <div className="rounded-lg bg-surface-200 p-3">
          <p className="text-xs uppercase tracking-wide text-fg-dim">Price</p>
          <p className="mt-1 text-sm font-semibold text-fg">{formatMoney(agreement.priceCents)}</p>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-1 border-b border-border">
        {(["overview", "assets", "visits"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
              tab === t ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {t}
            {t === "assets" && assets.length > 0 ? ` (${assets.length})` : ""}
            {t === "visits" && visits.length > 0 ? ` (${visits.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-dim">Agreement</h3>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">Term</dt>
                <dd className="text-right font-medium text-fg">
                  {agreement.startsAt ? new Date(agreement.startsAt).toLocaleDateString() : "—"} →{" "}
                  {agreement.endsAt ? new Date(agreement.endsAt).toLocaleDateString() : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">Billing</dt>
                <dd className="font-medium capitalize text-fg">{agreement.billingFrequency.replace(/_/g, " ")}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">Renewal</dt>
                <dd className="font-medium text-fg">
                  {agreement.autoRenew ? `Auto-renew (${agreement.renewalType})` : "Manual renewal"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">Created</dt>
                <dd className="font-medium text-fg">{new Date(agreement.createdAt).toLocaleDateString()}</dd>
              </div>
              {agreement.notes && (
                <div className="rounded-lg bg-surface-200 p-3">
                  <p className="text-xs uppercase tracking-wide text-fg-dim">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-fg">{agreement.notes}</p>
                </div>
              )}
            </dl>
          </Card>

          <Card className="p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-dim">Frozen configuration</h3>
            {!snapshot ? (
              <p className="mt-4 text-sm text-fg-muted">No configuration captured for this agreement.</p>
            ) : (
              <dl className="mt-4 grid gap-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">Maintenance</dt>
                  <dd className="font-medium capitalize text-fg">{snapshot.maintenanceFrequency.replace(/_/g, " ")}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">Primary visit type</dt>
                  <dd className="font-medium capitalize text-fg">{snapshot.primaryVisitType.replace(/_/g, " ")}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">Priority</dt>
                  <dd className="font-medium capitalize text-fg">{snapshot.schedulingPriority}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">Parts policy</dt>
                  <dd className="font-medium text-fg">{snapshot.partsPolicy.replace(/_/g, " ")}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">Consumables</dt>
                  <dd className="font-medium text-fg">{snapshot.consumablesPolicy.replace(/_/g, " ")}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">Emergency callouts</dt>
                  <dd className="font-medium text-fg">
                    {snapshot.emergencyCalloutCoverage.replace(/_/g, " ")}
                    {snapshot.emergencyCalloutAllowance > 0 ? ` · ${snapshot.emergencyCalloutAllowance} included` : ""}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">Transport</dt>
                  <dd className="font-medium text-fg">{snapshot.transportIncluded ? "Included" : "Billed separately"}</dd>
                </div>
                {benefits.length > 0 && (
                  <div>
                    <p className="mb-1 mt-2 text-xs uppercase tracking-wide text-fg-dim">Included benefits</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {benefits.map((b) => (
                        <li key={b.key} className="rounded-full bg-green/10 px-2.5 py-0.5 text-xs font-medium text-green">
                          ✓ {b.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </dl>
            )}
          </Card>
        </div>
      )}

      {tab === "assets" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3">
              <h3 className="text-sm font-semibold text-fg">Covered assets ({assets.length})</h3>
            </div>
            {assets.length === 0 ? (
              <div className="p-5 text-sm text-fg-muted">
                No equipment covered yet. Add equipment below to track it under this agreement.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {assets.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">{a.equipmentName}</p>
                      <p className="truncate text-xs text-fg-muted">
                        {[a.equipmentModel, a.equipmentSerial].filter(Boolean).join(" · ") || "No serial"}
                        {a.status ? ` · ${a.status}` : ""}
                      </p>
                      {a.notes && <p className="mt-0.5 text-xs text-fg-dim">{a.notes}</p>}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => run(() => api.removeAgreementAsset(id, a.id))}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="h-fit p-5">
            <h3 className="text-sm font-semibold text-fg">Add equipment</h3>
            <p className="mt-1 text-xs text-fg-muted">Equipment must belong to {agreement.customerName ?? "the customer"}.</p>
            <div className="mt-4 grid gap-4">
              <FormSelect
                value={addAssetEquipmentId}
                onChange={setAddAssetEquipmentId}
                placeholder="Select equipment"
                options={customerEquipment.map((e) => ({
                  value: e.id,
                  label: `${e.type}${e.make ? ` ${e.make}` : ""}${e.model ? ` ${e.model}` : ""}${e.serialNumber ? ` · ${e.serialNumber}` : ""}`,
                }))}
              />
              <Input value={addAssetNotes} onChange={(e) => setAddAssetNotes(e.target.value)} placeholder="Notes for this asset (optional)" />
              <Button onClick={addAsset} disabled={busy}>
                Add to agreement
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === "visits" && (
        <div>
          <Card className="mb-5 p-4">
            <p className="text-sm text-fg-muted">
              <span className="font-semibold text-fg">{stats.due}</span> upcoming ·{" "}
              <span className="font-semibold text-fg">{stats.done}</span> completed of {agreement.visitsIncluded} included
              {agreement.status !== "active" && (
                <span className="ml-2 text-xs text-orange">Visit generation paused while the agreement is not active.</span>
              )}
            </p>
          </Card>

          {visits.length === 0 ? (
            <Card>
              <div className="p-6">
                <p className="text-sm font-medium text-fg">No visits scheduled yet</p>
                <p className="mt-1 text-sm text-fg-muted">
                  {["active", "pending_approval"].includes(agreement.status)
                    ? "Visit generation runs on creation. Check the agreements list if it was created as a draft — activating it generates the schedule."
                    : "Activate the agreement to generate its preventive maintenance schedule."}
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4">
              {visits.map((v) => {
                const acts = actionForVisit(v);
                return (
                  <Card key={v.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-fg">{v.title}</h4>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${visitStatusColors[v.status]}`}>
                            {v.status.replace(/_/g, " ")}
                          </span>
                          <span className="text-xs text-fg-dim">{v.visitNumber}</span>
                        </div>
                        <p className="mt-1 text-xs text-fg-muted">
                          {v.visitType.replace(/_/g, " ")}
                          {v.equipmentName ? ` · ${v.equipmentName}` : ""}
                          {v.technicianName ? ` · ${v.technicianName}` : ""}
                          {" · due "}
                          {v.dueAt ? new Date(v.dueAt).toLocaleString() : v.scheduledAt ? new Date(v.scheduledAt).toLocaleString() : "—"}
                        </p>
                        {v.workPerformed && (
                          <p className="mt-2 text-sm text-fg">{v.workPerformed}</p>
                        )}
                        {v.recommendations && (
                          <p className="mt-1 text-sm text-amber">{v.recommendations}</p>
                        )}
                        {v.partsUsed.length > 0 && (
                          <div className="mt-2 text-xs text-fg-muted">
                            Parts:{" "}
                            {v.partsUsed
                              .map((p) => `${p.name} ×${p.quantity} (${formatMoney(p.costCents)})`)
                              .join(", ")}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {acts.canStart && (
                          <Button variant="secondary" size="sm" disabled={busy} onClick={() => startVisit(v)}>
                            Start
                          </Button>
                        )}
                        {v.status === "in_progress" && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              const notes = window.prompt("Work performed summary");
                              const recommendations = window.prompt("Recommendations (optional)");
                              void run(() =>
                                api.submitServiceVisitReport(v.id, {
                                  workPerformed: notes?.trim() || null,
                                  recommendations: recommendations?.trim() || null,
                                  complete: true,
                                }),
                              );
                            }}
                          >
                            Complete
                          </Button>
                        )}
                        {acts.canCancel && (
                          <Button variant="secondary" size="sm" disabled={busy} onClick={() => cancelVisit(v)}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}