import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { PortalEstimateDTO, PortalSessionDTO } from "@nnact/shared";
import { formatMoney } from "@nnact/shared";
import { customerApi } from "../api";
import {
  customerApproveEstimate,
  customerCheckout,
  customerDeclineEstimate,
  customerRefresh,
  customerWorkspace,
} from "../auth-api";
import type { StoredCustomerSession } from "../auth-storage";
import { Card, PrimaryButton, ScreenHeader } from "../components/ui";
import { fonts, type Palette } from "../theme";

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
    <Card colors={colors}>
      <Text style={styles.cardTitle}>Estimate {estimate.number}</Text>
      {estimate.options.map((option) => (
        <PrimaryButton
          key={option.id}
          colors={colors}
          label={`${option.label} · ${formatMoney(option.total)}`}
          variant={optionId === option.id ? "primary" : "secondary"}
          onPress={() => setOptionId(option.id)}
        />
      ))}
      <TextInput
        value={signatureName}
        onChangeText={setSignatureName}
        placeholder="Your name"
        placeholderTextColor={colors.dimForeground}
        style={styles.input}
      />
      <View style={styles.row}>
        <PrimaryButton colors={colors} label={working === "approve" ? "Approving…" : "Approve"} onPress={() => void approve()} disabled={working !== null} />
        <PrimaryButton colors={colors} label={working === "decline" ? "Declining…" : "Decline"} onPress={() => void decline()} disabled={working !== null} variant="danger" />
      </View>
      {message ? <Text style={styles.meta}>{message}</Text> : null}
    </Card>
  );
}

export function PortalScreen({
  colors,
  token,
  account,
  onBack,
  onSignOut,
}: {
  colors: Palette;
  token?: string;
  account?: { orgId: string; session: StoredCustomerSession; onSession: (session: StoredCustomerSession) => void };
  onBack: () => void;
  onSignOut: () => void;
}) {
  const [session, setSession] = useState<PortalSessionDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const styles = createStyles(colors);

  const load = useCallback(async () => {
    try {
      setError(null);
      if (account) {
        try {
          setSession(await customerWorkspace(account.session, account.orgId));
        } catch (err) {
          if (err instanceof Error && err.message === "session_expired") {
            const next = await customerRefresh(account.session.refreshToken);
            account.onSession(next);
            setSession(await customerWorkspace(next, account.orgId));
            return;
          }
          throw err;
        }
        return;
      }
      if (!token) throw new Error("Portal unavailable");
      setSession(await customerApi.portalSession(token));
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Portal unavailable");
      setSession(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [account, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function pay(invoiceId: string) {
    try {
      if (account) {
        let session = account.session;
        try {
          const { url } = await customerCheckout(session, account.orgId, invoiceId);
          await Linking.openURL(url);
          return;
        } catch (err) {
          if (err instanceof Error && err.message === "session_expired") {
            session = await customerRefresh(session.refreshToken);
            account.onSession(session);
            const { url } = await customerCheckout(session, account.orgId, invoiceId);
            await Linking.openURL(url);
            return;
          }
          throw err;
        }
      }
      if (!token) return;
      const { url } = await customerApi.portalCheckout(token, invoiceId);
      await Linking.openURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Checkout failed");
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loading}>Loading your portal…</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <ScreenHeader colors={colors} eyebrow="PORTAL" title="Link unavailable" subtitle={error ?? "This portal link is no longer active."} onBack={onBack} />
        <View style={styles.form}>
          <PrimaryButton colors={colors} label="Use a different link" onPress={onSignOut} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.primary} />}
    >
      <ScreenHeader
        colors={colors}
        eyebrow={session.org.name.toUpperCase()}
        title={`Hello, ${session.customer.name.split(" ")[0]}`}
        subtitle="Review estimates, pay invoices, and track your service history."
        onBack={onBack}
      />

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      {session.views.includes("estimates") ? (
        <Section colors={colors} title="Estimates">
          {session.estimates.length === 0 ? (
            <Text style={styles.empty}>No estimates waiting for approval.</Text>
          ) : (
            session.estimates.map((estimate) => (
              <EstimateCard
                key={estimate.id}
                colors={colors}
                estimate={estimate}
                customerName={session.customer.name}
                onChanged={() => void load()}
                onApprove={async (body) => {
                  if (account) {
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
                    return;
                  }
                  if (!token) return;
                  await customerApi.portalApproveEstimate(token, estimate.id, body);
                }}
                onDecline={async () => {
                  if (account) {
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
                    return;
                  }
                  if (!token) return;
                  await customerApi.portalDeclineEstimate(token, estimate.id);
                }}
              />
            ))
          )}
        </Section>
      ) : null}

      {session.views.includes("balance") ? (
        <Section colors={colors} title="Balance">
          {session.balance.invoices.length === 0 ? (
            <Text style={styles.empty}>No outstanding balance.</Text>
          ) : (
            session.balance.invoices.map((invoice) => (
              <Card key={invoice.id} colors={colors}>
                <Text style={styles.cardTitle}>Invoice {invoice.number}</Text>
                <Text style={styles.meta}>{formatMoney(invoice.remaining)} remaining</Text>
              </Card>
            ))
          )}
        </Section>
      ) : null}

      {session.views.includes("checkout") ? (
        <Section colors={colors} title="Pay online">
          {!session.checkout.available ? (
            <Text style={styles.empty}>{session.balance.paymentInstructions}</Text>
          ) : (
            session.balance.invoices.map((invoice) => (
              <Card key={invoice.id} colors={colors}>
                <Text style={styles.cardTitle}>Invoice {invoice.number}</Text>
                <Text style={styles.meta}>Pay {formatMoney(invoice.remaining)}</Text>
                <PrimaryButton colors={colors} label="Pay now" onPress={() => void pay(invoice.id)} />
              </Card>
            ))
          )}
        </Section>
      ) : null}

      {session.views.includes("receipts") ? (
        <Section colors={colors} title="Receipts">
          {session.receipts.length === 0 ? (
            <Text style={styles.empty}>No receipts yet.</Text>
          ) : (
            session.receipts.map((receipt) => (
              <Card key={receipt.id} colors={colors}>
                <Text style={styles.cardTitle}>Invoice {receipt.number}</Text>
                <Text style={[styles.meta, { color: colors.success }]}>{formatMoney(receipt.total)} paid</Text>
              </Card>
            ))
          )}
        </Section>
      ) : null}

      {session.views.includes("service_plans") ? (
        <Section colors={colors} title="Maintenance plans">
          {session.servicePlans.length === 0 ? (
            <Text style={styles.empty}>No active maintenance plan.</Text>
          ) : (
            session.servicePlans.map((plan) => (
              <Card key={plan.id} colors={colors}>
                <Text style={styles.cardTitle}>{plan.planName}</Text>
                <Text style={styles.meta}>
                  {plan.visitsCompleted} of {plan.visitsIncluded} visits used
                </Text>
              </Card>
            ))
          )}
        </Section>
      ) : null}

      {session.views.includes("service_history") ? (
        <Section colors={colors} title="Service history">
          {session.serviceHistory.length === 0 ? (
            <Text style={styles.empty}>No service visits yet.</Text>
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
        </Section>
      ) : null}

      <View style={styles.form}>
        <PrimaryButton colors={colors} label={account ? "Sign out of account" : "Sign out of portal link"} onPress={onSignOut} variant="secondary" />
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Section({ colors, title, children }: { colors: Palette; title: string; children: React.ReactNode }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingTop: 58, paddingBottom: 24 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: colors.background },
    loading: { color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.regular },
    form: { paddingHorizontal: 20, gap: 10, marginTop: 8 },
    section: { paddingHorizontal: 20, marginBottom: 18 },
    sectionTitle: { color: colors.foreground, fontSize: 16, fontFamily: fonts.bold, marginBottom: 10 },
    cardTitle: { color: colors.foreground, fontSize: 14, fontFamily: fonts.bold },
    meta: { color: colors.mutedForeground, fontSize: 12, marginTop: 4, fontFamily: fonts.regular },
    empty: { color: colors.mutedForeground, fontSize: 12, fontFamily: fonts.regular, marginBottom: 8 },
    errorBanner: { marginHorizontal: 20, marginBottom: 12, color: colors.danger, fontSize: 12, fontFamily: fonts.regular },
    input: {
      marginTop: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardMuted,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: colors.foreground,
      fontSize: 14,
      fontFamily: fonts.regular,
    },
    row: { flexDirection: "row", gap: 8, marginTop: 10 },
  });
