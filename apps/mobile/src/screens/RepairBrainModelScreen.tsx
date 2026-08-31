import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { StoredStaffSession } from "../auth-storage";
import { StatCard, ScreenHeader, SectionHeader, EmptyState } from "../components/ui";
import { getRepairBrainModelProfile, type RepairBrainModelProfile } from "../field-api";
import { fonts, spacing, type Palette } from "../theme";

type Section = "overview" | "procedures" | "faults" | "parts" | "testpoints";

export function RepairBrainModelScreen({
  colors,
  session,
  modelId,
  onBack,
}: {
  colors: Palette;
  session: StoredStaffSession;
  modelId: string;
  onBack: () => void;
}) {
  const styles = createStyles(colors);
  const [profile, setProfile] = useState<RepairBrainModelProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("overview");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProfile(await getRepairBrainModelProfile(session, modelId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load model");
    } finally {
      setLoading(false);
    }
  }, [session, modelId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.centerText}>Loading model…</Text>
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={styles.root}>
        <ScreenHeader colors={colors} eyebrow="Repair Brain" title="Model" onBack={onBack} />
        <EmptyState colors={colors} icon="alert-circle-outline" title="Couldn't load" description={error ?? "Unknown error"} />
      </View>
    );
  }

  const { model, faults, repairProcedures, parts, testPoints, documents, diagnosticWorkflows, repairStats, instanceCount } = profile;
  const modelTitle = [model.manufacturer, model.modelNumber].filter(Boolean).join(" ") || "Model";

  const SECTIONS: { id: Section; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "faults", label: `Faults (${faults.length})` },
    { id: "procedures", label: `Procedures (${repairProcedures.length})` },
    { id: "parts", label: `Parts (${parts.length})` },
    { id: "testpoints", label: `Test Points (${testPoints.length})` },
  ];

  return (
    <View style={styles.root}>
      <ScreenHeader colors={colors} eyebrow="Repair Brain" title={modelTitle} subtitle={model.modelName ?? model.category} onBack={onBack} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsRow}>
        {SECTIONS.map((s) => (
          <TouchableOpacity
            key={s.id}
            onPress={() => setSection(s.id)}
            style={[styles.tab, section === s.id && styles.tabActive]}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, section === s.id && styles.tabTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {section === "overview" ? (
          <>
            <View style={styles.statsRow}>
              <StatCard colors={colors} label="Total repairs" value={String(repairStats.totalRepairs)} hint={`${instanceCount} linked units`} />
              <StatCard colors={colors} label="Success rate" value={`${repairStats.totalRepairs ? Math.round((repairStats.successfulRepairs / repairStats.totalRepairs) * 100) : 0}%`} accent="success" hint={`${repairStats.successfulRepairs} resolved`} />
              <StatCard colors={colors} label="Avg labor" value={`${repairStats.averageLaborMinutes}m`} hint="per repair" />
            </View>

            {documents.length > 0 ? (
              <>
                <SectionHeader colors={colors} title="Documents" />
                {documents.map((d) => (
                  <View key={d.id} style={styles.rowCard}>
                    <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                    <Text style={styles.rowText}>{d.title}</Text>
                  </View>
                ))}
              </>
            ) : null}

            {diagnosticWorkflows.length > 0 ? (
              <>
                <SectionHeader colors={colors} title="Diagnostic workflows" />
                {diagnosticWorkflows.map((w) => (
                  <View key={w.id} style={styles.rowCard}>
                    <Ionicons name="git-branch-outline" size={18} color={colors.primary} />
                    <Text style={styles.rowText}>{w.name}</Text>
                  </View>
                ))}
              </>
            ) : null}

            {Object.keys(model.specifications ?? {}).length > 0 ? (
              <>
                <SectionHeader colors={colors} title="Specifications" />
                <View style={styles.card}>
                  {Object.entries(model.specifications).map(([k, v]) => (
                    <View key={k} style={styles.specRow}>
                      <Text style={styles.specKey}>{k}</Text>
                      <Text style={styles.specValue}>{String(v)}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {faults.length === 0 && documents.length === 0 && diagnosticWorkflows.length === 0 && Object.keys(model.specifications ?? {}).length === 0 ? (
              <EmptyState colors={colors} icon="information-circle-outline" title="No knowledge yet" description="Repair data will appear here as this model is diagnosed and repaired." />
            ) : null}
          </>
        ) : null}

        {section === "faults" ? (
          faults.length === 0 ? (
            <EmptyState colors={colors} icon="warning-outline" title="No known faults" description="Failure modes will appear as field data is collected." />
          ) : (
            faults.map((f) => (
              <View key={f.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{f.title}</Text>
                  {f.faultCode ? <Text style={styles.code}>{f.faultCode}</Text> : null}
                </View>
                {f.description ? <Text style={styles.cardDesc}>{f.description}</Text> : null}
                {f.probableCauses?.length ? (
                  <View style={styles.causes}>
                    {f.probableCauses.map((c, i) => (
                      <Text key={i} style={styles.cause}>• {c}</Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ))
          )
        ) : null}

        {section === "procedures" ? (
          repairProcedures.length === 0 ? (
            <EmptyState colors={colors} icon="list-outline" title="No procedures yet" description="Approved repair procedures will appear here." />
          ) : (
            repairProcedures.map((p) => (
              <View key={p.id} style={styles.card}>
                <Text style={styles.cardTitle}>{p.title}</Text>
                {p.description ? <Text style={styles.cardDesc}>{p.description}</Text> : null}
                {p.requiredTools?.length ? (
                  <Text style={styles.meta}>Tools: {p.requiredTools.join(", ")}</Text>
                ) : null}
                {p.steps?.length ? (
                  <View style={styles.steps}>
                    {p.steps.map((s) => (
                      <View key={s.sequence} style={styles.stepRow}>
                        <View style={styles.stepNum}>
                          <Text style={styles.stepNumText}>{s.sequence}</Text>
                        </View>
                        <Text style={styles.stepText}>{s.instruction}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ))
          )
        ) : null}

        {section === "parts" ? (
          parts.length === 0 ? (
            <EmptyState colors={colors} icon="cube-outline" title="No parts listed" description="Common parts and OEM numbers will appear here." />
          ) : (
            parts.map((p) => (
              <View key={p.id} style={styles.rowCard}>
                <View style={styles.flexOne}>
                  <Text style={styles.rowTitle}>{p.partName}</Text>
                  {p.oemPartNumber ? <Text style={styles.rowMeta}>OEM {p.oemPartNumber}</Text> : null}
                </View>
                {p.lastKnownPriceCents ? (
                  <Text style={styles.price}>${(p.lastKnownPriceCents / 100).toFixed(2)}</Text>
                ) : null}
              </View>
            ))
          )
        ) : null}

        {section === "testpoints" ? (
          testPoints.length === 0 ? (
            <EmptyState colors={colors} icon="analytics-outline" title="No test points" description="Voltage, resistance, and continuity points will appear here." />
          ) : (
            testPoints.map((t) => (
              <View key={t.id} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {[t.component, t.description].filter(Boolean).join(" — ") || "Test point"}
                </Text>
                {t.expectedMin || t.expectedMax ? (
                  <Text style={styles.meta}>
                    Expected {t.expectedMin ?? "?"} – {t.expectedMax ?? "?"} {t.unit ?? ""}
                  </Text>
                ) : null}
              </View>
            ))
          )
        ) : null}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: "center", justifyContent: "center", gap: spacing.md },
    centerText: { color: colors.mutedForeground, fontSize: 14, fontFamily: fonts.regular },
    tabsScroll: { flexGrow: 0 },
    tabsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
    tab: { paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: 24, backgroundColor: colors.surfaceMuted, marginRight: spacing.sm },
    tabActive: { backgroundColor: colors.primary },
    tabText: { color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.semibold },
    tabTextActive: { color: colors.onEmphasis },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
    statsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
    card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, marginBottom: spacing.sm },
    rowCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, marginBottom: spacing.sm },
    rowTitle: { color: colors.foreground, fontSize: 14, fontFamily: fonts.semibold },
    rowMeta: { color: colors.dimForeground, fontSize: 11, marginTop: 2, fontFamily: fonts.regular },
    rowText: { color: colors.foreground, fontSize: 14, fontFamily: fonts.regular, flexShrink: 1 },
    flexOne: { flex: 1 },
    cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    cardTitle: { color: colors.foreground, fontSize: 15, fontFamily: fonts.bold },
    cardDesc: { color: colors.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: spacing.sm, fontFamily: fonts.regular },
    code: { color: colors.primary, fontSize: 12, fontFamily: fonts.semibold },
    causes: { marginTop: spacing.sm, gap: 3 },
    cause: { color: colors.mutedForeground, fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
    meta: { color: colors.mutedForeground, fontSize: 12, marginTop: spacing.sm, fontFamily: fonts.regular },
    steps: { marginTop: spacing.md, gap: spacing.sm },
    stepRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
    stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primaryMuted, alignItems: "center", justifyContent: "center" },
    stepNumText: { color: colors.primary, fontSize: 11, fontFamily: fonts.bold },
    stepText: { flex: 1, color: colors.mutedForeground, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },
    specRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
    specKey: { color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.medium, flex: 1 },
    specValue: { color: colors.foreground, fontSize: 13, fontFamily: fonts.regular, textAlign: "right" },
    price: { color: colors.success, fontSize: 14, fontFamily: fonts.bold },
  });
