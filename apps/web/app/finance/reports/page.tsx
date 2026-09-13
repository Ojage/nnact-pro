"use client";

import { useState } from "react";
import { formatMoney } from "@nnact/shared";
import type { ExpenseReportRowDTO, PayablesAgingRowDTO, BudgetAnalysisRowDTO, JobCostingDTO } from "@nnact/shared";
import { useFinanceReportQuery } from "@/lib/redux/api";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { FinanceStatusBadge } from "@/components/finance-badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

type Kind = "expenses" | "payables-aging" | "budget-analysis" | "job-costing";

const KINDS: { value: Kind; label: string }[] = [
  { value: "expenses", label: "Expense report" },
  { value: "payables-aging", label: "Payables aging" },
  { value: "budget-analysis", label: "Budget vs actuals" },
  { value: "job-costing", label: "Job costing" },
];

export default function ReportsPage() {
  const [kind, setKind] = useState<Kind>("expenses");
  const [period, setPeriod] = useState("");
  const { data, isLoading, isError } = useFinanceReportQuery({ kind, ...(period ? { period } : {}) });

  const rows = data ?? [];

  const downloadUrl = `/api/finance/reports/${kind}.csv${period ? `?period=${period}` : ""}`;

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Expense, payables aging, budget analysis, and job costing reports — exportable to CSV."
        actions={
          <a href={downloadUrl} download>
            <Button size="sm" variant="secondary">↓ Download CSV</Button>
          </a>
        }
      />

      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <FormSelect
          value={kind}
          onChange={(v) => setKind(v as Kind)}
          options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
          className="sm:w-56"
        />
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Period filter"
        />
      </div>

      {isError && <Card className="mb-4 p-4 border-red/30 bg-red/5"><p className="text-red text-sm">We couldn't load the report.</p></Card>}

      {isLoading ? (
        <Card className="p-0 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-none border-b border-border last:border-b-0" />)}
        </Card>
      ) : rows.length === 0 ? (
        <Card><EmptyState title="No rows in this report" description={period ? "Try a different period." : "Record some activity first."} /></Card>
      ) : kind === "expenses" ? (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No.</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows as ExpenseReportRowDTO[]).map((r) => (
                <TableRow key={r.number}>
                  <TableCell className="font-mono text-xs">{r.number}</TableCell>
                  <TableCell className="text-fg">{r.title}</TableCell>
                  <TableCell className="text-fg-muted">{r.employeeName}</TableCell>
                  <TableCell className="text-fg-muted">{r.categoryName || "—"}</TableCell>
                  <TableCell><FinanceStatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatMoney(r.amountCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : kind === "payables-aging" ? (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No.</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows as PayablesAgingRowDTO[]).map((r) => (
                <TableRow key={r.number}>
                  <TableCell className="font-mono text-xs">{r.number}</TableCell>
                  <TableCell className="text-fg">{r.supplierName}</TableCell>
                  <TableCell><FinanceStatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-fg-muted">{r.dueDate ? r.dueDate.slice(0, 10) : "—"}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.overdueDays > 0 ? "text-destructive font-semibold" : "text-fg-muted"}`}>{r.overdueDays > 0 ? `${r.overdueDays}d` : "—"}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-fg">{formatMoney(r.balanceCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : kind === "budget-analysis" ? (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Cost center</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Planned</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-right">Used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows as BudgetAnalysisRowDTO[]).map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{r.period}</TableCell>
                  <TableCell className="text-fg-muted">{r.costCenterName ?? "—"}</TableCell>
                  <TableCell className="text-fg-muted">{r.categoryName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-fg">{formatMoney(r.plannedCents)}</TableCell>
                  <TableCell className="text-right tabular-nums text-fg">{formatMoney(r.actualCents)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.remainingCents < 0 ? "text-destructive" : "text-fg-muted"}`}>{formatMoney(r.remainingCents)}</TableCell>
                  <TableCell className={`text-right tabular-nums font-semibold ${r.usedPercent >= 100 ? "text-destructive" : r.usedPercent >= 80 ? "text-chart-3" : "text-fg"}`}>{Math.round(r.usedPercent)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Direct costs</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Bills</TableHead>
                <TableHead className="text-right">Labor</TableHead>
                <TableHead className="text-right">Gross profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows as JobCostingDTO[]).map((r) => (
                <TableRow key={r.jobId}>
                  <TableCell className="text-fg">{r.title}<span className="text-fg-dim text-xs block font-mono">{r.jobNumber ?? ""}</span></TableCell>
                  <TableCell className="text-fg-muted">{r.customerName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-fg">{formatMoney(r.revenueCents)}</TableCell>
                  <TableCell className="text-right tabular-nums text-fg-muted">{formatMoney(r.directCostCents)}</TableCell>
                  <TableCell className="text-right tabular-nums text-fg-muted">{formatMoney(r.expenseCents)}</TableCell>
                  <TableCell className="text-right tabular-nums text-fg-muted">{formatMoney(r.billCents)}</TableCell>
                  <TableCell className="text-right tabular-nums text-fg-muted">{formatMoney(r.laborCostCents)}</TableCell>
                  <TableCell className={`text-right tabular-nums font-semibold ${r.grossProfitCents < 0 ? "text-destructive" : "text-chart-2"}`}>{formatMoney(r.grossProfitCents)}</TableCell>
                  <TableCell className="text-right tabular-nums text-fg">{r.grossMarginPercent}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}