import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BackButton } from "@nnact/mobile-ui";
import type { JobDTO } from "@nnact/shared";
import type { StoredStaffSession } from "../auth-storage";
import {
  fetchDiagnosticSession,
  patchDiagnosticSession,
  recordMeasurement,
  type DiagnosticMeasurement,
  type DiagnosticSession,
  type DiagnosticSessionDetail,
  type MeasurementResult,
} from "../field-api";
import type { FieldPackage, SyncService } from "../sync";
import {
  Card,
  EmptyState,
  HeroBanner,
  LoadingScreen,
  PrimaryButton,
  SectionHeader,
} from "../components/ui";
import { humanize, statusColor } from "../hooks/useFieldData";
import { fonts, spacing, type Palette } from "../theme";

const RESULT_OPTIONS: MeasurementResult[] = [
  "pass",
  "fail",
  "within_range",
  "out_of_range",
  "unable",
  "not_reproduced",
];

function measurementFor(detail: DiagnosticSessionDetail, stepId: string) {
  return [...detail.measurements].reverse().find((item) => item.stepId === stepId);
}

const SESSION_PATCH_FIELDS: Array<keyof DiagnosticSession> = [
  "status",
  "customerComplaint",
  "technicianObservation",
  "disposition",
  "summary",
];

function toSessionPatch(patch: Record<string, unknown>): Partial<DiagnosticSession> {
  const out: Record<string, unknown> = {};
  for (const key of SESSION_PATCH_FIELDS) {
    if (patch[key] !== undefined) out[key] = patch[key];
  }
  return out as Partial<DiagnosticSession>;
}

/** Build a session detail from a cached field package plus queued offline ops. */
function buildOfflineDetail(
  pkg: FieldPackage,
  sessionId: string,
  queuedMeasurements: Array<Record<string, unknown>>,
  queuedPatches: Array<Record<string, unknown>>,
): DiagnosticSessionDetail | null {
  const session = pkg.session as unknown as DiagnosticSessionDetail["session"] | null;
  const equipment = pkg.equipment as unknown as DiagnosticSessionDetail["equipment"] | null;
  if (!session || !equipment) return null;
  const job = pkg.job as Partial<JobDTO>;
  const latestPatch = queuedPatches.length ? toSessionPatch(queuedPatches[queuedPatches.length - 1]) : null;
  return {
    session: latestPatch ? { ...session, ...latestPatch } : session,
    equipment,
    workflow: pkg.workflow as unknown as DiagnosticSessionDetail["workflow"] | null,
    job: {
      id: job.id ?? "",
      title: job.title ?? "Service job",
      status: job.status ?? "scheduled",
      scheduledAt: job.scheduledAt ?? null,
    },
    measurements: [
      ...((pkg.measurements as unknown as DiagnosticMeasurement[]) ?? []),
      ...(queuedMeasurements as unknown as DiagnosticMeasurement[]),
    ],
    steps: (pkg.steps as unknown as DiagnosticSessionDetail["steps"]) ?? [],
  };
}

export function DiagnosticSessionScreen({
  colors,
  sessionId,
  staffSession,
  offline,
  syncService,
  onBack,
  onCompleted,
}: {
  colors: Palette;
  sessionId: string;
  staffSession: StoredStaffSession;
  offline: boolean;
  syncService: SyncService | null;
  onBack: () => void;
  onCompleted?: () => void;
}) {
  const styles = createStyles(colors);
  const [detail, setDetail] = useState<DiagnosticSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<string>("");
  const [valueText, setValueText] = useState("");
  const [result, setResult] = useState<MeasurementResult>("pass");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [offlineMode, setOfflineMode] = useState(offline);
  const [pendingOps, setPendingOps] = useState(0);

  const isOffline = offline || offlineMode;
  const steps = useMemo(
    () =>
      detail?.steps.filter((step) => step.mode === "both" || step.mode === "field") ?? [],
    [detail?.steps],
  );

  const activeStep = steps.find((step) => step.id === activeStepId) ?? steps[0];

  const applyFirstIncomplete = useCallback((row: DiagnosticSessionDetail) => {
    const fieldSteps = row.steps.filter((step) => step.mode === "both" || step.mode === "field");
    setActiveStepId((current) => {
      if (current) return current;
      const firstIncomplete = fieldSteps.find((step) => !measurementFor(row, step.id));
      return firstIncomplete?.id ?? fieldSteps[0]?.id ?? "";
    });
  }, []);

  const restoreFromCache = useCallback(async (): Promise<DiagnosticSessionDetail | null> => {
    if (!syncService) return null;
    try {
      const pkg = await syncService.getCachedSessionDetail(sessionId);
      if (!pkg) return null;
      const queued = await syncService.listQueuedSessionOps(sessionId);
      const restored = buildOfflineDetail(pkg, sessionId, queued.measurements, queued.patches);
      setPendingOps(queued.measurements.length + queued.patches.length);
      return restored ?? null;
    } catch {
      return null;
    }
  }, [sessionId, syncService]);

  const load = useCallback(
    async (forceOffline = false) => {
      if (!forceOffline && !offline) {
        try {
          const row = await fetchDiagnosticSession(staffSession, sessionId);
          setDetail(row);
          setOfflineMode(false);
          setPendingOps(0);
          applyFirstIncomplete(row);
          setError(null);
          return;
        } catch {
          // network unavailable — fall through to the cached copy below
        }
      }

      setOfflineMode(true);
      const restored = await restoreFromCache();
      if (restored) {
        setDetail(restored);
        applyFirstIncomplete(restored);
        setError(null);
      } else {
        setDetail(null);
        setError("Could not load this session offline — no cached copy is available.");
      }
    },
    [applyFirstIncomplete, offline, restoreFromCache, sessionId, staffSession],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function saveReading() {
    if (!detail || !activeStep) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      if (isOffline && syncService) {
        await syncService.queueMeasurement({
          sessionId: detail.session.id,
          stepId: activeStep.id,
          valueText: valueText || undefined,
          unit: activeStep.unit || undefined,
          result,
          note: note || undefined,
          unableReason: result === "unable" ? note || "Could not access test point" : undefined,
        });
        setMessage("Reading queued — will sync when back online.");
        await load(true);
      } else {
        await recordMeasurement(staffSession, detail.session.id, {
          stepId: activeStep.id,
          valueText: valueText || undefined,
          unit: activeStep.unit || undefined,
          result,
          note: note || undefined,
          unableReason: result === "unable" ? note || "Could not access test point" : undefined,
        });
        setMessage("Reading recorded.");
        await load();
      }
      setValueText("");
      setNote("");
      const currentIndex = steps.findIndex((step) => step.id === activeStep.id);
      const nextStep = steps[currentIndex + 1];
      if (nextStep && !measurementFor(detail, nextStep.id)) setActiveStepId(nextStep.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record reading");
    } finally {
      setSaving(false);
    }
  }

  async function setDisposition(status: "diagnosed" | "inconclusive" | "escalated" | "completed") {
    if (!detail) return;
    setSaving(true);
    try {
      const disposition =
        status === "diagnosed"
          ? "Repair recommendation supported by recorded diagnostic evidence"
          : status === "inconclusive"
            ? "Condition could not be isolated responsibly"
            : status === "escalated"
              ? "Technical escalation required"
              : detail.session.disposition;

      if (isOffline && syncService) {
        await syncService.queueSessionPatch({
          sessionId: detail.session.id,
          baseVersion: detail.session.version,
          status,
          disposition,
        });
        setDetail((prev) => (prev ? { ...prev, session: { ...prev.session, status } } : prev));
        setMessage("Session status queued — will sync when back online.");
        onCompleted?.();
      } else {
        await patchDiagnosticSession(staffSession, detail.session.id, { status, disposition });
        await load();
        onCompleted?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update session");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !detail) {
    return (
      <View style={styles.root}>
        <View style={styles.topBar}>
          <BackButton colors={colors} onPress={onBack} variant="surface" />
        </View>
        <LoadingScreen colors={colors} message="Loading diagnostic workflow…" />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.root}>
        <View style={styles.topBar}>
          <BackButton colors={colors} onPress={onBack} variant="surface" />
        </View>
        <EmptyState colors={colors} icon="" title="Session not found" description={error ?? "Try again later."} />
      </View>
    );
  }

  const equipmentLabel =
    [detail.equipment.make, detail.equipment.model].filter(Boolean).join(" ") || detail.equipment.type;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.primary} />
        }
      >
        <View style={styles.heroBackRow}>
          <BackButton colors={colors} onPress={onBack} variant="hero" />
        </View>

        <HeroBanner
          colors={colors}
          eyebrow={detail.workflow?.name ?? "Diagnostic session"}
          title={equipmentLabel}
          subtitle={detail.job.title}
        >
          <View style={[styles.statusPill, { borderColor: statusColor(detail.session.status, colors) }]}>
            <Text style={[styles.statusPillText, { color: statusColor(detail.session.status, colors) }]}>
              {humanize(detail.session.status)}
            </Text>
          </View>
        </HeroBanner>

        {isOffline ? (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>
              {pendingOps > 0
                ? `Offline — ${pendingOps} change${pendingOps !== 1 ? "s" : ""} queued; will sync when back online.`
                : "Offline — readings queue locally until sync."}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {message ? (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{message}</Text>
          </View>
        ) : null}

        <SectionHeader colors={colors} title="Workflow steps" />
        <View style={styles.section}>
          {steps.length === 0 ? (
            <Text style={styles.muted}>No field steps in this workflow yet.</Text>
          ) : (
            steps.map((step) => {
              const completed = Boolean(measurementFor(detail, step.id));
              const active = step.id === activeStep?.id;
              return (
                <TouchableOpacity
                  key={step.id}
                  style={[styles.stepRow, active && styles.stepRowActive, completed && styles.stepRowDone]}
                  onPress={() => setActiveStepId(step.id)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.stepBadge, completed && styles.stepBadgeDone, active && styles.stepBadgeActive]}>
                    <Text style={styles.stepBadgeText}>{completed ? "✓" : step.sequence + 1}</Text>
                  </View>
                  <View style={styles.flexOne}>
                    <Text style={styles.stepTitle}>{step.publicLabel}</Text>
                    <Text style={styles.stepMeta}>{humanize(step.stepType)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {activeStep ? (
          <>
            <SectionHeader colors={colors} title="Record reading" />
            <View style={styles.section}>
              <Card colors={colors}>
                {activeStep.safetyState ? (
                  <Text style={styles.safety}>Safety: {activeStep.safetyState}</Text>
                ) : null}
                {activeStep.purpose ? <Text style={styles.body}>{activeStep.purpose}</Text> : null}
                {activeStep.expectedText ? (
                  <Text style={styles.muted}>Expected: {activeStep.expectedText}</Text>
                ) : null}

                <Text style={styles.inputLabel}>Measured value</Text>
                <TextInput
                  style={styles.input}
                  value={valueText}
                  onChangeText={setValueText}
                  placeholder={activeStep.unit ? `Value (${activeStep.unit})` : "Reading"}
                  placeholderTextColor={colors.dimForeground}
                />

                <Text style={styles.inputLabel}>Result</Text>
                <View style={styles.resultRow}>
                  {RESULT_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[styles.resultChip, result === option && styles.resultChipActive]}
                      onPress={() => setResult(option)}
                    >
                      <Text style={[styles.resultChipText, result === option && styles.resultChipTextActive]}>
                        {humanize(option)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.inputLabel}>Note</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Optional field note"
                  placeholderTextColor={colors.dimForeground}
                  multiline
                />

                <PrimaryButton
                  colors={colors}
                  label={isOffline ? "Queue reading" : "Record reading"}
                  onPress={() => void saveReading()}
                  loading={saving}
                />
              </Card>
            </View>
          </>
        ) : null}

        <SectionHeader colors={colors} title="Close session" />
        <View style={styles.section}>
          <View style={styles.actionRow}>
            <PrimaryButton
              colors={colors}
              label="Diagnosed"
              onPress={() => void setDisposition("diagnosed")}
              loading={saving}
              variant="accent"
              size="sm"
              fullWidth={false}
            />
            <PrimaryButton
              colors={colors}
              label="Escalate"
              onPress={() => void setDisposition("escalated")}
              loading={saving}
              variant="secondary"
              size="sm"
              fullWidth={false}
            />
            <PrimaryButton
              colors={colors}
              label="Inconclusive"
              onPress={() => void setDisposition("inconclusive")}
              loading={saving}
              variant="ghost"
              size="sm"
              fullWidth={false}
            />
          </View>
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
    offlineBanner: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      backgroundColor: colors.warningAlpha,
      borderRadius: 12,
      padding: spacing.md,
    },
    offlineText: { color: colors.warning, fontSize: 13, fontFamily: fonts.medium },
    errorBanner: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      backgroundColor: colors.dangerAlpha,
      borderRadius: 12,
      padding: spacing.md,
    },
    errorText: { color: colors.danger, fontSize: 13, fontFamily: fonts.medium },
    successBanner: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      backgroundColor: colors.successAlpha ?? colors.primaryMuted,
      borderRadius: 12,
      padding: spacing.md,
    },
    successText: { color: colors.success, fontSize: 13, fontFamily: fonts.medium },
    section: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    flexOne: { flex: 1, minWidth: 0 },
    muted: { color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.regular },
    body: { color: colors.foreground, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, marginBottom: spacing.sm },
    safety: { color: colors.warning, fontSize: 13, fontFamily: fonts.bold, marginBottom: spacing.sm },
    stepRow: {
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
    stepRowActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
    stepRowDone: { borderColor: colors.successAlpha ?? colors.borderLight },
    stepBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    stepBadgeActive: { backgroundColor: colors.primary },
    stepBadgeDone: { backgroundColor: colors.success },
    stepBadgeText: { color: colors.foreground, fontSize: 12, fontFamily: fonts.bold },
    stepTitle: { color: colors.foreground, fontSize: 14, fontFamily: fonts.semibold },
    stepMeta: { color: colors.dimForeground, fontSize: 11, marginTop: 2, fontFamily: fonts.regular },
    inputLabel: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.medium, marginTop: spacing.sm, marginBottom: 4 },
    input: {
      borderWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: 12,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      color: colors.foreground,
      fontFamily: fonts.regular,
      fontSize: 15,
      backgroundColor: colors.surfaceMuted,
    },
    inputMultiline: { minHeight: 72, textAlignVertical: "top" },
    resultRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
    resultChip: {
      borderWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: colors.card,
    },
    resultChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
    resultChipText: { color: colors.mutedForeground, fontSize: 11, fontFamily: fonts.medium },
    resultChipTextActive: { color: colors.primary, fontFamily: fonts.bold },
    actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  });
