import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EmptyState, HeroBanner, LoadingScreen, SegmentedTabs } from "../components/ui";
import type { AppSearchFonts } from "@nnact/mobile-ui";
import type { DiagnosticListItem } from "../hooks/useFieldData";
import { humanize, statusColor } from "../hooks/useFieldData";
import { fonts, spacing, type Palette } from "../theme";

export function DiagnosticsScreen({
  colors,
  diagnostics,
  loading,
  onOpenSession,
  onOpenSearch,
  searchPlaceholder,
  searchFonts,
}: {
  colors: Palette;
  diagnostics: DiagnosticListItem[];
  loading: boolean;
  onOpenSession: (sessionId: string) => void;
  onOpenSearch?: () => void;
  searchPlaceholder?: string;
  searchFonts?: AppSearchFonts;
}) {
  const [tab, setTab] = useState<"active" | "all">("active");
  const styles = createStyles(colors);

  const active = useMemo(
    () =>
      diagnostics.filter((item) =>
        ["identification_required", "workflow_ready", "testing", "blocked", "escalated"].includes(item.session.status),
      ),
    [diagnostics],
  );

  const rows = tab === "active" ? active : diagnostics;

  if (loading) return <LoadingScreen colors={colors} message="Loading diagnostic sessions…" />;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <HeroBanner
        colors={colors}
        eyebrow="Repair Brain"
        title="Diagnostics"
        subtitle="Validated workflows, measurements, and escalation paths for every appliance."
        searchPlaceholder={searchPlaceholder}
        onSearchPress={onOpenSearch}
        searchFonts={searchFonts}
      />

      <SegmentedTabs
        colors={colors}
        tabs={[
          { id: "active", label: `Active (${active.length})` },
          { id: "all", label: `All (${diagnostics.length})` },
        ]}
        active={tab}
        onChange={(id) => setTab(id as "active" | "all")}
      />

      <View style={styles.section}>
        {rows.length === 0 ? (
          <EmptyState
            colors={colors}
            icon=""
            title={tab === "active" ? "No active sessions" : "No diagnostic sessions"}
            description="Sessions appear after a work order is linked to the exact appliance."
          />
        ) : (
          rows.map((item) => (
            <TouchableOpacity
              key={item.session.id}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => onOpenSession(item.session.id)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.flexOne}>
                  <Text style={styles.title}>
                    {[item.equipment.make, item.equipment.model].filter(Boolean).join(" ") || item.equipment.type}
                  </Text>
                  <Text style={styles.meta}>{item.workflow?.name ?? "Unsupported / unresolved"}</Text>
                </View>
                <Text style={[styles.status, { color: statusColor(item.session.status, colors) }]}>
                  {humanize(item.session.status)}
                </Text>
              </View>
              {item.equipment.serialNumber ? (
                <Text style={styles.serial}>S/N {item.equipment.serialNumber}</Text>
              ) : null}
              <Text style={styles.complaint} numberOfLines={3}>
                {item.session.customerComplaint || "Complaint not recorded"}
              </Text>
              <View style={styles.cardFooter}>
                <Text style={styles.openHint}>Open workflow</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.dimForeground} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.lg },
    section: { paddingHorizontal: spacing.lg },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    flexOne: { flex: 1 },
    title: { color: colors.foreground, fontSize: 15, fontFamily: fonts.bold },
    meta: { color: colors.mutedForeground, fontSize: 12, marginTop: 3, fontFamily: fonts.regular },
    status: { fontSize: 10, fontFamily: fonts.extraBold, textTransform: "uppercase" },
    serial: { color: colors.dimForeground, fontSize: 11, marginTop: spacing.sm, fontFamily: fonts.medium },
    complaint: { color: colors.mutedForeground, fontSize: 12, lineHeight: 17, marginTop: spacing.sm, fontFamily: fonts.regular },
    cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
    openHint: { color: colors.primary, fontSize: 12, fontFamily: fonts.semibold },
  });
