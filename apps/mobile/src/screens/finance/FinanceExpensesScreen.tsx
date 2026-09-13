import { useCallback, useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { EmptyState, LoadingScreen, PrimaryButton, ScreenHeader, Card, TextField, Divider } from "../../components/ui";
import { fonts, radius, spacing, type Palette } from "../../theme";
import { createExpense, listExpenses, transitionExpense } from "../../finance-api";
import { loadStaffSession, type StoredStaffSession } from "../../auth-storage";
import { formatMoney, FINANCE_PAYMENT_METHODS } from "@nnact/shared";
import type { ExpenseDTO } from "@nnact/shared";

function StatusPill({ colors, status }: { colors: Palette; status: string }) {
  const styles = createStyles(colors);
  const tone =
    status === "PAID" || status === "SETTLED" || status === "APPROVED"
      ? colors.success
      : status === "REJECTED" || status === "VOIDED" || status === "OVERDUE" || status === "CANCELLED"
        ? colors.danger
        : colors.warning;
  return (
    <View style={[styles.pill, { backgroundColor: tone + "22" }]}>
      <Text style={[styles.pillText, { color: tone }]}>{status.replaceAll("_", " ")}</Text>
    </View>
  );
}

export function FinanceExpensesScreen({
  colors,
  session,
}: {
  colors: Palette;
  session?: StoredStaffSession | null;
}) {
  const styles = createStyles(colors);
  const [expenses, setExpenses] = useState<ExpenseDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [method, setMethod] = useState("CASH");
  const [submitNow, setSubmitNow] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const owner = session ?? (await loadStaffSession());
    if (!owner) {
      setError("Not signed in.");
      setLoading(false);
      return;
    }
    try {
      setExpenses(await listExpenses(owner));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load expenses.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    reload();
  }, [reload]);

  const saveExpense = async () => {
    const owner = session ?? (await loadStaffSession());
    if (!owner) {
      setCreateError("Not signed in.");
      return;
    }
    const amt = Math.round(Number(amount) * 100);
    if (!title.trim() || !Number.isFinite(amt) || amt < 0) {
      setCreateError("Title and a valid amount are required.");
      return;
    }
    setBusy(true);
    setCreateError(null);
    try {
      await createExpense(owner, {
        title: title.trim(),
        amountCents: amt,
        ...(Number(fee) > 0 ? { momoFeeCents: Math.round(Number(fee) * 100) } : {}),
        paymentMethod: method,
        submitImmediately: submitNow,
      });
      setShowCreate(false);
      setTitle(""); setAmount(""); setFee(""); setMethod("CASH"); setSubmitNow(true);
      await reload();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Could not save expense.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (id: string, action: "submit" | "void", reason?: string) => {
    const owner = session ?? (await loadStaffSession());
    if (!owner) return;
    try {
      await transitionExpense(owner, id, action, reason ? { reason } : {});
      await reload();
    } catch {
      setError("Action failed — try again.");
    }
  };

  if (loading) return <LoadingScreen colors={colors} message="Loading expenses…" />;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader colors={colors} title="My expenses" eyebrow="Field spend & reimbursements" />
      <View style={styles.headerRow}>
        <PrimaryButton colors={colors} label="⊕ Record expense" size="sm" fullWidth={false} onPress={() => setShowCreate(true)} />
        <PrimaryButton colors={colors} label="↻ Refresh" variant="secondary" size="sm" fullWidth={false} onPress={reload} />
      </View>

      {error ? (
        <Card colors={colors} style={styles.errorCard}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </Card>
      ) : null}

      {expenses.length === 0 ? (
        <Card colors={colors}>
          <EmptyState colors={colors} icon="receipt-outline" title="No expenses yet" description="Record anything you spend on the job and submit it for approval." />
        </Card>
      ) : (
        expenses.map((e) => (
          <Card colors={colors} key={e.id} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle} numberOfLines={1}>{e.title}</Text>
              <Text style={styles.rowSub}>{e.number} · {e.categoryName ?? "Uncategorized"} · {e.status === "PAID" ? `Paid ${(e.paidAt ?? "").slice(0, 10)}` : "Not paid yet"}</Text>
              {e.rejectionReason ? <Text style={[styles.rowSub, { color: colors.danger }]}>Rejected: {e.rejectionReason}</Text> : null}
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowAmount}>{formatMoney(e.amountCents)}</Text>
              <View style={styles.rowActions}>
                <StatusPill colors={colors} status={e.status} />
                {e.status === "DRAFT" ? (
                  <View style={styles.inlineActions}>
                    <PrimaryButton colors={colors} label="Submit" size="sm" fullWidth={false} onPress={() => act(e.id, "submit")} />
                    <PrimaryButton colors={colors} label="✕" variant="secondary" size="sm" fullWidth={false} onPress={() => act(e.id, "void")} />
                  </View>
                ) : null}
              </View>
            </View>
          </Card>
        ))
      )}

      <Modal visible={showCreate} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={styles.modalTitle}>Record expense</Text>
            {createError ? <Text style={[styles.errorText, { color: colors.danger }]}>{createError}</Text> : null}
            <TextField colors={colors} label="Title *" value={title} onChangeText={setTitle} placeholder="e.g. Fuel to job 104" />
            <TextField colors={colors} label="Amount (you'll be paid back) *" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />
            <TextField colors={colors} label="Mobile-money fee" value={fee} onChangeText={setFee} placeholder="0.00" keyboardType="decimal-pad" />
            <Text style={styles.fieldLabel}>Payment method</Text>
            <View style={styles.methodRow}>
              {FINANCE_PAYMENT_METHODS.slice(0, 4).map((m) => (
                <PrimaryButton
                  key={m}
                  colors={colors}
                  label={m.replaceAll("_", " ").replace("MOBILE MONEY", "MoMo")}
                  variant={method === m ? "accent" : "secondary"}
                  size="sm"
                  fullWidth={false}
                  onPress={() => setMethod(m)}
                />
              ))}
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Submit for approval immediately</Text>
              <Switch value={submitNow} onValueChange={setSubmitNow} />
            </View>
            <View style={styles.modalButtons}>
              <PrimaryButton colors={colors} label="Save expense" loading={busy} onPress={saveExpense} />
              <PrimaryButton colors={colors} label="Cancel" variant="secondary" onPress={() => setShowCreate(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, gap: spacing.md },
    headerRow: { flexDirection: "row", gap: spacing.sm },
    errorCard: { padding: spacing.md },
    errorText: { fontSize: 13, marginBottom: spacing.sm },
    row: { padding: spacing.md, flexDirection: "row", alignItems: "center" },
    rowMain: { flex: 1, gap: 2 },
    rowTitle: { fontSize: 15, fontFamily: fonts.semibold, color: colors.foreground },
    rowSub: { fontSize: 12, color: colors.mutedForeground },
    rowRight: { alignItems: "flex-end", gap: 4 },
    rowAmount: { fontSize: 15, fontFamily: fonts.bold, color: colors.foreground },
    rowActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    inlineActions: { flexDirection: "row", gap: spacing.xs },
    pill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
    pillText: { fontSize: 11, fontFamily: fonts.semibold, textTransform: "capitalize" },
    modalWrap: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.45)" },
    modalCard: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    modalTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.foreground, marginBottom: spacing.xs },
    fieldLabel: { fontSize: 13, fontFamily: fonts.semibold, color: colors.mutedForeground },
    methodRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
    switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    switchLabel: { fontSize: 14, color: colors.foreground, flex: 1, marginRight: spacing.sm },
    modalButtons: { gap: spacing.sm, marginTop: spacing.sm },
  });