import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  CURRENCY_CATALOG,
  formatMoney,
  type ArAgingReport,
  type EstimateConversionReport,
  type RevenueTrendReport,
  type TechnicianScorecardsReport,
  type ReportSummaryDTO,
  type BusinessSettings,
  type CurrencyCode,
} from "@nnact/shared";
import type { StoredStaffSession } from "../../auth-storage";
import { orgSettings, reportArAging, reportEstimateConversion, reportRevenueTrend, reportSummary, reportTechnicianScorecards } from "../../office-api";
import { InlineError, OfficeHeader, SectionLabel, Tag } from "./shared";
import { fonts, spacing, type Palette } from "../../theme";

export function ReportsScreen({
  colors,
  session,
  nav,
}: {
  colors: Palette;
  session: StoredStaffSession;
  nav: { pop: () => void };
}) {
  const [summary, setSummary] = useState<ReportSummaryDTO | null>(null);
  const [arAging, setArAging] = useState<ArAgingReport | null>(null);
  const [conversion, setConversion] = useState<EstimateConversionReport | null>(null);
  const [revenue, setRevenue] = useState<RevenueTrendReport | null>(null);
  const [scorecards, setScorecards] = useState<TechnicianScorecardsReport | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>("XAF");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [sum, ar, conv, rev, sc, org] = await Promise.all([
          reportSummary(session),
          reportArAging(session),
          reportEstimateConversion(session),
          reportRevenueTrend(session),
          reportTechnicianScorecards(session),
          orgSettings(session),
        ]);
        setSummary(sum);
        setArAging(ar);
        setConversion(conv);
        setRevenue(rev);
        setScorecards(sc);
        setCurrency(((org.businessSettings ?? {}) as unknown as BusinessSettings).currency ?? "XAF");
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

  const pipelineMargin = summary?.pipelineMarginCents ?? 0;
  const realizedMargin = summary?.realizedMarginCents ?? 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load(true);
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
          progressBackgroundColor={colors.surface}
        />
      }
    >
      <OfficeHeader
        colors={colors}
        eyebrow="Owner · Analytics"
        title="Reports"
        subtitle="Revenue, receivables, conversion and technician performance."
        onBack={nav.pop}
      />

      <InlineError colors={colors} message={error} />

      {loading ? (
        <Text style={styles.mutedNote}>Loading reports…</Text>
      ) : (
        <>
          <SectionLabel colors={colors}>Snapshot</SectionLabel>
          <View style={styles.kpiRow}>
            <KpiCard colors={colors} label="Revenue collected" value={formatMoney(summary?.revenueCollectedCents ?? 0, currency)} icon="cash-outline" />
            <KpiCard colors={colors} label="Accounts receivable" value={formatMoney(summary?.accountsReceivableCents ?? 0, currency)} icon="document-text-outline" />
          </View>
          <View style={styles.kpiRow}>
            <KpiCard colors={colors} label="Pipeline margin" value={formatMoney(pipelineMargin, currency)} icon="trending-up-outline" />
            <KpiCard colors={colors} label="Realized margin" value={formatMoney(realizedMargin, currency)} icon="checkmark-circle-outline" />
          </View>
          {summary ? (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={15} color={colors.warning} />
              <Text style={styles.ratingText}>{summary.rating.average.toFixed(1)} avg rating from {summary.rating.count} review{summary.rating.count === 1 ? "" : "s"}</Text>
            </View>
          ) : null}

          <SectionLabel colors={colors}>Estimate funnel</SectionLabel>
          {conversion ? (
            <View style={styles.card}>
              <View style={styles.funnelRow}>
                <View style={styles.funnelItem}>
                  <Text style={styles.funnelValue}>{conversion.sent}</Text>
                  <Text style={styles.funnelLabel}>Sent</Text>
                </View>
                <View style={[styles.funnelItem, { backgroundColor: colors.successAlpha, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 }]}>
                  <Text style={[styles.funnelValue, { color: colors.success }]}>{conversion.approved}</Text>
                  <Text style={[styles.funnelLabel, { color: colors.success }]}>Approved</Text>
                </View>
                <View style={styles.funnelItem}>
                  <Text style={styles.funnelValue}>{conversion.declined + conversion.expired}</Text>
                  <Text style={styles.funnelLabel}>Declined / expired</Text>
                </View>
              </View>
              <Text style={styles.conversionText}>
                Conversion: <Text style={{ fontFamily: fonts.bold, color: colors.foreground }}>{Math.round(conversion.conversionRate * 100)}%</Text>
                {conversion.avgDaysToApprove !== null ? ` · avg ${conversion.avgDaysToApprove.toFixed(1)}d to approve` : ""}
                {" "}over {conversion.windowDays} days
              </Text>
            </View>
          ) : (
            <Text style={styles.mutedNote}>No estimate data available.</Text>
          )}

          <SectionLabel colors={colors}>AR aging</SectionLabel>
          {arAging && arAging.invoiceCount > 0 ? (
            <View style={styles.card}>
              {arAging.buckets.map((bucket) => (
                <View key={bucket.label} style={styles.agingRow}>
                  <Text style={styles.agingLabel}>{bucket.label === "current" ? "Current" : bucket.label}</Text>
                  <Text style={styles.agingCount}>{bucket.count}</Text>
                  <Text style={styles.agingAmount}>{formatMoney(bucket.totalCents, currency)}</Text>
                </View>
              ))}
              <Text style={styles.agingTotal}>
                Total outstanding: <Text style={{ fontFamily: fonts.bold, color: colors.foreground }}>{formatMoney(arAging.totalOutstandingCents, currency)}</Text>
              </Text>
            </View>
          ) : (
            <Text style={styles.mutedNote}>No outstanding invoices.</Text>
          )}

          <SectionLabel colors={colors}>Revenue trend</SectionLabel>
          {revenue && revenue.months.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.trendTotal}>
                Total: <Text style={{ fontFamily: fonts.bold, color: colors.foreground }}>{formatMoney(revenue.totalRevenueCents, currency)}</Text>
              </Text>
              <View style={styles.trendList}>
                {revenue.months.map((point) => {
                  const parts = point.month.split("-");
                  const label = `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(parts[1]) - 1]} '${parts[0].slice(2)}`;
                  return (
                    <View key={point.month} style={styles.trendRow}>
                      <Text style={styles.trendLabel}>{label}</Text>
                      <Text style={styles.trendAmount}>{formatMoney(point.revenueCents, currency)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <Text style={styles.mutedNote}>No revenue data available.</Text>
          )}

          <SectionLabel colors={colors}>Technicians</SectionLabel>
          {scorecards && scorecards.scorecards.length > 0 ? (
            <View style={styles.card}>
              {scorecards.scorecards.map((tech) => (
                <View key={tech.technicianId ?? "(unassigned)"} style={styles.techRow}>
                  <View style={styles.techIcon}>
                    <Ionicons name="person-outline" size={15} color={colors.primary} />
                  </View>
                  <View style={styles.techBody}>
                    <Text style={styles.techName}>{tech.technicianName}</Text>
                    <Text style={styles.techMeta}>{tech.jobsCompleted} job{tech.jobsCompleted === 1 ? "" : "s"} · {formatMoney(tech.revenueCents, currency)}</Text>
                    <View style={styles.techTags}>
                      {tech.avgRating !== null ? <Tag colors={colors} label={`${tech.avgRating.toFixed(1)} ★`} tone={tech.avgRating >= 4 ? "success" : tech.avgRating >= 3 ? "warning" : "danger"} /> : null}
                      {tech.onTimeRate !== null ? (
                        <Tag colors={colors} label={`${Math.round(tech.onTimeRate * 100)}% on time`} tone={tech.onTimeRate >= 0.9 ? "success" : tech.onTimeRate >= 0.7 ? "warning" : "danger"} />
                      ) : null}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.mutedNote}>No completed jobs in this window.</Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

function KpiCard({
  colors,
  label,
  value,
  icon,
}: {
  colors: Palette;
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.kpiCard}>
      <View style={styles.kpiIcon}>
        <Ionicons name={icon} size={15} color={colors.primary} />
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: spacing.xl },
  mutedNote: { color: "#888", fontSize: 13, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  kpiRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  kpiCard: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fff", padding: spacing.sm },
  kpiIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  kpiLabel: { color: "#6b7280", fontSize: 10, fontFamily: fonts.medium, textTransform: "uppercase", letterSpacing: 0.4 },
  kpiValue: { color: "#111827", fontSize: 15, fontFamily: fonts.bold, marginTop: 2 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  ratingText: { color: "#6b7280", fontSize: 13, fontFamily: fonts.regular },
  card: { marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fff", padding: spacing.sm },
  funnelRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  funnelItem: { flex: 1, alignItems: "center", padding: spacing.sm },
  funnelValue: { color: "#111827", fontSize: 17, fontFamily: fonts.bold },
  funnelLabel: { color: "#6b7280", fontSize: 10.5, fontFamily: fonts.medium, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 2 },
  conversionText: { color: "#374151", fontSize: 12.5, fontFamily: fonts.regular, lineHeight: 18 },
  agingRow: { flexDirection: "row", alignItems: "center", paddingVertical: 7 },
  agingLabel: { flex: 1, color: "#374151", fontSize: 13, fontFamily: fonts.medium },
  agingCount: { color: "#6b7280", fontSize: 13, fontFamily: fonts.regular, width: 32, textAlign: "center" },
  agingAmount: { color: "#111827", fontSize: 13, fontFamily: fonts.semibold, width: 100, textAlign: "right" },
  agingTotal: { color: "#374151", fontSize: 12.5, fontFamily: fonts.regular, borderTopWidth: 1, borderTopColor: "#e5e7eb", marginTop: spacing.xs, paddingTop: spacing.xs, lineHeight: 18 },
  trendTotal: { color: "#374151", fontSize: 12.5, fontFamily: fonts.regular, marginBottom: spacing.sm, lineHeight: 18 },
  trendList: { gap: 6 },
  trendRow: { flexDirection: "row", alignItems: "center" },
  trendLabel: { flex: 1, color: "#6b7280", fontSize: 12.5, fontFamily: fonts.regular },
  trendAmount: { color: "#111827", fontSize: 13, fontFamily: fonts.semibold },
  techRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: 8 },
  techIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center" },
  techBody: { flex: 1, minWidth: 0 },
  techName: { color: "#111827", fontSize: 13.5, fontFamily: fonts.semibold },
  techMeta: { color: "#6b7280", fontSize: 12, fontFamily: fonts.regular, marginTop: 1 },
  techTags: { flexDirection: "row", gap: spacing.xs, marginTop: 6 },
});