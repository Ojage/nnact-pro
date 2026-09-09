import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, spacing, type Palette } from "../../theme";

const ITEMS = [
  {
    icon: "cloud-offline-outline" as const,
    title: "Offline ready",
    description: "Work without signal.",
  },
  {
    icon: "sync-outline" as const,
    title: "Auto-sync",
    description: "Syncs when back online.",
  },
  {
    icon: "shield-checkmark-outline" as const,
    title: "Secure",
    description: "Data stays protected.",
  },
];

export function OperationalTrustStrip({ colors }: { colors: Palette }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.wrap}>
      {ITEMS.map((item, index) => (
        <View
          key={item.title}
          style={[styles.item, index > 0 && styles.itemDivider]}
          accessible
          accessibilityLabel={`${item.title}. ${item.description}`}
        >
          <Ionicons name={item.icon} size={20} color={colors.brandOrange} />
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.desc}>{item.description}</Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      flexDirection: "row",
      borderWidth: 1,
      borderColor: colors.borderLight,
      backgroundColor: colors.surface,
      borderRadius: 16,
      overflow: "hidden",
    },
    item: {
      flex: 1,
      alignItems: "center",
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.md,
      gap: 2,
    },
    itemDivider: {
      borderLeftWidth: 1,
      borderLeftColor: colors.borderLight,
    },
    title: {
      color: colors.foreground,
      fontSize: 12.5,
      fontFamily: fonts.bold,
      marginTop: 4,
      textAlign: "center",
    },
    desc: {
      color: colors.mutedForeground,
      fontSize: 10.5,
      fontFamily: fonts.regular,
      textAlign: "center",
      marginTop: 1,
    },
  });