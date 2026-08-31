import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { StoredStaffSession } from "../auth-storage";
import { EmptyState, ScreenHeader } from "../components/ui";
import { searchRepairBrain, type RepairBrainSearchResults } from "../field-api";
import { fonts, radius, spacing, type Palette } from "../theme";

export function RepairBrainSearchScreen({
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RepairBrainSearchResults | null>(null);
  const [searching, setSearching] = useState(false);

  const runSearch = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setResults(null);
        return;
      }
      setSearching(true);
      try {
        setResults(await searchRepairBrain(session, q));
      } catch {
        setResults({
          models: [],
          faults: [],
          parts: [],
          procedures: [],
          documents: [],
          repairHistory: [],
        });
      } finally {
        setSearching(false);
      }
    },
    [session],
  );

  useEffect(() => {
    const t = setTimeout(() => void runSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const openModel = (modelId?: string | null) => {
    if (modelId) onOpenModel(modelId);
  };

  return (
    <View style={styles.root}>
      <ScreenHeader colors={colors} eyebrow="Repair Brain" title="Search" onBack={onBack} />
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.dimForeground} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Fault, model, part, procedure…"
          placeholderTextColor={colors.dimForeground}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {!query.trim() ? (
          <EmptyState colors={colors} icon="search-outline" title="Search the knowledge base" description="Find models, known faults, parts, procedures, documents, and past repairs." />
        ) : !results ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {results.models.length ? (
              <Group colors={colors} title={`Models (${results.models.length})`}>
                {results.models.map((m) => (
                  <TouchableOpacity key={m.id} style={styles.rowCard} activeOpacity={0.85} onPress={() => openModel(m.id)}>
                    <Ionicons name="hardware-chip-outline" size={18} color={colors.primary} />
                    <View style={styles.flexOne}>
                      <Text style={styles.rowTitle}>{[m.manufacturer, m.modelNumber].filter(Boolean).join(" ")}</Text>
                      <Text style={styles.rowMeta}>{m.category}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.dimForeground} />
                  </TouchableOpacity>
                ))}
              </Group>
            ) : null}

            {results.faults.length ? (
              <Group colors={colors} title={`Faults (${results.faults.length})`}>
                {results.faults.map((f) => (
                  <TouchableOpacity key={f.id} style={styles.rowCard} activeOpacity={0.85} onPress={() => openModel(f.equipmentModelId)}>
                    <Ionicons name="warning-outline" size={18} color={colors.warning} />
                    <View style={styles.flexOne}>
                      <Text style={styles.rowTitle}>{f.title}</Text>
                      {f.faultCode ? <Text style={styles.rowMeta}>Code {f.faultCode}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.dimForeground} />
                  </TouchableOpacity>
                ))}
              </Group>
            ) : null}

            {results.parts.length ? (
              <Group colors={colors} title={`Parts (${results.parts.length})`}>
                {results.parts.map((p) => (
                  <TouchableOpacity key={p.id} style={styles.rowCard} activeOpacity={0.85} onPress={() => openModel(p.equipmentModelId)}>
                    <Ionicons name="cube-outline" size={18} color={colors.primary} />
                    <View style={styles.flexOne}>
                      <Text style={styles.rowTitle}>{p.partName}</Text>
                      {p.oemPartNumber ? <Text style={styles.rowMeta}>OEM {p.oemPartNumber}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.dimForeground} />
                  </TouchableOpacity>
                ))}
              </Group>
            ) : null}

            {results.procedures.length ? (
              <Group colors={colors} title={`Procedures (${results.procedures.length})`}>
                {results.procedures.map((p) => (
                  <TouchableOpacity key={p.id} style={styles.rowCard} activeOpacity={0.85} onPress={() => openModel(p.equipmentModelId)}>
                    <Ionicons name="list-outline" size={18} color={colors.primary} />
                    <View style={styles.flexOne}>
                      <Text style={styles.rowTitle}>{p.title}</Text>
                      <Text style={styles.rowMeta}>{p.type}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.dimForeground} />
                  </TouchableOpacity>
                ))}
              </Group>
            ) : null}

            {results.documents.length ? (
              <Group colors={colors} title={`Documents (${results.documents.length})`}>
                {results.documents.map((d) => (
                  <TouchableOpacity key={d.id} style={styles.rowCard} activeOpacity={0.85} onPress={() => openModel(d.equipmentModelId)}>
                    <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                    <View style={styles.flexOne}>
                      <Text style={styles.rowTitle}>{d.title}</Text>
                      <Text style={styles.rowMeta}>{d.documentType.replaceAll("_", " ")}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.dimForeground} />
                  </TouchableOpacity>
                ))}
              </Group>
            ) : null}

            {results.repairHistory.length ? (
              <Group colors={colors} title={`Past repairs (${results.repairHistory.length})`}>
                {results.repairHistory.map((r) => (
                  <TouchableOpacity key={r.id} style={styles.rowCard} activeOpacity={0.85} onPress={() => openModel(r.equipmentModelId)}>
                    <Ionicons name="checkmark-done-outline" size={18} color={colors.success} />
                    <View style={styles.flexOne}>
                      <Text style={styles.rowTitle}>{r.outcome.replaceAll("_", " ")}</Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>{r.conclusion}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.dimForeground} />
                  </TouchableOpacity>
                ))}
              </Group>
            ) : null}

            {!results.models.length &&
            !results.faults.length &&
            !results.parts.length &&
            !results.procedures.length &&
            !results.documents.length &&
            !results.repairHistory.length ? (
              <EmptyState colors={colors} icon="search-outline" title="No results" description={`Nothing found for “${query}”. Try a different term.`} />
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Group({ colors, title, children }: { colors: Palette; title: string; children: React.ReactNode }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {children}
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
    center: { alignItems: "center", paddingVertical: spacing.xxl },
    group: { marginBottom: spacing.lg },
    groupTitle: { color: colors.foreground, fontSize: 15, fontFamily: fonts.bold, marginBottom: spacing.sm },
    rowCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    flexOne: { flex: 1 },
    rowTitle: { color: colors.foreground, fontSize: 14, fontFamily: fonts.semibold },
    rowMeta: { color: colors.dimForeground, fontSize: 11, marginTop: 2, fontFamily: fonts.regular },
  });
