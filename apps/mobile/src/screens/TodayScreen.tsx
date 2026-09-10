import { useMemo } from "react";
import {
  Image,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { JobDTO } from "@nnact/shared";
import { BrandLogo, HeroSearchTrigger, type AppSearchFonts } from "@nnact/mobile-ui";
import type { StoredStaffSession } from "../auth-storage";
import { SectionHeader } from "../components/ui";
import { humanize, type Appointment, type DiagnosticListItem } from "../hooks/useFieldData";
import { fonts, radius, spacing, type Palette } from "../theme";

const HERO_IMAGE = require("../../assets/photos/marine-engineer-on-deck.png");
const REPAIR_BRAIN_IMAGE = require("../../assets/photos/nnact-repair-brain-image.png");

type NextActionKind = "visit" | "diagnostic" | "appointment" | "unscheduled" | "empty";

function formatTime(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

function jobStatusTone(status: string, colors: Palette): string {
  switch (status) {
    case "in_progress":
      return colors.warning;
    case "completed":
      return colors.success;
    case "canceled":
      return colors.danger;
    case "lead":
      return colors.dimForeground;
    default:
      return colors.primary;
  }
}

function openDirections(address: string) {
  try {
    void Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(address)}`);
  } catch {
    // Navigation is best-effort; never crash the dashboard on a bad link.
  }
}

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
  jobs,
  onRefresh,
  onSyncNow,
  onOpenDiagnostics,
  onOpenJobs,
  onOpenJob,
  onOpenDiagnosticSession,
  onOpenRepairBrain,
  onOpenRepairBrainSearch,
  onOpenNotifications,
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
  onSyncNow: () => void;
  onOpenDiagnostics: () => void;
  onOpenJobs: () => void;
  onOpenJob: (jobId: string) => void;
  onOpenDiagnosticSession: (sessionId: string) => void;
  onOpenRepairBrain: () => void;
  onOpenRepairBrainSearch: () => void;
  onOpenNotifications: () => void;
  onOpenSearch?: () => void;
  searchPlaceholder?: string;
  searchFonts?: AppSearchFonts;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  const firstName = session.user.name.trim().split(/\s+/)[0] || undefined;
  const notifCount = unreadNotifications ?? 0;
  const showSearch = Boolean(searchPlaceholder && onOpenSearch && searchFonts);
  const diagnosticsCount = activeDiagnostics.length;
  const isBooting = loading && jobs.length === 0 && diagnosticsCount === 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandOrangeBright} colors={[colors.brandOrangeBright]} />}
    >
      <HeroBlock
        colors={colors}
        styles={styles}
        firstName={firstName}
        offline={offline}
        lastSync={lastSync}
        queuedWrites={queuedWrites}
        notifCount={notifCount}
        onOpenNotifications={onOpenNotifications}
        searchPlaceholder={searchPlaceholder}
        onOpenSearch={onOpenSearch}
        searchFonts={searchFonts}
      />

      <View style={styles.sheet}>
        {error ? (
          <ErrorBanner colors={colors} styles={styles} offline={offline} error={error} refreshing={refreshing} onRetry={onRefresh} />
        ) : null}

        <SummaryRow colors={colors} styles={styles} visits={todayAppointments.length} diagnosticsCount={activeDiagnostics.length} onVisits={onOpenJobs} onDiagnostics={onOpenDiagnostics} isBooting={isBooting} />

        <SectionHeader colors={colors} title="Next action" />
        {isBooting ? (
          <SkeletonCard colors={colors} styles={styles} />
        ) : (
          <NextActionCard
            colors={colors}
            styles={styles}
            activeDiagnostics={activeDiagnostics}
            nextAppointment={nextAppointment}
            nextJob={nextJob}
            nextDiagnostic={nextDiagnostic}
            jobs={jobs}
            todayAppointments={todayAppointments}
            onOpenJob={onOpenJob}
            onOpenJobs={onOpenJobs}
            onOpenDiagnosticSession={onOpenDiagnosticSession}
          />
        )}

        <SectionHeader colors={colors} title="Field tools" />
        <FieldToolsGrid colors={colors} styles={styles} activeDiagnostics={activeDiagnostics.length} jobs={jobs} isBooting={isBooting} onOpenDiagnostics={onOpenDiagnostics} onOpenRepairBrain={onOpenRepairBrain} onOpenRepairBrainSearch={onOpenRepairBrainSearch} onOpenJobs={onOpenJobs} />

        <RepairBrainCard colors={colors} styles={styles} activeDiagnostics={activeDiagnostics} onOpenRepairBrain={onOpenRepairBrain} onOpenDiagnosticSession={onOpenDiagnosticSession} />

        <SectionHeader colors={colors} title="System" />
        <SyncPanel colors={colors} styles={styles} offline={offline} lastSync={lastSync} queuedWrites={queuedWrites} error={error} refreshing={refreshing} onSyncNow={onSyncNow} />
      </View>

      <View style={styles.footerPad} />
    </ScrollView>
  );
}

function HeroBlock({
  colors,
  styles,
  firstName,
  offline,
  lastSync,
  queuedWrites,
  notifCount,
  onOpenNotifications,
  searchPlaceholder,
  onOpenSearch,
  searchFonts,
}: {
  colors: Palette;
  styles: ReturnType<typeof createStyles>;
  firstName?: string;
  offline: boolean;
  lastSync: string | null;
  queuedWrites: number;
  notifCount: number;
  onOpenNotifications: () => void;
  searchPlaceholder?: string;
  onOpenSearch?: () => void;
  searchFonts?: AppSearchFonts;
}) {
  const greeting = greetingForHour(new Date().getHours());
  const statusText = offline ? "Offline" : "Online";
  const statusTone = offline ? (queuedWrites > 0 ? colors.warning : colors.dimForeground) : queuedWrites > 0 ? colors.warning : colors.success;
  const syncText = offline
    ? queuedWrites > 0
      ? `${queuedWrites} change${queuedWrites === 1 ? "" : "s"} waiting to sync`
      : "Showing downloaded field packages"
    : queuedWrites > 0
      ? `Ready to sync · ${queuedWrites} queued`
      : lastSync
        ? `Synced ${lastSync}`
        : "Syncing…";
  const showSearch = Boolean(searchPlaceholder && onOpenSearch && searchFonts);

  return (
    <View style={styles.heroSection}>
      <View style={styles.heroPhoto}>
        <Image source={HERO_IMAGE} style={styles.heroPhotoImage} resizeMode="cover" accessibilityIgnoresInvertColors />
        <HeroShades styles={styles} />

        <View style={styles.heroPhotoContent}>
        <View style={styles.heroTopRow}>
          <View style={styles.brandBlock}>
            <BrandLogo size={40} />
            <View style={styles.wordmark}>
              <Text style={styles.brandName}>NNACT PRO</Text>
              <Text style={styles.brandRole}>TECHNICIAN</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.bellButton} onPress={onOpenNotifications} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={notifCount > 0 ? `Notifications, ${notifCount} unread` : "Notifications"}>
            <Ionicons name="notifications" size={22} color={colors.primary} />
            {notifCount > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{notifCount > 9 ? "9+" : notifCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <Text style={styles.heroGreeting}>{greeting}</Text>
        {firstName ? <Text style={styles.heroName}>{firstName}</Text> : null}
        <Text style={styles.heroLine}>Let&rsquo;s keep Cameroon running.</Text>

        <View style={styles.heroStatusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusTone }]} />
          <Text style={styles.heroStatus}>{statusText}</Text>
          <Text style={styles.heroStatusSep}>·</Text>
          <Text style={styles.heroSync} numberOfLines={1}>{syncText}</Text>
        </View>
        {showSearch ? (
          <View style={styles.heroSearchWrap}>
            <HeroSearchTrigger fonts={searchFonts!} placeholder={searchPlaceholder!} onPress={onOpenSearch!} />
          </View>
        ) : null}
      </View>
    </View>
  </View>
  );
}

function HeroShades({ styles }: { styles: ReturnType<typeof createStyles> }) {
  const leftStrips = useMemo(() => {
    const n = 48;
    return Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      const alpha = 0.62 * Math.pow(1 - t, 1.7);
      return { backgroundColor: `rgba(37, 99, 235, ${alpha.toFixed(3)})` };
    });
  }, []);
  const bottomStrips = useMemo(() => {
    const n = 10;
    return Array.from({ length: n }, (_, i) => {
      const alpha = 0.3 * ((i + 1) / n);
      return { backgroundColor: `rgba(15, 60, 150, ${alpha.toFixed(3)})` };
    });
  }, []);
  const topStrips = useMemo(() => {
    const n = 8;
    return Array.from({ length: n }, (_, i) => {
      const alpha = 0.26 * ((n - i) / n);
      return { backgroundColor: `rgba(15, 60, 150, ${alpha.toFixed(3)})` };
    });
  }, []);

  return (
    <View style={styles.heroTint} pointerEvents="none">
      <View style={styles.heroLeftGradient} pointerEvents="none">
        {leftStrips.map((strip, i) => (
          <View key={i} style={[styles.heroStrip, strip]} />
        ))}
      </View>
      <View style={styles.heroBottomGradient} pointerEvents="none">
        {bottomStrips.map((strip, i) => (
          <View key={i} style={[styles.heroBottomStrip, strip]} />
        ))}
      </View>
      <View style={styles.heroTopGradient} pointerEvents="none">
        {topStrips.map((strip, i) => (
          <View key={i} style={[styles.heroBottomStrip, strip]} />
        ))}
      </View>
    </View>
  );
}

function ErrorBanner({
  colors,
  styles,
  offline,
  error,
  refreshing,
  onRetry,
}: {
  colors: Palette;
  styles: ReturnType<typeof createStyles>;
  offline: boolean;
  error: string;
  refreshing: boolean;
  onRetry: () => void;
}) {
  return (
    <View style={[styles.errorBanner, offline ? styles.errorBannerAmber : styles.errorBannerRed]}>
      <Ionicons name={offline ? "cloud-offline-outline" : "alert-circle-outline"} size={18} color={offline ? colors.warning : colors.danger} />
      <View style={styles.errorBannerBody}>
        <Text style={[styles.errorBannerTitle, { color: offline ? colors.warning : colors.danger }]}>
          {offline ? "Couldn't refresh today's schedule." : "Field data needs attention."}
        </Text>
        <Text style={styles.errorBannerCopy} numberOfLines={2}>
          {offline ? "Showing your last synced data." : `${error}`}
        </Text>
      </View>
      <TouchableOpacity style={styles.errorRetry} onPress={onRetry} disabled={refreshing} activeOpacity={0.8} accessibilityRole="button">
        <Text style={styles.errorRetryText}>{refreshing ? "…" : "Retry"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function SummaryRow({
  colors,
  styles,
  visits,
  diagnosticsCount,
  onVisits,
  onDiagnostics,
  isBooting,
}: {
  colors: Palette;
  styles: ReturnType<typeof createStyles>;
  visits: number;
  diagnosticsCount: number;
  onVisits: () => void;
  onDiagnostics: () => void;
  isBooting: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <TouchableOpacity style={styles.summaryCard} onPress={onVisits} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${visits} visits today. Open jobs.`}>
        <View style={[styles.summaryIcon, { backgroundColor: colors.primaryMuted }]}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
        </View>
        <View style={styles.summaryBody}>
          <Text style={styles.summaryLabel}>Visits</Text>
          {isBooting ? (
            <SkeletonBar colors={colors} styles={styles} width={40} />
          ) : (
            <Text style={styles.summaryValue}>{visits}</Text>
          )}
          <Text style={styles.summaryHint}>Today</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.dimForeground} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.summaryCard} onPress={onDiagnostics} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${diagnosticsCount} diagnostics need attention. Open diagnostics.`}>
        <View style={[styles.summaryIcon, { backgroundColor: colors.accentMuted }]}>
          <Ionicons name="pulse-outline" size={18} color={colors.warning} />
        </View>
        <View style={styles.summaryBody}>
          <Text style={styles.summaryLabel}>Diagnostics</Text>
          {isBooting ? (
            <SkeletonBar colors={colors} styles={styles} width={40} />
          ) : (
            <Text style={[styles.summaryValue, { color: diagnosticsCount > 0 ? colors.warning : colors.success }]}>{diagnosticsCount}</Text>
          )}
          <Text style={styles.summaryHint}>{diagnosticsCount > 0 ? "Need attention" : "All clear"}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.dimForeground} />
      </TouchableOpacity>
    </View>
  );
}

function SkeletonBar({
  colors,
  styles,
  width,
}: {
  colors: Palette;
  styles: ReturnType<typeof createStyles>;
  width?: number | `${number}%`;
}) {
  return (
    <View style={[styles.skeletonBar, { backgroundColor: colors.surfaceMuted, width: width ?? "100%" }]} />
  );
}

function SkeletonCard({ colors, styles }: { colors: Palette; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.nextCard} accessibilityLabel="Loading your next action">
      <View style={styles.row}>
        <SkeletonBar colors={colors} styles={styles} width={64} />
        <View style={styles.flexOne}>
          <SkeletonBar colors={colors} styles={styles} />
          <View style={{ height: 6 }} />
          <SkeletonBar colors={colors} styles={styles} width="70%" />
        </View>
      </View>
      <View style={styles.skeletonCta} />
    </View>
  );
}

function NextActionCard({
  colors,
  styles,
  activeDiagnostics,
  nextAppointment,
  nextJob,
  nextDiagnostic,
  jobs,
  todayAppointments,
  onOpenJob,
  onOpenJobs,
  onOpenDiagnosticSession,
}: {
  colors: Palette;
  styles: ReturnType<typeof createStyles>;
  activeDiagnostics: DiagnosticListItem[];
  nextAppointment?: Appointment;
  nextJob?: JobDTO;
  nextDiagnostic?: DiagnosticListItem;
  jobs: JobDTO[];
  todayAppointments: Appointment[];
  onOpenJob: (jobId: string) => void;
  onOpenJobs: () => void;
  onOpenDiagnosticSession: (sessionId: string) => void;
}) {
  const activeJob = jobs.find((job) => job.status === "in_progress") ?? null;
  const activeJobDiagnostic = activeJob ? activeDiagnostics.find((item) => item.session.jobId === activeJob.id) ?? null : null;
  const diagnosticForAction = nextDiagnostic ?? activeDiagnostics[0] ?? null;
  const appointmentJob = nextJob ?? (nextAppointment ? jobs.find((job) => job.id === nextAppointment.jobId) ?? null : null);

  const kind: NextActionKind = (() => {
    if (activeJob) return "visit";
    if (activeDiagnostics.length > 0) return "diagnostic";
    if (nextAppointment) return "appointment";
    if (jobs.some((job) => job.status === "scheduled" || job.status === "lead")) return "unscheduled";
    return "empty";
  })();

  const laterAppointments = useMemo(
    () => todayAppointments.filter((item) => item.id !== (nextAppointment?.id ?? "")).slice(0, 2),
    [todayAppointments, nextAppointment],
  );
  const laterCount = todayAppointments.length - (nextAppointment ? 1 : 0);
  const unscheduledCount = jobs.filter((job) => job.status === "scheduled" || job.status === "lead").length;

  return (
    <View style={styles.nextCard}>
      {kind === "visit" && activeJob ? (
        <>
          <Text style={styles.nextEyebrowAmber}>Visit in progress</Text>
          <Text style={styles.nextTitle}>{activeJob.title}</Text>
          {activeJob.serviceAddress ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={14} color={colors.mutedForeground} />
              <Text style={styles.metaText} numberOfLines={1}>{activeJob.serviceAddress}</Text>
            </View>
          ) : null}
          {activeJobDiagnostic ? (
            <View style={styles.diagInline}>
              <Ionicons name="pulse-outline" size={14} color={colors.warning} />
              <Text style={styles.diagInlineText} numberOfLines={1}>
                {[activeJobDiagnostic.equipment.make, activeJobDiagnostic.equipment.model].filter(Boolean).join(" ") || activeJobDiagnostic.equipment.type}
              </Text>
            </View>
          ) : null}
          <CTARow
            colors={colors}
            styles={styles}
            address={activeJob.serviceAddress ?? undefined}
            primaryLabel="Continue visit"
            onPrimary={() => onOpenJob(activeJob.id)}
          />
        </>
      ) : null}

      {kind === "diagnostic" && diagnosticForAction ? (
        <>
          <Text style={styles.nextEyebrowAmber}>Diagnostic in progress</Text>
          <Text style={styles.nextTitle}>
            {[diagnosticForAction.equipment.make, diagnosticForAction.equipment.model].filter(Boolean).join(" ") || diagnosticForAction.equipment.type}
          </Text>
          <View style={styles.metaRow}>
            <Text style={[styles.nextStatusText, { color: jobStatusTone(diagnosticForAction.session.status, colors) }]}>
              {humanize(diagnosticForAction.session.status)}
            </Text>
            {diagnosticForAction.workflow?.name ? (
              <Text style={styles.metaText} numberOfLines={1}>{diagnosticForAction.workflow.name}</Text>
            ) : null}
          </View>
          {diagnosticForAction.session.customerComplaint ? (
            <Text style={styles.complaintText} numberOfLines={2}>
              &ldquo;{diagnosticForAction.session.customerComplaint}&rdquo;
            </Text>
          ) : null}
          <TouchableOpacity style={[styles.ctaPrimary, styles.ctaWide]} onPress={() => onOpenDiagnosticSession(diagnosticForAction.session.id)} activeOpacity={0.85}>
            <Ionicons name="play-circle-outline" size={18} color={colors.primaryDark} />
            <Text style={styles.ctaPrimaryText}>Continue diagnostic</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {kind === "appointment" && nextAppointment ? (
        <>
          <View style={styles.apptHead}>
            <Text style={styles.nextEyebrow}>Next action</Text>
            <View style={[styles.apptTimeBlock, { backgroundColor: colors.accentMuted }]}>
              <Text style={[styles.apptTimeText, { color: colors.warning }]}>
                {formatTime(nextAppointment.startsAt)}
              </Text>
              {appointmentJob ? (
                <Text style={[styles.apptStatusText, { color: jobStatusTone(appointmentJob.status, colors) }]}>
                  {humanize(appointmentJob.status)}
                </Text>
              ) : null}
            </View>
          </View>
          <Text style={styles.nextTitle}>{appointmentJob?.title ?? "Assigned service job"}</Text>
          {appointmentJob?.serviceAddress ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={14} color={colors.mutedForeground} />
              <Text style={styles.metaText} numberOfLines={1}>{appointmentJob.serviceAddress}</Text>
            </View>
          ) : null}
          <CTARow
            colors={colors}
            styles={styles}
            address={appointmentJob?.serviceAddress ?? undefined}
            primaryLabel="Start visit"
            onPrimary={() => onOpenJob(nextAppointment.jobId)}
          />
        </>
      ) : null}

      {kind === "unscheduled" ? (
        <>
          <Text style={styles.nextEyebrowAmber}>Work still needs attention</Text>
          <Text style={styles.nextTitle}>Unscheduled work</Text>
          <Text style={styles.complaintText}>
            {unscheduledCount} job{unscheduledCount === 1 ? "" : "s"} waiting to be scheduled{activeDiagnostics.length > 0 ? `, ${activeDiagnostics.length} diagnostic${activeDiagnostics.length === 1 ? "" : "s"} to complete` : ""}.
          </Text>
          <TouchableOpacity style={[styles.ctaPrimary, styles.ctaWide]} onPress={onOpenJobs} activeOpacity={0.85}>
            <Ionicons name="briefcase-outline" size={18} color={colors.primaryDark} />
            <Text style={styles.ctaPrimaryText}>Review work</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {kind === "empty" ? (
        <>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
          </View>
          <Text style={styles.emptyTitle}>You&rsquo;re clear for now</Text>
          <Text style={styles.emptyCopy}>
            No remaining appointments today. Check Jobs for unscheduled work or Repair Brain for incomplete diagnostics.
          </Text>
          <TouchableOpacity style={[styles.ctaPrimary, styles.ctaWide]} onPress={onOpenJobs} activeOpacity={0.85}>
            <Ionicons name="briefcase-outline" size={18} color={colors.primaryDark} />
            <Text style={styles.ctaPrimaryText}>View all jobs</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {kind === "appointment" && laterAppointments.length > 0 ? (
        <LaterToday appointments={laterAppointments} remaining={laterCount - laterAppointments.length} jobsById={new Map(jobs.map((job) => [job.id, job]))} colors={colors} styles={styles} onOpenJob={onOpenJob} />
      ) : null}
    </View>
  );
}

function CTARow({
  colors,
  styles,
  address,
  primaryLabel,
  onPrimary,
}: {
  colors: Palette;
  styles: ReturnType<typeof createStyles>;
  address?: string;
  primaryLabel: string;
  onPrimary: () => void;
}) {
  return (
    <View style={styles.ctaRow}>
      {address ? (
        <TouchableOpacity style={styles.ctaSecondary} onPress={() => openDirections(address)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Navigate to ${address}`}>
          <Ionicons name="navigate-outline" size={18} color={colors.primary} />
          <Text style={styles.ctaSecondaryText}>Navigate</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={[styles.ctaPrimary, styles.ctaFlex]} onPress={onPrimary} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={primaryLabel}>
        <Text style={styles.ctaPrimaryText}>{primaryLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function LaterToday({
  appointments,
  remaining,
  jobsById,
  colors,
  styles,
  onOpenJob,
}: {
  appointments: Appointment[];
  remaining: number;
  jobsById: Map<string, JobDTO>;
  colors: Palette;
  styles: ReturnType<typeof createStyles>;
  onOpenJob: (jobId: string) => void;
}) {
  return (
    <View style={styles.laterWrap}>
      <Text style={styles.laterLabel}>Later today</Text>
      {appointments.map((appointment) => {
        const job = jobsById.get(appointment.jobId);
        return (
          <TouchableOpacity key={appointment.id} style={styles.laterRow} onPress={() => onOpenJob(appointment.jobId)} activeOpacity={0.8}>
            <Text style={styles.laterTime}>{formatTime(appointment.startsAt)}</Text>
            <Text style={styles.laterTitle} numberOfLines={1}>{job?.title ?? "Assigned service job"}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.dimForeground} />
          </TouchableOpacity>
        );
      })}
      {remaining > 0 ? <Text style={styles.laterMore}>{remaining} more in Jobs</Text> : null}
    </View>
  );
}

function FieldToolsGrid({
  colors,
  styles,
  activeDiagnostics,
  jobs,
  isBooting,
  onOpenDiagnostics,
  onOpenRepairBrain,
  onOpenRepairBrainSearch,
  onOpenJobs,
}: {
  colors: Palette;
  styles: ReturnType<typeof createStyles>;
  activeDiagnostics: number;
  jobs: JobDTO[];
  isBooting: boolean;
  onOpenDiagnostics: () => void;
  onOpenRepairBrain: () => void;
  onOpenRepairBrainSearch: () => void;
  onOpenJobs: () => void;
}) {
  const openJobs = jobs.filter((job) => job.status === "scheduled" || job.status === "in_progress" || job.status === "lead").length;

  const tools: {
    id: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    description: string;
    onPress: () => void;
    badge?: number;
  }[] = [
    { id: "diagnostics", icon: "pulse-outline", label: "Diagnostics", description: "Guided diagnosis", onPress: onOpenDiagnostics, badge: activeDiagnostics },
    { id: "repair-brain", icon: "bulb-outline", label: "Repair Brain", description: "Knowledge base", onPress: onOpenRepairBrain },
    { id: "knowledge", icon: "search-outline", label: "Search", description: "Faults, docs & parts", onPress: onOpenRepairBrainSearch },
    { id: "jobs", icon: "briefcase-outline", label: "Jobs", description: "Work orders", onPress: onOpenJobs, badge: openJobs },
  ];

  return (
    <View style={styles.toolsGrid}>
      {tools.map((tool) => (
        <TouchableOpacity key={tool.id} style={styles.toolCard} onPress={tool.onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${tool.label}. ${tool.description}.`}>
          <View style={styles.toolIconWrap}>
            <Ionicons name={tool.icon} size={20} color={colors.primary} />
            {tool.badge && tool.badge > 0 ? (
              <View style={styles.toolBadge}>
                <Text style={styles.toolBadgeText}>{tool.badge > 9 ? "9+" : tool.badge}</Text>
              </View>
            ) : null}
          </View>
          {isBooting ? <SkeletonBar colors={colors} styles={styles} width="80%" /> : <Text style={styles.toolTitle}>{tool.label}</Text>}
          <Text style={styles.toolDescription} numberOfLines={1}>{tool.description}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function RepairBrainCard({
  colors,
  styles,
  activeDiagnostics,
  onOpenRepairBrain,
  onOpenDiagnosticSession,
}: {
  colors: Palette;
  styles: ReturnType<typeof createStyles>;
  activeDiagnostics: DiagnosticListItem[];
  onOpenRepairBrain: () => void;
  onOpenDiagnosticSession: (sessionId: string) => void;
}) {
  const needsAttention = activeDiagnostics.length > 0;
  const label = needsAttention ? "Continue diagnostic" : "Open Repair Brain";
  const onPress = () => {
    if (needsAttention) onOpenDiagnosticSession(activeDiagnostics[0].session.id);
    else onOpenRepairBrain();
  };

  return (
    <TouchableOpacity style={styles.rbCard} onPress={onPress} activeOpacity={0.92} accessibilityRole="button" accessibilityLabel={`Repair Brain. ${label}.`}>
      <View style={styles.rbFrame}>
        <Image source={REPAIR_BRAIN_IMAGE} style={styles.rbImage} resizeMode="cover" accessibilityIgnoresInvertColors />
        <View style={styles.rbOverlay} />
        <View style={styles.rbBody}>
          <Text style={styles.rbEyebrow}>REPAIR BRAIN</Text>
          <Text style={styles.rbTitle}>Smarter diagnostics. Faster repairs.</Text>
          <Text style={styles.rbCopy}>Step-by-step guidance for real-world jobs.</Text>
          <View style={styles.ctaRow}>
            <View style={styles.rbCta}>
              <Ionicons name={needsAttention ? "play-circle-outline" : "arrow-forward"} size={18} color={colors.primaryDark} />
              <Text style={styles.rbCtaText}>{label}</Text>
            </View>
          </View>
          {needsAttention ? (
            <Text style={styles.rbAttention}>
              {activeDiagnostics.length} diagnostic{activeDiagnostics.length === 1 ? "" : "s"} need attention
            </Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function SyncPanel({
  colors,
  styles,
  offline,
  lastSync,
  queuedWrites,
  error,
  refreshing,
  onSyncNow,
}: {
  colors: Palette;
  styles: ReturnType<typeof createStyles>;
  offline: boolean;
  lastSync: string | null;
  queuedWrites: number;
  error: string | null;
  refreshing: boolean;
  onSyncNow: () => void;
}) {
  let tone = colors.success;
  let title = "You're online";
  let copy = "Your data is synced.";
  if (offline) {
    tone = queuedWrites > 0 ? colors.warning : colors.dimForeground;
    title = "Offline mode";
    copy = queuedWrites > 0
      ? `${queuedWrites} change${queuedWrites === 1 ? "" : "s"} waiting to sync.`
      : "Showing downloaded field packages from your last sync.";
  } else if (queuedWrites > 0) {
    tone = colors.warning;
    title = "Ready to sync";
    copy = `${queuedWrites} queued change${queuedWrites === 1 ? "" : "s"} will sync automatically.`;
  } else if (lastSync) {
    title = "You're online";
    copy = `Your data is synced. Last sync ${lastSync}.`;
  } else {
    tone = colors.dimForeground;
    title = "Connecting";
    copy = "Contacting the server…";
  }

  return (
    <View style={styles.syncCard}>
      <View style={[styles.syncDot, { backgroundColor: tone }]} />
      <View style={styles.syncBody}>
        <Text style={styles.syncTitle}>{title}</Text>
        <Text style={styles.syncCopy}>{copy}</Text>
      </View>
      <TouchableOpacity style={[styles.syncNow, refreshing && { opacity: 0.5 }]} onPress={onSyncNow} disabled={refreshing} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Sync now">
        <Ionicons name="sync-outline" size={16} color={colors.primaryDark} />
        <Text style={styles.syncNowText}>{refreshing ? "Syncing…" : "Sync now"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: 0 },
    footerPad: { height: spacing.lg },

    heroSection: {
      width: "100%",
      backgroundColor: "#3b82f6",
    },
    heroPhoto: {
      width: "100%",
      height: 300,
      overflow: "hidden",
      backgroundColor: "#3b82f6",
    },
    heroPhotoImage: {
      width: "100%",
      height: "100%",
    },
    heroPhotoContent: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: Platform.OS === "ios" ? 44 : 42,
      paddingHorizontal: spacing.lg,
      paddingBottom: 16,
    },
    heroTint: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(96, 165, 250, 0.16)",
    },
    heroLeftGradient: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      width: "68%",
      flexDirection: "row",
      overflow: "hidden",
    },
    heroStrip: { flex: 1, alignSelf: "stretch" },
    heroBottomGradient: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 96,
      flexDirection: "column",
    },
    heroBottomStrip: { flex: 1, alignSelf: "stretch" },
    heroTopGradient: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      height: 64,
      flexDirection: "column",
    },

    heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    brandBlock: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    wordmark: { gap: 0 },
    brandName: {
      color: colors.brandWarmWhite,
      fontSize: 17,
      fontFamily: fonts.bold,
      letterSpacing: 0.6,
    },
    brandRole: {
      color: colors.brandOrangeBright,
      fontSize: 10.5,
      fontFamily: fonts.bold,
      letterSpacing: 2.4,
    },
    bellButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#ffffff",
      shadowColor: "#000000",
      shadowOpacity: 0.18,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    bellBadge: {
      position: "absolute",
      top: -4,
      right: -4,
      backgroundColor: colors.danger,
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 5,
      borderWidth: 2,
      borderColor: "#ffffff",
    },
    bellBadgeText: { color: colors.onEmphasis, fontSize: 10, fontFamily: fonts.bold },

    heroGreeting: { color: "#ffffff", fontSize: 26, fontFamily: fonts.extraBold, letterSpacing: -0.4, marginTop: 10 },
    heroName: { color: "#ffffff", fontSize: 30, fontFamily: fonts.extraBold, letterSpacing: -0.4, marginTop: 0 },
    heroLine: { color: "rgba(255,255,255,0.92)", fontSize: 15, fontFamily: fonts.regular, marginTop: 2 },

    heroStatusRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    heroStatus: { color: "#ffffff", fontSize: 13, fontFamily: fonts.bold },
    heroStatusSep: { color: "rgba(255,255,255,0.6)", marginHorizontal: 6 },
    heroSync: { color: "rgba(255,255,255,0.82)", fontSize: 13, fontFamily: fonts.regular, flex: 1 },

    heroSearchWrap: { marginTop: spacing.sm },

    sheet: {
      marginTop: -12,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      backgroundColor: colors.background,
      overflow: "hidden",
      paddingTop: spacing.lg,
    },

    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      padding: spacing.md,
    },
    errorBannerRed: { backgroundColor: colors.dangerAlpha, borderColor: colors.dangerAlpha },
    errorBannerAmber: { backgroundColor: colors.warningAlpha, borderColor: colors.warningAlpha },
    errorBannerBody: { flex: 1, minWidth: 0 },
    errorBannerTitle: { fontSize: 13, fontFamily: fonts.bold },
    errorBannerCopy: { color: colors.mutedForeground, fontSize: 12, marginTop: 2, fontFamily: fonts.regular },
    errorRetry: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderLight },
    errorRetryText: { color: colors.primary, fontSize: 12, fontFamily: fonts.bold },

    summaryRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.xs },
    summaryCard: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      minHeight: 72,
    },
    summaryIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    summaryBody: { flex: 1, minWidth: 0 },
    summaryLabel: { color: colors.dimForeground, fontSize: 10, fontFamily: fonts.bold, textTransform: "uppercase", letterSpacing: 0.6 },
    summaryValue: { color: colors.foreground, fontSize: 22, fontFamily: fonts.extraBold, marginTop: 2 },
    summaryHint: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.regular },
    skeletonBar: { height: 22, borderRadius: 6, marginTop: 2 },

    nextCard: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    row: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
    flexOne: { flex: 1, minWidth: 0 },
    skeletonCta: { height: 48, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, marginTop: spacing.md },

    nextEyebrow: { color: colors.dimForeground, fontSize: 10, fontFamily: fonts.bold, textTransform: "uppercase", letterSpacing: 0.8 },
    nextEyebrowAmber: { color: colors.warning, fontSize: 10, fontFamily: fonts.bold, textTransform: "uppercase", letterSpacing: 0.8 },
    nextTitle: { color: colors.foreground, fontSize: 18, fontFamily: fonts.extraBold, letterSpacing: -0.2, marginTop: 4 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
    metaText: { color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.regular, flex: 1 },
    nextStatusText: { fontSize: 11, fontFamily: fonts.extraBold, textTransform: "uppercase" },
    complaintText: { color: colors.mutedForeground, fontSize: 13, lineHeight: 18, marginTop: spacing.sm, fontFamily: fonts.regular },
    diagInline: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
    diagInlineText: { color: colors.warning, fontSize: 13, fontFamily: fonts.semibold, flex: 1 },

    apptHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
    apptTimeBlock: { borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },
    apptTimeText: { fontSize: 17, fontFamily: fonts.extraBold },
    apptStatusText: { fontSize: 9, fontFamily: fonts.extraBold, textTransform: "uppercase", marginTop: 2 },

    ctaRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
    ctaFlex: { flex: 1 },
    ctaWide: { alignSelf: "stretch" },
    ctaPrimary: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      minHeight: 48,
      borderRadius: radius.pill,
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.md,
    },
    ctaPrimaryText: { color: colors.primaryDark, fontSize: 14, fontFamily: fonts.bold },
    ctaSecondary: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      minHeight: 48,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: spacing.md,
    },
    ctaSecondaryText: { color: colors.primary, fontSize: 14, fontFamily: fonts.bold },

    laterWrap: { borderTopWidth: 1, borderTopColor: colors.borderLight, marginTop: spacing.lg, paddingTop: spacing.sm },
    laterLabel: { color: colors.dimForeground, fontSize: 10, fontFamily: fonts.bold, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: spacing.xs },
    laterRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 8, minHeight: 40 },
    laterTime: { color: colors.primary, fontSize: 13, fontFamily: fonts.extraBold, width: 52 },
    laterTitle: { color: colors.foreground, fontSize: 13, fontFamily: fonts.semibold, flex: 1 },
    laterMore: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.regular, marginTop: spacing.xs },

    emptyIconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.successAlpha },
    emptyTitle: { color: colors.foreground, fontSize: 17, fontFamily: fonts.extraBold, marginTop: spacing.sm },
    emptyCopy: { color: colors.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: 4, fontFamily: fonts.regular },
    emptyCta: { marginTop: spacing.md },

    toolsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg },
    toolCard: {
      width: "48%",
      flexGrow: 1,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      minHeight: 88,
    },
    toolIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primaryMuted, alignItems: "center", justifyContent: "center", marginBottom: 8 },
    toolBadge: {
      position: "absolute",
      top: -5,
      right: -5,
      backgroundColor: colors.accent,
      borderRadius: 9,
      minWidth: 18,
      height: 18,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    toolBadgeText: { color: colors.primaryDark, fontSize: 9, fontFamily: fonts.bold },
    toolTitle: { color: colors.foreground, fontSize: 14, fontFamily: fonts.bold },
    toolDescription: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.regular, marginTop: 1 },

    rbCard: { marginHorizontal: spacing.lg, marginTop: spacing.lg, borderRadius: radius.lg, overflow: "hidden" },
    rbFrame: { width: "100%" },
    rbImage: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: "100%",
      height: "100%",
    },
    rbOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(9, 15, 24, 0.9)" },
    rbBody: { padding: spacing.md },
    rbEyebrow: { color: colors.brandOrangeBright, fontSize: 11, fontFamily: fonts.bold, letterSpacing: 1.2 },
    rbTitle: { color: "#ffffff", fontSize: 20, fontFamily: fonts.extraBold, marginTop: 4, letterSpacing: -0.2 },
    rbCopy: { color: "rgba(255,255,255,0.78)", fontSize: 13, fontFamily: fonts.regular, marginTop: 2, lineHeight: 18 },
    rbCta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      minHeight: 48,
      borderRadius: radius.pill,
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.lg,
    },
    rbCtaText: { color: colors.primaryDark, fontSize: 14, fontFamily: fonts.bold },
    rbAttention: { color: colors.warning, fontSize: 12, fontFamily: fonts.semibold, marginTop: spacing.sm, textAlign: "center" },

    syncCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: spacing.lg,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
    },
    syncDot: { width: 10, height: 10, borderRadius: 5 },
    syncBody: { flex: 1, minWidth: 0 },
    syncTitle: { color: colors.foreground, fontSize: 14, fontFamily: fonts.bold },
    syncCopy: { color: colors.mutedForeground, fontSize: 12, marginTop: 2, fontFamily: fonts.regular },
    syncNow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      minHeight: 40,
      borderRadius: radius.pill,
      backgroundColor: colors.accentMuted,
      paddingHorizontal: spacing.md,
    },
    syncNowText: { color: colors.warning, fontSize: 12, fontFamily: fonts.bold },
  });