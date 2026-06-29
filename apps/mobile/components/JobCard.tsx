import { View, Text, StyleSheet } from "react-native";
import type { JobDTO } from "@ofp/shared";
import { formatMoney } from "@ofp/shared";

const badgeColors: Record<string, { bg: string; fg: string }> = {
  lead: { bg: "#1a2340", fg: "#6b7aa8" },
  scheduled: { bg: "rgba(122,184,255,0.12)", fg: "#7ab8ff" },
  in_progress: { bg: "rgba(224,179,79,0.12)", fg: "#e0b34f" },
  completed: { bg: "rgba(134,226,154,0.12)", fg: "#86e29a" },
  canceled: { bg: "rgba(255,128,128,0.12)", fg: "#ff8080" },
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
    backgroundColor: "#141b33",
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
    fontWeight: "600",
    textTransform: "capitalize",
  },
  title: {
    color: "#e6e9f0",
    fontSize: 15,
    fontWeight: "500",
  },
  amount: {
    color: "#8a97c2",
    fontSize: 15,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});
