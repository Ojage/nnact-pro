import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, radius, spacing, type Palette } from "../../theme";

const CAPABILITIES = [
  {
    icon: "navigate-outline" as const,
    title: "Today's route",
    description: "Appointments & job status at a glance.",
  },
  {
    icon: "pulse-outline" as const,
    title: "Guided diagnostics",
    description: "Run Repair Brain workflows in the field.",
  },
  {
    icon: "cloud-offline-outline" as const,
    title: "Offline ready",
    description: "Keep working without a signal.",
  },
  {
    icon: "library-outline" as const,
    title: "Knowledge",
    description: "Manuals, procedures & field cases.",
  },
];

function CapabilityCard({ colors, item }: { colors: Palette; item: (typeof CAPABILITIES)[number] }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.card} accessible accessibilityLabel={`${item.title}. ${item.description}`}>
      <View style={styles.iconWrap}>
        <Ionicons name={item.icon} size={22} color={colors.brandOrange} />
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardDesc} numberOfLines={2}>
        {item.description}
      </Text>
    </View>
  );
}

export function CapabilitiesSection({
  colors,
  onOpenSearch,
  searchPlaceholder,
}: {
  colors: Palette;
  onOpenSearch?: () => void;
  searchPlaceholder?: string;
}) {
  const styles = createStyles(colors);

  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>QUICK ACCESS</Text>
      <Text style={styles.heading}>Built for technicians</Text>

      {onOpenSearch && searchPlaceholder ? (
        <Pressable
          accessibilityRole="search"
          accessibilityLabel={`Search ${searchPlaceholder.toLowerCase()}`}
          onPress={onOpenSearch}
          style={({ pressed }) => [styles.searchBar, pressed && styles.searchBarPressed]}
        >
          <Ionicons name="search" size={18} color={colors.dimForeground} />
          <Text style={styles.searchText} numberOfLines={1} ellipsizeMode="tail">
            {searchPlaceholder}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.dimForeground} />
        </Pressable>
      ) : null}

      <View style={styles.grid}>
        {CAPABILITIES.map((item) => (
          <CapabilityCard key={item.title} colors={colors} item={item} />
        ))}
      </View>
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
    eyebrow: {
      color: colors.brandOrange,
      fontSize: 11,
      fontFamily: fonts.bold,
      letterSpacing: 1.4,
      marginBottom: spacing.xs,
    },
    heading: {
      color: colors.foreground,
      fontSize: 21,
      fontFamily: fonts.extraBold,
      letterSpacing: -0.3,
      marginBottom: spacing.lg,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      marginBottom: spacing.md,
    },
    searchBarPressed: { opacity: 0.7 },
    searchText: {
      flex: 1,
      color: colors.dimForeground,
      fontSize: 14,
      fontFamily: fonts.regular,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: spacing.md,
    },
    card: {
      width: "48.5%",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.brandOrangeMuted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.sm + 2,
    },
    cardTitle: {
      color: colors.foreground,
      fontSize: 15.5,
      fontFamily: fonts.bold,
      lineHeight: 20,
    },
    cardDesc: {
      color: colors.mutedForeground,
      fontSize: 13,
      fontFamily: fonts.regular,
      lineHeight: 18,
      marginTop: 3,
    },
  });