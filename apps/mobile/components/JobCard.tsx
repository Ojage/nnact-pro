import { View, Text, StyleSheet } from "react-native";
import { useMemo } from "react";
import type { JobDTO } from "@nnact/shared";
import { formatMoney } from "@nnact/shared";
import { useTheme, fonts, type Palette } from "../src/theme";

const badgeFor = (
  colors: Palette,
  status: string
): { bg: string; fg: string } => {
  switch (status) {
    case "scheduled":
      return { bg: colors.primaryAlpha, fg: colors.focus };
    case "in_progress":
      return { bg: colors.warningAlpha, fg: colors.warning };
    case "completed":
      return { bg: colors.successAlpha, fg: colors.success };
    case "canceled":
      return { bg: colors.dangerAlpha, fg: colors.danger };
    default:
      return { bg: colors.borderAlpha, fg: colors.dimForeground };
  }
};

export function JobCard({ job }: { job: JobDTO }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const badge = badgeFor(colors, job.status);

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.fg }]}>
            {job.status.replace("_", " ")}
          </Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {job.title}
        </Text>
      </View>
      <Text style={styles.amount}>{formatMoney(job.total)}</Text>
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 10,
      paddingVertical: 14,
      paddingHorizontal: 14,
      marginBottom: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    left: {
      flex: 1,
      marginRight: 12,
    },
    badge: {
      alignSelf: "flex-start",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
      marginBottom: 6,
    },
    badgeText: {
      fontSize: 11,
      fontFamily: fonts.semibold,
      textTransform: "capitalize",
    },
    title: {
      color: colors.foreground,
      fontSize: 15,
      fontFamily: fonts.medium,
    },
    amount: {
      color: colors.mutedForeground,
      fontSize: 15,
      fontFamily: fonts.semibold,
      fontVariant: ["tabular-nums"],
    },
  });