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
import type { StoredStaffSession } from "../auth-storage";
import {
  fetchDiagnosticSession,
  patchDiagnosticSession,
  recordMeasurement,
  type DiagnosticSessionDetail,
  type MeasurementResult,
} from "../field-api";
import type { SyncService } from "../sync";
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

  const steps = useMemo(
    () =>
      detail?.steps.filter((step) => step.mode === "both" || step.mode === "field") ?? [],
    [detail?.steps],
  );

  const activeStep = steps.find((step) => step.id === activeStepId) ?? steps[0];

  const load = useCallback(async () => {
    setError(null);
    try {
      const row = await fetchDiagnosticSession(staffSession, sessionId);
      setDetail(row);
      if (!activeStepId && row.steps.length > 0) {
        const fieldSteps = row.steps.filter((step) => step.mode === "both" || step.mode === "field");
        const firstIncomplete = fieldSteps.find((step) => !measurementFor(row, step.id));
        setActiveStepId(firstIncomplete?.id ?? fieldSteps[0]?.id ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load diagnostic session");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeStepId, sessionId, staffSession]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveReading() {
    if (!detail || !activeStep) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      if (offline && syncService) {
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
      }
      setValueText("");
      setNote("");
      await load();
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
      await patchDiagnosticSession(staffSession, detail.session.id, {
        status,
        disposition:
          status === "diagnosed"
            ? "Repair recommendation supported by recorded diagnostic evidence"
            : status === "inconclusive"
              ? "Condition could not be isolated responsibly"
              : status === "escalated"
                ? "Technical escalation required"
                : detail.session.disposition,
      });
      await load();
      onCompleted?.();
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

        {offline ? (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>Offline — readings queue locally until sync.</Text>
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
                  label={offline ? "Queue reading" : "Record reading"}
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
