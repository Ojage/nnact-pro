import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { BackButton } from "@nnact/mobile-ui";
import type { StoredStaffSession } from "../auth-storage";
import {
  createDiagnosticSession,
  fetchJobEquipment,
  listCustomerEquipment,
  listWorkflows,
  type DiagnosticWorkflow,
  type EquipmentRow,
} from "../field-api";
import { EmptyState, HeroBanner, LoadingScreen, PrimaryButton, SectionHeader } from "../components/ui";
import { fonts, spacing, type Palette } from "../theme";

export function StartDiagnosticScreen({
  colors,
  staffSession,
  jobId,
  jobTitle,
  customerId,
  defaultComplaint,
  onBack,
  onStarted,
}: {
  colors: Palette;
  staffSession: StoredStaffSession;
  jobId: string;
  jobTitle: string;
  customerId: string;
  defaultComplaint?: string | null;
  onBack: () => void;
  onStarted: (sessionId: string) => void;
}) {
  const styles = createStyles(colors);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [workflows, setWorkflows] = useState<DiagnosticWorkflow[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");

  useEffect(() => {
    void (async () => {
      try {
        const [jobLink, customerRows, workflowRows] = await Promise.all([
          fetchJobEquipment(staffSession, jobId),
          listCustomerEquipment(staffSession, customerId),
          listWorkflows(staffSession),
        ]);
        const rows = customerRows.length ? customerRows : jobLink ? [jobLink.equipment] : [];
        setEquipment(rows);
        setWorkflows(workflowRows.filter((row) => row.supportStatus === "validated" || row.supportStatus === "pilot"));
        if (jobLink) setSelectedEquipmentId(jobLink.equipment.id);
        else if (rows[0]) setSelectedEquipmentId(rows[0].id);
        const firstWorkflow = workflowRows.find((row) => row.supportStatus === "validated");
        if (firstWorkflow) setSelectedWorkflowId(firstWorkflow.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load equipment or workflows");
      } finally {
        setLoading(false);
      }
    })();
  }, [customerId, jobId, staffSession]);

  async function startSession() {
    if (!selectedEquipmentId || !selectedWorkflowId) {
      setError("Select equipment and a validated workflow.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const session = await createDiagnosticSession(staffSession, {
        jobId,
        equipmentId: selectedEquipmentId,
        workflowId: selectedWorkflowId,
        customerComplaint: defaultComplaint ?? undefined,
      });
      onStarted(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start diagnostic session");
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.topBar}>
          <BackButton colors={colors} onPress={onBack} variant="surface" />
        </View>
        <LoadingScreen colors={colors} message="Preparing diagnostic session…" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.heroBackRow}>
          <BackButton colors={colors} onPress={onBack} variant="hero" />
        </View>

        <HeroBanner colors={colors} eyebrow="Start diagnostic" title={jobTitle} subtitle="Link equipment and select a validated workflow." />

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <SectionHeader colors={colors} title="Equipment on site" />
        <View style={styles.section}>
          {equipment.length === 0 ? (
            <EmptyState
              colors={colors}
              icon=""
              title="No equipment linked"
              description="Add equipment to the customer record from the office, then return here."
            />
          ) : (
            equipment.map((row) => (
              <TouchableOpacity
                key={row.id}
                style={[styles.option, selectedEquipmentId === row.id && styles.optionActive]}
                onPress={() => setSelectedEquipmentId(row.id)}
                activeOpacity={0.85}
              >
                <Text style={styles.optionTitle}>
                  {[row.make, row.model].filter(Boolean).join(" ") || row.type}
                </Text>
                {row.serialNumber ? <Text style={styles.optionMeta}>S/N {row.serialNumber}</Text> : null}
              </TouchableOpacity>
            ))
          )}
        </View>

        <SectionHeader colors={colors} title="Validated workflow" />
        <View style={styles.section}>
          {workflows.length === 0 ? (
            <Text style={styles.muted}>No published workflows available.</Text>
          ) : (
            workflows.map((row) => (
              <TouchableOpacity
                key={row.id}
                style={[styles.option, selectedWorkflowId === row.id && styles.optionActive]}
                onPress={() => setSelectedWorkflowId(row.id)}
                activeOpacity={0.85}
              >
                <Text style={styles.optionTitle}>{row.name}</Text>
                <Text style={styles.optionMeta}>
                  {row.productType} · {row.supportStatus}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.section}>
          <PrimaryButton
            colors={colors}
            label="Start diagnostic session"
            onPress={() => void startSession()}
            loading={starting}
            disabled={!selectedEquipmentId || !selectedWorkflowId}
          />
        </View>
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
    errorBanner: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      backgroundColor: colors.dangerAlpha,
      borderRadius: 12,
      padding: spacing.md,
    },
    errorText: { color: colors.danger, fontSize: 13, fontFamily: fonts.medium },
    section: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    muted: { color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.regular },
    option: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    optionActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
    optionTitle: { color: colors.foreground, fontSize: 15, fontFamily: fonts.bold },
    optionMeta: { color: colors.mutedForeground, fontSize: 12, marginTop: 4, fontFamily: fonts.regular },
  });
