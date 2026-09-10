import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { StoredStaffSession } from "../auth-storage";
import { Chip, EmptyState, HeroBanner, ProgressBar, StatCard } from "../components/ui";
import { listRepairBrainModels, type RepairBrainModel } from "../field-api";
import { fonts, radius, spacing, type Palette } from "../theme";

const REPAIR_BRAIN_IMAGE = require("../../assets/photos/repair-brain.png");

const ALL = "all";

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
  const [category, setCategory] = useState<string>(ALL);
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

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of models) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [models]);

  const makes = useMemo(
    () => new Set(models.map((m) => m.manufacturer).filter(Boolean)).size,
    [models],
  );

  const documented = useMemo(
    () => models.filter((m) => Object.keys(m.specifications ?? {}).length > 0).length,
    [models],
  );

  const coverage = models.length ? Math.round((documented / models.length) * 100) : 0;

  const filtered = useMemo(() => {
    let list = models;
    if (category !== ALL) list = list.filter((m) => m.category === category);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((m) =>
        [m.manufacturer, m.brand, m.modelNumber, m.modelName, m.category]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return [...list].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [models, category, query]);

  return (
    <View style={styles.root}>
      <HeroBanner
        colors={colors}
        eyebrow="Repair Brain"
        title="Knowledge Base"
        subtitle="Models, procedures, parts, and test points for your fleet."
        photo={REPAIR_BRAIN_IMAGE}
        back={{ onPress: onBack }}
      />

      {models.length > 0 ? (
        <View style={styles.statsRow}>
          <StatCard colors={colors} label="Models" value={String(models.length)} />
          <StatCard colors={colors} label="Makes" value={String(makes)} />
          <StatCard colors={colors} label="Categories" value={String(categories.length)} />
        </View>
      ) : null}

      {models.length > 0 ? (
        <View style={styles.coverageRow}>
          <ProgressBar
            colors={colors}
            progress={coverage}
            label={`Knowledge coverage · ${documented} of ${models.length} documented`}
          />
        </View>
      ) : null}

      <View style={styles.categoryRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryContent}
        >
          <Chip
            colors={colors}
            label={`All (${models.length})`}
            selected={category === ALL}
            onPress={() => setCategory(ALL)}
          />
          {categories.map(([name, count]) => (
            <Chip
              key={name}
              colors={colors}
              label={`${name} (${count})`}
              selected={category === name}
              onPress={() => setCategory(name)}
            />
          ))}
        </ScrollView>
      </View>

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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />
        }
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.centerText}>Loading repair knowledge…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <EmptyState colors={colors} icon="cloud-offline-outline" title="Couldn't load" description={error} />
          </View>
        ) : filtered.length === 0 ? (
          <EmptyState
            colors={colors}
            icon={query || category !== ALL ? "search-outline" : "library-outline"}
            title={
              query || category !== ALL
                ? "No matching models"
                : "Knowledge base is empty"
            }
            description={
              query || category !== ALL
                ? "Try a different search term or category."
                : "Link equipment to a model from a diagnostic session to grow your knowledge base."
            }
          />
        ) : (
          <>
            <Text style={styles.resultCount}>
              {filtered.length} model{filtered.length === 1 ? "" : "s"}
              {category !== ALL ? ` in ${category}` : ""}
            </Text>
            {filtered.map((m) => {
              const specCount = Object.keys(m.specifications ?? {}).length;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={styles.card}
                  activeOpacity={0.85}
                  onPress={() => onOpenModel(m.id)}
                >
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
                  <View style={styles.cardFooter}>
                    <View style={[styles.specBadge, specCount === 0 && styles.specBadgeMuted]}>
                      <Ionicons
                        name={specCount === 0 ? "create-outline" : "document-text-outline"}
                        size={12}
                        color={specCount === 0 ? colors.dimForeground : colors.primary}
                      />
                      <Text style={[styles.specBadgeText, specCount === 0 && { color: colors.dimForeground }]}>
                        {specCount === 0 ? "Not documented" : `${specCount} spec${specCount === 1 ? "" : "s"}`}
                      </Text>
                    </View>
                    <Text style={styles.cardUpdated}>
                      Updated {new Date(m.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
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
    statsRow: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      marginTop: -spacing.md,
      marginBottom: spacing.md,
    },
    coverageRow: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    categoryRow: { marginBottom: spacing.sm },
    categoryContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
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
    center: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl },
    centerText: { color: colors.mutedForeground, fontSize: 14, fontFamily: fonts.regular },
    resultCount: {
      color: colors.dimForeground,
      fontSize: 12,
      fontFamily: fonts.medium,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
    },
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
    cardFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 10,
      gap: spacing.sm,
    },
    specBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.primaryAlpha,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    specBadgeMuted: { backgroundColor: colors.surfaceMuted },
    specBadgeText: { color: colors.primary, fontSize: 11, fontFamily: fonts.bold },
    cardUpdated: { color: colors.dimForeground, fontSize: 11, fontFamily: fonts.regular },
  });