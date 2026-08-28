import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NNACT_COMPANY, NNACT_PRODUCT } from "@nnact/shared";
import type { StoredStaffSession } from "../auth-storage";
import { HeroCarousel } from "../components/HeroCarousel";
import {
  Card,
  EmptyState,
  HeroBanner,
  LoadingScreen,
  SectionHeader,
  StatCard,
} from "../components/ui";
import { buildFieldToolsSlides, NNACT_BUEA_SLIDES } from "../content/field-carousels";
import type { DiagnosticListItem } from "../hooks/useFieldData";
import { humanize, statusColor, type Appointment } from "../hooks/useFieldData";
import type { JobDTO } from "@nnact/shared";
import { fonts, spacing, type Palette } from "../theme";
import type { AppSearchFonts } from "@nnact/mobile-ui";

export function TodayScreen({
  colors,
  session,
  loading,
  refreshing,
  offline,
  error,
  lastSync,
  queuedWrites,
  todayAppointments,
  activeDiagnostics,
  nextAppointment,
  nextJob,
  nextDiagnostic,
  unreadNotifications,
  onRefresh,
  onOpenDiagnostics,
  onOpenJobs,
  onOpenJob,
  jobs,
  onOpenSearch,
  searchPlaceholder,
  searchFonts,
}: {
  colors: Palette;
  session: StoredStaffSession;
  loading: boolean;
  refreshing: boolean;
  offline: boolean;
  error: string | null;
  lastSync: string | null;
  queuedWrites: number;
  todayAppointments: Appointment[];
  activeDiagnostics: DiagnosticListItem[];
  nextAppointment?: Appointment;
  nextJob?: JobDTO;
  nextDiagnostic?: DiagnosticListItem;
  unreadNotifications?: number;
  jobs: JobDTO[];
  onRefresh: () => void;
  onOpenDiagnostics: () => void;
  onOpenJobs: () => void;
  onOpenJob: (jobId: string) => void;
  onOpenSearch?: () => void;
  searchPlaceholder?: string;
  searchFonts?: AppSearchFonts;
}) {
  const styles = createStyles(colors);
  const firstName = session.user.name.split(" ")[0];
  const toolSlides = buildFieldToolsSlides(activeDiagnostics.length, queuedWrites || undefined);

  if (loading) return <LoadingScreen colors={colors} message="Loading today's field work…" />;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <HeroBanner
        colors={colors}
        eyebrow={NNACT_PRODUCT.name}
        title={`Good day, ${firstName}`}
        subtitle={`${todayAppointments.length} visit${todayAppointments.length === 1 ? "" : "s"} today · ${activeDiagnostics.length} active diagnostic${activeDiagnostics.length === 1 ? "" : "s"}`}
        searchPlaceholder={searchPlaceholder}
        onSearchPress={onOpenSearch}
        searchFonts={searchFonts}
      >
        <View style={styles.heroMeta}>
          <Text style={[styles.connectivity, { color: offline ? colors.warning : colors.success }]}>
            {offline ? "Offline" : "Online"}
          </Text>
          {lastSync ? <Text style={styles.syncMeta}>Synced {lastSync}</Text> : null}
        </View>
      </HeroBanner>

      {error ? (
        <View style={[styles.banner, offline ? styles.bannerOffline : styles.bannerError]}>
          <Text style={[styles.bannerTitle, offline && { color: colors.warning }]}>
            {offline ? "Working from downloaded field packages" : "Field data needs attention"}
          </Text>
          <Text style={styles.bannerCopy}>{error}</Text>
        </View>
      ) : null}

      {unreadNotifications && unreadNotifications > 0 ? (
        <View style={styles.assignBanner}>
          <Text style={styles.assignTitle}>New assignments from dispatch</Text>
          <Text style={styles.assignCopy}>
            {unreadNotifications} update{unreadNotifications === 1 ? "" : "s"} from the office — open your next visit below.
          </Text>
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <StatCard colors={colors} label="Visits" value={String(todayAppointments.length)} hint="Today" accent="primary" />
        <StatCard
          colors={colors}
          label="Diagnostics"
          value={String(activeDiagnostics.length)}
          hint="Need attention"
          accent={activeDiagnostics.length ? "warning" : "success"}
        />
        {queuedWrites ? (
          <StatCard colors={colors} label="Queued" value={String(queuedWrites)} hint="Pending sync" accent="warning" />
        ) : null}
      </View>

      <SectionHeader colors={colors} title="Next action" />
      <View style={styles.section}>
        {nextAppointment ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => onOpenJob(nextJob?.id ?? nextAppointment.jobId)}
          >
            <Card colors={colors} elevated>
              <View style={styles.nextRow}>
                <View style={styles.timeBlock}>
                  <Text style={styles.timeText}>
                    {new Date(nextAppointment.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </Text>
                  <Text style={styles.timeLabel}>arrival</Text>
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>{nextJob?.title ?? "Assigned service job"}</Text>
                  <Text style={styles.cardMeta}>{nextJob?.status ? humanize(nextJob.status) : "scheduled"}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.dimForeground} />
              </View>
              {nextDiagnostic ? (
                <View style={styles.panel}>
                  <View style={styles.nextRow}>
                    <View style={styles.flexOne}>
                      <Text style={styles.panelTitle}>
                        {[nextDiagnostic.equipment.make, nextDiagnostic.equipment.model].filter(Boolean).join(" ") ||
                          nextDiagnostic.equipment.type}
                      </Text>
                      <Text style={styles.cardMeta}>{nextDiagnostic.workflow?.name ?? "Coverage required"}</Text>
                    </View>
                    <View style={[styles.pill, { borderColor: statusColor(nextDiagnostic.session.status, colors) }]}>
                      <Text style={[styles.pillText, { color: statusColor(nextDiagnostic.session.status, colors) }]}>
                        {humanize(nextDiagnostic.session.status)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.complaint}>
                    {nextDiagnostic.session.customerComplaint || "Customer complaint not recorded"}
                  </Text>
                </View>
              ) : (
                <View style={styles.warningPanel}>
                  <Text style={styles.warningTitle}>Diagnostic not started</Text>
                  <Text style={styles.cardMeta}>Confirm model and serial, then select the applicable validated workflow.</Text>
                </View>
              )}
            </Card>
          </TouchableOpacity>
        ) : (
          <EmptyState
            colors={colors}
            icon=""
            title="No remaining appointments today"
            description="Check Jobs for unscheduled work and incomplete diagnostic sessions."
          />
        )}
      </View>

      <SectionHeader colors={colors} title="Field tools" action="Diagnostics" onAction={onOpenDiagnostics} />
      <HeroCarousel colors={colors} slides={toolSlides} onSlidePress={() => onOpenDiagnostics()} />

      <SectionHeader colors={colors} title={`${NNACT_COMPANY.shortName} in Buea`} />
      <HeroCarousel colors={colors} slides={NNACT_BUEA_SLIDES} />

      <SectionHeader colors={colors} title="Today's route" action="All jobs" onAction={onOpenJobs} />
      <View style={styles.section}>
        {todayAppointments.length === 0 ? (
          <Text style={styles.cardMeta}>No appointments scheduled for today.</Text>
        ) : (
          todayAppointments.map((appointment) => {
            const job = jobs.find((item) => item.id === appointment.jobId);
            return (
              <TouchableOpacity
                key={appointment.id}
                style={styles.routeRow}
                activeOpacity={0.85}
                onPress={() => onOpenJob(appointment.jobId)}
              >
                <Text style={styles.routeTime}>
                  {new Date(appointment.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </Text>
                <Text style={styles.routeTitle}>{job?.title ?? "Service job"}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.dimForeground} />
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.lg },
    heroMeta: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
    connectivity: { fontSize: 11, fontFamily: fonts.black, letterSpacing: 1.2 },
    syncMeta: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: fonts.regular },
    banner: { marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: 12, padding: spacing.md },
    bannerError: { backgroundColor: colors.dangerAlpha, borderWidth: 1, borderColor: colors.dangerAlpha },
    bannerOffline: { backgroundColor: colors.warningAlpha, borderWidth: 1, borderColor: colors.warningAlpha },
    bannerTitle: { color: colors.danger, fontSize: 13, fontFamily: fonts.bold },
    bannerCopy: { color: colors.mutedForeground, fontSize: 12, marginTop: 4, fontFamily: fonts.regular },
    assignBanner: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      backgroundColor: colors.primaryMuted,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
    },
    assignTitle: { color: colors.primary, fontSize: 14, fontFamily: fonts.bold },
    assignCopy: { color: colors.mutedForeground, fontSize: 12, marginTop: 4, fontFamily: fonts.regular },
    statsRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: -spacing.md, marginBottom: spacing.lg },
    section: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    nextRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
    flexOne: { flex: 1, minWidth: 0 },
    timeBlock: { width: 72, borderRadius: 12, backgroundColor: colors.surfaceMuted, paddingVertical: 10, alignItems: "center" },
    timeText: { color: colors.foreground, fontSize: 16, fontFamily: fonts.extraBold },
    timeLabel: { color: colors.dimForeground, fontSize: 9, marginTop: 2, textTransform: "uppercase", fontFamily: fonts.medium },
    cardTitle: { color: colors.foreground, fontSize: 17, fontFamily: fonts.bold },
    cardMeta: { color: colors.mutedForeground, fontSize: 12, marginTop: 3, fontFamily: fonts.regular },
    panel: { marginTop: spacing.md, backgroundColor: colors.surfaceMuted, borderRadius: 12, padding: spacing.md },
    panelTitle: { color: colors.foreground, fontSize: 14, fontFamily: fonts.bold },
    pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    pillText: { fontSize: 9, fontFamily: fonts.extraBold, textTransform: "uppercase" },
    complaint: { color: colors.mutedForeground, fontSize: 12, lineHeight: 17, marginTop: spacing.sm, fontFamily: fonts.regular },
    warningPanel: { marginTop: spacing.md, backgroundColor: colors.warningAlpha, borderRadius: 12, padding: spacing.md },
    warningTitle: { color: colors.warning, fontSize: 13, fontFamily: fonts.bold },
    routeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, marginBottom: spacing.sm },
    routeTime: { width: 70, color: colors.primary, fontSize: 13, fontFamily: fonts.extraBold },
    routeTitle: { color: colors.foreground, fontSize: 14, fontFamily: fonts.semibold, flex: 1 },
  });
