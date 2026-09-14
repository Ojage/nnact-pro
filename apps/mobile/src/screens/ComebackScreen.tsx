import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState, LoadingScreen, PrimaryButton, ScreenHeader, Card, TextField, Divider } from "../components/ui";
import { fonts, radius, spacing, type Palette } from "../theme";
import { createComebackFromJob, getComeback, listComebacks, transitionComeback } from "../comeback-api";
import { loadStaffSession, type StoredStaffSession } from "../auth-storage";
import { formatMoney, COMEBACK_STATUS_LABEL, COMEBACK_SEVERITY_LABEL } from "@nnact/shared";
import type { ComebackCaseListItemDTO, ComebackCaseDetailDTO, JobDTO } from "@nnact/shared";

function StatusPill({ colors, status }: { colors: Palette; status: string }) {
  const styles = createStyles(colors);
  const cooked = COMEBACK_STATUS_LABEL[status as keyof typeof COMEBACK_STATUS_LABEL] ?? status.replaceAll("_", " ");
  const tone =
    ["RESOLVED", "CLOSED", "MONITORING", "NOT_A_COMEBACK"].includes(status)
      ? colors.success
      : ["DISPUTED", "CRITICAL"].includes(status)
        ? colors.danger
        : colors.warning;
  return (
    <View style={[styles.pill, { backgroundColor: tone + "22" }]}>
      <Text style={[styles.pillText, { color: tone }]}>{cooked}</Text>
    </View>
  );
}

function InfoRow({ colors, label, value }: { colors: Palette; label: string; value: string }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, !value || value === "—" ? { color: colors.dimForeground } : null]} numberOfLines={3}>
        {value || "—"}
      </Text>
    </View>
  );
}

export function ComebackScreen({
  colors,
  session,
  jobs = [],
  defaultJobId,
  onOpenComeback,
}: {
  colors: Palette;
  session?: StoredStaffSession | null;
  jobs?: JobDTO[];
  defaultJobId?: string;
  onOpenComeback?: (id: string) => void;
}) {
  const styles = createStyles(colors);
  const [list, setList] = useState<ComebackCaseListItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState(false);

  const [detail, setDetail] = useState<ComebackCaseDetailDTO | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showReport, setShowReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportJobId, setReportJobId] = useState(defaultJobId ?? "");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const owner = session ?? (await loadStaffSession());
    if (!owner) {
      setError("Not signed in.");
      setLoading(false);
      return;
    }
    try {
      setList(await listComebacks(owner));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load comebacks.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    reload();
  }, [reload]);

  const visible = useMemo(() => {
    if (!mine) return list;
    const myId = session?.user.id;
    if (!myId) return list;
    return list.filter((c) => c.assignedTechnicianId === myId);
  }, [list, mine, session]);

  const openDetail = async (id: string) => {
    if (onOpenComeback) {
      onOpenComeback(id);
      return;
    }
    const owner = session ?? (await loadStaffSession());
    if (!owner) return;
    setDetailLoading(true);
    setError(null);
    try {
      setDetail(await getComeback(owner, id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load case.");
    } finally {
      setDetailLoading(false);
    }
  };

  const act = async (id: string, action: string, body?: Record<string, unknown>) => {
    const owner = session ?? (await loadStaffSession());
    if (!owner) return;
    try {
      await transitionComeback(owner, id, action, body);
      if (detail && detail.id === id) setDetail(await getComeback(owner, id));
      await reload();
    } catch {
      setError("Action failed — try again.");
    }
  };

  const saveReport = async () => {
    const owner = session ?? (await loadStaffSession());
    if (!owner) {
      setReportError("Not signed in.");
      return;
    }
    if (!reportJobId) {
      setReportError("Choose which job this comeback is for.");
      return;
    }
    if (!summary.trim()) {
      setReportError("Describe the problem in one line.");
      return;
    }
    setBusy(true);
    setReportError(null);
    try {
      await createComebackFromJob(owner, {
        jobId: reportJobId,
        complaintSummary: summary.trim(),
        ...(details.trim() ? { complaintDetails: details.trim() } : {}),
      });
      setShowReport(false);
      setSummary("");
      setDetails("");
      if (!reportJobId.startsWith("pick-")) setReportJobId("");
      await reload();
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "Could not record the comeback.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingScreen colors={colors} message="Loading comebacks…" />;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader colors={colors} title="Comebacks" eyebrow="Quality follow-ups on completed jobs" />
      <View style={styles.headerRow}>
        <PrimaryButton colors={colors} label="↩ Report comeback" size="sm" fullWidth={false} onPress={() => setShowReport(true)} />
        <PrimaryButton
          colors={colors}
          label={mine ? "All cases" : "My cases"}
          variant={mine ? "accent" : "secondary"}
          size="sm"
          fullWidth={false}
          onPress={() => setMine((v) => !v)}
        />
        <PrimaryButton colors={colors} label="↻" variant="secondary" size="sm" fullWidth={false} onPress={reload} />
      </View>

      {error ? (
        <Card colors={colors} style={styles.errorCard}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </Card>
      ) : null}

      {visible.length === 0 ? (
        <Card colors={colors}>
          <EmptyState
            colors={colors}
            icon="refresh-circle-outline"
            title={mine ? "No cases assigned to you" : "No comebacks yet"}
            description="Cases opened when a job comes back for the same issue appear here. Tap Report comeback to log one."
          />
        </Card>
      ) : (
        visible.map((c) => (
          <Card colors={colors} key={c.id} style={styles.row}>
            <View style={styles.rowMain}>
              <View style={styles.rowLine}>
                <Text style={styles.rowTitle} numberOfLines={1}>{c.caseNumber}</Text>
                <View style={styles.rowBadges}>
                  <StatusPill colors={colors} status={c.status} />
                  <StatusPill colors={colors} status={c.severity} />
                </View>
              </View>
              <Text style={styles.rowSub} numberOfLines={2}>{c.complaintSummary}</Text>
              <Text style={styles.rowSub}>
                {c.customerName ?? "Unknown customer"}
                {c.equipmentLabel ? ` · ${c.equipmentLabel}` : ""}
                {c.repeatNumber > 1 ? ` · repeat #${c.repeatNumber}` : ""}
              </Text>
              <Text style={styles.rowSub}>
                Reported {new Date(c.reportedAt).toLocaleDateString()}
                {c.internalCostCents > 0 ? ` · internal ${formatMoney(c.internalCostCents)}` : ""}
              </Text>
              {OPEN_ACTIONS[c.status] ? (
                <View style={styles.inlineActions}>
                  {OPEN_ACTIONS[c.status].map(([action, label]) => (
                    <PrimaryButton key={action} colors={colors} label={label} variant="secondary" size="sm" fullWidth={false} onPress={() => act(c.id, action)} />
                  ))}
                </View>
              ) : null}
            </View>
            <PrimaryButton colors={colors} label="Open" size="sm" fullWidth={false} onPress={() => openDetail(c.id)} />
          </Card>
        ))
      )}

      <Modal visible={detailLoading} transparent animationType="fade">
        <View style={styles.modalWrap}><LoadingScreen colors={colors} message="Opening case…" /></View>
      </Modal>

      <Modal visible={detail !== null} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={styles.detailWrap}>
          <View style={[styles.detailCard, { backgroundColor: colors.card }]}>
            {detail ? (
              <>
                <View style={styles.detailHeader}>
                  <Text style={styles.modalTitle}>{detail.caseNumber}</Text>
                  <View style={styles.rowBadges}>
                    <StatusPill colors={colors} status={detail.status} />
                    <StatusPill colors={colors} status={detail.severity} />
                  </View>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={styles.detailBody}>
                    <Text style={styles.detailTitle}>Complaint</Text>
                    <Text style={styles.detailText}>{detail.complaintSummary}</Text>
                    {detail.complaintDetails ? <Text style={styles.detailSub}>{detail.complaintDetails}</Text> : null}
                    {detail.resolutionSummary ? (
                      <>
                        <Text style={styles.detailTitle}>Resolution</Text>
                        <Text style={styles.detailText}>{detail.resolutionSummary}</Text>
                      </>
                    ) : null}
                    <Divider colors={colors} />
                    <InfoRow colors={colors} label="Fault relationship" value={labelOrDash(detail.faultRelationship)} />
                    <InfoRow colors={colors} label="Root cause" value={labelOrDash(detail.rootCause)} />
                    <InfoRow colors={colors} label="Responsibility" value={labelOrDash(detail.responsibility)} />
                    <InfoRow colors={colors} label="Billing" value={labelOrDash(detail.billingDecision)} />
                    {detail.chargeAmountCents > 0 ? <InfoRow colors={colors} label="Charge" value={formatMoney(detail.chargeAmountCents)} /> : null}
                    {detail.warranty ? <InfoRow colors={colors} label="Warranty" value={labelOrDash(detail.warranty.status)} /> : null}
                    {detail.followUps.length > 0 ? (
                      <>
                        <Text style={styles.detailTitle}>Follow-ups</Text>
                        {detail.followUps.map((f) => (
                          <View key={f.id} style={styles.followupRow}>
                            <Text style={styles.detailText}>{f.note ?? "Scheduled check"}</Text>
                            <Text style={styles.detailSub}>{new Date(f.scheduledAt).toLocaleDateString()}</Text>
                            {f.outcome === "PENDING" ? (
                              <PrimaryButton colors={colors} label="Mark no-relapse" size="sm" fullWidth={false} onPress={() => act(detail.id, "follow-up", { outcome: "NO_RELAPSE", note: null })} />
                            ) : (
                              <StatusPill colors={colors} status={f.outcome} />
                            )}
                          </View>
                        ))}
                      </>
                    ) : null}
                    {DETAIL_ACTIONS[detail.status] ? (
                      <View style={styles.modalButtons}>
                        {DETAIL_ACTIONS[detail.status].map(([action, label, variant]) => (
                          <PrimaryButton
                            key={action}
                            colors={colors}
                            label={label}
                            variant={(variant as "secondary" | "accent") ?? "primary"}
                            onPress={() => act(detail.id, action)}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                </ScrollView>
                <PrimaryButton colors={colors} label="Close" variant="secondary" onPress={() => setDetail(null)} />
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={showReport} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={styles.modalTitle}>Report a comeback</Text>
            {reportError ? <Text style={[styles.errorText, { color: colors.danger }]}>{reportError}</Text> : null}
            <Text style={styles.fieldLabel}>Job *</Text>
            <View style={styles.methodRow}>
              {jobs.length > 0 ? (
                jobs.map((j) => (
                  <PrimaryButton
                    key={j.id}
                    colors={colors}
                    label={`${j.number}${j.id === reportJobId ? " ✓" : ""}`}
                    variant={reportJobId === j.id ? "accent" : "secondary"}
                    size="sm"
                    fullWidth={false}
                    onPress={() => setReportJobId(j.id)}
                  />
                ))
              ) : defaultJobId ? (
                <Text style={styles.detailSub}>Job #{defaultJobId.slice(0, 8)}</Text>
              ) : (
                <Text style={styles.detailSub}>No completed jobs loaded — add the jobs list prop to pick a job.</Text>
              )}
              {jobs.length > 0 && reportJobId && !jobs.some((j) => j.id === reportJobId) ? (
                <Text style={styles.detailSub}>Using preselected job.</Text>
              ) : null}
            </View>
            <TextField colors={colors} label="One-line summary *" value={summary} onChangeText={setSummary} placeholder="e.g. Washer not draining again after repair" />
            <TextField colors={colors} label="Details" value={details} onChangeText={setDetails} placeholder="What the customer reported, and when" />
            <View style={styles.modalButtons}>
              <PrimaryButton colors={colors} label="Save comeback" loading={busy} onPress={saveReport} />
              <PrimaryButton colors={colors} label="Cancel" variant="secondary" onPress={() => setShowReport(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function labelOrDash(value: string | null | undefined): string {
  if (!value) return "—";
  return COMEBACK_SEVERITY_LABEL[value as keyof typeof COMEBACK_SEVERITY_LABEL] ?? value.replaceAll("_", " ");
}

const OPEN_ACTIONS: Record<string, Array<[string, string]>> = {
  REPORTED: [["triage", "Triage"]],
  UNDER_INVESTIGATION: [["classify", "Classify"], ["resolve", "Resolve"]],
  AWAITING_VERIFICATION: [["resolve", "Verify & resolve"]],
  MONITORING: [["close", "Close"]],
};

const DETAIL_ACTIONS: Record<string, Array<[string, string, string]>> = {
  REPORTED: [["triage", "Triage", "primary"]],
  SCHEDULED: [["investigating", "Start investigation", "accent"]],
  UNDER_INVESTIGATION: [["waiting-part", "Waiting on part", "secondary"], ["classify", "Classify", "secondary"], ["resolve", "Resolve", "accent"]],
  WAITING_FOR_PART: [["investigating", "Back to investigation", "accent"]],
  AWAITING_VERIFICATION: [["resolve", "Verify & resolve", "accent"]],
  MONITORING: [["close", "Close case", "primary"]],
  DISPUTED: [["reopen", "Reopen", "accent"]],
};

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, gap: spacing.md },
    headerRow: { flexDirection: "row", gap: spacing.sm },
    errorCard: { padding: spacing.md },
    errorText: { fontSize: 13, marginBottom: spacing.sm },
    row: { padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md },
    rowMain: { flex: 1, gap: 1 },
    rowLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    rowBadges: { flexDirection: "row", gap: spacing.xs },
    rowTitle: { fontSize: 15, fontFamily: fonts.semibold, color: colors.foreground, flexShrink: 1 },
    rowSub: { fontSize: 12, color: colors.mutedForeground },
    inlineActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
    pill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
    pillText: { fontSize: 11, fontFamily: fonts.semibold, textTransform: "capitalize" },
    modalWrap: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.45)" },
    modalCard: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    modalTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.foreground, marginBottom: spacing.xs },
    fieldLabel: { fontSize: 13, fontFamily: fonts.semibold, color: colors.mutedForeground },
    methodRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
    modalButtons: { gap: spacing.sm, marginTop: spacing.sm },
    detailWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
    detailCard: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: "88%", gap: spacing.sm },
    detailHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    detailBody: { gap: spacing.sm, paddingBottom: spacing.sm },
    detailTitle: { fontSize: 13, fontFamily: fonts.semibold, color: colors.mutedForeground, marginTop: spacing.xs },
    detailText: { fontSize: 14, color: colors.foreground },
    detailSub: { fontSize: 12, color: colors.mutedForeground },
    infoRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
    infoLabel: { fontSize: 13, color: colors.mutedForeground },
    infoValue: { fontSize: 13, fontFamily: fonts.semibold, color: colors.foreground, flexShrink: 1, textAlign: "right" },
    followupRow: { gap: 2, borderColor: colors.borderLight, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  });