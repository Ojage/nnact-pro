import { View, Text, StyleSheet } from "react-native";
import { colors, fonts } from "../src/theme";

export function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={[styles.card, color ? { borderLeftColor: color } : undefined]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, color ? { color } : undefined]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 120,
    marginRight: 10,
  },
  label: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontFamily: fonts.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  value: {
    color: colors.foreground,
    fontSize: 20,
    fontFamily: fonts.bold,
  },
});
