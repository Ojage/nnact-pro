import { useCallback, useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState, LoadingScreen, PrimaryButton, ScreenHeader, Card, TextField, Divider } from "../../components/ui";
import { fonts, radius, spacing, type Palette } from "../../theme";
import { createAdvance, listAdvances, settleAdvance } from "../../finance-api";
import { loadStaffSession, type StoredStaffSession } from "../../auth-storage";
import { formatMoney } from "@nnact/shared";
import type { CashAdvanceDTO } from "@nnact/shared";

function StatusPill({ colors, status }: { colors: Palette; status: string }) {
  const styles = createStyles(colors);
  const tone =
    status === "SETTLED" || status === "APPROVED" || status === "DISBURSED"
      ? colors.success
      : status === "CANCELLED" || status === "OVERDUE"
        ? colors.danger
        : colors.warning;
  return (
    <View style={[styles.pill, { backgroundColor: tone + "22" }]}>
      <Text style={[styles.pillText, { color: tone }]}>{status.replaceAll("_", " ")}</Text>
    </View>
  );
}

export function FinanceAdvancesScreen({
  colors,
  session,
}: {
  colors: Palette;
  session?: StoredStaffSession | null;
}) {
  const styles = createStyles(colors);
  const [advances, setAdvances] = useState<CashAdvanceDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [settling, setSettling] = useState<CashAdvanceDTO | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [settleAmount, setSettleAmount] = useState("");
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
      setAdvances(await listAdvances(owner));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load advances.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    reload();
  }, [reload]);

  const requestAdvance = async () => {
    const owner = session ?? (await loadStaffSession());
    if (!owner) {
      setCreateError("Not signed in.");
      return;
    }
    const amt = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amt) || amt <= 0) {
      setCreateError("Enter a valid amount.");
      return;
    }
    setBusy(true);
    setCreateError(null);
    try {
      await createAdvance(owner, {
        amountCents: amt,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setShowCreate(false);
      setAmount(""); setReason("");
      await reload();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Could not request advance.");
    } finally {
      setBusy(false);
    }
  };

  const doSettle = async () => {
    if (!settling) return;
    const owner = session ?? (await loadStaffSession());
    if (!owner) return;
    const amt = Math.round(Number(settleAmount) * 100);
    if (!Number.isFinite(amt) || amt < 0) {
      setCreateError("Enter a valid settled amount.");
      return;
    }
    setBusy(true);
    try {
      await settleAdvance(owner, settling.id, { settledCents: amt, description: "Settled from mobile" });
      setShowSettle(false);
      setSettling(null);
      setSettleAmount("");
      await reload();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Could not settle advance.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingScreen colors={colors} message="Loading advances…" />;

  const settlable = advances.filter(
    (a) => a.status === "DISBURSED" || a.status === "PARTIALLY_SETTLED" || a.status === "OVERDUE",
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader colors={colors} title="Cash advances" eyebrow="Request, draw down, settle" />
      <View style={styles.headerRow}>
        <PrimaryButton colors={colors} label="⊕ Request advance" size="sm" fullWidth={false} onPress={() => setShowCreate(true)} />
        <PrimaryButton colors={colors} label="↻ Refresh" variant="secondary" size="sm" fullWidth={false} onPress={reload} />
      </View>

      {error ? (
        <Card colors={colors} style={styles.errorCard}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </Card>
      ) : null}

      {advances.length === 0 ? (
        <Card colors={colors}>
          <EmptyState colors={colors} icon="cash-outline" title="No advances yet" description="Request money before a long job, then settle it against receipts afterwards." />
        </Card>
      ) : (
        advances.map((a) => (
          <Card colors={colors} key={a.id} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{a.number}</Text>
              <Text style={styles.rowSub} numberOfLines={2}>{a.reason ?? "Cash advance"}</Text>
              <Text style={styles.rowSub}>
                Settled {formatMoney(a.settledCents)} of {formatMoney(a.amountCents)}
              </Text>
              {a.settlementDueAt ? <Text style={styles.rowSub}>Settle by {a.settlementDueAt.slice(0, 10)}</Text> : null}
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowAmount}>{formatMoney(a.outstandingCents)} outstanding</Text>
              <View style={styles.rowActions}>
                <StatusPill colors={colors} status={a.status} />
                {(a.status === "DISBURSED" || a.status === "PARTIALLY_SETTLED" || a.status === "OVERDUE") ? (
                  <PrimaryButton
                    colors={colors}
                    label="Settle"
                    size="sm"
                    fullWidth={false}
                    onPress={() => { setSettling(a); setSettleAmount(""); setShowSettle(true); }}
                  />
                ) : null}
              </View>
            </View>
          </Card>
        ))
      )}

      <Modal visible={showCreate} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={styles.modalTitle}>Request cash advance</Text>
            {createError ? <Text style={[styles.errorText, { color: colors.danger }]}>{createError}</Text> : null}
            <TextField colors={colors} label="Amount *" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />
            <TextField colors={colors} label="Reason" value={reason} onChangeText={setReason} placeholder="What's it for?" />
            <View style={styles.modalButtons}>
              <PrimaryButton colors={colors} label="Submit request" loading={busy} onPress={requestAdvance} />
              <PrimaryButton colors={colors} label="Cancel" variant="secondary" onPress={() => setShowCreate(false)} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showSettle} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={styles.modalTitle}>Settle {settling?.number}</Text>
            <Text style={styles.rowSub}>
              Outstanding: <Text style={styles.rowAmount}>{settling ? formatMoney(settling.outstandingCents) : ""}</Text>
            </Text>
            {createError ? <Text style={[styles.errorText, { color: colors.danger }]}>{createError}</Text> : null}
            <TextField colors={colors} label="Amount settled *" value={settleAmount} onChangeText={setSettleAmount} placeholder="0.00" keyboardType="decimal-pad" />
            <View style={styles.modalButtons}>
              <PrimaryButton colors={colors} label="Record settlement" loading={busy} onPress={doSettle} />
              <PrimaryButton colors={colors} label="Cancel" variant="secondary" onPress={() => setShowSettle(false)} />
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
    rowAmount: { fontSize: 14, fontFamily: fonts.bold, color: colors.foreground },
    rowActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    pill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
    pillText: { fontSize: 11, fontFamily: fonts.semibold, textTransform: "capitalize" },
    modalWrap: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.45)" },
    modalCard: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    modalTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.foreground, marginBottom: spacing.xs },
    modalButtons: { gap: spacing.sm, marginTop: spacing.sm },
  });