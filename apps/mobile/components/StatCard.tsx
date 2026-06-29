import { View, Text, StyleSheet } from "react-native";

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
    backgroundColor: "#141b33",
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#2a3355",
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 120,
    marginRight: 10,
  },
  label: {
    color: "#8a97c2",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  value: {
    color: "#e6e9f0",
    fontSize: 20,
    fontWeight: "700",
  },
});
