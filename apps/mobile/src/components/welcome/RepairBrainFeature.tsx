import { ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, radius, spacing, type Palette } from "../../theme";

const REPAIR_BRAIN_IMAGE = require("../../../assets/photos/nnact-repair-brain-image.png");

const HIGHLIGHTS = [
  { icon: "clipboard-outline" as const, label: "Validated procedures" },
  { icon: "speedometer-outline" as const, label: "Capture measurements" },
];

export function RepairBrainFeature({
  colors,
  onExplore,
}: {
  colors: Palette;
  onExplore: () => void;
}) {
  const styles = createStyles(colors);

  return (
    <ImageBackground
      source={REPAIR_BRAIN_IMAGE}
      style={styles.card}
      imageStyle={styles.cardImage}
      resizeMode="cover"
      accessible={false}
    >
      <View style={styles.scrim} />
      <View style={styles.content}>
      <View style={styles.headRow}>
        <Text style={styles.eyebrow}>REPAIR BRAIN</Text>
        <View style={styles.brainIcon}>
          <Ionicons name="hardware-chip-outline" size={22} color={colors.brandOrangeBright} />
        </View>
      </View>

      <Text style={styles.title}>Guided diagnostics for real-world repairs.</Text>
      <Text style={styles.copy}>
        Follow validated procedures, capture measurements and learn from previous NNACT field cases.
      </Text>

      <View style={styles.highlights}>
        {HIGHLIGHTS.map((item) => (
          <View key={item.label} style={styles.highlight}>
            <Ionicons name={item.icon} size={16} color={colors.brandOrangeBright} />
            <Text style={styles.highlightLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="See what Repair Brain does. Sign in required."
        onPress={onExplore}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
      >
        <Text style={styles.ctaLabel}>See what Repair Brain does</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.brandOrangeBright} />
      </Pressable>
    </View>
    </ImageBackground>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    card: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.xl,
      backgroundColor: colors.brandCharcoal,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.10)",
      borderRadius: radius.xl,
      overflow: "hidden",
    },
    cardImage: {
      borderRadius: radius.xl,
    },
    scrim: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: "rgba(23, 18, 13, 0.74)",
    },
    content: {
      padding: spacing.lg,
    },
    headRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    eyebrow: {
      color: colors.brandOrangeBright,
      fontSize: 11,
      fontFamily: fonts.bold,
      letterSpacing: 1.6,
    },
    brainIcon: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: "rgba(242, 183, 5, 0.16)",
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      color: colors.brandWarmWhite,
      fontSize: 22,
      fontFamily: fonts.extraBold,
      letterSpacing: -0.3,
      lineHeight: 28,
      marginTop: spacing.sm,
    },
    copy: {
      color: "rgba(250, 245, 238, 0.82)",
      fontSize: 14.5,
      fontFamily: fonts.regular,
      lineHeight: 21,
      marginTop: spacing.sm,
    },
    highlights: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
      marginTop: spacing.md,
    },
    highlight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    highlightLabel: {
      color: "rgba(250, 245, 238, 0.92)",
      fontSize: 13,
      fontFamily: fonts.semibold,
    },
    cta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      marginTop: spacing.lg,
      borderWidth: 1.5,
      borderColor: "rgba(242, 183, 5, 0.5)",
      backgroundColor: "rgba(242, 183, 5, 0.10)",
      borderRadius: radius.lg,
      paddingVertical: 13,
      paddingHorizontal: spacing.md,
    },
    ctaPressed: { opacity: 0.85 },
    ctaLabel: {
      color: colors.brandOrangeBright,
      fontSize: 15,
      fontFamily: fonts.bold,
    },
  });