import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { JobDTO } from "@nnact/shared";
import { formatMoney } from "@nnact/shared";
import { Chip, EmptyState, HeroBanner, LoadingScreen, SectionHeader } from "../components/ui";
import type { AppSearchFonts } from "@nnact/mobile-ui";
import { humanize, jobStatusTone, jobStatusToneBg } from "../hooks/useFieldData";
import { fonts, spacing, type Palette } from "../theme";

const HERO_IMAGE = require("../../assets/photos/hero-ac-smiles.png");

const STATUS_FILTERS = ["all", "scheduled", "in_progress", "completed", "canceled"] as const;

function scheduledLabel(job: JobDTO): string | null {
  if (!job.scheduledAt) return null;
  const date = new Date(job.scheduledAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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

  const counts = useMemo(() => {
    const result = {} as Record<(typeof STATUS_FILTERS)[number], number>;
    for (const key of STATUS_FILTERS) result[key] = 0;
    for (const job of jobs) {
      const key = job.status as (typeof STATUS_FILTERS)[number];
      if (job.status in result) result[key] += 1;
    }
    result.all = jobs.length;
    return result;
  }, [jobs]);

  if (loading) return <LoadingScreen colors={colors} message="Loading jobs…" />;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <HeroBanner
        colors={colors}
        eyebrow="Jobs"
        title="Work orders"
        subtitle="All service jobs for your organization, with their work order numbers."
        photo={HERO_IMAGE}
        searchPlaceholder={searchPlaceholder}
        onSearchPress={onOpenSearch}
        searchFonts={searchFonts}
      />

      <View style={styles.filters}>
        {STATUS_FILTERS.map((status) => (
          <Chip
            key={status}
            colors={colors}
            label={status === "all" ? `All (${counts.all})` : `${humanize(status)} (${counts[status]})`}
            selected={filter === status}
            onPress={() => setFilter(status)}
          />
        ))}
      </View>

      <View style={styles.section}>
        <SectionHeader colors={colors} title={`${filtered.length} job${filtered.length === 1 ? "" : "s"}`} />
        {filtered.length === 0 ? (
          <EmptyState
            colors={colors}
            icon=""
            title="No jobs found"
            description="Try a different status filter or pull to refresh on Today."
          />
        ) : (
          filtered.map((job) => (
            <TouchableOpacity
              key={job.id}
              style={styles.jobCard}
              activeOpacity={0.85}
              onPress={() => onOpenJob(job.id)}
            >
              <View style={styles.jobHeader}>
                <View style={styles.titleWrap}>
                  {job.number ? <Text style={styles.jobNumber}>{job.number}</Text> : null}
                  <Text style={styles.jobTitle}>{job.title}</Text>
                </View>
                <View
                  style={[styles.statusBadge, { backgroundColor: jobStatusToneBg(job.status, colors) }]}
                >
                  <Text style={[styles.statusText, { color: jobStatusTone(job.status, colors) }]}>
                    {humanize(job.status)}
                  </Text>
                </View>
              </View>
              {job.description ? (
                <Text style={styles.jobMeta} numberOfLines={2}>
                  {job.description}
                </Text>
              ) : null}
              <View style={styles.jobFooter}>
                {scheduledLabel(job) ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={14} color={colors.dimForeground} />
                    <Text style={styles.jobMetaText} numberOfLines={1}>
                      {scheduledLabel(job)}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.jobMetaText}>Not scheduled</Text>
                )}
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
    titleWrap: { flex: 1, minWidth: 0 },
    jobNumber: {
      color: colors.dimForeground,
      fontSize: 11,
      fontFamily: fonts.bold,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: 2,
    },
    jobTitle: { color: colors.foreground, fontSize: 16, fontFamily: fonts.bold },
    statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    statusText: { fontSize: 10, fontFamily: fonts.bold, textTransform: "uppercase", letterSpacing: 0.4 },
    jobMeta: { color: colors.mutedForeground, fontSize: 13, lineHeight: 18, marginTop: 6, fontFamily: fonts.regular },
    jobFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 10,
      gap: spacing.sm,
    },
    metaItem: { flexDirection: "row", alignItems: "center", gap: 5, flex: 1, minWidth: 0 },
    jobMetaText: { color: colors.dimForeground, fontSize: 12, fontFamily: fonts.regular, flexShrink: 1 },
    jobAmount: { color: colors.foreground, fontSize: 14, fontFamily: fonts.semibold },
  });