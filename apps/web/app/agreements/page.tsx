"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/form-select";
import { EmptyState } from "@/components/empty-state";
import { api } from "@/lib/api";
import { formatMoney, AGREEMENT_STATUS, type ServiceAgreementDTO } from "@nnact/shared";

const statusColors: Record<string, string> = {
  active: "bg-green/10 text-green",
  draft: "bg-surface-500/60 text-fg-dim",
  pending_approval: "bg-amber/10 text-amber",
  suspended: "bg-orange/10 text-orange",
  expired: "bg-orange/10 text-orange",
  canceled: "bg-red/10 text-red",
  renewed: "bg-blue/10 text-blue",
};

export default function AgreementsPage() {
  const router = useRouter();
  const [agreements, setAgreements] = useState<ServiceAgreementDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.serviceAgreements();
      setAgreements(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load agreements");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(() => {
    const live = agreements.filter((a) => ["active", "pending_approval"].includes(a.status));
    return {
      total: agreements.length,
      active: live.length,
      visitsCompleted: agreements.reduce((s, a) => s + a.visitsCompleted, 0),
      mrrCents:
        agreements
          .filter((a) => a.status === "active" && ["monthly", "quarterly"].includes(a.billingFrequency))
          .reduce((sum, a) => {
            const months: Record<string, number> = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 };
            return sum + (a.priceCents / (months[a.billingFrequency] ?? 12));
          }, 0) / 100,
    };
  }, [agreements]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return agreements.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (!term) return true;
      return (
        a.planName.toLowerCase().includes(term) ||
        a.agreementNumber.toLowerCase().includes(term) ||
        (a.customerName ?? "").toLowerCase().includes(term)
      );
    });
  }, [agreements, statusFilter, search]);

  return (
    <div>
      <PageHeader
        title="Service Agreements"
        description={
          <span>
            {stats.total} agreement{stats.total !== 1 ? "s" : ""} ·{" "}
            <span className="text-fg">{stats.active} active</span> · {stats.visitsCompleted} visits performed ·{" "}
            ≈ {formatMoney(Math.round(stats.mrrCents))} / mo from live recurring plans
          </span>
        }
        actions={
          <Button size="sm" onClick={() => router.push("/agreements/new")}>
            ⊕ New Agreement
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, plan or number…" className="max-w-sm" />
        <FormSelect
          value={statusFilter}
          onChange={setStatusFilter}
          className="w-44"
          options={[
            { value: "all", label: "All statuses" },
            ...AGREEMENT_STATUS.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
          ]}
        />
      </div>

      {error && (
        <Card className="mb-5 border-red/30 bg-red/5">
          <p className="text-sm font-medium text-red">Agreements API unavailable</p>
          <p className="mt-1 text-xs text-fg-muted">{error}</p>
        </Card>
      )}

      {loading ? (
        <Card>
          <p className="text-sm text-fg-muted">Loading agreements…</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            title={agreements.length === 0 ? "No agreements yet" : "No agreements match your search"}
            description={
              agreements.length === 0
                ? "Subscribe a customer to a plan template, or create a custom agreement, to start scheduling preventive maintenance."
                : "Try different filters or search terms."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-dim">
                <th className="px-4 py-3 font-semibold">Agreement</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Price</th>
                <th className="px-4 py-3 text-right font-semibold">Visits</th>
                <th className="px-4 py-3 font-semibold">Term</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-border/60 transition-colors hover:bg-surface-200/50">
                  <td className="px-4 py-3">
                    <Link href={`/agreements/${a.id}`} className="font-medium text-fg hover:text-accent">
                      {a.agreementNumber}
                    </Link>
                    <p className="mt-0.5 text-xs text-fg-muted">{a.planName}</p>
                  </td>
                  <td className="px-4 py-3 text-fg">{a.customerName}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusColors[a.status]}`}>
                      {a.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-fg">{formatMoney(a.priceCents)}</td>
                  <td className="px-4 py-3 text-right text-fg-muted">
                    {a.visitsCompleted} / {a.visitsIncluded}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {a.startsAt ? new Date(a.startsAt).toLocaleDateString() : "—"} →{" "}
                    {a.endsAt ? new Date(a.endsAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}