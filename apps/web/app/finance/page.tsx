"use client";

import { useMemo } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Calculator,
  CircleDollarSign,
  ClipboardList,
  Coins,
  FilePlus2,
  FileSignature,
  FileText,
  HandCoins,
  Landmark,
  Receipt,
  RefreshCw,
  Repeat,
  Settings2,
  Undo2,
  Wallet,
} from "lucide-react";
import { formatMoney } from "@nnact/shared";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { useFinanceDashboardQuery, useJobCostingQuery, useBillingInvoicesQuery, useBillingEstimatesQuery } from "@/lib/redux/api";
import { Skeleton } from "@/components/ui/skeleton";
import { FinanceStatusBadge } from "@/components/finance-badge";
import { requestLearn } from "@/lib/walkthroughs/events";
import {
  Banner,
  ColumnChart,
  ConsolePage,
  Facts,
  MeterList,
  Panel,
  ProductTiles,
  ResourceList,
  ServiceOverviewHero,
  SummaryCards,
  ToolbarButton,
  illustrationSrc,
  monthlySeries,
  type ProductTile,
} from "@/components/console";

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const DAY = 86_400_000;

const viewAll = "text-sm font-medium text-[var(--shell-accent-text)] hover:underline";

export default function FinancePage() {
  const dashQuery = useFinanceDashboardQuery();
  const { data: dash, isLoading, isError } = dashQuery;
  const { data: costing = [] } = useJobCostingQuery();
  const { data: invoices = [] } = useBillingInvoicesQuery();
  const { data: estimates = [] } = useBillingEstimatesQuery();

  const topJobs = useMemo(() => [...costing].sort((a, b) => b.grossProfitCents - a.grossProfitCents).slice(0, 5), [costing]);
  const margin = useMemo(() => {
    const revenue = costing.reduce((sum, row) => sum + row.revenueCents, 0);
    const profit = costing.reduce((sum, row) => sum + row.grossProfitCents, 0);
    return revenue > 0 ? Math.round((profit / revenue) * 100) : null;
  }, [costing]);

  const receivables = useMemo(() => {
    const now = Date.now();
    const open = invoices.filter((i) => i.status === "draft" || i.status === "sent");
    const overdue = open.filter((i) => i.status === "sent" && i.dueAt && new Date(i.dueAt).getTime() < now);
    return {
      open,
      count: open.length,
      totalCents: open.reduce((sum, i) => sum + (i.total ?? 0), 0),
      overdue,
      overdueCents: overdue.reduce((sum, i) => sum + (i.total ?? 0), 0),
    };
  }, [invoices]);

  const invoicedByMonth = useMemo(
    () => monthlySeries(invoices.filter((i) => i.status !== "void"), (i) => i.createdAt, (i) => i.total ?? 0, 6),
    [invoices],
  );
  const invoicedSixMonths = invoicedByMonth.reduce((sum, d) => sum + d.value, 0);
  const openEstimates = estimates.filter((e) => e.status === "draft" || e.status === "sent");

  const tiles: ProductTile[] = [
    { href: "/invoices", icon: Receipt, name: "Invoices & Payments", description: "Issue invoices, record payments, track receivables.", meta: `${invoices.length} invoices` },
    { href: "/estimates", icon: FileText, name: "Estimates", description: "Prepare and send quotes; accept and convert to jobs.", meta: `${openEstimates.length} open` },
    { href: "/agreements", icon: FileSignature, name: "Agreements", description: "Service agreements and recurring commitments." },
    { href: "/service-plans", icon: Repeat, name: "Service Plans", description: "Plan templates for recurring and scheduled service." },
    { href: "/finance/expenses", icon: ArrowUpFromLine, name: "Expenses", description: "Staff expense records and approvals." },
    { href: "/finance/bills", icon: Landmark, name: "Supplier Bills", description: "Supplier invoices, payments and payables." },
    { href: "/finance/advances", icon: HandCoins, name: "Advances", description: "Cash advances issued to staff, tracked to settlement." },
    { href: "/finance/reimbursements", icon: Undo2, name: "Reimbursements", description: "Out-of-pocket claims and reimbursements." },
    { href: "/finance/petty-cash", icon: Coins, name: "Petty Cash", description: "Small cash funds, deposits and withdrawals." },
    { href: "/finance/budgets", icon: Calculator, name: "Budgets", description: "Budget lines and spend against plan." },
    { href: "/finance/reports", icon: BarChart3, name: "Reports", description: "Expense, payables and budget analysis." },
    { href: "/finance/categories", icon: Settings2, name: "Setup", description: "Expense categories, cost centers, numbering." },
  ];

  if (isLoading) {
    return (
      <div className="grid gap-6" aria-busy="true" aria-label="Loading finance overview">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <Skeleton className="h-44 rounded-[8px]" />
          <Skeleton className="h-44 rounded-[8px]" />
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-[8px]" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-[8px]" />
      </div>
    );
  }

  const overBudget = dash?.budgetLines.filter((line) => line.level !== "ok") ?? [];

  return (
    <ConsolePage className="gap-6">
      <div data-tour="finance-overview" className="grid min-w-0 gap-6">
        <ServiceOverviewHero
          title="Finance"
          icon={CircleDollarSign}
          description="Bill customers, pay suppliers, track staff money and keep spending inside the budget, all tied back to the jobs that earned or spent it."
          meta={
            dash ? (
              <>
                <span>Period {dash.period}</span>
                <span>Currency {dash.currency}</span>
                <ToolbarButton
                  icon={RefreshCw}
                  spinning={dashQuery.isFetching}
                  disabled={dashQuery.isFetching}
                  onClick={() => void dashQuery.refetch()}
                  className="-ml-2.5 h-7"
                >
                  Refresh
                </ToolbarButton>
              </>
            ) : null
          }
          quickActions={[
            { label: "Create invoice", href: "/invoices", icon: FilePlus2 },
            { label: "Record expense", href: "/finance/expenses", icon: ArrowUpFromLine },
            { label: "Pay a supplier bill", href: "/finance/bills", icon: Landmark },
            { label: "Issue an advance", href: "/finance/advances", icon: HandCoins },
            { label: "Set a budget", href: "/finance/budgets", icon: Calculator },
            { label: "Run a report", href: "/finance/reports", icon: BarChart3 },
          ]}
          illustration={{
            image: illustrationSrc("finance"),
            icon: Wallet,
            title: "Money in, money out, per job.",
            copy: "Every invoice, bill and expense can point at a job, so job costing shows the real margin.",
            links: [
              { label: "Start a walkthrough", onClick: () => requestLearn() },
              { label: "Finance questions in the FAQ", href: "/help/faq" },
            ],
          }}
        />

        {isError || !dash ? (
          <Banner tone="danger" title="The finance dashboard could not be loaded." action={<ToolbarButton onClick={() => void dashQuery.refetch()}>Try again</ToolbarButton>}>
            Check your connection and try again. The pages below still work.
          </Banner>
        ) : (
          <>
            {dash.billsOverdueCents > 0 || receivables.overdue.length > 0 || overBudget.length > 0 ? (
              <ul className="grid gap-2" role="list" aria-label="Finance alerts">
                {dash.billsOverdueCents > 0 ? (
                  <li>
                    <Banner tone="danger" title={`${formatMoney(dash.billsOverdueCents)} in supplier bills is overdue.`} action={<Link href="/finance/bills" className={viewAll}>Review bills</Link>} />
                  </li>
                ) : null}
                {receivables.overdue.length > 0 ? (
                  <li>
                    <Banner
                      tone="warning"
                      title={`${receivables.overdue.length} customer invoice${receivables.overdue.length === 1 ? " is" : "s are"} past due (${formatMoney(receivables.overdueCents)}).`}
                      action={<Link href="/invoices" className={viewAll}>Chase payments</Link>}
                    />
                  </li>
                ) : null}
                {overBudget.length > 0 ? (
                  <li>
                    <Banner
                      tone="warning"
                      title={`${overBudget.length} budget line${overBudget.length === 1 ? " is" : "s are"} near or over plan.`}
                      action={<Link href="/finance/budgets" className={viewAll}>Review budget</Link>}
                    />
                  </li>
                ) : null}
              </ul>
            ) : null}

            <SummaryCards
              label="Finance at a glance"
              items={[
                {
                  label: "Owed to you",
                  icon: ArrowDownToLine,
                  value: formatMoney(receivables.totalCents),
                  note: `${receivables.count} open invoice${receivables.count === 1 ? "" : "s"}`,
                  href: "/invoices",
                },
                {
                  label: "Spent this month",
                  icon: ArrowUpFromLine,
                  value: formatMoney(dash.monthTotalOutCents),
                  note: `${formatMoney(dash.monthExpenseCents)} expenses · ${formatMoney(dash.monthBillPaidCents)} bills`,
                  href: "/finance/expenses",
                },
                {
                  label: "You owe suppliers",
                  icon: Landmark,
                  value: formatMoney(dash.billsPayableCents),
                  note: dash.billsOverdueCents > 0 ? `${formatMoney(dash.billsOverdueCents)} overdue` : "Nothing overdue",
                  attention: dash.billsOverdueCents > 0,
                  href: "/finance/bills",
                },
                {
                  label: "Budget used",
                  icon: Calculator,
                  value: `${Math.round(dash.budgetUsedPercent)}%`,
                  meter: dash.budgetPlannedCents ? dash.budgetUsedPercent / 100 : undefined,
                  note: dash.budgetPlannedCents
                    ? `${formatMoney(dash.budgetActualCents)} of ${formatMoney(dash.budgetPlannedCents)}`
                    : `No budget set for ${dash.period}`,
                  attention: dash.budgetUsedPercent >= 100,
                  href: "/finance/budgets",
                },
              ]}
            />

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <Panel
                title={`Invoiced per month (${dash.currency})`}
                description={`${formatMoney(invoicedSixMonths)} across the last six months, void invoices left out`}
                actions={<Link href="/invoices" className={viewAll}>Invoices</Link>}
              >
                <ColumnChart
                  data={invoicedByMonth}
                  format={(value) => formatMoney(value)}
                  formatTick={(value) => compact.format(value / 100)}
                  empty="Nothing was invoiced in the last six months."
                  label="Invoiced amount per month for the last six months"
                />
              </Panel>
              <Panel title={`Budget for ${dash.period}`} actions={<Link href="/finance/budgets" className={viewAll}>Manage</Link>}>
                <MeterList
                  empty={`No budget set for ${dash.period}.`}
                  rows={dash.budgetLines.slice(0, 6).map((line) => ({
                    id: line.id,
                    label: line.categoryName ?? "Uncategorized",
                    value: line.actualCents,
                    of: line.plannedCents,
                    valueText: `${formatMoney(line.actualCents)} of ${formatMoney(line.plannedCents)}`,
                    level: line.level,
                  }))}
                />
              </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <Panel title="Open invoices" description="Draft and sent, oldest due first" flush actions={<Link href="/invoices" className={viewAll}>View all</Link>}>
                <ResourceList
                  empty="No open invoices. Everything billed is paid."
                  rows={[...receivables.open]
                    .sort((a, b) => (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9"))
                    .slice(0, 5)
                    .map((invoice) => ({
                      id: invoice.id,
                      href: `/invoices/${invoice.id}`,
                      primary: invoice.number,
                      secondary: invoice.dueAt
                        ? new Date(invoice.dueAt).getTime() < Date.now() - DAY / 2
                          ? `Overdue since ${new Date(invoice.dueAt).toLocaleDateString()}`
                          : `Due ${new Date(invoice.dueAt).toLocaleDateString()}`
                        : "No due date",
                      status: <FinanceStatusBadge status={invoice.status} />,
                      trailing: formatMoney(invoice.total ?? 0),
                    }))}
                />
              </Panel>
              <Panel title="Recent expenses" flush actions={<Link href="/finance/expenses" className={viewAll}>View all</Link>}>
                <ResourceList
                  empty="No expenses recorded yet."
                  rows={dash.recentExpenses.slice(0, 5).map((expense) => ({
                    id: expense.id,
                    href: `/finance/expenses/${expense.id}`,
                    primary: expense.title,
                    secondary: expense.employeeName ?? "Staff",
                    status: <FinanceStatusBadge status={expense.status} />,
                    trailing: formatMoney(expense.amountCents),
                  }))}
                />
              </Panel>
              <Panel
                title="Top jobs by profit"
                description={margin !== null ? `Average gross margin ${margin}%` : undefined}
                flush
                actions={<Link href="/finance/reports" className={viewAll}>Reports</Link>}
                className="lg:col-span-2 xl:col-span-1"
              >
                <ResourceList
                  empty="No job costing data yet."
                  rows={topJobs.map((job) => ({
                    id: job.jobId,
                    href: `/jobs/${job.jobId}`,
                    primary: job.title,
                    secondary: `${job.customerName ?? "—"} · ${Math.round(job.grossMarginPercent)}% margin`,
                    trailing: formatMoney(job.grossProfitCents),
                  }))}
                />
              </Panel>
            </div>

            <Panel title="Staff money and cash" description="Balances people are holding or waiting for">
              <Facts
                termWidth="14rem"
                rows={[
                  [
                    "Outstanding advances",
                    <Link key="adv" href="/finance/advances" className="tabular-nums text-fg hover:text-[var(--shell-accent-text)] hover:underline">
                      {formatMoney(dash.outstandingAdvanceCents)}
                    </Link>,
                  ],
                  [
                    "Unsettled reimbursements",
                    <Link key="reimb" href="/finance/reimbursements" className="tabular-nums text-fg hover:text-[var(--shell-accent-text)] hover:underline">
                      {formatMoney(dash.unsettledReimbursementCents)}
                    </Link>,
                  ],
                  [
                    "Petty cash balance",
                    <Link key="petty" href="/finance/petty-cash" className="tabular-nums text-fg hover:text-[var(--shell-accent-text)] hover:underline">
                      {formatMoney(dash.pettyCashBalanceCents)}
                    </Link>,
                  ],
                  ["Open estimates", `${openEstimates.length} worth ${formatMoney(openEstimates.reduce((sum, e) => sum + e.total, 0))}`],
                ]}
              />
            </Panel>
          </>
        )}

        <ProductTiles title="Finance products" tiles={tiles} />

        <section aria-labelledby="finance-learn" className="grid gap-2 rounded-[8px] border border-[var(--shell-border)] p-4">
          <h2 id="finance-learn" className="flex items-center gap-2 text-sm font-medium text-fg">
            <ClipboardList className="size-4 text-fg-muted" aria-hidden="true" />
            Learn more
          </h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm" role="list">
            <li>
              <button type="button" onClick={() => requestLearn()} className={viewAll}>
                Guided walkthroughs
              </button>
            </li>
            <li>
              <Link href="/help/faq" className={viewAll}>
                Help and FAQ
              </Link>
            </li>
            <li>
              <Link href="/finance/categories" className={viewAll}>
                Set up categories and cost centers
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </ConsolePage>
  );
}
