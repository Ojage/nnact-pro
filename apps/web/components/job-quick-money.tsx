"use client";

import { useEffect, useState } from "react";
import type { CurrencyCode, JobDTO } from "@nnact/shared";
import { CURRENCY_CATALOG, formatMoney, isCurrencyCode } from "@nnact/shared";
import { useOrgQuery, usePatchJobMutation } from "@/lib/redux/api";
import { useSession } from "@/lib/session-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";

interface JobQuickMoneyProps {
  job: JobDTO;
}

const moneyStep = (currency: CurrencyCode) =>
  CURRENCY_CATALOG[currency].minorUnits === 0 ? "1" : "0.01";

/**
 * Dispatcher-friendly quick money snapshot on the job. Trade the structured
 * invoice flow for four plain numbers: advance received, balance left, how much
 * can go to expenses, and what's left as profit. Separate from the real invoice
 * ledger — payments are still recorded the normal way in "Pricing & payment".
 */
export function JobQuickMoney({ job }: JobQuickMoneyProps) {
  const { data: org } = useOrgQuery();
  const { user } = useSession();
  const currency: CurrencyCode = isCurrencyCode(org?.businessSettings?.currency)
    ? org!.businessSettings!.currency
    : "XAF";
  const step = moneyStep(currency);
  const symbol = CURRENCY_CATALOG[currency].symbol;
  const canEdit = user?.role === "owner" || user?.role === "dispatcher";

  const advanceCents = job.advanceReceivedCents ?? 0;
  const balanceCents = job.customerBalanceCents ?? 0;
  const expenseCents = job.expenseAllowanceCents ?? 0;
  const totalCents = advanceCents + balanceCents;
  const profitCents = totalCents - expenseCents;

  const [editing, setEditing] = useState(false);
  const [advanceInput, setAdvanceInput] = useState(String(advanceCents / 100));
  const [balanceInput, setBalanceInput] = useState(String(balanceCents / 100));
  const [expenseInput, setExpenseInput] = useState(String(expenseCents / 100));
  const [error, setError] = useState<string | null>(null);
  const [patchJob, patchState] = usePatchJobMutation();

  useEffect(() => {
    setAdvanceInput(String(advanceCents / 100));
    setBalanceInput(String(balanceCents / 100));
    setExpenseInput(String(expenseCents / 100));
  }, [advanceCents, balanceCents, expenseCents]);

  const toCents = (raw: string) => Math.round((Number.parseFloat(raw) || 0) * 100);
  const draftAdvance = toCents(advanceInput);
  const draftBalance = toCents(balanceInput);
  const draftExpense = toCents(expenseInput);
  const draftProfit = draftAdvance + draftBalance - draftExpense;

  function resetDraft() {
    setAdvanceInput(String(advanceCents / 100));
    setBalanceInput(String(balanceCents / 100));
    setExpenseInput(String(expenseCents / 100));
    setError(null);
  }

  function openEdit() {
    resetDraft();
    setEditing(true);
  }

  async function handleSave() {
    setError(null);
    const data = {
      advanceReceivedCents: draftAdvance,
      customerBalanceCents: draftBalance,
      expenseAllowanceCents: draftExpense,
    };
    if (data.advanceReceivedCents < 0 || data.customerBalanceCents < 0 || data.expenseAllowanceCents < 0) {
      setError("Amounts cannot be negative.");
      return;
    }
    try {
      await patchJob({ id: job.id, data }).unwrap();
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-1.5">
          Quick money
          <InfoTip label="About quick money" side="right">
            A simple cash snapshot for the dispatcher: what the customer paid as advance, what is still left to collect,
            how much of it may be set aside for expenses, and the profit that remains. Kept separate from the invoice —
            real payments are still recorded in Pricing &amp; payment.
          </InfoTip>
        </CardTitle>
        <CardDescription>Advance · balance · expenses · profit</CardDescription>
      </CardHeader>
      <CardContent>
        {editing ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
          >
            <div>
              <label htmlFor="qm-advance" className="mb-1.5 block text-xs font-semibold text-fg-muted">
                Advance received from customer ({symbol})
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-fg-dim">{symbol}</span>
                <Input
                  id="qm-advance"
                  type="number"
                  min="0"
                  step={step}
                  value={advanceInput}
                  onChange={(e) => setAdvanceInput(e.target.value)}
                  inputMode="decimal"
                />
              </div>
            </div>

            <div>
              <label htmlFor="qm-balance" className="mb-1.5 block text-xs font-semibold text-fg-muted">
                Balance left to collect ({symbol})
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-fg-dim">{symbol}</span>
                <Input
                  id="qm-balance"
                  type="number"
                  min="0"
                  step={step}
                  value={balanceInput}
                  onChange={(e) => setBalanceInput(e.target.value)}
                  inputMode="decimal"
                />
              </div>
            </div>

            <div>
              <label htmlFor="qm-expense" className="mb-1.5 block text-xs font-semibold text-fg-muted">
                May be used for expenses ({symbol})
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-fg-dim">{symbol}</span>
                <Input
                  id="qm-expense"
                  type="number"
                  min="0"
                  step={step}
                  value={expenseInput}
                  onChange={(e) => setExpenseInput(e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <p className="mt-1 text-xs text-fg-dim">
                Parts, fuel, subcontractors, anything spent to deliver this job. Profit is what remains after these.
              </p>
            </div>

            <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-fg-muted">Total (advance + balance)</span>
                <span className="font-semibold text-fg">{formatMoney(draftAdvance + draftBalance, currency)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-fg-muted">Estimated profit</span>
                <span className={`font-bold ${draftProfit >= 0 ? "text-green" : "text-red"}`}>
                  {formatMoney(draftProfit, currency)}
                </span>
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button type="submit" loading={patchState.isLoading} size="sm">
                Save
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="space-y-1 rounded-lg border border-accent/20 bg-accent/5 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-fg-muted">Total job amount</span>
                <span className="font-bold text-fg">{formatMoney(totalCents, currency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-fg-muted">Advance received</span>
                <span className="font-semibold text-green">{formatMoney(advanceCents, currency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-fg-muted">Balance left</span>
                <span className="font-semibold text-yellow">{formatMoney(balanceCents, currency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-fg-muted">May be used for expenses</span>
                <span className="font-semibold text-fg">{formatMoney(expenseCents, currency)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border/60 pt-1">
                <span className="text-fg-muted">Estimated profit</span>
                <span className={`font-bold ${profitCents >= 0 ? "text-green" : "text-red"}`}>
                  {formatMoney(profitCents, currency)}
                </span>
              </div>
            </div>

            {canEdit && (
              <Button className="mt-3 w-full" variant="secondary" onClick={openEdit}>
                {totalCents > 0 || expenseCents > 0 ? "Update quick money" : "Add quick money"}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}