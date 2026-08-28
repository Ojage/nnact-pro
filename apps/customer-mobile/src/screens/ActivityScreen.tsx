import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { PortalEstimateDTO, PortalSessionDTO } from "@nnact/shared";
import { formatMoney } from "@nnact/shared";
import {
  customerApproveEstimate,
  customerCheckout,
  customerDeclineEstimate,
  customerRefresh,
  customerWorkspace,
} from "../auth-api";
import type { StoredCustomerSession } from "../auth-storage";
import {
  Card,
  EmptyState,
  HeroBanner,
  LoadingScreen,
  PrimaryButton,
  ProgressBar,
  SegmentedTabs,
  StatCard,
  TextField,
} from "../components/ui";
import { fonts, spacing, type Palette } from "../theme";
import type { AppSearchFonts } from "@nnact/mobile-ui";

type ActivityTab = "overview" | "estimates" | "billing" | "history";

function EstimateCard({
  colors,
  estimate,
  customerName,
  onChanged,
  onApprove,
  onDecline,
}: {
  colors: Palette;
  estimate: PortalEstimateDTO;
  customerName: string;
  onChanged: () => void;
  onApprove: (body: { optionId: string; signatureName?: string }) => Promise<void>;
  onDecline: () => Promise<void>;
}) {
  const [optionId, setOptionId] = useState(estimate.options[0]?.id ?? "");
  const [signatureName, setSignatureName] = useState(customerName);
  const [working, setWorking] = useState<"approve" | "decline" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const styles = createStyles(colors);

  async function approve() {
    setWorking("approve");
    try {
      await onApprove({ optionId, signatureName });
      setMessage("Estimate approved.");
      onChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Approval failed");
    } finally {
      setWorking(null);
    }
  }

  async function decline() {
    setWorking("decline");
    try {
      await onDecline();
      setMessage("Estimate declined.");
      onChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Decline failed");
    } finally {
      setWorking(null);
    }
  }

  return (
    <Card colors={colors} elevated>
      <View style={styles.estimateHeader}>
        <Text style={styles.cardTitle}>Estimate {estimate.number}</Text>
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingBadgeText}>Pending</Text>
        </View>
      </View>
      <Text style={styles.cardSubtitle}>Select an option to approve</Text>
      {estimate.options.map((option) => (
        <PrimaryButton
          key={option.id}
          colors={colors}
          label={`${option.label} · ${formatMoney(option.total)}`}
          variant={optionId === option.id ? "primary" : "secondary"}
          size="sm"
          onPress={() => setOptionId(option.id)}
        />
      ))}
      <TextField
        colors={colors}
        label="Signature name"
        value={signatureName}
        onChangeText={setSignatureName}
        placeholder="Your full name"
      />
      <View style={styles.row}>
        <View style={styles.rowBtn}>
          <PrimaryButton
            colors={colors}
            label={working === "approve" ? "Approving…" : "Approve"}
            onPress={() => void approve()}
            disabled={working !== null}
            size="sm"
          />
        </View>
        <View style={styles.rowBtn}>
          <PrimaryButton
            colors={colors}
            label={working === "decline" ? "Declining…" : "Decline"}
            onPress={() => void decline()}
            disabled={working !== null}
            variant="danger"
            size="sm"
          />
        </View>
      </View>
      {message ? <Text style={styles.meta}>{message}</Text> : null}
    </Card>
  );
}

export function ActivityScreen({
  colors,
  account,
  onSessionLoaded,
  onOpenSearch,
  searchPlaceholder,
  searchFonts,
}: {
  colors: Palette;
  account: { orgId: string; session: StoredCustomerSession; onSession: (session: StoredCustomerSession) => void };
  onSessionLoaded?: (summary: { estimates: number; balance: string | null }) => void;
  onOpenSearch?: () => void;
  searchPlaceholder?: string;
  searchFonts?: AppSearchFonts;
}) {
  const [session, setSession] = useState<PortalSessionDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ActivityTab>("overview");
  const styles = createStyles(colors);

  const load = useCallback(async () => {
    try {
      setError(null);
      try {
        const data = await customerWorkspace(account.session, account.orgId);
        setSession(data);
        onSessionLoaded?.({
          estimates: data.estimates.length,
          balance: data.balance.invoices.length
            ? formatMoney(data.balance.invoices.reduce((sum, inv) => sum + inv.remaining, 0))
            : null,
        });
      } catch (err) {
        if (err instanceof Error && err.message === "session_expired") {
          const next = await customerRefresh(account.session.refreshToken);
          account.onSession(next);
          const data = await customerWorkspace(next, account.orgId);
          setSession(data);
          return;
        }
        throw err;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Unable to load your activity");
      setSession(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [account, onSessionLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  const tabs = useMemo(() => {
    if (!session) return [];
    const items: { id: ActivityTab; label: string }[] = [{ id: "overview", label: "Overview" }];
    if (session.views.includes("estimates")) items.push({ id: "estimates", label: "Estimates" });
    if (session.views.includes("balance") || session.views.includes("checkout") || session.views.includes("receipts")) {
      items.push({ id: "billing", label: "Billing" });
    }
    if (session.views.includes("service_plans") || session.views.includes("service_history")) {
      items.push({ id: "history", label: "History" });
    }
    return items;
  }, [session]);

  async function pay(invoiceId: string) {
    try {
      let current = account.session;
      try {
        const { url } = await customerCheckout(current, account.orgId, invoiceId);
        await Linking.openURL(url);
        return;
      } catch (err) {
        if (err instanceof Error && err.message === "session_expired") {
          current = await customerRefresh(current.refreshToken);
          account.onSession(current);
          const { url } = await customerCheckout(current, account.orgId, invoiceId);
          await Linking.openURL(url);
          return;
        }
        throw err;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Checkout failed");
    }
  }

  if (loading) return <LoadingScreen colors={colors} message="Loading your activity…" />;

  if (!session) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.emptyContent}>
        <EmptyState
          colors={colors}
          icon=""
          title="Activity unavailable"
          description={error ?? "We could not load your estimates and invoices. Pull to refresh or try again later."}
        />
        <View style={styles.section}>
          <PrimaryButton colors={colors} label="Try again" onPress={() => void load()} variant="secondary" />
        </View>
      </ScrollView>
    );
  }

  const totalDue = session.balance.invoices.reduce((sum, inv) => sum + inv.remaining, 0);
  const firstName = session.customer.name.split(" ")[0];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.primary} />
      }
      showsVerticalScrollIndicator={false}
    >
      <HeroBanner
        colors={colors}
        eyebrow={session.org.name}
        title={`Hello, ${firstName}`}
        subtitle="Estimates, invoices, and service history for your account."
        searchPlaceholder={searchPlaceholder}
        onSearchPress={onOpenSearch}
        searchFonts={searchFonts}
      />

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      <SegmentedTabs colors={colors} tabs={tabs} active={tab} onChange={(id) => setTab(id as ActivityTab)} />

      <View style={styles.section}>
        {tab === "overview" ? (
          <>
            <View style={styles.statsRow}>
              <StatCard
                colors={colors}
                label="Estimates"
                value={String(session.estimates.length)}
                hint="Pending review"
                accent={session.estimates.length ? "warning" : undefined}
              />
              <StatCard
                colors={colors}
                label="Balance"
                value={formatMoney(totalDue)}
                hint={totalDue > 0 ? "Outstanding" : "All paid"}
                accent={totalDue > 0 ? "primary" : "success"}
              />
            </View>
            {session.servicePlans.length > 0 ? (
              <Card colors={colors} elevated>
                <Text style={styles.cardTitle}>Maintenance plan</Text>
                {session.servicePlans.map((plan) => (
                  <View key={plan.id}>
                    <Text style={styles.meta}>{plan.planName}</Text>
                    <ProgressBar
                      colors={colors}
                      progress={plan.visitsIncluded ? (plan.visitsCompleted / plan.visitsIncluded) * 100 : 0}
                      label={`${plan.visitsCompleted} of ${plan.visitsIncluded} visits used`}
                    />
                  </View>
                ))}
              </Card>
            ) : null}
            {session.estimates.length > 0 ? (
              <PrimaryButton colors={colors} label="Review estimates" onPress={() => setTab("estimates")} variant="accent" />
            ) : null}
            {totalDue > 0 && session.checkout.available ? (
              <PrimaryButton colors={colors} label="Pay outstanding balance" onPress={() => setTab("billing")} />
            ) : null}
          </>
        ) : null}

        {tab === "estimates" && session.views.includes("estimates") ? (
          session.estimates.length === 0 ? (
            <EmptyState colors={colors} icon="" title="All caught up" description="No estimates waiting for your approval." />
          ) : (
            session.estimates.map((estimate) => (
              <EstimateCard
                key={estimate.id}
                colors={colors}
                estimate={estimate}
                customerName={session.customer.name}
                onChanged={() => void load()}
                onApprove={async (body) => {
                  let current = account.session;
                  try {
                    await customerApproveEstimate(current, account.orgId, estimate.id, body);
                  } catch (err) {
                    if (err instanceof Error && err.message === "session_expired") {
                      current = await customerRefresh(current.refreshToken);
                      account.onSession(current);
                      await customerApproveEstimate(current, account.orgId, estimate.id, body);
                      return;
                    }
                    throw err;
                  }
                }}
                onDecline={async () => {
                  let current = account.session;
                  try {
                    await customerDeclineEstimate(current, account.orgId, estimate.id);
                  } catch (err) {
                    if (err instanceof Error && err.message === "session_expired") {
                      current = await customerRefresh(current.refreshToken);
                      account.onSession(current);
                      await customerDeclineEstimate(current, account.orgId, estimate.id);
                      return;
                    }
                    throw err;
                  }
                }}
              />
            ))
          )
        ) : null}

        {tab === "billing" ? (
          <>
            {session.views.includes("balance") ? (
              session.balance.invoices.length === 0 ? (
                <EmptyState colors={colors} icon="" title="No balance due" description="You're all paid up. Thank you!" />
              ) : (
                session.balance.invoices.map((invoice) => (
                  <Card key={invoice.id} colors={colors} elevated>
                    <Text style={styles.cardTitle}>Invoice {invoice.number}</Text>
                    <Text style={styles.amount}>{formatMoney(invoice.remaining)} remaining</Text>
                  </Card>
                ))
              )
            ) : null}
            {session.views.includes("checkout") && session.checkout.available ? (
              session.balance.invoices.map((invoice) => (
                <Card key={`pay-${invoice.id}`} colors={colors} elevated>
                  <Text style={styles.cardTitle}>Pay invoice {invoice.number}</Text>
                  <Text style={styles.amount}>{formatMoney(invoice.remaining)}</Text>
                  <PrimaryButton colors={colors} label="Pay now" onPress={() => void pay(invoice.id)} variant="accent" />
                </Card>
              ))
            ) : session.views.includes("checkout") ? (
              <Text style={styles.meta}>{session.balance.paymentInstructions}</Text>
            ) : null}
            {session.views.includes("receipts") ? (
              <>
                <Text style={styles.sectionLabel}>Receipts</Text>
                {session.receipts.length === 0 ? (
                  <Text style={styles.meta}>No receipts yet.</Text>
                ) : (
                  session.receipts.map((receipt) => (
                    <Card key={receipt.id} colors={colors}>
                      <Text style={styles.cardTitle}>Invoice {receipt.number}</Text>
                      <Text style={[styles.amount, { color: colors.success }]}>{formatMoney(receipt.total)} paid</Text>
                    </Card>
                  ))
                )}
              </>
            ) : null}
          </>
        ) : null}

        {tab === "history" ? (
          <>
            {session.views.includes("service_plans") ? (
              <>
                <Text style={styles.sectionLabel}>Maintenance plans</Text>
                {session.servicePlans.length === 0 ? (
                  <EmptyState colors={colors} icon="" title="No active plan" description="Ask NNACT about preventive maintenance contracts." />
                ) : (
                  session.servicePlans.map((plan) => (
                    <Card key={plan.id} colors={colors} elevated>
                      <Text style={styles.cardTitle}>{plan.planName}</Text>
                      <ProgressBar
                        colors={colors}
                        progress={plan.visitsIncluded ? (plan.visitsCompleted / plan.visitsIncluded) * 100 : 0}
                        label={`${plan.visitsCompleted} of ${plan.visitsIncluded} visits used`}
                      />
                    </Card>
                  ))
                )}
              </>
            ) : null}
            {session.views.includes("service_history") ? (
              <>
                <Text style={styles.sectionLabel}>Service visits</Text>
                {session.serviceHistory.length === 0 ? (
                  <EmptyState colors={colors} icon="" title="No visits yet" description="Your completed service visits will appear here." />
                ) : (
                  session.serviceHistory.map((job) => (
                    <Card key={job.id} colors={colors}>
                      <Text style={styles.cardTitle}>{job.title}</Text>
                      <Text style={styles.meta}>
                        {job.status.replaceAll("_", " ")}
                        {job.scheduledAt ? ` · ${new Date(job.scheduledAt).toLocaleDateString()}` : ""}
                      </Text>
                    </Card>
                  ))
                )}
              </>
            ) : null}
          </>
        ) : null}
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.lg },
    emptyContent: { flexGrow: 1, justifyContent: "center" },
    section: { paddingHorizontal: spacing.lg },
    statsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
    errorBanner: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, color: colors.danger, fontSize: 13, fontFamily: fonts.regular },
    estimateHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    pendingBadge: { backgroundColor: colors.accentMuted, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    pendingBadgeText: { color: colors.warning, fontSize: 10, fontFamily: fonts.bold, textTransform: "uppercase" },
    cardTitle: { color: colors.foreground, fontSize: 16, fontFamily: fonts.bold },
    cardSubtitle: { color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.regular, marginTop: 4, marginBottom: spacing.sm },
    amount: { color: colors.primary, fontSize: 20, fontFamily: fonts.extraBold, marginTop: 4, marginBottom: spacing.sm },
    meta: { color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.regular, marginTop: 4 },
    sectionLabel: { color: colors.foreground, fontSize: 15, fontFamily: fonts.bold, marginBottom: spacing.sm, marginTop: spacing.sm },
    row: { flexDirection: "row", gap: spacing.sm },
    rowBtn: { flex: 1 },
  });
