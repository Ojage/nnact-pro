import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from "react-native";
import { BrandLogo, HeroSearchTrigger, type AppSearchFonts } from "@nnact/mobile-ui";
import { fonts, radius, spacing, type Palette } from "../theme";

const DEFAULT_HERO_RATIO = 0.42;
const DEFAULT_HERO_MIN = 300;
const DEFAULT_HERO_MAX = 340;

const HERO_RAMP_ALPHAS = [
  0.501, 0.491, 0.482, 0.474, 0.466, 0.463, 0.459, 0.453, 0.445, 0.437, 0.425,
  0.411, 0.398, 0.384, 0.37, 0.356, 0.347, 0.337, 0.321, 0.292, 0.262, 0.235,
  0.209, 0.184, 0.165, 0.149, 0.134, 0.118,
];

const RAMP_CONTAINER = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: "flex-end",
  },
});

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function BottomRamp() {
  return (
    <View style={RAMP_CONTAINER.container} pointerEvents="none">
      {HERO_RAMP_ALPHAS.map((alpha, index) => (
        <View
          key={index}
          style={{
            height: `${100 / HERO_RAMP_ALPHAS.length}%`,
            backgroundColor: `rgba(20, 13, 8, ${alpha})`,
          }}
        />
      ))}
    </View>
  );
}

export function ImageHero({
  colors,
  image,
  eyebrow,
  title,
  subtitle,
  heroHeight,
  brand = "NNACT",
  role = "CUSTOMER",
  badge = "SERVICE PORTAL",
  children,
  searchPlaceholder,
  onSearchPress,
  searchFonts,
}: {
  colors: Palette;
  image: ImageSourcePropType;
  eyebrow: string;
  title: string;
  subtitle?: string;
  heroHeight?: number;
  brand?: string;
  role?: string;
  badge?: string;
  children?: ReactNode;
  searchPlaceholder?: string;
  onSearchPress?: () => void;
  searchFonts?: AppSearchFonts;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const height =
    heroHeight ??
    clamp(Math.round(windowHeight * DEFAULT_HERO_RATIO), DEFAULT_HERO_MIN, DEFAULT_HERO_MAX);
  const styles = createStyles(colors);
  const kenBurns = useRef(new Animated.Value(0)).current;
  const showSearch = Boolean(searchPlaceholder && onSearchPress && searchFonts);

  useEffect(() => {
    const phase = (toValue: number) =>
      Animated.timing(kenBurns, {
        toValue,
        duration: 16000,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      });
    const loop = Animated.loop(Animated.sequence([phase(1), phase(0)]));
    loop.start();
    return () => loop.stop();
  }, [kenBurns]);

  const heroScale = kenBurns.interpolate({ inputRange: [0, 1], outputRange: [1, 1.24] });
  const heroTranslateX = kenBurns.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0, 8] });
  const heroTranslateY = kenBurns.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0, -6] });

  return (
    <View style={[styles.hero, { height }]}>
      <Animated.Image
        source={image}
        resizeMode="cover"
        accessible={false}
        style={[
          styles.image,
          { transform: [{ scale: heroScale }, { translateX: heroTranslateX }, { translateY: heroTranslateY }] },
        ]}
      />
      <BottomRamp />

      <View style={styles.heroBody}>
        <View style={styles.headerRow}>
          <View style={styles.brandBlock}>
            <BrandLogo size={40} />
            <View style={styles.wordmark}>
              <Text style={styles.brandName}>{brand}</Text>
              <Text style={styles.brandRole}>{role}</Text>
            </View>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        </View>

        <View style={styles.spacer} />

        <View style={styles.heroText}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        {children ? <View style={styles.heroActions}>{children}</View> : null}

        {showSearch ? (
          <View style={styles.searchArea}>
            <HeroSearchTrigger fonts={searchFonts!} placeholder={searchPlaceholder!} onPress={onSearchPress!} />
          </View>
        ) : null}
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
      backgroundColor: colors.primaryDark,
      marginBottom: spacing.lg,
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
    heroBody: {
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
      color: colors.onEmphasis,
      fontSize: 17,
      fontFamily: fonts.bold,
      letterSpacing: 0.6,
    },
    brandRole: {
      color: colors.accent,
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
      color: colors.onEmphasis,
      fontSize: 10,
      fontFamily: fonts.bold,
      letterSpacing: 1.2,
    },
    spacer: { flex: 1 },
    heroText: { marginTop: spacing.md },
    eyebrow: {
      color: colors.accent,
      fontSize: 11,
      fontFamily: fonts.bold,
      letterSpacing: 1.6,
      marginBottom: spacing.sm,
    },
    title: {
      color: colors.onEmphasis,
      fontSize: 30,
      fontFamily: fonts.extraBold,
      lineHeight: 34,
      letterSpacing: -0.6,
    },
    subtitle: {
      color: "rgba(250, 245, 238, 0.9)",
      fontSize: 14,
      fontFamily: fonts.regular,
      lineHeight: 21,
      marginTop: spacing.sm,
    },
    heroActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    searchArea: { marginTop: spacing.lg },
  });