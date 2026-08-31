import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { StoredStaffSession } from "../auth-storage";
import { EmptyState, ProgressBar, ScreenHeader } from "../components/ui";
import { listRepairBrainModels, type RepairBrainModel } from "../field-api";
import { fonts, radius, spacing, type Palette } from "../theme";

export function RepairBrainScreen({
  colors,
  session,
  onBack,
  onOpenModel,
}: {
  colors: Palette;
  session: StoredStaffSession;
  onBack: () => void;
  onOpenModel: (modelId: string) => void;
}) {
  const styles = createStyles(colors);
  const [models, setModels] = useState<RepairBrainModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (refresh?: boolean) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      try {
        const data = await listRepairBrainModels(session);
        setModels(data);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load repair brain");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = query.trim()
    ? models.filter((m) =>
        [m.manufacturer, m.brand, m.modelNumber, m.modelName, m.category]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(query.trim().toLowerCase())),
      )
    : models;

  const coverage = models.length ? Math.min(100, Math.round((models.filter((m) => Object.keys(m.specifications ?? {}).length > 0).length / models.length) * 100)) : 0;

  return (
    <View style={styles.root}>
      <ScreenHeader colors={colors} eyebrow="Repair Brain" title="Knowledge Base" subtitle="Models, procedures, parts, and test points for your fleet." onBack={onBack} />

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.dimForeground} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search models, makes, categories…"
          placeholderTextColor={colors.dimForeground}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.dimForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      {models.length > 0 ? (
        <View style={styles.coverageRow}>
          <ProgressBar colors={colors} progress={coverage} label="Knowledge coverage" />
        </View>
      ) : null}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.centerText}>Loading repair knowledge…</Text>
          </View>
        ) : error ? (
          <EmptyState colors={colors} icon="cloud-offline-outline" title="Couldn't load" description={error} />
        ) : filtered.length === 0 ? (
          <EmptyState
            colors={colors}
            icon="library-outline"
            title={query ? "No matching models" : "No models yet"}
            description={
              query
                ? "Try a different search term."
                : "Link equipment to a model from a diagnostic session to grow your knowledge base."
            }
          />
        ) : (
          filtered.map((m) => (
            <TouchableOpacity key={m.id} style={styles.card} activeOpacity={0.85} onPress={() => onOpenModel(m.id)}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <Ionicons name="hardware-chip-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>
                    {[m.manufacturer, m.modelNumber].filter(Boolean).join(" ")}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {[m.modelName, m.category].filter(Boolean).join(" · ") || "Uncategorized"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.dimForeground} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: spacing.md,
    },
    searchInput: { flex: 1, color: colors.foreground, fontSize: 14, fontFamily: fonts.regular, paddingVertical: 12 },
    coverageRow: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
    center: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xxl },
    centerText: { color: colors.mutedForeground, fontSize: 14, fontFamily: fonts.regular },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    flexOne: { flex: 1 },
    cardIconWrap: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: colors.primaryMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    cardTitle: { color: colors.foreground, fontSize: 15, fontFamily: fonts.bold },
    cardMeta: { color: colors.mutedForeground, fontSize: 12, marginTop: 3, fontFamily: fonts.regular },
  });
