import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NotificationDTO } from "@nnact/shared";
import { BackButton } from "@nnact/mobile-ui";
import type { StoredStaffSession } from "../auth-storage";
import { staffFetch } from "../auth-api";
import { EmptyState, HeroBanner, LoadingScreen, PrimaryButton, SectionHeader } from "../components/ui";
import type { AppSearchFonts } from "@nnact/mobile-ui";
import { fonts, spacing, type Palette } from "../theme";

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationsScreen({
  colors,
  session,
  onBack,
  onOpenJob,
  onOpenSearch,
  searchPlaceholder,
  searchFonts,
}: {
  colors: Palette;
  session: StoredStaffSession;
  onBack?: () => void;
  onOpenJob?: (jobId: string) => void;
  onOpenSearch?: () => void;
  searchPlaceholder?: string;
  searchFonts?: AppSearchFonts;
}) {
  const styles = createStyles(colors);
  const [rows, setRows] = useState<NotificationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await staffFetch<NotificationDTO[]>(session, "/api/notifications/all");
      setRows(list);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    await staffFetch(session, `/api/notifications/${id}/read`, { method: "PATCH" });
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, read: true } : row)));
  }

  async function markAllRead() {
    await staffFetch(session, "/api/notifications/read-all", { method: "POST" });
    setRows((prev) => prev.map((row) => ({ ...row, read: true })));
  }

  function openRow(row: NotificationDTO) {
    void markRead(row.id);
    const jobMatch = row.link?.match(/\/jobs\/([a-f0-9-]+)/i);
    if (jobMatch && onOpenJob) onOpenJob(jobMatch[1]);
  }

  if (loading) {
    return (
      <View style={styles.root}>
        {onBack ? (
          <View style={styles.topBar}>
            <BackButton colors={colors} onPress={onBack} variant="surface" />
          </View>
        ) : null}
        <LoadingScreen colors={colors} message="Loading notifications…" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.primary} />
      }
    >
      {onBack ? (
        <View style={styles.heroBackRow}>
          <BackButton colors={colors} onPress={onBack} variant="hero" />
        </View>
      ) : null}

      <HeroBanner
        colors={colors}
        eyebrow="Inbox"
        title="Notifications"
        subtitle="Live updates from dispatch, assignments, and job changes."
        searchPlaceholder={searchPlaceholder}
        onSearchPress={onOpenSearch}
        searchFonts={searchFonts}
      />

      <View style={styles.section}>
        {rows.some((row) => !row.read) ? (
          <PrimaryButton colors={colors} label="Mark all read" onPress={() => void markAllRead()} variant="ghost" size="sm" fullWidth={false} />
        ) : null}
      </View>

      <SectionHeader colors={colors} title={`${rows.length} message${rows.length === 1 ? "" : "s"}`} />
      <View style={styles.section}>
        {rows.length === 0 ? (
          <EmptyState colors={colors} icon="" title="No notifications" description="Assignments and dispatch updates appear here instantly." />
        ) : (
          rows.map((row) => (
            <TouchableOpacity
              key={row.id}
              style={[styles.card, !row.read && styles.cardUnread]}
              activeOpacity={0.85}
              onPress={() => openRow(row)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.title}>{row.title}</Text>
                {!row.read ? <View style={styles.dot} /> : null}
              </View>
              {row.body ? <Text style={styles.body}>{row.body}</Text> : null}
              <Text style={styles.meta}>{formatTimeAgo(row.createdAt)}</Text>
              {row.link ? (
                <View style={styles.linkRow}>
                  <Text style={styles.linkText}>Open</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </View>
              ) : null}
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1, backgroundColor: colors.background },
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
    section: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    cardUnread: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
    cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    title: { color: colors.foreground, fontSize: 15, fontFamily: fonts.bold, flex: 1 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
    body: { color: colors.mutedForeground, fontSize: 13, marginTop: 6, fontFamily: fonts.regular },
    meta: { color: colors.dimForeground, fontSize: 11, marginTop: spacing.sm, fontFamily: fonts.regular },
    linkRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
    linkText: { color: colors.primary, fontSize: 12, fontFamily: fonts.semibold },
  });
