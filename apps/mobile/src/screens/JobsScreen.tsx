import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { JobDTO } from "@nnact/shared";
import { formatMoney } from "@nnact/shared";
import { Chip, EmptyState, HeroBanner, LoadingScreen, SectionHeader } from "../components/ui";
import type { AppSearchFonts } from "@nnact/mobile-ui";
import { humanize } from "../hooks/useFieldData";
import { fonts, spacing, type Palette } from "../theme";

const STATUS_FILTERS = ["all", "scheduled", "in_progress", "completed", "cancelled"] as const;

export function JobsScreen({
  colors,
  jobs,
  loading,
  onOpenJob,
  onOpenSearch,
  searchPlaceholder,
  searchFonts,
}: {
  colors: Palette;
  jobs: JobDTO[];
  loading: boolean;
  onOpenJob: (jobId: string) => void;
  onOpenSearch?: () => void;
  searchPlaceholder?: string;
  searchFonts?: AppSearchFonts;
}) {
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const styles = createStyles(colors);

  const filtered = useMemo(() => {
    if (filter === "all") return jobs;
    return jobs.filter((job) => job.status === filter);
  }, [filter, jobs]);

  if (loading) return <LoadingScreen colors={colors} message="Loading jobs…" />;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <HeroBanner
        colors={colors}
        eyebrow="Jobs"
        title="Work orders"
        subtitle="All assigned and open service jobs for your organization."
        searchPlaceholder={searchPlaceholder}
        onSearchPress={onOpenSearch}
        searchFonts={searchFonts}
      />

      <View style={styles.filters}>
        {STATUS_FILTERS.map((status) => (
          <Chip
            key={status}
            colors={colors}
            label={status === "all" ? "All" : humanize(status)}
            selected={filter === status}
            onPress={() => setFilter(status)}
          />
        ))}
      </View>

      <View style={styles.section}>
        <SectionHeader colors={colors} title={`${filtered.length} job${filtered.length === 1 ? "" : "s"}`} />
        {filtered.length === 0 ? (
          <EmptyState colors={colors} icon="" title="No jobs found" description="Try a different status filter or pull to refresh on Today." />
        ) : (
          filtered.map((job) => (
            <TouchableOpacity
              key={job.id}
              style={styles.jobCard}
              activeOpacity={0.85}
              onPress={() => onOpenJob(job.id)}
            >
              <View style={styles.jobHeader}>
                <Text style={styles.jobTitle}>{job.title}</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>{humanize(job.status)}</Text>
                </View>
              </View>
              {job.description ? <Text style={styles.jobMeta}>{job.description}</Text> : null}
              <View style={styles.jobFooter}>
                <Text style={styles.jobAmount}>{formatMoney(job.total)}</Text>
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
    filters: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.sm },
    section: { paddingHorizontal: spacing.lg },
    jobCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    jobHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
    jobTitle: { color: colors.foreground, fontSize: 15, fontFamily: fonts.bold, flex: 1 },
    statusBadge: { backgroundColor: colors.primaryMuted, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    statusText: { color: colors.primary, fontSize: 10, fontFamily: fonts.bold, textTransform: "uppercase" },
    jobMeta: { color: colors.mutedForeground, fontSize: 12, marginTop: 6, fontFamily: fonts.regular },
    jobFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
    jobAmount: { color: colors.foreground, fontSize: 14, fontFamily: fonts.semibold },
  });
