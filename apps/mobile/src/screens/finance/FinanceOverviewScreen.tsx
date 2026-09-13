import { useCallback, useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState, LoadingScreen, PrimaryButton, ScreenHeader, StatCard, Card, TextField, Divider } from "../../components/ui";
import { fonts, radius, spacing, type Palette } from "../../theme";
import { financeDashboard } from "../../finance-api";
import { loadStaffSession, type StoredStaffSession } from "../../auth-storage";
import { formatMoney } from "@nnact/shared";
import type { FinanceDashboardDTO } from "@nnact/shared";

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

export function FinanceOverviewScreen({
  colors,
  session,
}: {
  colors: Palette;
  session?: StoredStaffSession | null;
}) {
  const styles = createStyles(colors);
  const [dash, setDash] = useState<FinanceDashboardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setDash(await financeDashboard(owner));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load finance overview.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (loading) return <LoadingScreen colors={colors} message="Loading finance…" />;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader colors={colors} title="Finance" eyebrow="My money & spend" />
      <PrimaryButton colors={colors} label="↻ Refresh" variant="secondary" size="sm" fullWidth={false} onPress={reload} />

      {error ? (
        <Card colors={colors} style={styles.errorCard}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </Card>
      ) : dash ? (
        <>
          <View style={styles.statsRow}>
            <StatCard colors={colors} label="Out this month" value={formatMoney(dash.monthTotalOutCents)} />
            <StatCard colors={colors} label="My outstanding advances" value={formatMoney(dash.outstandingAdvanceCents)} />
          </View>
          <View style={styles.statsRow}>
            <StatCard colors={colors} label="Overdue bills" value={formatMoney(dash.billsOverdueCents)} />
            <StatCard colors={colors} label="Petty cash balance" value={formatMoney(dash.pettyCashBalanceCents)} />
          </View>

          <Divider colors={colors} />

          <Text style={styles.sectionTitle}>My recent expenses</Text>
          {dash.recentExpenses.length === 0 ? (
            <Card colors={colors}>
              <EmptyState colors={colors} icon="wallet-outline" title="No expenses yet" description="Record field spend so you get paid back fast." />
            </Card>
          ) : (
            <View style={styles.list}>
              {dash.recentExpenses.slice(0, 8).map((e) => (
                <Card colors={colors} key={e.id} style={styles.row}>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{e.title}</Text>
                    <Text style={styles.rowSub}>{e.number} · {e.categoryName ?? "Uncategorized"}</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.rowAmount}>{formatMoney(e.amountCents)}</Text>
                    <StatusPill colors={colors} status={e.status} />
                  </View>
                </Card>
              ))}
            </View>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, gap: spacing.md },
    errorCard: { padding: spacing.md },
    errorText: { fontSize: 14 },
    statsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.sm },
    sectionTitle: { fontSize: 17, fontFamily: fonts.semibold, color: colors.foreground, marginTop: spacing.sm },
    list: { gap: spacing.sm },
    row: { padding: spacing.md, flexDirection: "row", alignItems: "center" },
    rowMain: { flex: 1, gap: 2 },
    rowTitle: { fontSize: 15, fontFamily: fonts.semibold, color: colors.foreground },
    rowSub: { fontSize: 12, color: colors.mutedForeground },
    rowRight: { alignItems: "flex-end", gap: 4 },
    rowAmount: { fontSize: 15, fontFamily: fonts.bold, color: colors.foreground },
    pill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
    pillText: { fontSize: 11, fontFamily: fonts.semibold, textTransform: "capitalize" },
  });