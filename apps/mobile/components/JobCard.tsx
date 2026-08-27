import { View, Text, StyleSheet } from "react-native";
import type { JobDTO } from "@nnact/shared";
import { formatMoney } from "@nnact/shared";
import { colors, fonts } from "../src/theme";

const badgeColors: Record<string, { bg: string; fg: string }> = {
  lead: { bg: colors.borderAlpha, fg: colors.dimForeground },
  scheduled: { bg: colors.primaryAlpha, fg: colors.focus },
  in_progress: { bg: colors.warningAlpha, fg: colors.warning },
  completed: { bg: colors.successAlpha, fg: colors.success },
  canceled: { bg: colors.dangerAlpha, fg: colors.danger },
};

export function JobCard({ job }: { job: JobDTO }) {
  const colors = badgeColors[job.status] ?? badgeColors.lead;

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <View style={[styles.badge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.badgeText, { color: colors.fg }]}>
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

const styles = StyleSheet.create({
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
