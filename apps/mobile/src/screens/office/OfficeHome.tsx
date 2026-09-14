import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatMoney, type JobDTO } from "@nnact/shared";
import type { StoredStaffSession } from "../../auth-storage";
import type { Appointment, DiagnosticListItem } from "../../hooks/useFieldData";
import {
  financeDashboard,
  listEstimates,
  listInvoices,
  type OfficeEstimate,
  type OfficeInvoice,
} from "../../office-api";
import { InlineError, SectionLabel, Row } from "./shared";
import { fonts, spacing, type Palette } from "../../theme";

const AREAS = [
  { key: "jobs", icon: "briefcase-outline" as const, title: "Jobs", subtitle: "Board & records", accent: "primary" as const },
  { key: "dispatch", icon: "radio-outline" as const, title: "Dispatch", subtitle: "Assign & schedule", accent: "primary" as const },
  { key: "customers", icon: "people-outline" as const, title: "Customers", subtitle: "Directory & equipment", accent: "primary" as const },
  { key: "billing", icon: "receipt-outline" as const, title: "Estimates & invoices", subtitle: "Send, approve & collect", accent: "primary" as const },
  { key: "service", icon: "sparkles-outline" as const, title: "Service", subtitle: "Plans & agreements", accent: "primary" as const },
  { key: "money", icon: "cash-outline" as const, title: "Money", subtitle: "Expenses, bills & advances", accent: "primary" as const },
] as const;

export function OfficeHome({
  colors,
  session,
  jobs,
  appointments,
  diagnostics,
  loading,
  refreshing,
  onRefresh,
  onOpenNotifications,
  onOpenJob,
  nav,
}: {
  colors: Palette;
  session: StoredStaffSession;
  jobs: JobDTO[];
  appointments: Appointment[];
  diagnostics: DiagnosticListItem[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenNotifications: () => void;
  onOpenJob: (jobId: string) => void;
  nav: {
    push: (route: { name: "dispatch" } | { name: "customers" } | { name: "billing" } | { name: "jobs" } | { name: "plans" } | { name: "finance" } | { name: "team" } | { name: "settings" } | { name: "reports" }) => void;
  };
}) {
  const styles = createStyles(colors);
  const [estimates, setEstimates] = useState<OfficeEstimate[]>([]);
  const [invoices, setInvoices] = useState<OfficeInvoice[]>([]);
  const [billsPayable, setBillsPayable] = useState(0);
  const [toApprove, setToApprove] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadCounts = useCallback(async () => {
    try {
      const [e, inv, dash] = await Promise.all([listEstimates(session), listInvoices(session), financeDashboard(session)]);
      setEstimates(e);
      setInvoices(inv);
      setBillsPayable(dash.billsPayableCents);
      setToApprove(dash.recentExpenses.filter((x) => x.status.toLowerCase() === "submitted").length);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [session]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const unassigned = useMemo(
    () => jobs.filter((j) => !["completed", "canceled"].includes(j.status)).filter((j) => !j.scheduledAt).length,
    [jobs],
  );

  const openJobs = useMemo(() => jobs.filter((j) => !["completed", "canceled"].includes(j.status)).length, [jobs]);

  const todayVisits = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return appointments
      .filter((a) => {
        const t = new Date(a.startsAt);
        return t >= start && t < end;
      })
      .sort((a, b) => (new Date(a.startsAt) > new Date(b.startsAt) ? 1 : -1));
  }, [appointments]);

  const openEstimateValue = useMemo(
    () => estimates.filter((e) => ["draft", "sent", "approved"].includes(e.status)).reduce((sum, e) => sum + e.total, 0),
    [estimates],
  );
  const openInvoiceValue = useMemo(
    () =>
      invoices.reduce((sum, i) => {
        const s = String(i.status).toLowerCase();
        return s === "void" || s === "paid" ? sum : sum + i.total;
      }, 0),
    [invoices],
  );

  function areaPress(key: (typeof AREAS)[number]["key"]) {
    switch (key) {
      case "jobs":
        nav.push({ name: "jobs" });
        break;
      case "dispatch":
        nav.push({ name: "dispatch" });
        break;
      case "customers":
        nav.push({ name: "customers" });
        break;
      case "billing":
        nav.push({ name: "billing" });
        break;
      case "service":
        nav.push({ name: "plans" });
        break;
      case "money":
        nav.push({ name: "finance" });
        break;
    }
  }

  const greeting = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const isOwner = session.user.role === "owner";

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            onRefresh();
            void loadCounts();
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
          progressBackgroundColor={colors.surface}
        />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>OFFICE · {greeting.toUpperCase()}</Text>
        <Text style={styles.heroTitle}>Run the day</Text>
        <Text style={styles.heroSubtitle}>
          Dispatch the team, keep customers informed and let invoices, expenses and bills clear on time.
        </Text>
        <TouchableOpacity style={styles.heroAlert} onPress={onOpenNotifications} activeOpacity={0.85}>
          <Ionicons name="notifications-outline" size={16} color={colors.brandOrangeBright} />
          <Text style={styles.heroAlertText}>View alerts</Text>
        </TouchableOpacity>
      </View>

      <InlineError colors={colors} message={error} />

      <View style={styles.kpiRow}>
        <KpiCard
          colors={colors}
          label="Open jobs"
          value={String(openJobs)}
          hint={`${unassigned} unassigned`}
          tone={unassigned > 0 ? "warning" : "neutral"}
          onPress={() => nav.push({ name: "jobs" })}
        />
        <KpiCard colors={colors} label="Visits today" value={String(todayVisits.length)} onPress={() => nav.push({ name: "dispatch" })} />
        <KpiCard colors={colors} label="Estimates" value={formatMoney(openEstimateValue)} hint={`${estimates.length} quotes`} onPress={() => nav.push({ name: "billing" })} />
      </View>
      <View style={styles.kpiRow}>
        <KpiCard colors={colors} label="Receivables" value={formatMoney(openInvoiceValue)} onPress={() => nav.push({ name: "billing" })} />
        <KpiCard colors={colors} label="Bills payable" value={formatMoney(billsPayable)} onPress={() => nav.push({ name: "finance" })} />
        <KpiCard colors={colors} label="Active diagnoses" value={String(diagnostics.length)} />
      </View>

      <SectionLabel colors={colors}>Work areas</SectionLabel>
      <View style={styles.areaGrid}>
        {AREAS.map((area) => (
          <TouchableOpacity key={area.key} style={styles.areaCard} onPress={() => areaPress(area.key)} activeOpacity={0.85}>
            <View style={[styles.areaIcon, { backgroundColor: colors.primaryAlpha }]}>
              <Ionicons name={area.icon} size={22} color={colors.primary} />
            </View>
            <Text style={styles.areaTitle}>{area.title}</Text>
            <Text style={styles.areaSubtitle}>{area.subtitle}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isOwner ? (
        <>
          <SectionLabel colors={colors}>Owner's desk</SectionLabel>
          <View style={styles.areaGrid}>
            <TouchableOpacity style={styles.areaCard} onPress={() => nav.push({ name: "team" })} activeOpacity={0.85}>
              <View style={[styles.areaIcon, { backgroundColor: colors.primaryAlpha }]}>
                <Ionicons name="people-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.areaTitle}>Team & staff</Text>
              <Text style={styles.areaSubtitle}>Invite, roles & permissions</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.areaCard} onPress={() => nav.push({ name: "settings" })} activeOpacity={0.85}>
              <View style={[styles.areaIcon, { backgroundColor: colors.primaryAlpha }]}>
                <Ionicons name="cog-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.areaTitle}>Business settings</Text>
              <Text style={styles.areaSubtitle}>Currency, docs & service areas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.areaCard} onPress={() => nav.push({ name: "reports" })} activeOpacity={0.85}>
              <View style={[styles.areaIcon, { backgroundColor: colors.primaryAlpha }]}>
                <Ionicons name="bar-chart-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.areaTitle}>Reports</Text>
              <Text style={styles.areaSubtitle}>Revenue, AR, conversion & more</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}

      <SectionLabel colors={colors}>Today's visits ({todayVisits.length})</SectionLabel>
      {todayVisits.length === 0 ? (
        <Text style={styles.mutedNote}>Nothing scheduled for today.</Text>
      ) : (
        todayVisits.map((appointment) => {
          const job = jobs.find((j) => j.id === appointment.jobId);
          return (
            <Row
              key={appointment.id}
              colors={colors}
              icon="calendar-clear-outline"
              title={job?.title ?? "Service job"}
              subtitle={`${fmtHour(appointment.startsAt)}${job ? ` · ${job.status.replaceAll("_", " ")}` : ""}`}
              onPress={job ? () => onOpenJob(job.id) : undefined}
            />
          );
        })
      )}

      <SectionLabel colors={colors}>Unassigned queue</SectionLabel>
      {unassigned === 0 ? (
        <Text style={styles.mutedNote}>Every open job has a slot. Nice.</Text>
      ) : (
        <TouchableOpacity style={styles.queueBox} onPress={() => nav.push({ name: "dispatch" })} activeOpacity={0.85}>
          <View style={styles.queueRow}>
            <Ionicons name="person-add-outline" size={20} color={colors.warning} />
            <Text style={styles.queueText}>
              <Text style={{ fontFamily: fonts.bold, color: colors.foreground }}>{unassigned}</Text>{" "}
              {unassigned === 1 ? "job" : "jobs"} waiting to be assigned or scheduled.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.dimForeground} />
        </TouchableOpacity>
      )}

      {toApprove > 0 ? (
        <Text style={styles.warnNote}>{toApprove} submitted expense{toApprove === 1 ? "" : "s"} awaiting sign-off in Finance.</Text>
      ) : null}

      {loading && jobs.length === 0 ? <Text style={styles.mutedNote}>Loading field data…</Text> : null}
    </ScrollView>
  );
}

function fmtHour(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
}

function KpiCard({
  colors,
  label,
  value,
  hint,
  tone = "neutral",
  onPress,
}: {
  colors: Palette;
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "warning";
  onPress?: () => void;
}) {
  const styles = createStyles(colors);
  const content = (
    <>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, tone === "warning" && { color: colors.warning }]} numberOfLines={1}>
        {value}
      </Text>
      {hint ? <Text style={styles.kpiHint}>{hint}</Text> : null}
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.kpiCard, { borderColor: colors.borderLight, backgroundColor: colors.card }]}
        activeOpacity={0.85}
        onPress={onPress}
      >
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.kpiCard, { borderColor: colors.borderLight, backgroundColor: colors.card }]}>{content}</View>;
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.xl },
    hero: {
      backgroundColor: colors.primary,
      paddingTop: spacing.lg,
      paddingBottom: spacing.lg,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    heroEyebrow: { color: colors.brandOrangeBright, fontSize: 11, fontFamily: fonts.bold, letterSpacing: 1.2 },
    heroTitle: { color: colors.onEmphasis, fontSize: 28, fontFamily: fonts.extraBold, marginTop: spacing.xs },
    heroSubtitle: { color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, marginTop: spacing.sm },
    heroAlert: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md, alignSelf: "flex-start" },
    heroAlertText: { color: colors.brandOrangeBright, fontSize: 13, fontFamily: fonts.semibold },
    kpiRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    kpiCard: { flex: 1, borderWidth: 1, borderRadius: 14, padding: spacing.sm },
    kpiLabel: { color: colors.dimForeground, fontSize: 10, fontFamily: fonts.medium, textTransform: "uppercase", letterSpacing: 0.4 },
    kpiValue: { color: colors.foreground, fontSize: 16, fontFamily: fonts.bold, marginTop: 2 },
    kpiHint: { color: colors.dimForeground, fontSize: 10, fontFamily: fonts.regular, marginTop: 2 },
    areaGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg },
    areaCard: {
      width: "31%",
      flexGrow: 1,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: 16,
      padding: spacing.sm,
    },
    areaIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    areaTitle: { color: colors.foreground, fontSize: 13, fontFamily: fonts.bold, marginTop: spacing.sm },
    areaSubtitle: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.regular, marginTop: 2 },
    mutedNote: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.regular, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    warnNote: { color: colors.warning, fontSize: 13, fontFamily: fonts.semibold, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    queueBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      backgroundColor: colors.warningAlpha,
      borderRadius: 14,
      padding: spacing.md,
    },
    queueRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
    queueText: { flex: 1, color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.regular },
  });