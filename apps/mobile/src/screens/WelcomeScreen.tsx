import { ScrollView, StyleSheet, Text, View } from "react-native";
import { NNACT_COMPANY, NNACT_PRODUCT } from "@nnact/shared";
import type { AppSearchFonts } from "@nnact/mobile-ui";
import { HeroSection } from "../components/welcome/HeroSection";
import { CapabilitiesSection } from "../components/welcome/CapabilitiesSection";
import { RepairBrainFeature } from "../components/welcome/RepairBrainFeature";
import { OperationalTrustStrip } from "../components/welcome/OperationalTrustStrip";
import { DispatchSupport } from "../components/welcome/DispatchSupport";
import { fonts, spacing, type Palette } from "../theme";

export function WelcomeScreen({
  colors,
  onSignIn,
  onOpenSearch,
  searchPlaceholder,
  searchFonts,
}: {
  colors: Palette;
  onSignIn: () => void;
  onOpenSearch?: () => void;
  searchPlaceholder?: string;
  searchFonts?: AppSearchFonts;
}) {
  const styles = createStyles(colors);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <HeroSection colors={colors} onSignIn={onSignIn} />

        <CapabilitiesSection
          colors={colors}
          onOpenSearch={onOpenSearch}
          searchPlaceholder={searchPlaceholder}
        />

        <RepairBrainFeature colors={colors} onExplore={onSignIn} />

        <OperationalTrustStrip colors={colors} />

        <DispatchSupport colors={colors} />

        <View style={styles.footer}>
          <Text style={styles.tagline}>{NNACT_COMPANY.tagline.toUpperCase()}</Text>
          <Text style={styles.footLine}>Keeping Cameroon Running · Buea, Southwest Region</Text>
          <Text style={styles.footMuted}>
            {NNACT_PRODUCT.name} — {NNACT_PRODUCT.subtitle}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.xl },
    footer: {
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      gap: 4,
    },
    tagline: {
      color: colors.brandOrange,
      fontSize: 13,
      fontFamily: fonts.bold,
      letterSpacing: 2.2,
      textAlign: "center",
    },
    footLine: {
      color: colors.mutedForeground,
      fontSize: 12.5,
      fontFamily: fonts.regular,
      textAlign: "center",
    },
    footMuted: {
      color: colors.dimForeground,
      fontSize: 11,
      fontFamily: fonts.regular,
      textAlign: "center",
      marginTop: 2,
    },
  });