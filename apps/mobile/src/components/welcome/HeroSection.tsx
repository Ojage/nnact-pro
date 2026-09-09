import { Image, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BrandLogo } from "@nnact/mobile-ui";
import { fonts, radius, spacing, type Palette } from "../../theme";

const HERO_IMAGE = require("../../../assets/photos/nnact-protech-app-hero.png");

const scrimBase = StyleSheet.create({
  top: { justifyContent: "flex-start" },
  bottom: { justifyContent: "flex-end" },
});

const BOTTOM_RAMP_ALPHAS = [
  0.501, 0.491, 0.482, 0.474, 0.466, 0.463, 0.459, 0.453, 0.445, 0.437, 0.425,
  0.411, 0.398, 0.384, 0.37, 0.356, 0.347, 0.337, 0.321, 0.292, 0.262, 0.235,
  0.209, 0.184, 0.165, 0.149, 0.134, 0.118,
];
const BOTTOM_RAMP = BOTTOM_RAMP_ALPHAS.map((alpha) => ({
  fraction: 100 / BOTTOM_RAMP_ALPHAS.length,
  alpha,
}));

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ScrimStack({
  position,
  bands,
}: {
  position: "top" | "bottom";
  bands: Array<{ fraction: number; alpha: number }>;
}) {
  return (
    <View
      style={[
        { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
        position === "bottom" ? scrimBase.bottom : scrimBase.top,
        { pointerEvents: "none" },
      ]}
    >
      {bands.map((band, index) => (
        <View
          key={index}
          style={{
            height: `${band.fraction}%`,
            backgroundColor: `rgba(20, 13, 8, ${band.alpha})`,
          }}
        />
      ))}
    </View>
  );
}

function SignInButton({ colors, onPress }: { colors: Palette; onPress: () => void }) {
  const styles = createStyles(colors);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sign in to NNACT Pro"
      onPress={onPress}
      style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
    >
      <Text style={styles.ctaLabel}>Sign in</Text>
      <Ionicons name="arrow-forward" size={20} color={colors.primaryDark} />
    </Pressable>
  );
}

export function HeroSection({
  colors,
  onSignIn,
}: {
  colors: Palette;
  onSignIn: () => void;
}) {
  const styles = createStyles(colors);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const heroHeight = clamp(Math.round(windowHeight * 0.46), 356, 470);
  const titleSize = windowWidth < 380 ? 34 : 38;

  return (
    <View style={[styles.hero, { height: heroHeight }]}>
      <Image source={HERO_IMAGE} style={styles.image} resizeMode="cover" accessible={false} />

      <ScrimStack position="bottom" bands={BOTTOM_RAMP} />

      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View style={styles.brandBlock}>
            <BrandLogo size={40} />
            <View style={styles.wordmark}>
              <Text style={styles.brandName}>NNACT PRO</Text>
              <Text style={styles.brandRole}>TECHNICIAN</Text>
            </View>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>FIELD OPS</Text>
          </View>
        </View>

        <View style={styles.spacer} />

        <Text style={styles.eyebrow}>TECHNICAL OPERATIONS</Text>
        <Text style={[styles.title, { fontSize: titleSize, lineHeight: titleSize + 6 }]}>
          Field operations,{"\n"}in your pocket.
        </Text>
        <Text style={styles.subtitle}>Diagnose. Repair. Deliver. Anywhere.</Text>

        <View style={styles.ctaRow}>
          <SignInButton colors={colors} onPress={onSignIn} />
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    hero: {
      overflow: "hidden",
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
      backgroundColor: colors.brandCharcoal,
    },
    image: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: "100%",
      height: "100%",
    },
    body: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: Platform.select({ ios: 58, android: 42, default: 36 }),
      paddingBottom: spacing.lg,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    brandBlock: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    wordmark: { gap: 0 },
    brandName: {
      color: colors.brandWarmWhite,
      fontSize: 17,
      fontFamily: fonts.bold,
      letterSpacing: 0.6,
    },
    brandRole: {
      color: colors.brandOrangeBright,
      fontSize: 10.5,
      fontFamily: fonts.bold,
      letterSpacing: 2.4,
    },
    badge: {
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.36)",
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 4,
      backgroundColor: "rgba(255,255,255,0.10)",
    },
    badgeText: {
      color: colors.brandWarmWhite,
      fontSize: 10,
      fontFamily: fonts.bold,
      letterSpacing: 1.2,
    },
    spacer: { flex: 1 },
    eyebrow: {
      color: colors.brandOrangeBright,
      fontSize: 11,
      fontFamily: fonts.bold,
      letterSpacing: 1.6,
      marginBottom: spacing.sm,
    },
    title: {
      color: colors.brandWarmWhite,
      fontFamily: fonts.extraBold,
      letterSpacing: -0.6,
    },
    subtitle: {
      color: "rgba(250, 245, 238, 0.9)",
      fontSize: 16,
      fontFamily: fonts.regular,
      lineHeight: 24,
      marginTop: spacing.sm,
    },
    ctaRow: { marginTop: spacing.lg },
    cta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      backgroundColor: colors.accent,
      borderRadius: radius.pill,
      paddingVertical: 13,
      paddingHorizontal: spacing.lg,
    },
    ctaPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
    ctaLabel: { color: colors.primaryDark, fontSize: 16, fontFamily: fonts.bold },
  });