import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatMoney, type ServiceAgreementDTO, type ServicePlanDTO } from "@nnact/shared";
import type { StoredStaffSession } from "../../auth-storage";
import { listServiceAgreements, listServicePlans } from "../../office-api";
import { InlineError, OfficeHeader, Row, SectionLabel, StatusTag } from "./shared";
import { fonts, spacing, type Palette } from "../../theme";

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtPlanPrice(plan: ServicePlanDTO): string {
  const per = plan.billingFrequency.toLowerCase().replaceAll("_", " ");
  return `${formatMoney(plan.priceCents)}${plan.pricingModel === "fixed" ? "" : ` · ${plan.termMonths} mo`}${plan.priceCents > 0 ? ` / ${per}` : ""}`;
}

export function PlansScreen({
  colors,
  session,
  nav,
}: {
  colors: Palette;
  session: StoredStaffSession;
  nav: { pop: () => void };
}) {
  const styles = createStyles(colors);
  const [plans, setPlans] = useState<ServicePlanDTO[]>([]);
  const [agreements, setAgreements] = useState<ServiceAgreementDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [p, a] = await Promise.all([listServicePlans(session), listServiceAgreements(session)]);
        setPlans(p);
        setAgreements(a);
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

  const activeAgreements = agreements.filter((a) => a.status.toLowerCase() === "active");
  const renewingSoon = activeAgreements.filter((a) => a.endsAt && new Date(a.endsAt).getTime() < Date.now() + 45 * 86_400_000);

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
        eyebrow="Service"
        title="Plans & agreements"
        subtitle="Renewable service contracts with coverage, visits and parts policies."
        onBack={nav.pop}
      />
      <InlineError colors={colors} message={error} />

      <SectionLabel colors={colors}>Active agreements · {activeAgreements.length}</SectionLabel>
      {loading ? (
        <Text style={styles.mutedNote}>Loading…</Text>
      ) : renewingSoon.length > 0 ? (
        <Text style={styles.warnNote}>Renewal coming up for {renewingSoon.length} agreement{renewingSoon.length === 1 ? "" : "s"}.</Text>
      ) : null}
      {agreements.length === 0 ? (
        <Text style={styles.mutedNote}>No agreements on file.</Text>
      ) : (
        activeAgreements.map((agreement) => (
          <Row
            key={agreement.id}
            colors={colors}
            icon="ribbon-outline"
            title={agreement.agreementNumber}
            subtitle={`${agreement.customerName ?? "Customer"} · ${agreement.planName}${agreement.endsAt ? ` · renews ${fmtDate(agreement.endsAt)}` : ""}`}
            right={<StatusTag colors={colors} status={agreement.status} />}
          />
        ))
      )}
      {agreements.filter((a) => a.status.toLowerCase() !== "active").map((agreement) => (
        <Row
          key={agreement.id}
          colors={colors}
          icon="ribbon-outline"
          title={agreement.agreementNumber}
          subtitle={`${agreement.customerName ?? "Customer"} · ${agreement.planName}`}
          right={<StatusTag colors={colors} status={agreement.status} />}
        />
      ))}

      <SectionLabel colors={colors}>{plans.length} templates</SectionLabel>
      {loading ? null : plans.length === 0 ? (
        <Text style={styles.mutedNote}>No service plan templates defined.</Text>
      ) : (
        plans.map((plan) => (
          <Row
            key={plan.id}
            colors={colors}
            icon="sparkles-outline"
            title={plan.name}
            subtitle={`${fmtPlanPrice(plan)}${plan.activeAgreementCount ? ` · ${plan.activeAgreementCount} on it` : ""}${plan.visitsPerTerm ? ` · ${plan.visitsPerTerm} visits` : ""}`}
            right={<StatusTag colors={colors} status={plan.status} />}
          />
        ))
      )}
    </ScrollView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.xl },
    mutedNote: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.regular, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    warnNote: { color: colors.warning, fontSize: 13, fontFamily: fonts.semibold, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  });