import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BackButton } from "@nnact/mobile-ui";
import type { ActivityDTO, CustomerDTO, JobDTO } from "@nnact/shared";
import { buildGoogleMapsDirectionsToAddress, buildWhatsAppUrl, formatMoney } from "@nnact/shared";
import { staffFetch, staffRefresh } from "../auth-api";
import { saveStaffSession, type StoredStaffSession } from "../auth-storage";
import {
  Card,
  EmptyState,
  HeroBanner,
  LoadingScreen,
  PrimaryButton,
  SectionHeader,
  StatCard,
} from "../components/ui";
import type { Appointment, DiagnosticListItem } from "../hooks/useFieldData";
import { humanize, statusColor } from "../hooks/useFieldData";
import { listJobPhotos, listJobVoiceNotes, uploadJobPhoto, type JobPhoto } from "../field-api";
import type { JobVoiceNoteDTO } from "@nnact/shared";
import { VoiceNoteRecorder } from "../components/VoiceNoteRecorder";
import { fonts, spacing, type Palette } from "../theme";
import * as ImagePicker from "expo-image-picker";

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

async function fetchWithRefresh<T>(
  session: StoredStaffSession,
  path: string,
  onSession?: (next: StoredStaffSession) => void,
  init?: RequestInit,
): Promise<T> {
  try {
    return await staffFetch<T>(session, path, init);
  } catch (error) {
    if (error instanceof Error && error.message === "session_expired") {
      const refreshed = await staffRefresh(session.refreshToken);
      await saveStaffSession(refreshed);
      onSession?.(refreshed);
      return staffFetch<T>(refreshed, path, init);
    }
    throw error;
  }
}

export function JobDetailScreen({
  colors,
  jobId,
  session,
  onSession,
  onBack,
  onOpenDiagnosticSession,
  onStartDiagnostic,
  initialJob,
  cachedAppointments,
  cachedDiagnostics,
  onJobUpdated,
}: {
  colors: Palette;
  jobId: string;
  session: StoredStaffSession;
  onSession: (next: StoredStaffSession) => void;
  onBack: () => void;
  onOpenDiagnosticSession: (sessionId: string) => void;
  onStartDiagnostic: (payload: { customerId: string; description?: string | null }) => void;
  initialJob?: JobDTO;
  cachedAppointments?: Appointment[];
  cachedDiagnostics?: DiagnosticListItem[];
  onJobUpdated?: () => void;
}) {
  const styles = createStyles(colors);
  const [job, setJob] = useState<JobDTO | null>(initialJob ?? null);
  const [customer, setCustomer] = useState<CustomerDTO | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [activities, setActivities] = useState<ActivityDTO[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticListItem[]>([]);
  const [loading, setLoading] = useState(!initialJob);
  const [refreshing, setRefreshing] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [voiceNotes, setVoiceNotes] = useState<JobVoiceNoteDTO[]>([]);
  const [error, setError] = useState<string | null>(null);

  const jobAppointments = useMemo(() => {
    const fromCache = cachedAppointments?.filter((item) => item.jobId === jobId) ?? [];
    if (fromCache.length > 0) return fromCache;
    if (job?.scheduledAt) {
      const start = new Date(job.scheduledAt);
      if (!Number.isNaN(start.getTime())) {
        return [
          {
            id: `scheduled-${job.id}`,
            jobId: job.id,
            technicianId: job.assignedTo ?? null,
            startsAt: start.toISOString(),
            endsAt: new Date(start.getTime() + 90 * 60 * 1000).toISOString(),
          },
        ];
      }
    }
    return [];
  }, [cachedAppointments, job, jobId]);

  const primaryDiagnostic = diagnostics[0] ?? cachedDiagnostics?.find((item) => item.session.jobId === jobId);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      setError(null);
      try {
        const [jobRow, lineItemRows, activityRows, diagnosticRows, photoRows, voiceRows] = await Promise.all([
          fetchWithRefresh<JobDTO>(session, `/api/jobs/${jobId}`, onSession),
          fetchWithRefresh<LineItem[]>(session, `/api/jobs/${jobId}/line-items`, onSession),
          fetchWithRefresh<ActivityDTO[]>(session, `/api/activities?jobId=${jobId}&limit=50`, onSession),
          fetchWithRefresh<DiagnosticListItem[]>(session, `/api/diagnostics/sessions?jobId=${jobId}`, onSession),
          listJobPhotos(session, jobId).catch(() => []),
          listJobVoiceNotes(session, jobId).catch(() => []),
        ]);
        setJob(jobRow);
        setLineItems(lineItemRows);
        setActivities(activityRows);
        setDiagnostics(diagnosticRows);
        setPhotos(photoRows);
        setVoiceNotes(voiceRows);

        const customerRow = await fetchWithRefresh<CustomerDTO>(
          session,
          `/api/customers/${jobRow.customerId}`,
          onSession,
        );
        setCustomer(customerRow);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load job details");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [jobId, onSession, session],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function openDiagnostic() {
    if (primaryDiagnostic) {
      onOpenDiagnosticSession(primaryDiagnostic.session.id);
    } else if (job) {
      onStartDiagnostic({ customerId: job.customerId, description: job.description });
    }
  }

  async function capturePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission is required to attach field photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setPhotoUploading(true);
    setError(null);
    try {
      const uploaded = await uploadJobPhoto(session, jobId, result.assets[0].uri);
      setPhotos((prev) => [uploaded, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setPhotoUploading(false);
    }
  }

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library permission is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      allowsEditing: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setPhotoUploading(true);
    setError(null);
    try {
      const uploaded = await uploadJobPhoto(session, jobId, result.assets[0].uri);
      setPhotos((prev) => [uploaded, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setPhotoUploading(false);
    }
  }

  async function updateStatus(nextStatus: "in_progress" | "completed") {
    if (!job) return;
    setStatusUpdating(true);
    setError(null);
    try {
      const updated = await fetchWithRefresh<JobDTO>(
        session,
        `/api/jobs/${job.id}`,
        onSession,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      setJob(updated);
      onJobUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update job status");
    } finally {
      setStatusUpdating(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    void load(true);
  }

  if (loading && !job) {
    return (
      <View style={styles.root}>
        <View style={styles.topBar}>
          <BackButton colors={colors} onPress={onBack} variant="surface" />
        </View>
        <LoadingScreen colors={colors} message="Loading job details…" />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.root}>
        <View style={styles.topBar}>
          <BackButton colors={colors} onPress={onBack} variant="surface" />
        </View>
        <EmptyState
          colors={colors}
          icon=""
          title="Job not found"
          description={error ?? "This work order may not be assigned to you or no longer exists."}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View style={styles.heroBackRow}>
          <BackButton colors={colors} onPress={onBack} variant="hero" />
        </View>

        <HeroBanner
          colors={colors}
          eyebrow="Work order"
          title={job.title}
          subtitle={customer?.name ?? "Customer details loading…"}
        >
          <View style={[styles.statusPill, { borderColor: statusColor(job.status, colors) }]}>
            <Text style={[styles.statusPillText, { color: statusColor(job.status, colors) }]}>
              {humanize(job.status)}
            </Text>
          </View>
        </HeroBanner>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <StatCard colors={colors} label="Total" value={formatMoney(job.total)} accent="primary" />
          <StatCard
            colors={colors}
            label="Scheduled"
            value={
              job.scheduledAt
                ? new Date(job.scheduledAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                : "—"
            }
            hint={
              job.scheduledAt
                ? new Date(job.scheduledAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
                : "Not scheduled"
            }
            accent={job.scheduledAt ? "primary" : "warning"}
          />
          <StatCard
            colors={colors}
            label="Line items"
            value={String(lineItems.length)}
            hint={lineItems.length ? "On this job" : "None yet"}
          />
        </View>

        <View style={styles.actions}>
          {job.status === "scheduled" ? (
            <PrimaryButton
              colors={colors}
              label="Start job"
              onPress={() => void updateStatus("in_progress")}
              loading={statusUpdating}
            />
          ) : null}
          {job.status === "in_progress" ? (
            <PrimaryButton
              colors={colors}
              label="Mark completed"
              onPress={() => void updateStatus("completed")}
              loading={statusUpdating}
              variant="accent"
            />
          ) : null}
          <PrimaryButton
            colors={colors}
            label={primaryDiagnostic ? "Open diagnostic" : "Start diagnostic"}
            onPress={openDiagnostic}
            variant="secondary"
            size="sm"
            fullWidth={false}
          />
          <PrimaryButton
            colors={colors}
            label="Add photo"
            onPress={() => void capturePhoto()}
            loading={photoUploading}
            variant="ghost"
            size="sm"
            fullWidth={false}
          />
        </View>

        <SectionHeader colors={colors} title="Overview" />
        <View style={styles.section}>
          <Card colors={colors}>
            {job.description ? (
              <Text style={styles.bodyText}>{job.description}</Text>
            ) : (
              <Text style={styles.mutedText}>No description or access notes recorded for this job.</Text>
            )}
            <View style={styles.metaGrid}>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Created</Text>
                <Text style={styles.metaValue}>
                  {new Date(job.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Job ID</Text>
                <Text style={styles.metaValueMono}>{job.id.slice(0, 8)}…</Text>
              </View>
            </View>
          </Card>
        </View>

        {customer ? (
          <>
            <SectionHeader colors={colors} title="Customer" />
            <View style={styles.section}>
              <Card colors={colors}>
                <Text style={styles.cardTitle}>{customer.name}</Text>
                {customer.email ? <Text style={styles.mutedText}>{customer.email}</Text> : null}
                {customer.phone ? (
                  <View style={styles.contactRow}>
                    <TouchableOpacity
                      onPress={() => void Linking.openURL(`tel:${customer.phone!.replace(/\s/g, "")}`)}
                      activeOpacity={0.7}
                      style={styles.phoneRow}
                    >
                      <Ionicons name="call-outline" size={16} color={colors.primary} />
                      <Text style={styles.phoneText}>{customer.phone}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() =>
                        void Linking.openURL(
                          buildWhatsAppUrl(
                            customer.phone!,
                            `Hello ${customer.name}, this is ${session.user.name} from NNACT regarding your service visit.`,
                          ),
                        )
                      }
                      activeOpacity={0.7}
                      style={styles.phoneRow}
                    >
                      <Ionicons name="logo-whatsapp" size={16} color={colors.success} />
                      <Text style={styles.phoneText}>WhatsApp</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {customer.primaryAddress ? (
                  <TouchableOpacity
                    onPress={() =>
                      void Linking.openURL(buildGoogleMapsDirectionsToAddress(customer.primaryAddress!))
                    }
                    activeOpacity={0.7}
                    style={styles.phoneRow}
                  >
                    <Ionicons name="navigate-outline" size={16} color={colors.primary} />
                    <Text style={styles.phoneText}>{customer.primaryAddress}</Text>
                  </TouchableOpacity>
                ) : null}
                <Text style={styles.dimText}>
                  Customer since{" "}
                  {new Date(customer.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </Text>
              </Card>
            </View>
          </>
        ) : null}

        <SectionHeader
          colors={colors}
          title="Visit schedule"
          action={jobAppointments.length ? undefined : "Start diagnostic"}
          onAction={jobAppointments.length ? undefined : openDiagnostic}
        />
        <View style={styles.section}>
          {jobAppointments.length === 0 ? (
            <Text style={styles.mutedText}>No appointments scheduled for this job yet.</Text>
          ) : (
            jobAppointments.map((appointment) => (
              <View key={appointment.id} style={styles.scheduleRow}>
                <View style={styles.scheduleTime}>
                  <Text style={styles.scheduleTimeText}>
                    {new Date(appointment.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </Text>
                  <Text style={styles.scheduleDateText}>
                    {new Date(appointment.startsAt).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>On-site visit</Text>
                  <Text style={styles.mutedText}>
                    Until{" "}
                    {new Date(appointment.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <SectionHeader colors={colors} title="Diagnostic" action="Open" onAction={openDiagnostic} />
        <View style={styles.section}>
          {primaryDiagnostic ? (
            <Card colors={colors}>
              <View style={styles.diagnosticHeader}>
                <Text style={styles.cardTitle}>
                  {[primaryDiagnostic.equipment.make, primaryDiagnostic.equipment.model]
                    .filter(Boolean)
                    .join(" ") || primaryDiagnostic.equipment.type}
                </Text>
                <View
                  style={[
                    styles.statusPill,
                    { borderColor: statusColor(primaryDiagnostic.session.status, colors) },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: statusColor(primaryDiagnostic.session.status, colors) },
                    ]}
                  >
                    {humanize(primaryDiagnostic.session.status)}
                  </Text>
                </View>
              </View>
              <Text style={styles.mutedText}>
                {primaryDiagnostic.workflow?.name ?? "Workflow not selected"}
              </Text>
              <Text style={styles.bodyText}>
                {primaryDiagnostic.session.customerComplaint || "No customer complaint recorded."}
              </Text>
              {primaryDiagnostic.equipment.serialNumber ? (
                <Text style={styles.dimText}>Serial {primaryDiagnostic.equipment.serialNumber}</Text>
              ) : null}
            </Card>
          ) : (
            <EmptyState
              colors={colors}
              icon=""
              title="Diagnostic not started"
              description="Confirm equipment details and start a validated workflow from the Diagnostics tab."
            />
          )}
        </View>

        <SectionHeader colors={colors} title="Voice to dispatch" />
        <View style={styles.section}>
          <VoiceNoteRecorder
            colors={colors}
            session={session}
            jobId={jobId}
            onUploaded={() => void load(true)}
          />
          {voiceNotes.length > 0 ? (
            <Text style={styles.mutedText}>
              {voiceNotes.length} note{voiceNotes.length === 1 ? "" : "s"} sent · office notified instantly
            </Text>
          ) : null}
        </View>

        <SectionHeader colors={colors} title="Field photos" action="Gallery" onAction={() => void pickPhoto()} />
        <View style={styles.section}>
          {photos.length === 0 ? (
            <Text style={styles.mutedText}>No photos yet. Capture evidence from the job site.</Text>
          ) : (
            photos.map((photo) => (
              <View key={photo.id} style={styles.photoRow}>
                <Ionicons name="image-outline" size={18} color={colors.primary} />
                <Text style={styles.cardTitle}>{photo.filename}</Text>
                <Text style={styles.dimText}>
                  {new Date(photo.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            ))
          )}
        </View>

        <SectionHeader colors={colors} title="Line items" />
        <View style={styles.section}>
          {lineItems.length === 0 ? (
            <Text style={styles.mutedText}>No line items on this job yet.</Text>
          ) : (
            <>
              {lineItems.map((item) => (
                <View key={item.id} style={styles.lineItemRow}>
                  <View style={styles.flexOne}>
                    <Text style={styles.cardTitle}>{item.description}</Text>
                    <Text style={styles.mutedText}>
                      {item.quantity} × {formatMoney(item.unitPrice)}
                    </Text>
                  </View>
                  <Text style={styles.lineItemAmount}>{formatMoney(item.quantity * item.unitPrice)}</Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Job total</Text>
                <Text style={styles.totalValue}>{formatMoney(job.total)}</Text>
              </View>
            </>
          )}
        </View>

        <SectionHeader colors={colors} title="Activity" />
        <View style={styles.section}>
          {activities.length === 0 ? (
            <Text style={styles.mutedText}>No activity recorded for this job yet.</Text>
          ) : (
            activities.map((activity) => (
              <View key={activity.id} style={styles.activityRow}>
                <View style={styles.activityDot} />
                <View style={styles.flexOne}>
                  <Text style={styles.bodyText}>{activity.summary}</Text>
                  <Text style={styles.dimText}>
                    {new Date(activity.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    content: { paddingBottom: spacing.lg },
    topBar: {
      paddingTop: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    heroBackRow: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      marginBottom: -spacing.sm,
    },
    statusPill: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 5,
      marginTop: spacing.sm,
    },
    statusPillText: { fontSize: 10, fontFamily: fonts.extraBold, textTransform: "uppercase" },
    errorBanner: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      backgroundColor: colors.dangerAlpha,
      borderRadius: 12,
      padding: spacing.md,
    },
    errorText: { color: colors.danger, fontSize: 13, fontFamily: fonts.medium },
    statsRow: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      marginTop: -spacing.md,
      marginBottom: spacing.md,
    },
    actions: {
      paddingHorizontal: spacing.lg,
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    section: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    flexOne: { flex: 1, minWidth: 0 },
    cardTitle: { color: colors.foreground, fontSize: 15, fontFamily: fonts.bold },
    bodyText: { color: colors.foreground, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
    mutedText: { color: colors.mutedForeground, fontSize: 13, marginTop: 4, fontFamily: fonts.regular },
    dimText: { color: colors.dimForeground, fontSize: 12, marginTop: spacing.sm, fontFamily: fonts.regular },
    metaGrid: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
    metaCell: {
      flex: 1,
      backgroundColor: colors.surfaceMuted,
      borderRadius: 12,
      padding: spacing.md,
    },
    metaLabel: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.medium, textTransform: "uppercase" },
    metaValue: { color: colors.foreground, fontSize: 14, marginTop: 4, fontFamily: fonts.semibold },
    metaValueMono: { color: colors.foreground, fontSize: 13, marginTop: 4, fontFamily: fonts.medium },
    phoneRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
    contactRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
    phoneText: { color: colors.primary, fontSize: 14, fontFamily: fonts.semibold },
    photoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    scheduleRow: {
      flexDirection: "row",
      gap: spacing.md,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    scheduleTime: { width: 72, alignItems: "center" },
    scheduleTimeText: { color: colors.primary, fontSize: 16, fontFamily: fonts.extraBold },
    scheduleDateText: { color: colors.dimForeground, fontSize: 10, marginTop: 2, fontFamily: fonts.medium },
    diagnosticHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
    lineItemRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    lineItemAmount: { color: colors.foreground, fontSize: 14, fontFamily: fonts.bold },
    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: colors.accentMuted,
      borderRadius: 12,
      padding: spacing.md,
      marginTop: spacing.xs,
    },
    totalLabel: { color: colors.foreground, fontSize: 14, fontFamily: fonts.semibold },
    totalValue: { color: colors.foreground, fontSize: 16, fontFamily: fonts.extraBold },
    activityRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
    activityDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.primary,
      marginTop: 5,
    },
  });
