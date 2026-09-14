import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatMoney, type FinanceDashboardDTO } from "@nnact/shared";
import type { StoredStaffSession } from "../../auth-storage";
import { DateField } from "../../components/DateTimeFields";
import {
  advanceAction,
  billAction,
  createAdvance,
  createBill,
  createExpense,
  expenseAction,
  financeDashboard,
  listAdvances,
  listBills,
  listExpenses,
  listPettyCash,
  listReimbursements,
  recordBillPayment,
  reimbursementAction,
} from "../../office-api";
import type {
  CashAdvanceDTO,
  ExpenseDTO,
  FinancePaymentMethod,
  PettyCashFundDTO,
  ReimbursementDTO,
  SupplierBillDTO,
} from "@nnact/shared";
import { ActionButton, InlineError, OfficeHeader, Row, SectionLabel, Sheet } from "./shared";
import { fonts, spacing, type Palette } from "../../theme";

function isApprover(role?: string): boolean {
  return role === "owner" || role === "dispatcher";
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").toLowerCase();
}

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const METHOD_OPTIONS: FinancePaymentMethod[] = ["CASH", "MTN_MOBILE_MONEY", "ORANGE_MONEY", "BANK_TRANSFER", "CARD"];

type FocusKind = "expense" | "bill" | "advance" | "reimbursement";

export function FinanceScreen({
  colors,
  session,
  nav,
}: {
  colors: Palette;
  session: StoredStaffSession;
  nav: { pop: () => void };
}) {
  const styles = createStyles(colors);
  const [tab, setTab] = useState<"overview" | "expenses" | "bills" | "petty" | "advances" | "reimbursements">("overview");
  const [dashboard, setDashboard] = useState<FinanceDashboardDTO | null>(null);
  const [expenses, setExpenses] = useState<ExpenseDTO[]>([]);
  const [bills, setBills] = useState<SupplierBillDTO[]>([]);
  const [petty, setPetty] = useState<PettyCashFundDTO[]>([]);
  const [advances, setAdvances] = useState<CashAdvanceDTO[]>([]);
  const [reimbursements, setReimbursements] = useState<ReimbursementDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ kind: FocusKind; id: string } | null>(null);
  const [newExpense, setNewExpense] = useState(false);
  const [newAdvance, setNewAdvance] = useState(false);
  const [newBill, setNewBill] = useState(false);
  const approver = isApprover(session.user.role);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [dash, e, b, p, a, r] = await Promise.all([
          financeDashboard(session),
          listExpenses(session),
          listBills(session),
          listPettyCash(session),
          listAdvances(session),
          listReimbursements(session),
        ]);
        setDashboard(dash);
        setExpenses(e);
        setBills(b);
        setPetty(p);
        setAdvances(a);
        setReimbursements(r);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      setError(null);
      setFocus(null);
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  const submittedExpenses = expenses.filter((e) => e.status.toLowerCase() === "submitted").length;
  const unsettled = advances.filter((a) => a.outstandingCents > 0).length;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.surface} />
      }
    >
      <OfficeHeader
        colors={colors}
        eyebrow="Finance"
        title="Money"
        subtitle="Watch cash in and out, and clear the paperwork that is waiting on you."
        onBack={nav.pop}
      />
      <InlineError colors={colors} message={error} />

      <View style={styles.kpiStrip}>
        <Kpi colors={colors} label="Month out" value={formatMoney(dashboard?.monthTotalOutCents ?? 0)} />
        <Kpi colors={colors} label="Bills payable" value={formatMoney(dashboard?.billsPayableCents ?? 0)} warning={(dashboard?.billsOverdueCents ?? 0) > 0} />
        <Kpi colors={colors} label="Advances out" value={formatMoney(dashboard?.outstandingAdvanceCents ?? 0)} />
      </View>
      <View style={styles.kpiStrip}>
        <Kpi colors={colors} label="Petty cash" value={formatMoney(dashboard?.pettyCashBalanceCents ?? 0)} />
        <Kpi colors={colors} label="Budget used" value={dashboard ? `${dashboard.budgetUsedPercent}%` : "–"} />
        <Kpi colors={colors} label="To approve" value={String(submittedExpenses)} />
      </View>

      <View style={styles.tabs}>
        {(["overview", "expenses", "bills", "petty", "advances", "reimbursements"] as const).map((key) => (
          <TouchableOpacity key={key} style={[styles.tab, tab === key && { backgroundColor: colors.primary }]} onPress={() => setTab(key)} activeOpacity={0.8}>
            <Text style={[styles.tabText, { color: tab === key ? colors.onEmphasis : colors.mutedForeground }]}>
              {key === "petty" ? "Petty cash" : key.charAt(0).toUpperCase() + key.slice(1)}
              {key === "expenses" && submittedExpenses > 0 && tab !== key ? ` (${submittedExpenses})` : ""}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "overview" ? (
        <>
          <SectionLabel colors={colors}>Recent expenses</SectionLabel>
          {(dashboard?.recentExpenses ?? []).slice(0, 5).map((expense) => (
            <Row key={expense.id} colors={colors} icon="wallet-outline" title={expense.title} subtitle={expense.employeeName ?? "Team"} right={<MoneyTag colors={colors} cents={expense.amountCents} />} onPress={() => setFocus({ kind: "expense", id: expense.id })} />
          ))}
          <SectionLabel colors={colors}>Cash flow</SectionLabel>
          <View style={styles.flowRow}>
            <View style={styles.flowBox}>
              <Text style={styles.flowLabel}>Expenses this month</Text>
              <Text style={styles.flowValue}>{formatMoney(dashboard?.monthExpenseCents ?? 0)}</Text>
            </View>
            <View style={styles.flowBox}>
              <Text style={styles.flowLabel}>Bills paid</Text>
              <Text style={styles.flowValue}>{formatMoney(dashboard?.monthBillPaidCents ?? 0)}</Text>
            </View>
            <View style={styles.flowBox}>
              <Text style={styles.flowLabel}>Overdue</Text>
              <Text style={[styles.flowValue, (dashboard?.billsOverdueCents ?? 0) > 0 && { color: colors.danger }]}>{formatMoney(dashboard?.billsOverdueCents ?? 0)}</Text>
            </View>
          </View>
          {unsettled > 0 ? <Text style={styles.warnNote}>{unsettled} advance{unsettled === 1 ? "" : "s"} still open.</Text> : null}
        </>
      ) : null}

      {tab === "expenses" ? (
        <>
          <View style={styles.strip}>
            <Text style={styles.stripLabel}>{expenses.length} records</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setNewExpense(true)} activeOpacity={0.85}>
              <Ionicons name="add" size={16} color={colors.onEmphasis} />
              <Text style={styles.primaryBtnText}>Record</Text>
            </TouchableOpacity>
          </View>
          {expenses.length === 0 ? <Text style={styles.mutedNote}>Nothing recorded.</Text> : expenses.map((expense) => (
            <Row key={expense.id} colors={colors} icon="wallet-outline" title={expense.title} subtitle={`${humanize(expense.status)} · ${fmtDate(expense.submittedAt ?? expense.createdAt)}`} right={<MoneyTag colors={colors} cents={expense.amountCents} />} onPress={() => setFocus({ kind: "expense", id: expense.id })} />
          ))}
        </>
      ) : null}

      {tab === "bills" ? (
        <>
          <View style={styles.strip}>
            <Text style={styles.stripLabel}>{bills.length} bills</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setNewBill(true)} activeOpacity={0.85}>
              <Ionicons name="add" size={16} color={colors.onEmphasis} />
              <Text style={styles.primaryBtnText}>Record bill</Text>
            </TouchableOpacity>
          </View>
          {bills.length === 0 ? (
            <Text style={styles.mutedNote}>No supplier bills.</Text>
          ) : (
            bills.map((bill) => (
              <Row
                key={bill.id}
                colors={colors}
                icon="receipt-outline"
                title={`${bill.supplierName}${bill.number ? ` · ${bill.number}` : ""}`}
                subtitle={`${humanize(bill.status)} · due ${fmtDate(bill.dueDate) ?? "–"}`}
                right={<MoneyTag colors={colors} cents={bill.balanceCents} />}
                onPress={() => setFocus({ kind: "bill", id: bill.id })}
              />
            ))
          )}
        </>
      ) : null}

      {tab === "petty" ? (
        petty.length === 0 ? (
          <Text style={styles.mutedNote}>No petty cash funds. Create one from the web console.</Text>
        ) : (
          petty.map((fund) => (
            <Row
              key={fund.id}
              colors={colors}
              icon="wallet-outline"
              title={fund.name}
              subtitle={`${humanize(fund.status)}${fund.custodianName ? ` · ${fund.custodianName}` : ""}${fund.closedAt ? ` · closed ${fmtDate(fund.closedAt)}` : ""}`}
              right={<MoneyTag colors={colors} cents={fund.currentBalanceCents} />}
            />
          ))
        )
      ) : null}

      {tab === "advances" ? (
        <>
          <View style={styles.strip}>
            <Text style={styles.stripLabel}>{advances.length} advances</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setNewAdvance(true)} activeOpacity={0.85}>
              <Ionicons name="add" size={16} color={colors.onEmphasis} />
              <Text style={styles.primaryBtnText}>Request</Text>
            </TouchableOpacity>
          </View>
          {advances.length === 0 ? <Text style={styles.mutedNote}>Nothing in flight.</Text> : advances.map((advance) => (
            <Row key={advance.id} colors={colors} icon="cash-outline" title={advance.reason ?? advance.number} subtitle={`${humanize(advance.status)} · ${advance.employeeName ?? "Team"}`} right={<MoneyTag colors={colors} cents={advance.amountCents} />} onPress={() => setFocus({ kind: "advance", id: advance.id })} />
          ))}
        </>
      ) : null}

      {tab === "reimbursements" ? (
        reimbursements.length === 0 ? (
          <Text style={styles.mutedNote}>No reimbursements.</Text>
        ) : (
          reimbursements.map((item) => (
            <Row key={item.id} colors={colors} icon="card-outline" title={item.title ?? item.number} subtitle={`${humanize(item.status)} · ${item.employeeName ?? "Team"}`} right={<MoneyTag colors={colors} cents={item.amountCents} />} onPress={() => setFocus({ kind: "reimbursement", id: item.id })} />
          ))
        )
      ) : null}

      {focus ? (
        <Sheet colors={colors} visible title={sheetTitle(focus.kind)} onClose={() => setFocus(null)}>
          {focus.kind === "expense" ? (
            <ExpenseActions colors={colors} session={session} approver={approver} expense={expenses.find((e) => e.id === focus.id)} onAction={(fn) => void act(fn)} />
          ) : null}
          {focus.kind === "bill" ? (
            <BillActions colors={colors} session={session} approver={approver} bill={bills.find((b) => b.id === focus.id)} onAction={(fn) => void act(fn)} />
          ) : null}
          {focus.kind === "advance" ? (
            <AdvanceActions colors={colors} session={session} approver={approver} advance={advances.find((a) => a.id === focus.id)} onAction={(fn) => void act(fn)} />
          ) : null}
          {focus.kind === "reimbursement" ? (
            <ReimbursementActions colors={colors} session={session} approver={approver} item={reimbursements.find((r) => r.id === focus.id)} onAction={(fn) => void act(fn)} />
          ) : null}
        </Sheet>
      ) : null}

      {newExpense ? (
        <NewExpenseSheet colors={colors} session={session} onCancel={() => setNewExpense(false)} onDone={() => { setNewExpense(false); void load(true); }} />
      ) : null}

      {newAdvance ? (
        <NewAdvanceSheet colors={colors} session={session} onCancel={() => setNewAdvance(false)} onDone={() => { setNewAdvance(false); void load(true); }} />
      ) : null}

      {newBill ? (
        <NewBillSheet colors={colors} session={session} onCancel={() => setNewBill(false)} onDone={() => { setNewBill(false); void load(true); }} />
      ) : null}
    </ScrollView>
  );
}

function sheetTitle(kind: FocusKind): string {
  if (kind === "expense") return "Expense";
  if (kind === "bill") return "Supplier bill";
  if (kind === "advance") return "Cash advance";
  return "Reimbursement";
}

function Kpi({ colors, label, value, warning }: { colors: Palette; label: string; value: string; warning?: boolean }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, warning && { color: colors.warning }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function MoneyTag({ colors, cents }: { colors: Palette; cents: number }) {
  return <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: fonts.bold }}>{formatMoney(cents)}</Text>;
}

function ExpenseActions({
  colors,
  session,
  approver,
  expense,
  onAction,
}: {
  colors: Palette;
  session: StoredStaffSession;
  approver: boolean;
  expense?: ExpenseDTO;
  onAction: (fn: () => Promise<unknown>) => void;
}) {
  const styles = createStyles(colors);
  if (!expense) return null;
  const status = expense.status.toLowerCase();
  return (
    <View>
      <Text style={styles.detailTitle}>{expense.title}</Text>
      <Text style={styles.detailMeta}>{humanize(expense.status)} · {formatMoney(expense.amountCents)}</Text>
      <Text style={styles.detailMeta}>{expense.employeeName ?? "Team"} · {expense.paymentMethod ?? "CASH"}</Text>
      {status === "draft" ? <ActionButton colors={colors} label="Submit" icon="paper-plane-outline" onPress={() => onAction(() => expenseAction(session, expense.id, "submit"))} /> : null}
      {approver ? (
        <>
          {status === "submitted" || status === "under_review" ? <ActionButton colors={colors} label="Approve" icon="shield-checkmark-outline" tone="success" onPress={() => onAction(() => expenseAction(session, expense.id, "approve"))} /> : null}
          {status === "approved" ? <ActionButton colors={colors} label="Mark paid" icon="cash-outline" tone="primary" onPress={() => onAction(() => expenseAction(session, expense.id, "pay"))} /> : null}
          {status === "submitted" ? <ActionButton colors={colors} label="Reject" icon="close-circle-outline" tone="danger" onPress={() => onAction(() => expenseAction(session, expense.id, "reject", { reason: "Rejected from mobile" }))} /> : null}
          {status === "draft" ? <ActionButton colors={colors} label="Void" icon="trash-outline" tone="danger" onPress={() => onAction(() => expenseAction(session, expense.id, "void", { reason: "Voided from mobile" }))} /> : null}
        </>
      ) : null}
    </View>
  );
}

function BillActions({
  colors,
  session,
  approver,
  bill,
  onAction,
}: {
  colors: Palette;
  session: StoredStaffSession;
  approver: boolean;
  bill?: SupplierBillDTO;
  onAction: (fn: () => Promise<unknown>) => void;
}) {
  const styles = createStyles(colors);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FinancePaymentMethod>("BANK_TRANSFER");
  if (!bill) return null;
  const cents = Math.round(parseFloat(amount || "0") * 100);
  const valid = cents > 0 && cents <= bill.balanceCents;
  const status = bill.status.toLowerCase();
  return (
    <View>
      <Text style={styles.detailTitle}>{bill.supplierName}</Text>
      <Text style={styles.detailMeta}>{humanize(bill.status)} · total {formatMoney(bill.totalCents)} · balance {formatMoney(bill.balanceCents)}</Text>
      {approver && !["voided", "draft", "disputed"].includes(status) ? (
        <>
          {status === "received" ? (
            <ActionButton colors={colors} label="Approve" icon="shield-checkmark-outline" tone="success" onPress={() => onAction(() => billAction(session, bill.id, "approve"))} />
          ) : null}
          <Text style={styles.fieldLabel}>Record payment</Text>
          <TextInput value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.dimForeground} keyboardType="decimal-pad" style={[styles.input, { color: colors.foreground }]} />
          <View style={styles.methodRow}>
            {METHOD_OPTIONS.map((m) => (
              <TouchableOpacity key={m} style={[styles.methodChip, method === m && { backgroundColor: colors.primary }]} onPress={() => setMethod(m)} activeOpacity={0.8}>
                <Text style={[styles.methodChipText, { color: method === m ? colors.onEmphasis : colors.mutedForeground }]}>{m.replaceAll("_", " ")}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[styles.primaryBtn, !valid && { opacity: 0.45 }]} disabled={!valid} onPress={() => onAction(() => recordBillPayment(session, bill.id, { amountCents: cents, method }))} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Record payment</Text>
          </TouchableOpacity>
        </>
      ) : null}
      {approver && !["voided", "paid", "disputed"].includes(status) ? (
        <ActionButton colors={colors} label="Dispute" icon="flag-outline" tone="warning" onPress={() => onAction(() => billAction(session, bill.id, "dispute", { reason: "Disputed from mobile" }))} />
      ) : null}
      {approver && !["voided", "paid"].includes(status) ? (
        <ActionButton colors={colors} label="Void bill" icon="trash-outline" tone="danger" onPress={() => onAction(() => billAction(session, bill.id, "void", { reason: "Voided from mobile" }))} />
      ) : null}
    </View>
  );
}

function AdvanceActions({
  colors,
  session,
  approver,
  advance,
  onAction,
}: {
  colors: Palette;
  session: StoredStaffSession;
  approver: boolean;
  advance?: CashAdvanceDTO;
  onAction: (fn: () => Promise<unknown>) => void;
}) {
  const styles = createStyles(colors);
  if (!advance) return null;
  const status = advance.status.toLowerCase();
  return (
    <View>
      <Text style={styles.detailTitle}>{advance.reason ?? advance.number}</Text>
      <Text style={styles.detailMeta}>{humanize(advance.status)} · {formatMoney(advance.amountCents)} · outstanding {formatMoney(advance.outstandingCents)}</Text>
      {approver ? (
        <>
          {status === "requested" || status === "pending" ? <ActionButton colors={colors} label="Approve" icon="shield-checkmark-outline" tone="success" onPress={() => onAction(() => advanceAction(session, advance.id, "approve"))} /> : null}
          {status === "approved" ? <ActionButton colors={colors} label="Disburse cash" icon="cash-outline" tone="primary" onPress={() => onAction(() => advanceAction(session, advance.id, "disburse"))} /> : null}
          {status === "requested" || status === "pending" || status === "approved" ? <ActionButton colors={colors} label="Cancel" icon="close-circle-outline" tone="danger" onPress={() => onAction(() => advanceAction(session, advance.id, "cancel", { reason: "Cancelled from mobile" }))} /> : null}
        </>
      ) : null}
    </View>
  );
}

function ReimbursementActions({
  colors,
  session,
  approver,
  item,
  onAction,
}: {
  colors: Palette;
  session: StoredStaffSession;
  approver: boolean;
  item?: ReimbursementDTO;
  onAction: (fn: () => Promise<unknown>) => void;
}) {
  const styles = createStyles(colors);
  if (!item) return null;
  const status = item.status.toLowerCase();
  return (
    <View>
      <Text style={styles.detailTitle}>{item.title ?? item.number}</Text>
      <Text style={styles.detailMeta}>{humanize(item.status)} · {formatMoney(item.amountCents)}</Text>
      {approver ? (
        <>
          {status === "submitted" ? <ActionButton colors={colors} label="Approve" icon="shield-checkmark-outline" tone="success" onPress={() => onAction(() => reimbursementAction(session, item.id, "approve"))} /> : null}
          {status === "approved" ? <ActionButton colors={colors} label="Pay out" icon="cash-outline" tone="primary" onPress={() => onAction(() => reimbursementAction(session, item.id, "pay"))} /> : null}
          {status === "submitted" ? <ActionButton colors={colors} label="Reject" icon="close-circle-outline" tone="danger" onPress={() => onAction(() => reimbursementAction(session, item.id, "reject", { reason: "Rejected from mobile" }))} /> : null}
        </>
      ) : null}
    </View>
  );
}

function NewExpenseSheet({
  colors,
  session,
  onCancel,
  onDone,
}: {
  colors: Palette;
  session: StoredStaffSession;
  onCancel: () => void;
  onDone: () => void;
}) {
  const styles = createStyles(colors);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FinancePaymentMethod>("CASH");
  const [error, setError] = useState<string | null>(null);
  const cents = Math.round(parseFloat(amount || "0") * 100);
  const valid = title.trim().length > 0 && cents > 0;
  return (
    <Sheet colors={colors} visible title="Record expense" onClose={onCancel}>
      <Text style={styles.fieldLabel}>Title</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Taxi to site" placeholderTextColor={colors.dimForeground} style={[styles.input, { color: colors.foreground }]} />
      <Text style={styles.fieldLabel}>Amount</Text>
      <TextInput value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.dimForeground} keyboardType="decimal-pad" style={[styles.input, { color: colors.foreground }]} />
      <Text style={styles.fieldLabel}>Paid by</Text>
      <View style={styles.methodRow}>
        {METHOD_OPTIONS.map((m) => (
          <TouchableOpacity key={m} style={[styles.methodChip, method === m && { backgroundColor: colors.primary }]} onPress={() => setMethod(m)} activeOpacity={0.8}>
            <Text style={[styles.methodChipText, { color: method === m ? colors.onEmphasis : colors.mutedForeground }]}>{m.replaceAll("_", " ")}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <InlineError colors={colors} message={error} />
      <TouchableOpacity
        style={[styles.primaryBtn, !valid && { opacity: 0.45 }]}
        disabled={!valid}
        onPress={async () => {
          if (!valid) {
            setError("Add a title and an amount.");
            return;
          }
          try {
            await createExpense(session, { title: title.trim(), amountCents: cents, paymentMethod: method, submitImmediately: true });
            onDone();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
          }
        }}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryBtnText}>Save & submit</Text>
      </TouchableOpacity>
    </Sheet>
  );
}

function NewAdvanceSheet({
  colors,
  session,
  onCancel,
  onDone,
}: {
  colors: Palette;
  session: StoredStaffSession;
  onCancel: () => void;
  onDone: () => void;
}) {
  const styles = createStyles(colors);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cents = Math.round(parseFloat(amount || "0") * 100);
  const valid = cents > 0;
  return (
    <Sheet colors={colors} visible title="Request cash advance" onClose={onCancel}>
      <Text style={styles.fieldLabel}>Amount</Text>
      <TextInput value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.dimForeground} keyboardType="decimal-pad" style={[styles.input, { color: colors.foreground }]} />
      <Text style={styles.fieldLabel}>Reason</Text>
      <TextInput value={reason} onChangeText={setReason} placeholder="e.g. Fuel for the week" placeholderTextColor={colors.dimForeground} style={[styles.input, { color: colors.foreground }]} />
      <InlineError colors={colors} message={error} />
      <TouchableOpacity
        style={[styles.primaryBtn, !valid && { opacity: 0.45 }]}
        disabled={!valid}
        onPress={async () => {
          if (!valid) {
            setError("Enter the amount.");
            return;
          }
          try {
            await createAdvance(session, { amountCents: cents, reason: reason.trim() || undefined });
            onDone();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
          }
        }}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryBtnText}>Submit request</Text>
      </TouchableOpacity>
    </Sheet>
  );
}

function NewBillSheet({
  colors,
  session,
  onCancel,
  onDone,
}: {
  colors: Palette;
  session: StoredStaffSession;
  onCancel: () => void;
  onDone: () => void;
}) {
  const styles = createStyles(colors);
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [line, setLine] = useState("");
  const [amount, setAmount] = useState("");
  const [issueDate, setIssueDate] = useState<Date>(() => new Date());
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cents = Math.round(parseFloat(amount || "0") * 100);
  const valid = supplier.trim().length > 0 && line.trim().length > 0 && cents > 0;
  return (
    <Sheet colors={colors} visible title="Record supplier bill" onClose={onCancel}>
      <Text style={styles.fieldLabel}>Supplier</Text>
      <TextInput value={supplier} onChangeText={setSupplier} placeholder="e.g. CEPLEC materials" placeholderTextColor={colors.dimForeground} style={[styles.input, { color: colors.foreground }]} />
      <Text style={styles.fieldLabel}>Reference / invoice no.</Text>
      <TextInput value={reference} onChangeText={setReference} placeholder="Optional" placeholderTextColor={colors.dimForeground} style={[styles.input, { color: colors.foreground }]} />
      <Text style={styles.fieldLabel}>Line item</Text>
      <TextInput value={line} onChangeText={setLine} placeholder="e.g. Refrigerant R410a" placeholderTextColor={colors.dimForeground} style={[styles.input, { color: colors.foreground }]} />
      <Text style={styles.fieldLabel}>Amount</Text>
      <TextInput value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.dimForeground} keyboardType="decimal-pad" style={[styles.input, { color: colors.foreground }]} />
      <DateField colors={colors} label="Issued" value={issueDate} onChange={setIssueDate} />
      <DateField colors={colors} label="Due" value={dueDate} onChange={setDueDate} placeholder="No due date" />
      <InlineError colors={colors} message={error} />
      <TouchableOpacity
        style={[styles.primaryBtn, !valid && { opacity: 0.45 }]}
        disabled={!valid}
        onPress={async () => {
          if (!valid) {
            setError("Supplier, a line item and an amount are required.");
            return;
          }
          try {
            await createBill(session, {
              supplierName: supplier.trim(),
              supplierReference: reference.trim() || undefined,
              issueDate: issueDate.toISOString(),
              dueDate: dueDate ? dueDate.toISOString() : undefined,
              status: "RECEIVED",
              lines: [{ description: line.trim(), quantity: 1, unitPriceCents: cents }],
            });
            onDone();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
          }
        }}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryBtnText}>Save bill</Text>
      </TouchableOpacity>
    </Sheet>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.xl },
    kpiStrip: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    kpiCard: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 14, padding: spacing.sm },
    kpiLabel: { color: colors.dimForeground, fontSize: 10, fontFamily: fonts.medium, textTransform: "uppercase", letterSpacing: 0.4 },
    kpiValue: { color: colors.foreground, fontSize: 16, fontFamily: fonts.bold, marginTop: 2 },
    tabs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
    tab: { paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surface },
    tabText: { fontSize: 12, fontFamily: fonts.bold },
    warnNote: { color: colors.warning, fontSize: 13, fontFamily: fonts.semibold, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    mutedNote: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.regular, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    flowRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg },
    flowBox: { flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: 12, padding: spacing.sm },
    flowLabel: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.medium },
    flowValue: { color: colors.foreground, fontSize: 15, fontFamily: fonts.bold, marginTop: 2 },
    strip: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    stripLabel: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.medium },
    primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: 999 },
    primaryBtnText: { color: colors.onEmphasis, fontSize: 13, fontFamily: fonts.bold },
    detailTitle: { color: colors.foreground, fontSize: 16, fontFamily: fonts.bold },
    detailMeta: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.regular, marginTop: 2, marginBottom: spacing.sm },
    fieldLabel: { color: colors.mutedForeground, fontSize: 12, fontFamily: fonts.semibold, marginTop: spacing.sm, marginBottom: 6 },
    input: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.md, paddingVertical: 11, fontFamily: fonts.regular, fontSize: 15, marginBottom: spacing.sm },
    methodRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
    methodChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surfaceMuted },
    methodChipText: { fontSize: 11, fontFamily: fonts.semibold },
  });