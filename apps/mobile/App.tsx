// NNACT Pro technician app — next-action field dashboard with a durable
// diagnostic-package fallback for low-signal service locations.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { JobDTO } from "@nnact/shared";
import { SyncService, type FieldPackage } from "./src/sync";
import { useTheme, fonts, type Palette } from "./src/theme";
import { staffFetch, staffLogout, staffRefresh } from "./src/auth-api";
import {
  clearStaffSession,
  loadStaffSession,
  saveStaffSession,
  type StoredStaffSession,
} from "./src/auth-storage";
import { AuthBootScreen, LoginScreen } from "./src/screens/LoginScreen";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

interface Appointment {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

interface DiagnosticListItem {
  session: {
    id: string;
    jobId: string;
    status: string;
    customerComplaint?: string | null;
    updatedAt: string;
  };
  equipment: {
    id: string;
    type: string;
    make?: string | null;
    model?: string | null;
    serialNumber?: string | null;
  };
  workflow: {
    id: string;
    name: string;
    supportStatus: string;
  } | null;
}

async function fetchJson<T>(
  session: StoredStaffSession,
  path: string,
  onSession?: (next: StoredStaffSession) => void,
): Promise<T> {
  try {
    return await staffFetch<T>(session, path);
  } catch (error) {
    if (error instanceof Error && error.message === "session_expired") {
      const refreshed = await staffRefresh(session.refreshToken);
      await saveStaffSession(refreshed);
      onSession?.(refreshed);
      return staffFetch<T>(refreshed, path);
    }
    throw error;
  }
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function statusColor(status: string, colors: Palette) {
  if (["blocked", "escalated", "suspended"].includes(status)) return colors.danger;
  if (["diagnosed", "completed"].includes(status)) return colors.success;
  if (["testing", "workflow_ready"].includes(status)) return colors.focus;
  return colors.warning;
}

function packageToDiagnostic(fieldPackage: FieldPackage): DiagnosticListItem | null {
  if (!fieldPackage.session || !fieldPackage.equipment) return null;
  return {
    session: fieldPackage.session as unknown as DiagnosticListItem["session"],
    equipment: fieldPackage.equipment as unknown as DiagnosticListItem["equipment"],
    workflow: fieldPackage.workflow
      ? (fieldPackage.workflow as unknown as DiagnosticListItem["workflow"])
      : null,
  };
}

function packageToAppointment(fieldPackage: FieldPackage): Appointment | null {
  const job = fieldPackage.job as Partial<JobDTO> & { scheduledAt?: string | null };
  if (!job.id || !job.scheduledAt) return null;
  const start = new Date(job.scheduledAt);
  if (Number.isNaN(start.getTime())) return null;
  return {
    id: `cached-${job.id}`,
    jobId: job.id,
    technicianId: null,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 90 * 60 * 1000).toISOString(),
  };
}

function FieldDashboard({
  session,
  onSession,
  onSignOut,
}: {
  session: StoredStaffSession;
  onSession: (next: StoredStaffSession) => void;
  onSignOut: () => void;
}) {
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [queuedWrites, setQueuedWrites] = useState(0);
  const syncRef = useRef<SyncService | null>(null);
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const loadCached = useCallback(async (): Promise<boolean> => {
    const packages = await syncRef.current?.listCachedPackages();
    if (!packages?.length) return false;

    setJobs(packages.map((item) => item.job as unknown as JobDTO));
    setAppointments(
      packages.flatMap((item) => {
        const appointment = packageToAppointment(item);
        return appointment ? [appointment] : [];
      }),
    );
    setDiagnostics(
      packages.flatMap((item) => {
        const diagnostic = packageToDiagnostic(item);
        return diagnostic ? [diagnostic] : [];
      }),
    );
    setQueuedWrites((await syncRef.current?.queuedCount()) ?? 0);
    setOffline(true);
    return true;
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [jobRows, appointmentRows, diagnosticRows] = await Promise.all([
        fetchJson<JobDTO[]>(session, "/api/jobs", onSession),
        fetchJson<Appointment[]>(session, "/api/appointments", onSession),
        fetchJson<DiagnosticListItem[]>(session, "/api/diagnostics/sessions", onSession).catch(() => []),
      ]);
      setJobs(jobRows);
      setAppointments(appointmentRows);
      setDiagnostics(diagnosticRows);
      setOffline(false);
      setQueuedWrites((await syncRef.current?.queuedCount()) ?? 0);
    } catch (caught) {
      const restored = await loadCached();
      setError(
        restored
          ? "Offline mode — showing downloaded field packages. New readings remain queued until synchronization succeeds."
          : caught instanceof Error
            ? caught.message
            : String(caught),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadCached, onSession, session]);

  useEffect(() => {
    const service = new SyncService({ apiUrl: API, orgId: session.orgId, token: session.accessToken });
    syncRef.current = service;
    void load();

    const synchronize = async () => {
      try {
        const result = await service.pull();
        setLastSync(new Date().toLocaleTimeString());
        setQueuedWrites(Math.max(0, result.queuedBeforeFlush - result.flushed));
        await load();
      } catch {
        await loadCached();
      }
    };

    void synchronize();
    const interval = setInterval(() => void synchronize(), 30_000);
    return () => clearInterval(interval);
  }, [load, loadCached, session.accessToken, session.orgId]);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const todayAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => {
          const starts = new Date(appointment.startsAt);
          return starts >= todayStart && starts < tomorrowStart;
        })
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [appointments, todayStart.getTime(), tomorrowStart.getTime()],
  );

  const activeDiagnostics = useMemo(
    () =>
      diagnostics.filter((item) =>
        ["identification_required", "workflow_ready", "testing", "blocked", "escalated"].includes(
          item.session.status,
        ),
      ),
    [diagnostics],
  );

  const nextAppointment = todayAppointments.find(
    (appointment) => new Date(appointment.endsAt) > now,
  );
  const nextJob = nextAppointment ? jobs.find((job) => job.id === nextAppointment.jobId) : null;
  const nextDiagnostic = nextAppointment
    ? diagnostics.find((item) => item.session.jobId === nextAppointment.jobId)
    : null;

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading today’s field work…</Text>
        </View>
        <StatusBar style={scheme === "light" ? "dark" : "light"} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerStatusRow}>
            <Text style={styles.eyebrow}>NNACT FIELD</Text>
            <View style={styles.headerActions}>
              <Text style={[styles.connectivity, { color: offline ? colors.warning : colors.success }]}>
                {offline ? "OFFLINE" : "ONLINE"}
              </Text>
              <TouchableOpacity onPress={onSignOut}>
                <Text style={styles.signOut}>Sign out</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.headerTitle}>Today</Text>
          <Text style={styles.headerSub}>
            {session.user.name} · {todayAppointments.length} visit{todayAppointments.length === 1 ? "" : "s"} · {activeDiagnostics.length} active diagnostic{activeDiagnostics.length === 1 ? "" : "s"}
            {queuedWrites ? ` · ${queuedWrites} queued` : ""}
            {lastSync ? ` · synced ${lastSync}` : ""}
          </Text>
        </View>

        {error && (
          <View style={[styles.errorBanner, offline && styles.offlineBanner]}>
            <Text style={[styles.errorTitle, offline && styles.offlineTitle]}>
              {offline ? "Working from downloaded field packages" : "Field data needs attention"}
            </Text>
            <Text style={styles.errorMessage}>{error}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Next action</Text>
          {nextAppointment ? (
            <View style={styles.primaryCard}>
              <View style={styles.rowBetween}>
                <View style={styles.timeBlock}>
                  <Text style={styles.timeText}>
                    {new Date(nextAppointment.startsAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Text>
                  <Text style={styles.timeLabel}>arrival</Text>
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>{nextJob?.title ?? "Assigned service job"}</Text>
                  <Text style={styles.cardMeta}>
                    {nextJob?.status ? humanize(nextJob.status) : "scheduled"}
                  </Text>
                </View>
              </View>

              {nextDiagnostic ? (
                <View style={styles.appliancePanel}>
                  <View style={styles.rowBetween}>
                    <View style={styles.flexOne}>
                      <Text style={styles.applianceTitle}>
                        {[nextDiagnostic.equipment.make, nextDiagnostic.equipment.model]
                          .filter(Boolean)
                          .join(" ") || nextDiagnostic.equipment.type}
                      </Text>
                      <Text style={styles.cardMeta}>
                        {nextDiagnostic.workflow?.name ?? "Coverage required"}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusPill,
                        { borderColor: statusColor(nextDiagnostic.session.status, colors) },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          { color: statusColor(nextDiagnostic.session.status, colors) },
                        ]}
                      >
                        {humanize(nextDiagnostic.session.status)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.complaintText}>
                    {nextDiagnostic.session.customerComplaint || "Customer complaint not recorded"}
                  </Text>
                </View>
              ) : (
                <View style={styles.warningPanel}>
                  <Text style={styles.warningTitle}>Diagnostic not started</Text>
                  <Text style={styles.cardMeta}>
                    Confirm the exact model and serial, then select the applicable validated workflow.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No remaining appointments today</Text>
              <Text style={styles.emptyText}>
                Check Jobs for unscheduled work, parts returns, and incomplete diagnostic sessions.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Diagnostic attention</Text>
            <Text style={styles.sectionCount}>{activeDiagnostics.length}</Text>
          </View>
          {activeDiagnostics.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No active diagnostic sessions</Text>
              <Text style={styles.emptyText}>
                New sessions appear after the work order is linked to the exact appliance.
              </Text>
            </View>
          ) : (
            activeDiagnostics.slice(0, 8).map((item) => (
              <View key={item.session.id} style={styles.listCard}>
                <View style={styles.rowBetween}>
                  <View style={styles.flexOne}>
                    <Text style={styles.listTitle}>
                      {[item.equipment.make, item.equipment.model].filter(Boolean).join(" ") ||
                        item.equipment.type}
                    </Text>
                    <Text style={styles.cardMeta}>
                      {item.workflow?.name ?? "Unsupported / unresolved"}
                    </Text>
                  </View>
                  <Text style={[styles.smallStatus, { color: statusColor(item.session.status, colors) }]}>
                    {humanize(item.session.status)}
                  </Text>
                </View>
                <Text style={styles.complaintText} numberOfLines={2}>
                  {item.session.customerComplaint || "Complaint not recorded"}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Today’s route</Text>
            <Text style={styles.sectionCount}>{todayAppointments.length}</Text>
          </View>
          {todayAppointments.map((appointment) => {
            const job = jobs.find((item) => item.id === appointment.jobId);
            const session = diagnostics.find((item) => item.session.jobId === appointment.jobId);
            return (
              <View key={appointment.id} style={styles.routeCard}>
                <Text style={styles.routeTime}>
                  {new Date(appointment.startsAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
                <View style={styles.flexOne}>
                  <Text style={styles.listTitle}>{job?.title ?? "Service job"}</Text>
                  <Text style={styles.cardMeta}>
                    {session ? humanize(session.session.status) : "diagnostic not started"}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
        <View style={{ height: 48 }} />
      </ScrollView>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
    </View>
  );
}

export default function App() {
  const { colors, scheme } = useTheme();
  const [session, setSession] = useState<StoredStaffSession | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    void loadStaffSession().then((stored) => {
      setSession(stored);
      setBooting(false);
    });
  }, []);

  async function handleSignOut(current: StoredStaffSession) {
    await staffLogout(current.refreshToken);
    await clearStaffSession();
    setSession(null);
  }

  if (booting) {
    return (
      <>
        <AuthBootScreen colors={colors} />
        <StatusBar style={scheme === "light" ? "dark" : "light"} />
      </>
    );
  }

  if (!session) {
    return (
      <>
        <LoginScreen
          colors={colors}
          onSignedIn={async (next) => {
            await saveStaffSession(next);
            setSession(next);
          }}
        />
        <StatusBar style={scheme === "light" ? "dark" : "light"} />
      </>
    );
  }

  return (
    <FieldDashboard
      session={session}
      onSession={(next) => {
        void saveStaffSession(next).then(() => setSession(next));
      }}
      onSignOut={() => void handleSignOut(session)}
    />
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 58, paddingBottom: 24 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: colors.mutedForeground, fontSize: 14, fontFamily: fonts.regular },
  header: { paddingHorizontal: 20, marginBottom: 22 },
  headerStatusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  signOut: { color: colors.mutedForeground, fontSize: 11, fontFamily: fonts.bold },
  eyebrow: { color: colors.primary, fontSize: 10, fontFamily: fonts.extraBold, letterSpacing: 2 },
  connectivity: { fontSize: 9, fontFamily: fonts.black, letterSpacing: 1.4 },
  headerTitle: { color: colors.foreground, fontSize: 32, fontFamily: fonts.extraBold, letterSpacing: -0.8, marginTop: 4 },
  headerSub: { color: colors.mutedForeground, fontSize: 12, marginTop: 5, fontFamily: fonts.regular },
  errorBanner: { marginHorizontal: 20, marginBottom: 18, borderRadius: 12, borderWidth: 1, borderColor: colors.dangerAlpha, backgroundColor: colors.dangerAlpha, padding: 14 },
  offlineBanner: { borderColor: colors.warningAlpha, backgroundColor: colors.warningAlpha },
  errorTitle: { color: colors.danger, fontSize: 13, fontFamily: fonts.bold },
  offlineTitle: { color: colors.warning },
  errorMessage: { color: colors.mutedForeground, fontSize: 11, marginTop: 4, fontFamily: fonts.regular },
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionTitle: { color: colors.foreground, fontSize: 16, fontFamily: fonts.bold, marginBottom: 11 },
  sectionCount: { color: colors.dimForeground, fontSize: 12, fontFamily: fonts.bold, marginBottom: 11 },
  primaryCard: { borderRadius: 18, borderWidth: 1, borderColor: colors.focus, backgroundColor: colors.card, padding: 16 },
  rowBetween: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  flexOne: { flex: 1, minWidth: 0 },
  timeBlock: { width: 72, borderRadius: 12, backgroundColor: colors.cardMuted, paddingVertical: 9, alignItems: "center" },
  timeText: { color: colors.foreground, fontSize: 16, fontFamily: fonts.extraBold },
  timeLabel: { color: colors.dimForeground, fontSize: 9, marginTop: 2, textTransform: "uppercase" },
  cardTitle: { color: colors.foreground, fontSize: 17, fontFamily: fonts.bold },
  cardMeta: { color: colors.mutedForeground, fontSize: 11, marginTop: 3, fontFamily: fonts.regular },
  appliancePanel: { marginTop: 14, borderRadius: 13, backgroundColor: colors.cardMuted, padding: 13 },
  applianceTitle: { color: colors.foreground, fontSize: 14, fontFamily: fonts.bold },
  statusPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  statusText: { fontSize: 9, fontFamily: fonts.extraBold, textTransform: "uppercase" },
  complaintText: { color: colors.mutedForeground, fontSize: 12, lineHeight: 17, marginTop: 10, fontFamily: fonts.regular },
  warningPanel: { marginTop: 14, borderRadius: 13, backgroundColor: colors.warningAlpha, padding: 13 },
  warningTitle: { color: colors.warning, fontSize: 13, fontFamily: fonts.bold },
  emptyCard: { borderRadius: 14, backgroundColor: colors.card, paddingVertical: 28, paddingHorizontal: 18, alignItems: "center" },
  emptyTitle: { color: colors.mutedForeground, fontSize: 14, fontFamily: fonts.bold, textAlign: "center" },
  emptyText: { color: colors.dimForeground, fontSize: 11, lineHeight: 16, marginTop: 5, textAlign: "center", fontFamily: fonts.regular },
  listCard: { borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 9 },
  listTitle: { color: colors.foreground, fontSize: 13, fontFamily: fonts.bold },
  smallStatus: { fontSize: 9, fontFamily: fonts.extraBold, textTransform: "uppercase" },
  routeCard: { flexDirection: "row", alignItems: "center", gap: 13, borderRadius: 13, backgroundColor: colors.card, padding: 13, marginBottom: 8 },
  routeTime: { width: 70, color: colors.focus, fontSize: 13, fontFamily: fonts.extraBold },
});
