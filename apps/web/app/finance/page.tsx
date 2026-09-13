"use client";

import { useMemo } from "react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { formatMoney } from "@nnact/shared";
import { useFinanceDashboardQuery, useJobCostingQuery } from "@/lib/redux/api";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { FinanceStatusBadge, BudgetLevelBadge } from "@/components/finance-badge";

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide">{label}</p>
      <p className={`mt-1.5 text-xl font-bold tabular-nums ${tone === "good" ? "text-chart-2" : tone === "bad" ? "text-destructive" : "text-fg"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-fg-dim">{sub}</p>}
    </Card>
  );
}

export default function FinancePage() {
  const { data: dash, isLoading, isError } = useFinanceDashboardQuery();
  const { data: costing = [] } = useJobCostingQuery();

  const topJobs = useMemo(() => [...costing].sort((a, b) => b.grossProfitCents - a.grossProfitCents).slice(0, 5), [costing]);

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-8 w-40 mb-2" />
        <Skeleton className="h-4 w-64 mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Finance"
        description={
          dash
            ? `${dash.period} · ${formatMoney(dash.monthTotalOutCents)} out this month`
            : undefined
        }
        actions={
          <div className="flex gap-2">
            <Link href="/finance/expenses" className="text-sm text-fg-link hover:text-fg underline-offset-2 hover:underline">
              Expenses
            </Link>
          </div>
        }
      />

      {isError || !dash ? (
        <Card className="p-6 border-red/30 bg-red/5">
          <p className="text-red text-sm">We couldn't load the finance dashboard. Check your connection and try again.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Paid this month" value={formatMoney(dash.monthExpenseCents)} sub="expenses" />
            <StatCard label="Bills paid" value={formatMoney(dash.monthBillPaidCents)} sub={formatMoney(dash.billsPayableCents) + " payable"} />
            <StatCard
              label="Overdue bills"
              value={formatMoney(dash.billsOverdueCents)}
              tone={dash.billsOverdueCents > 0 ? "bad" : "good"}
            />
            <StatCard label="Petty cash" value={formatMoney(dash.pettyCashBalanceCents)} sub="balance" />
            <StatCard
              label="Outstanding advances"
              value={formatMoney(dash.outstandingAdvanceCents)}
              tone={dash.outstandingAdvanceCents > 0 ? "bad" : undefined}
            />
            <StatCard
              label="Unsettled reimbursements"
              value={formatMoney(dash.unsettledReimbursementCents)}
              tone={dash.unsettledReimbursementCents > 0 ? "bad" : undefined}
            />
            <StatCard
              label="Budget used"
              value={`${Math.round(dash.budgetUsedPercent)}%`}
              sub={`${formatMoney(dash.budgetActualCents)} of ${formatMoney(dash.budgetPlannedCents)}`}
              tone={dash.budgetUsedPercent >= 100 ? "bad" : dash.budgetUsedPercent >= 80 ? undefined : "good"}
            />
            <StatCard label="Gross jobs" value={`${costing.length}`} sub="job costing tracked" />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Budget lines */}
            <Card className="p-4 lg:col-span-1">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-fg">Budget this period</h3>
                <Link href="/finance/budgets" className="text-xs text-fg-link hover:text-fg">Manage</Link>
              </div>
              {dash.budgetLines.length === 0 ? (
                <p className="text-sm text-fg-dim">No budget set for {dash.period}.</p>
              ) : (
                <ul className="space-y-2">
                  {dash.budgetLines.map((l) => (
                    <li key={l.id} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-fg truncate">{l.categoryName ?? "Uncategorized"}</span>
                        <span className="text-fg-muted tabular-nums">
                          {formatMoney(l.actualCents)}
                          <span className="text-fg-dim"> / {formatMoney(l.plannedCents)}</span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${l.level === "critical" ? "bg-destructive" : l.level === "warning" ? "bg-chart-3" : "bg-chart-2"}`}
                          style={{ width: `${Math.min(100, l.usedPercent)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Recent expenses */}
            <Card className="p-4 lg:col-span-1">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-fg">Recent expenses</h3>
                <Link href="/finance/expenses" className="text-xs text-fg-link hover:text-fg">View all</Link>
              </div>
              {dash.recentExpenses.length === 0 ? (
                <p className="text-sm text-fg-dim">No expenses yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {dash.recentExpenses.map((e) => (
                    <li key={e.id} className="text-sm flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/finance/expenses/${e.id}`} className="truncate block text-fg hover:text-fg-link">
                          {e.title}
                        </Link>
                        <span className="text-xs text-fg-dim">{e.employeeName ?? "Staff"}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-medium tabular-nums text-fg">{formatMoney(e.amountCents)}</span>
                        <div className="flex justify-end">
                          <FinanceStatusBadge status={e.status} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Top gross profit */}
            <Card className="p-4 lg:col-span-1">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-fg">Top jobs by profit</h3>
                <Link href="/finance/reports" className="text-xs text-fg-link hover:text-fg">Reports</Link>
              </div>
              {topJobs.length === 0 ? (
                <p className="text-sm text-fg-dim">No job costing data yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {topJobs.map((j) => (
                    <li key={j.jobId} className="text-sm flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/jobs/${j.jobId}`} className="truncate block text-fg hover:text-fg-link">
                          {j.title}
                        </Link>
                        <span className="text-xs text-fg-dim">{j.customerName ?? "—"}</span>
                      </div>
                      <span className="font-medium tabular-nums shrink-0 text-fg">{formatMoney(j.grossProfitCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {dash.budgetLines.some((l) => l.level !== "ok") && (
            <Card className="mt-6 p-4 border-border">
              <div className="flex flex-wrap items-center gap-2">
                <BudgetLevelBadge level="warning" />
                <span className="text-sm text-fg-dim">Some budget lines are near or over their plan.</span>
                <Link href="/finance/budgets" className="text-sm text-fg-link hover:text-fg ml-auto">Review budget</Link>
              </div>
            </Card>
          )}

          {dash.recentExpenses.length === 0 && dash.recentBills.length === 0 && (
            <Card className="mt-6">
              <EmptyState
                title="Finance workspace"
                description="Record expenses, pay supplier bills, manage advances and petty cash, and keep budgets in check."
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}