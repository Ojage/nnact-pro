"use client";

import { useState } from "react";
import { formatMoney } from "@nnact/shared";
import {
  useCreatePettyCashFundMutation,
  usePatchPettyCashFundMutation,
  usePettyCashFundsQuery,
  usePettyCashOperateMutation,
  usePettyCashTransactionsQuery,
  useUsersQuery,
} from "@/lib/redux/api";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/ui/form-select";
import { FinanceStatusBadge } from "@/components/finance-badge";

const KIND_LABEL: Record<string, string> = { DEPOSIT: "Deposit", TOP_UP: "Top-up", EXPENSE: "Expense", CLOSEOUT: "Close-out" };

export default function PettyCashPage() {
  const { data: funds = [], isLoading } = usePettyCashFundsQuery();
  const { data: users = [] } = useUsersQuery();
  const [createFund, { isLoading: creating }] = useCreatePettyCashFundMutation();
  const [patchFund] = usePatchPettyCashFundMutation();
  const [operate, { isLoading: operating }] = usePettyCashOperateMutation();
  const [selected, setSelected] = useState<string | null>(null);
  const { data: transactions = [] } = usePettyCashTransactionsQuery(selected ?? "", { skip: !selected });

  const [showCreate, setShowCreate] = useState(false);
  const [fName, setFName] = useState("");
  const [fCustodian, setFCustodian] = useState("");
  const [fOpening, setFOpening] = useState("");
  const [mode, setMode] = useState<"DEPOSIT" | "TOP_UP" | "EXPENSE" | "CLOSEOUT">("DEPOSIT");
  const [fAmount, setFAmount] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [opError, setOpError] = useState<string | null>(null);

  const activeFund = funds.find((f) => f.id === selected) ?? funds[0] ?? null;

  const createOne = async () => {
    setOpError(null);
    if (!fName.trim()) { setOpError("Fund name is required."); return; }
    try {
      const fund = await createFund({
        name: fName.trim(),
        ...(fCustodian ? { custodianId: fCustodian } : {}),
        ...(Number(fOpening) > 0 ? { openingBalanceCents: Math.round(Number(fOpening) * 100) } : {}),
      }).unwrap();
      setSelected(fund.id);
      setShowCreate(false); setFName(""); setFCustodian(""); setFOpening("");
    } catch (e) {
      const err = e as { data?: { error?: string } };
      setOpError(err?.data?.error ?? "Could not create fund.");
    }
  };

  const doOperate = async () => {
    if (!activeFund) return;
    setOpError(null);
    const amt = Math.round(Number(fAmount) * 100);
    if (!Number.isFinite(amt) || amt <= 0) { setOpError("Enter a valid amount."); return; }
    try {
      await operate({ id: activeFund.id, action: mode.toLowerCase() as "deposit" | "expense", body: { amountCents: amt, description: fDesc.trim() || null } }).unwrap();
      setFAmount(""); setFDesc("");
    } catch (e) {
      const err = e as { data?: { error?: string } };
      setOpError(err?.data?.error ?? "Operation failed.");
    }
  };

  const closeFund = async () => {
    if (!activeFund) return;
    setOpError(null);
    try {
      await operate({ id: activeFund.id, action: "close", body: {} }).unwrap();
    } catch (e) {
      const err = e as { data?: { error?: string } };
      setOpError(err?.data?.error ?? "Could not close fund.");
    }
  };

  if (isLoading) {
    return <div><Skeleton className="h-8 w-40 mb-2" /><Skeleton className="h-4 w-52 mb-6" /><Skeleton className="h-40 rounded-xl mb-4" /><Skeleton className="h-40 rounded-xl" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Petty cash"
        description={funds.length > 0 ? `${funds.length} fund${funds.length > 1 ? "s" : ""} · ${formatMoney(funds.filter((f) => f.status === "active").reduce((a, f) => a + f.currentBalanceCents, 0))} on hand` : undefined}
        actions={<Button onClick={() => setShowCreate(true)} size="sm">⊕ New Fund</Button>}
      />

      {showCreate && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <form onSubmit={(e) => { e.preventDefault(); createOne(); }} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-fg">New Petty Cash Fund</h3>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-fg-muted hover:text-fg" onClick={() => setShowCreate(false)}>✕</Button>
                </div>
                {opError && <p className="text-red text-xs mb-3 p-2 rounded bg-red/5">{opError}</p>}
                <div className="space-y-4">
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Name *</Label>
                    <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Depot drawers" autoFocus />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Custodian (office staff)</Label>
                    <FormSelect value={fCustodian} onChange={setFCustodian} allowEmpty emptyLabel="No custodian" options={users.map((u) => ({ value: u.id, label: `${u.name ?? u.email}` }))} />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Opening balance</Label>
                    <Input type="number" min="0" step="0.01" value={fOpening} onChange={(e) => setFOpening(e.target.value)} placeholder="0.00" />
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <Button type="submit" loading={creating}>Create fund</Button>
                  <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          </div>
        </>
      )}

      {funds.length === 0 ? (
        <Card className="p-6"><p className="text-sm text-fg-dim">No petty cash funds yet. Create one to track cash in drawers or field kits.</p></Card>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {funds.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={selected === f.id || (selected === null && funds[0]?.id === f.id) ? "default" : "secondary"}
              onClick={() => setSelected(f.id)}
            >
              {f.name} · {formatMoney(f.currentBalanceCents)}
            </Button>
          ))}
        </div>
      )}

      {activeFund && (
        <>
          <Card className="p-5 mb-4">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-fg">{activeFund.name}</h3>
                  <FinanceStatusBadge status={activeFund.status} />
                </div>
                <p className="text-xs text-fg-dim mt-1">
                  Custodian: {activeFund.custodianName ?? "None"} · Opened with {formatMoney(activeFund.openingBalanceCents)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-fg-muted">Current balance</p>
                <p className={`text-2xl font-bold tabular-nums ${activeFund.currentBalanceCents < 0 ? "text-destructive" : "text-fg"}`}>
                  {formatMoney(activeFund.currentBalanceCents)}
                </p>
              </div>
            </div>
          </Card>

          {opError && <Card className="mb-4 p-3 border-red/30 bg-red/5"><p className="text-red text-xs">{opError}</p></Card>}

          <Card className="p-5 mb-4">
            <h3 className="text-sm font-semibold text-fg mb-3">Record transaction</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {(["DEPOSIT", "TOP_UP", "EXPENSE", "CLOSEOUT"] as const).map((m) => (
                <Button key={m} size="sm" variant={mode === m ? "default" : "secondary"} onClick={() => setMode(m)}>{KIND_LABEL[m]}</Button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Amount</Label>
                <Input type="number" min="0" step="0.01" value={fAmount} onChange={(e) => setFAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Description</Label>
                <Input value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder={mode === "EXPENSE" ? "e.g. Bought cleaning rags" : "optional note"} />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" loading={operating} onClick={doOperate}>Apply</Button>
              {activeFund.status === "active" && (
                <Button size="sm" variant="secondary" onClick={closeFund} disabled={activeFund.currentBalanceCents !== 0}>
                  Close fund{activeFund.currentBalanceCents !== 0 ? " (balance must be 0)" : ""}
                </Button>
              )}
            </div>
            {activeFund.status === "active" && activeFund.custodianId && (
              <div className="mt-3">
                <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Change custodian</Label>
                <FormSelect
                  value={activeFund.custodianId ?? ""}
                  onChange={async (v) => { try { await patchFund({ id: activeFund.id, data: { custodianId: v || null } }).unwrap(); } catch { /* ignore */ } }}
                  allowEmpty
                  emptyLabel="None"
                  options={users.map((u) => ({ value: u.id, label: u.name ?? u.email }))}
                />
              </div>
            )}
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="p-4 pb-0"><h3 className="text-sm font-semibold text-fg">Transactions</h3></div>
            <div className="divide-y divide-border">
              {transactions.length === 0 ? (
                <p className="p-4 text-sm text-fg-dim">No transactions yet.</p>
              ) : (
                [...transactions].sort((a, b) => b.happenedAt.localeCompare(a.happenedAt)).map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-4 text-sm">
                    <div>
                      <p className="text-fg font-medium">{KIND_LABEL[t.kind]}</p>
                      <p className="text-xs text-fg-dim">{t.happenedAt.slice(0, 16).replace("T", " ")}{t.description ? ` · ${t.description}` : ""}</p>
                    </div>
                    <span className={`font-mono tabular-nums font-medium ${t.kind === "EXPENSE" || t.kind === "CLOSEOUT" ? "text-destructive" : "text-chart-2"}`}>
                      {t.kind === "EXPENSE" || t.kind === "CLOSEOUT" ? "−" : "+"}{formatMoney(t.amountCents)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}